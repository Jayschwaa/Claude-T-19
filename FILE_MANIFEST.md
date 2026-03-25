# T-19 Ops - Complete File Manifest

## Project Configuration (8 files)

### Root Configuration
- **package.json** - NPM dependencies & scripts (Next.js 14, React 18, Tailwind, Lucide)
- **tsconfig.json** - TypeScript configuration with path aliases (@/*)
- **next.config.js** - Next.js 14 config with standalone output for Railway
- **tailwind.config.ts** - Dark theme configuration with critical/high/medium/low colors
- **postcss.config.js** - PostCSS with Tailwind & Autoprefixer
- **.eslintrc.json** - ESLint Next.js recommended rules
- **.gitignore** - Node/Next.js standard exclusions
- **.env.example** - Environment variable template

## Core App Files (2 files)

### Root Layout & Styles
- **src/app/layout.tsx** - Root layout with Nav wrapper, max-width container
- **src/app/globals.css** - Dark theme base styles, card/badge/status utilities

## Shared Components (3 files)

### Navigation & UI Elements
- **src/components/shared/Nav.tsx** (use client)
  - Sticky navigation with logo, page links, role switcher
  - Reads ?role= from URL for demo switching between 6 roles
  - Available roles: leadership, location_manager, estimator_pm, technician, recon_lead, marketing

- **src/components/shared/ScoreBadge.tsx** (use client)
  - Risk level badge: critical (red), high (orange), medium (yellow), low (green)
  - Displays score with risk level

- **src/components/shared/TaskCard.tsx** (use client)
  - Reusable task card with compact and full views
  - Shows job number, customer, priority, due date, evidence required
  - Red border & overdue badge for overdue tasks

## Dashboard Components (4 files)

- **src/components/dashboard/KPICards.tsx** (use client)
  - 6 KPI cards: Total Jobs, Pipeline Value, Overdue Tasks, Open Escalations, Critical Jobs, Team Performance
  - Real-time metrics from buildDashboardKPIs()

- **src/components/dashboard/PipelineBar.tsx** (use client)
  - Horizontal bar visualization of job status distribution
  - 7 workflow statuses with color coding
  - Percentage breakdown below bar

- **src/components/dashboard/PriorityList.tsx** (use client)
  - Shows tasks due today or overdue, sorted by priority
  - Compact task cards
  - Configurable max items

- **src/components/dashboard/EscalationPreview.tsx** (use client)
  - Top 3-N escalations by revenue at risk
  - Shows reason, days overdue, escalation chain
  - Orange accent for escalation theme

## Task & Team Components (2 files)

- **src/components/tasks/TaskListView.tsx** (use client)
  - Role-filtered task queue with priority grouping
  - Filter by status & priority
  - Stats: total, overdue, completed for current role

- **src/components/tasks/TeamBoard.tsx** (use client)
  - Team scoreboard table with completion rates, pipeline owned, avg score
  - Green/yellow/red color coding by completion %
  - Overdue task drill-down by assignee below table

## Intelligence Components (1 file)

- **src/components/intelligence/RecommendationList.tsx** (use client)
  - Expandable recommendation items with title, value, score
  - Used for all 6 intelligence briefings
  - Shows count and max items display

## Job Components (2 files)

- **src/components/jobs/JobListView.tsx** (use client)
  - Searchable & filterable job table
  - Filters: status, type, risk level
  - Sort: by score, value, opened date
  - Shows: job number, customer, type, status, value, score, owner, days open

- **src/components/jobs/JobDetailView.tsx** (use client)
  - Full job profile with multiple sections
  - Header: job info, risk score
  - Quick stats: estimate, supplement, invoice, paid
  - Score breakdown with 6 signal bars
  - Documentation checklist (12 items)
  - Accountability tasks for this job
  - Notes history (newest first)
  - Contacts with last contact date
  - Insurance information
  - Financials summary

## API Routes (4 files)

- **src/app/api/jobs/route.ts**
  - GET /api/jobs
  - Query params: ?status= ?type= ?risk= ?sort=
  - Returns: jobs with scorecards

- **src/app/api/tasks/route.ts**
  - GET /api/tasks
  - Query params: ?role= ?status= ?assignedTo=
  - Returns: tasks sorted by priority, then due date

- **src/app/api/intelligence/route.ts**
  - GET /api/intelligence
  - Returns: kpis, executive5, conversionRisks, upsellOps, unsignedEstimates, staleJobs, missingData, escalations

- **src/app/api/escalations/route.ts**
  - GET /api/escalations
  - Returns: escalations sorted by revenue at risk

## Pages (8 files)

### Dashboard & Overview
- **src/app/page.tsx**
  - "/" - Operations Center dashboard
  - Shows: KPI cards, pipeline bar, priorities, escalations

### Task Management
- **src/app/tasks/page.tsx**
  - "/tasks" - My Action Queue
  - Role-filtered via ?role= URL param
  - Shows: priority-grouped tasks with filters

- **src/app/team/page.tsx**
  - "/team" - Team Accountability Board
  - Shows: scoreboard table, overdue tasks by assignee

### Intelligence & Analysis
- **src/app/intelligence/page.tsx**
  - "/intelligence" - Intelligence Center
  - Shows: 6 briefings (Executive5, ConversionRisks, Upsell, Unsigned Estimates, Stale, MissingData)

### Job Management
- **src/app/jobs/page.tsx**
  - "/jobs" - All Jobs searchable list
  - Search, filter, sort functionality

- **src/app/jobs/[id]/page.tsx**
  - "/jobs/[id]" - Job Detail Profile
  - Full job profile with all sections

### Operational Oversight
- **src/app/escalations/page.tsx**
  - "/escalations" - Escalations Board
  - Grouped by status: Open, Acknowledged, Resolved
  - Sorted by revenue at risk within each status

- **src/app/opportunities/page.tsx**
  - "/opportunities" - Opportunity Finder
  - 3 sections: Contents Upsell, Duct Cleaning, Reconstruction
  - Shows potential revenue per opportunity

## Library Functions (7 files)

### New Utility
- **src/lib/intelligence.ts**
  - buildDashboardKPIs() - Aggregates job/task/escalation data into KPI metrics

### Pre-existing (included)
- **src/lib/types.ts** - Complete TypeScript type definitions
- **src/lib/users.ts** - User roster, role labels, escalation chain
- **src/lib/adapter.ts** - MockAdapter & PSAAdapter (data source abstraction)
- **src/lib/scoring-engine.ts** - 6-factor job scoring algorithm
- **src/lib/accountability-engine.ts** - Task generation & escalation logic
- **src/lib/mock-data.ts** - Mock job data generator with seeded RNG

## Documentation

- **README.md** - Complete feature documentation, architecture, configuration, deployment
- **FILE_MANIFEST.md** (this file) - Detailed file-by-file breakdown

## File Summary

| Category | Count |
|----------|-------|
| Config Files | 8 |
| Core App Files | 2 |
| Shared Components | 3 |
| Dashboard Components | 4 |
| Task/Team Components | 2 |
| Intelligence Components | 1 |
| Job Components | 2 |
| API Routes | 4 |
| Pages | 8 |
| Library Files | 7 |
| Documentation | 2 |
| **TOTAL** | **43** |

## Key Features by File

### Scoring (scoring-engine.ts)
- Urgency: 20% weight - escalation language, approval status, staleness
- Revenue: 25% weight - estimate + supplement values
- Upsell: 10% weight - missing scopes, companion services
- Conversion Risk: 15% weight - unsigned estimates, unresponsiveness
- Documentation: 20% weight - missing field count
- Escalation: 10% weight - legal threats, overdue activity
- Overall Score: 0-100 → Risk Level (critical/high/medium/low)

### Task Generation (accountability-engine.ts)
- Status-based tasks: No Dates, Received, Inspected, Pending, Approved, WIP, Completed
- Role-specific assignments
- Evidence requirements with types
- Automatic escalation for overdue (>24h after due date)
- Escalation chain: Technician → PM → Manager → Leadership

### UI Features by Role
- **Leadership**: Full dashboard, all insights, team oversight
- **Location Manager**: Territory view, escalation management
- **Estimator/PM**: Estimate & approval tasks, conversion monitoring
- **Technician**: Field inspection & photo tasks
- **Recon Lead**: Reconstruction scope tasks
- **Marketing**: Lead follow-up, contact verification

## Deployment

Ready for Railway deployment:
- `npm run build` → `.next/standalone`
- `npm start` → Listens on $PORT or 3000
- All environment variables configurable
- Mock data by default (no external dependencies)
