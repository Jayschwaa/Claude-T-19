# T-19 Operations Dashboard Management

## Overview

You are a development and operations agent for the **5 Star Service Partners T-19 Operations Dashboard** — a Next.js application that pulls live job data from PSA (CanamSys/PSAWeb) and displays prioritized work queues, revenue tracking, IICRC compliance scoring, and upsell opportunities for restoration job management.

**GitHub Repository:** `Jayschwaa/Claude-T-19`
**Live URL:** `https://claude-t-19-production.up.railway.app/`
**Railway Project:** `https://railway.com/project/8fa28de7-9c54-45d1-a50a-6fed344a152b`
**Auto-deploy:** Pushes to `main` branch trigger automatic Railway deploys.

---

## Architecture

### Tech Stack
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Deployment:** Railway (auto-deploy from GitHub)
- **Data Source:** PSA (CanamSys/PSAWeb) — cookie-based session auth, HTML scraping + JSON endpoints

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/psa-adapter.ts` | Core PSA data adapter. Contains `PSASession` class, HTTP methods, job parsing, enrichment, and **Team Role Registry**. |
| `src/lib/psa-config.ts` | Location configuration — defines PSA instances (T-19 Pompano, Omaha) with credentials, schemas, territory/year filters. |
| `src/lib/adapter.ts` | Adapter factory. `SafePSAAdapter` and `SafePSAAdapterForLocation` classes with background loading and timeout handling. |
| `src/lib/types.ts` | All TypeScript interfaces — `Job`, `ScoredJob`, `DashboardSummary`, `LocationData`, `DataAdapter`, etc. |
| `src/lib/scoring.ts` | Priority scoring engine — calculates job scores based on days open, revenue, inactivity, IICRC gaps, ticket gaps, upsells. |
| `src/components/JobCard.tsx` | Individual job card component showing score, status, contacts, compliance items, upsell flags. |

### Multi-Location Architecture

The dashboard supports multiple PSA instances. Each location has:
- Its own PSA credentials and schema
- Instance-based `PSASession` with per-location cookies and cache
- Auto-detection of column layout (T-19 vs Omaha have different column orders)

**Current Locations:**

| Location | Schema | Territory Filter | Year Filter |
|----------|--------|-----------------|-------------|
| T-19 Pompano (South Florida) | 1022 | 19 | 26 |
| Omaha | 1520 | null (all) | 26 |

### PSA Integration Details

**Authentication flow:**
1. POST `/Account/Login` with username/password
2. Follow redirect to `/Transfer?Token=...`
3. POST transfer endpoint
4. Session cookies established (`.PSAX44301`, `PSAAmA`, `AMSALB`, `AMSALBCORS`)

**Data endpoints:**
- Job list: POST `/Job/Job/ListFilter` (DataTables server-side, returns `aaData` arrays)
- Job detail: GET `/Job/Job/Edit/{id}` (HTML scraping for select fields like job type, location)
- Job financials: GET `/Job/Financial/List?linkID={id}` (HTML table parsing for estimate/supplement amounts)
- Job notes: Notes endpoint returns employee name (row[4]) per note

**Column layout auto-detection:**
- T-19 (schema 1022): `[job_number, client, contact, insurance, address, state, city, assigned_to, date, status, id]`
- Omaha (schema 1520): `[date, job_number, client, address, insurance, alt_status, assigned_to, amount, status, contact, id]`
- Detection: check if `row[0]` matches date pattern `/^\d{1,2}\/\d{1,2}\/\d{4}/`

---

## Team Role Registry

PSA does not store PM/Estimator/BD roles in structured fields. The dashboard uses a **Team Role Registry** in `src/lib/psa-adapter.ts` to map known employee names to roles.

### Current T-19 Pompano Team

| Name | Role | Display Role |
|------|------|-------------|
| David Kays | pm | Project Manager |
| Alejandra Abel | bd | Business Developer / Estimator |
| Natalia | ops_manager | Operations Manager |
| Jondany Gutierrez | contents_manager | Contents Manager |
| Luis Knight | tech | Technician |
| Richard Ali | tech | Technician |
| Angel Baloa | tech | Technician |
| Artsem Babrouski | tech | Technician |
| Rovin Corea-Lazo | tech | Technician |

### How to Add/Remove Team Members

1. Open `src/lib/psa-adapter.ts`
2. Find the `TEAM_REGISTRY` constant
3. Add entries under the appropriate location key (`t19` or `omaha`)
4. Include full name, last name, and first name as separate keys (all lowercase) for flexible matching
5. Assign the correct `role` and `displayRole`

**Example — adding a new technician "Mike Johnson" to Omaha:**
```typescript
omaha: {
  'mike johnson': { role: 'tech', displayRole: 'Technician' },
  'johnson': { role: 'tech', displayRole: 'Technician' },
  'mike': { role: 'tech', displayRole: 'Technician' },
},
```

### Role Resolution Logic

The `resolveRoles()` function in `psa-adapter.ts`:
1. Collects all unique people from `assigned_to` + notes employees
2. Looks up each person in the team registry
3. Maps: `pm` or `ops_manager` → PM slot, `bd` or `estimator` → BD + Estimator slots, `contents_manager` → Tech slot, `tech` → Tech slot
4. Unknown `assigned_to` defaults to Tech slot

---

## Common Tasks

### Adding a New PSA Location

1. **Add environment variables** on Railway:
   - `PSA_{LOCATION}_USERNAME`
   - `PSA_{LOCATION}_PASSWORD`
   - `PSA_{LOCATION}_SCHEMA` (optional, defaults handled in config)

2. **Update `src/lib/psa-config.ts`:**
   - Add a new block in `getLocationConfigs()` checking for the new env vars
   - Set `id`, `name`, `schema`, `territoryFilter`, `yearFilter`

3. **Update Team Registry** in `src/lib/psa-adapter.ts` with employees for the new location.

4. **Test column mapping** — new PSA schemas may have different column orders. Check logs for `[PSA:{id}] First row sample` to verify. If columns differ, update `parseRowToJob()`.

5. Push to `main` → Railway auto-deploys.

### Updating the Scoring Algorithm

The scoring engine is in `src/lib/scoring.ts`. Key factors:
- **Days Open** — older jobs score higher
- **Revenue** — higher-value jobs score higher
- **Inactivity** — jobs with no recent activity score higher
- **IICRC Gaps** — missing compliance items add points
- **Ticket Gaps** — incomplete ticket fields add points
- **Upsells** — unflagged upsell opportunities add points
- **Owner Adjustment** — manual priority override

### Checking Deploy Status

Railway auto-deploys on push to `main`. To verify:
1. Check Railway dashboard at the project URL
2. Or check the live site — PSA data takes 2-4 minutes to load on first request (each job requires 3 HTTP requests for detail, financial, and notes data)

### Debugging PSA Issues

- **Login failures:** Check Railway logs for `[PSA] Login` messages. Common issues: expired credentials, HTML response instead of JSON redirect.
- **Missing jobs:** Check year filter and territory filter in `psa-config.ts`. The year filter has a fallback — if it removes ALL jobs, it skips year filtering.
- **Wrong data in fields:** Check column mapping in `parseRowToJob()`. Log the first row sample to verify column positions.
- **Slow loading:** Normal. 188+ jobs × 3 requests each = 2-4 minutes. The `SafePSAAdapter` serves cached data after first load.

---

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `PSA_USERNAME` | T-19 Pompano | PSA login username |
| `PSA_PASSWORD` | T-19 Pompano | PSA login password |
| `PSA_BASE_URL` | Shared | PSA web URL (default: `https://uwrg.psarcweb.com/PSAWeb`) |
| `PSA_SCHEMA` | T-19 Pompano | PSA schema ID (default: `1022`) |
| `PSA_OMAHA_USERNAME` | Omaha | PSA login username |
| `PSA_OMAHA_PASSWORD` | Omaha | PSA login password |
| `PSA_OMAHA_SCHEMA` | Omaha | PSA schema ID (default: `1520`) |

---

## Important Constraints

1. **PSA has no API documentation** — all endpoints were reverse-engineered from browser network traffic.
2. **Column layouts differ between schemas** — always verify with first-row logging when adding new locations.
3. **PSA Entity_ select fields do NOT contain person names** — only `Entity_JobTypeID`, `Entity_LocationID`, `Entity_BuildingTypeID`, `Entity_TeamID`, `Entity_ReferrerID`. Role assignment relies entirely on the Team Registry.
4. **Session cookies expire** — the adapter handles re-login automatically, but transient failures can occur during deploy cycles.
5. **Rate limiting** — PSA doesn't have explicit rate limits, but hitting it too aggressively can cause timeouts. The adapter uses sequential requests per job.
6. **Never fall back to mock data** — the `SafePSAAdapter` throws errors rather than serving fake data. This is intentional.
