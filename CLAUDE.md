# T-19 Operations Dashboard

## What This Is

Next.js operations dashboard for **5 Star Service Partners** that pulls live job data from PSA (CanamSys/PSAWeb) and displays prioritized work queues, revenue tracking, IICRC compliance scoring, and upsell opportunities for restoration job management.

**Live:** https://claude-t-19-production.up.railway.app/
**Railway:** https://railway.com/project/8fa28de7-9c54-45d1-a50a-6fed344a152b
**Auto-deploy:** pushes to `main` trigger Railway deploys automatically.

## Tech Stack

- Next.js (App Router) + TypeScript
- Deployed on Railway
- Data from PSA (CanamSys/PSAWeb) — cookie-based session auth, HTML scraping + JSON endpoints
- No database — all data fetched live from PSA, cached in-memory per location

## Project Structure

```
src/
├── app/
│   ├── api/           # API routes (data endpoints)
│   ├── page.tsx       # Main dashboard page (location tabs)
│   ├── jobs/          # Job list/detail pages
│   ├── escalations/   # Escalation views
│   ├── intelligence/  # Intelligence/analytics views
│   ├── opportunities/ # Upsell opportunity views
│   ├── tasks/         # Task management views
│   └── team/          # Team views
├── components/
│   ├── DashboardClient.tsx  # Client-side dashboard wrapper
│   ├── JobCard.tsx          # Job card with score, status, contacts, compliance
│   ├── JobDetail.tsx        # Full job detail view
│   ├── JobList.tsx          # Filterable job list
│   └── SummaryBar.tsx       # Revenue/count summary bar
├── lib/
│   ├── psa-adapter.ts       # ⭐ CORE: PSA data adapter, auth, parsing, team registry
│   ├── psa-config.ts        # Location configs (credentials, schemas, filters)
│   ├── adapter.ts           # Safe adapter factory with background loading
│   ├── types.ts             # All TypeScript interfaces
│   ├── scoring-engine.ts    # Priority scoring algorithm
│   └── mock-data.ts         # Legacy mock data (NOT used in production)
```

## PSA Integration

### Authentication Flow
1. POST `/Account/Login` with username/password/schema
2. Follow redirect to `/Transfer?Token=...`
3. POST transfer endpoint → session cookies established

### Data Endpoints
- **Job list:** POST `/Job/Job/ListFilter` (DataTables server-side, `aaData` arrays)
- **Job detail:** GET `/Job/Job/Edit/{id}` (HTML scraping for entity fields)
- **Job financials:** GET `/Job/Financial/List?linkID={id}` (HTML table for estimates/supplements)
- **Job notes:** Notes endpoint returns employee name per note entry

### Column Layouts (IMPORTANT)
Different PSA schemas return columns in different orders. Auto-detected in `parseRowToJob()`:
- **T-19 (1022):** `[job_number, client, contact, insurance, address, state, city, assigned_to, date, status, id]`
- **Omaha (1520):** `[date, job_number, client, address, insurance, alt_status, assigned_to, amount, status, contact, id]`
- Detection: check if `row[0]` matches `/^\d{1,2}\/\d{1,2}\/\d{4}/`

### No API Docs
All PSA endpoints were reverse-engineered from browser network traffic. There is no official API documentation.

## Locations

| Location | ID | Schema | Territory | Year |
|----------|----|--------|-----------|------|
| T-19 Pompano (South Florida) | `t19` | 1022 | 19 | 25, 26 |
| Omaha | `omaha` | 1520 | null (all) | 25, 26 |

## Team Role Registry

PSA does NOT have structured fields for PM/Estimator/BD roles. The `TEAM_REGISTRY` in `psa-adapter.ts` maps known employee names → roles. The `resolveRoles()` function combines `assigned_to` + notes employees to figure out who's on each job.

### Current T-19 Team
- **David Kays** — Operations Manager
- **Alejandra Abel** — Operations Manager
- **Jose** — Manager
- **Natalie Ramos** — Business Developer
- **Natalia** — Operations Manager
- **Jondany Gutierrez** — Contents Manager
- **Luis Knight, Richard Ali, Angel Baloa, Artsem Babrouski, Rovin Corea-Lazo** — Technicians

