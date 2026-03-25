# T-19 Operations Center

A comprehensive operational accountability system for restoration company job management, scoring, and task automation.

## Features

### Dashboard
- **KPI Cards**: Real-time overview of pipeline value, overdue tasks, escalations, and critical jobs
- **Pipeline Visualization**: Job status distribution across workflow stages
- **Today's Priorities**: Quick view of urgent tasks due today or overdue
- **Executive Escalations**: High-impact escalations with revenue at risk

### My Action Queue
- Role-based task filtering (Technician, Estimator/PM, Location Manager, Leadership, etc.)
- Priority-sorted tasks with evidence requirements
- Status tracking and overdue indicators
- Filter by priority level and task status

### Team Board
- **Member Scoreboard**: Completion rates, assigned tasks, overdue count, pipeline ownership
- **Color-coded Performance**: Green (>80%), Yellow (50-80%), Red (<50%) completion rates
- **Overdue Task Drill-down**: Grouped view of overdue tasks by team member

### Intelligence Center
- **Executive Daily 5**: Top 5 highest-risk jobs
- **Conversion Risks**: Jobs at risk of conversion failure (unsigned estimates, unresponsive parties)
- **Upsell Opportunities**: Contents, duct cleaning, and reconstruction upsells
- **Unsigned Estimates**: Pending estimates sorted by value
- **Stale Jobs**: No activity >21 days
- **Missing Data Audit**: Incomplete documentation

### Escalations
- Comprehensive escalation tracking by status (Open, Acknowledged, Resolved)
- Revenue at risk calculations
- Escalation chain visualization

### Opportunity Finder
- **Contents Upsell**: WTR jobs without contents scope
- **Duct Cleaning**: MLD/FIR jobs with upsell potential
- **Reconstruction**: High-value mitigation without reconstruction scope
- Expected revenue impact calculations

### All Jobs & Job Details
- Searchable, filterable job listing
- Sort by risk score, value, or opened date
- Detailed job profiles including:
  - Score breakdown by signal
  - Documentation completeness
  - Accountability tasks
  - Note history
  - Contacts and insurance info
  - Financial summary

## Architecture

### Core Components

**Scoring Engine** (`lib/scoring-engine.ts`)
- 6-factor job risk scoring:
  - Urgency: Escalation language, approval status, staleness
  - Revenue Opportunity: Estimate and supplement values
  - Upsell Likelihood: Missing scopes and companion services
  - Conversion Risk: Unsigned estimates, unresponsive parties
  - Documentation Completeness: Missing field tracking
  - Escalation Signals: Legal threats, overdue activity
- Weighted score calculation (0-100)
- Risk level classification (low, medium, high, critical)

**Accountability Engine** (`lib/accountability-engine.ts`)
- Status-based task generation for each job
- Role-specific task assignment
- Evidence requirement tracking
- Escalation rule enforcement
- Automatic escalation generation for overdue tasks

**Intelligence Module** (`lib/intelligence.ts`)
- Dashboard KPI aggregation
- Pipeline metrics
- Team performance calculations

### Data Flow

1. **Data Adapter** (`lib/adapter.ts`): Abstracts data source (mock or PSA)
2. **Jobs**: Loaded from adapter with full job details
3. **Scoring**: Each job scored across 6 factors
4. **Task Generation**: Tasks created based on job status and scorecard
5. **Escalations**: Auto-escalated if tasks become overdue
6. **Intelligence**: Aggregated metrics and insights calculated

### Pages & Routes

- `/` - Dashboard with KPIs and priorities
- `/tasks` - Role-filtered task queue
- `/team` - Team scoreboard and overdue tracking
- `/intelligence` - Intelligence center with briefings
- `/escalations` - Escalation tracking and management
- `/opportunities` - Upsell and revenue opportunity finder
- `/jobs` - Searchable/filterable job list
- `/jobs/[id]` - Detailed job profile
- `/api/jobs` - Job listing API with filters
- `/api/tasks` - Task API with role/status filters
- `/api/intelligence` - Intelligence briefing data
- `/api/escalations` - Escalation list API

## Configuration

### Environment Variables

```
PORT=3000                              # Server port
DATA_SOURCE=mock                       # Data source: 'mock' or 'psa'
TERRITORY=T-19                         # Territory identifier
PSA_BASE_URL=https://uwrg.psarcweb.com/PSAWeb
PSA_USERNAME=                          # PSA username (if using PSA adapter)
PSA_PASSWORD=                          # PSA password (if using PSA adapter)
PSA_SCHEMA=1022                        # PSA schema ID
```

### Role-Based Features

The system supports 6 user roles with different task visibility and priorities:

1. **Leadership**: Full visibility, strategic overview
2. **Location Manager**: Territory management, escalation oversight
3. **Estimator/PM**: Estimate and project management tasks
4. **Technician**: Field work and inspection tasks
5. **Reconstruction Lead**: Reconstruction scope and execution
6. **Marketing**: Lead follow-up and customer contact

## Technologies

- **Next.js 14**: App router, server components, streaming
- **React 18**: Client components for interactivity
- **TypeScript**: Type-safe data structures
- **Tailwind CSS**: Utility-first styling with dark theme
- **Lucide React**: Icon library

## Development

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

Navigate to http://localhost:3000

### Build for Production
```bash
npm run build
npm start
```

## Design System

### Color Palette (Dark Theme)
- **Background**: `slate-950`, `slate-900`, `slate-800`
- **Borders**: `slate-700`
- **Text**: `slate-100`, `slate-300`, `slate-400`
- **Accent**: Blue (`blue-400`, `blue-600`)
- **Status**:
  - Critical: Red (`#ef4444`)
  - High: Orange (`#f97316`)
  - Medium: Yellow (`#eab308`)
  - Low: Green (`#22c55e`)

### Component Patterns
- **Cards**: `.card` with hover effects
- **Badges**: Status indicators with color coding
- **Tables**: Compact tables with striped rows
- **Forms**: Dark-themed inputs with focus states

## Performance Considerations

- Server-side rendering for pages with data fetching
- Memoized client components to prevent unnecessary re-renders
- Efficient filtering and sorting on the server when possible
- API routes for complex data aggregation

## Deployment

### Railway Deployment
1. Connect GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy with `npm run build && npm start`
4. Service runs on `PORT` environment variable (default 3000)

### Standalone Build
Output is configured as `standalone` for containerization:
```bash
npm run build
# Outputs optimized build in .next/standalone
```

## License

Proprietary - UWRG Operations