### Adding Team Members
Edit `TEAM_REGISTRY` in `psa-adapter.ts`. Add full name, last name, and first name as keys (all lowercase) under the location key (`t19` or `omaha`).

## Environment Variables

```
PSA_USERNAME          # T-19 Pompano login
PSA_PASSWORD          # T-19 Pompano password
PSA_BASE_URL          # PSA web URL (default: https://uwrg.psarcweb.com/PSAWeb)
PSA_SCHEMA            # T-19 schema (default: 1022)
PSA_OMAHA_USERNAME    # Omaha login
PSA_OMAHA_PASSWORD    # Omaha password
PSA_OMAHA_SCHEMA      # Omaha schema (default: 1520)
```

Set these on Railway. For local dev, use `.env.local`.

## Key Constraints

1. **PSA data loads take 2-4 minutes** on cold start (each job needs 3 HTTP requests). `SafePSAAdapter` caches after first load.
2. **Session cookies expire** — adapter handles re-login automatically, but transient failures can occur during deploy cycles.
3. **Entity_ select fields do NOT contain person names** — only JobType, Location, BuildingType, Team, Referrer. Role assignment is entirely via Team Registry.
4. **Never serve mock data** — the adapter throws errors rather than returning fake data. This is intentional.
5. **Year filter has a fallback** — if yearFilter removes ALL jobs, it skips year filtering (handles different job number formats across schemas).

## Common Development Tasks

### Adding a new PSA location
1. Add env vars on Railway (`PSA_{LOCATION}_USERNAME`, etc.)
2. Add config block in `psa-config.ts`
3. Add team members in `TEAM_REGISTRY` in `psa-adapter.ts`
4. Test column mapping — check logs for first row sample, update `parseRowToJob()` if needed
5. Push to main → auto-deploys

### API Endpoints
- **`/api/health`** — Health check
- **`/api/cron`** — Force-refresh all PSA data (daily 4 AM ET auto-runs via instrumentation.ts)
- **`/api/audit?location=t19`** — Self-audit: dashboard vs PSA Control Center counts (accounts for STR separation)
- **`/api/debug-all-statuses?location=t19`** — All jobs with status/revenue/dates
- **`/api/debug-dates?location=t19&job=19-26-3477-PLM`** — PSA date descriptions for a job
- **`/api/debug-search?location=t19&seq=3520,3159`** — Deep search for job sequences across Open/Closed lists

### Data Refresh
- **Daily at 4:00 AM ET** — `src/instrumentation.ts` schedules automatic PSA data refresh
- **Startup warmup** — 30 seconds after deploy, all locations are pre-fetched
- **Manual refresh** — Hit `/api/cron` to force-refresh immediately
- **Cache TTL** — 15 minutes at adapter level; module-level singleton persists until container restart

### STR Division
STR, RCN/RECON, and STC jobs are all separated from the main pipeline into the **STR Summary** card. STC is Omaha's transit/structure code. Use `isSTRDivisionJob()` from `types.ts` to check membership. PSA's Control Center counts these in pipeline buckets, but we do NOT — this is intentional.

### Revenue Sources (priority order)
1. `TotalRevenue.Estimate` from Financial tab
2. `TotalRevenue.Actual` from Financial tab
3. Revenue display field from Job Edit page
4. Completed display field from Job Edit page
5. Amount column from Job List
6. **Fallback:** Estimate folder (most recent by due date) — only fetched if sources 1-5 return $0

### Debugging
- **Login failures:** Check Railway logs for `[PSA] Login` messages
- **Missing jobs:** Check year/territory filters in `psa-config.ts`; run `/api/debug-search` to scan raw PSA lists
- **Wrong data in fields:** Check column mapping in `parseRowToJob()`, log first row
- **Wrong status:** Check date descriptions via `/api/debug-dates`; status derived from PSA date types
- **Slow loading:** Normal — 60+ jobs × 3-4 requests each
- **Over-classification of Completed:** Closed-sourced jobs need completion evidence (dates, WIP status, or >$500 revenue)

### Running locally
```bash
npm install
cp .env.example .env.local  # fill in PSA credentials
npm run dev
```
