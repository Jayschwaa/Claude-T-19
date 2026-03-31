import { NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';
import { scoreAllJobs } from '@/lib/scoring-engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit — Self-audit dashboard counts vs PSA raw data.
 *
 * Compares our dashboard pipeline counts against what PSA shows in the job list.
 * IMPORTANT: PSA's Control Center includes STR jobs in pipeline buckets,
 * but our dashboard separates STR into its own summary card.
 * The audit accounts for this difference.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get('location') || 't19';

  const config = getLocationConfigs().find(c => c.id === locationId);
  if (!config) {
    return NextResponse.json({ error: `Unknown location: ${locationId}` }, { status: 400 });
  }

  try {
    const adapter = createAdapterForLocation(config);
    const jobs = await adapter.getJobs();
    const allScored = scoreAllJobs(jobs);

    // Our dashboard splits: MIT jobs in pipeline, STR jobs in separate card
    const mitJobs = allScored.filter(sj => sj.job.type !== 'STR');
    const strJobs = allScored.filter(sj => sj.job.type === 'STR');

    // Pipeline counts (MIT only — what our dashboard shows in the status bar)
    const dashboardCounts: Record<string, number> = {};
    const dashboardRevenue: Record<string, number> = {};
    for (const sj of mitJobs) {
      const s = sj.job.status;
      dashboardCounts[s] = (dashboardCounts[s] || 0) + 1;
      dashboardRevenue[s] = (dashboardRevenue[s] || 0) + sj.job.estimateAmount;
    }

    // STR counts (what our STR Summary card shows)
    const strCounts: Record<string, number> = {};
    const strRevenue: Record<string, number> = {};
    for (const sj of strJobs) {
      const s = sj.job.status;
      strCounts[s] = (strCounts[s] || 0) + 1;
      strRevenue[s] = (strRevenue[s] || 0) + sj.job.estimateAmount;
    }

    // Combined counts (what PSA Control Center would show — includes STR in pipeline)
    const psaControlCenterCounts: Record<string, number> = {};
    const psaControlCenterRevenue: Record<string, number> = {};
    for (const sj of allScored) {
      const s = sj.job.status;
      psaControlCenterCounts[s] = (psaControlCenterCounts[s] || 0) + 1;
      psaControlCenterRevenue[s] = (psaControlCenterRevenue[s] || 0) + sj.job.estimateAmount;
    }

    // Discrepancy analysis
    const discrepancies: string[] = [];
    const statusOrder = ['Received', 'Scoped', 'Sales', 'WIP', 'Completed'];
    for (const status of statusOrder) {
      const dashCount = dashboardCounts[status] || 0;
      const strCount = strCounts[status] || 0;
      const combined = dashCount + strCount;
      const psaCount = psaControlCenterCounts[status] || 0;
      if (combined !== psaCount) {
        discrepancies.push(
          `${status}: dashboard(${dashCount}) + STR(${strCount}) = ${combined}, but total is ${psaCount}`
        );
      }
    }

    // Jobs with $0 revenue (potential issue)
    const zeroRevenueJobs = allScored
      .filter(sj => sj.job.estimateAmount === 0)
      .map(sj => ({
        jobNumber: sj.job.jobNumber,
        status: sj.job.status,
        type: sj.job.type,
        customer: sj.job.customerName,
      }));

    // Jobs where our status might differ from PSA's raw status
    const statusMismatches = allScored
      .filter(sj => {
        const rawStatus = (sj.job as any).psaAltStatus;
        return rawStatus && rawStatus.length > 0;
      })
      .map(sj => ({
        jobNumber: sj.job.jobNumber,
        ourStatus: sj.job.status,
        psaAltStatus: (sj.job as any).psaAltStatus,
        type: sj.job.type,
      }));

    const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

    return NextResponse.json({
      location: config.name,
      auditTime: new Date().toISOString(),
      totalJobs: allScored.length,

      dashboardPipeline: {
        note: 'MIT jobs only (STR excluded) — what appears in the pipeline status bar',
        totalJobs: mitJobs.length,
        totalRevenue: fmt(mitJobs.reduce((s, sj) => s + sj.job.estimateAmount, 0)),
        byStatus: statusOrder.map(s => ({
          status: s,
          count: dashboardCounts[s] || 0,
          revenue: fmt(dashboardRevenue[s] || 0),
        })),
      },

      strSummary: {
        note: 'STR jobs — shown in the separate STR Summary card at top',
        totalJobs: strJobs.length,
        totalRevenue: fmt(strJobs.reduce((s, sj) => s + sj.job.estimateAmount, 0)),
        byStatus: statusOrder.map(s => ({
          status: s,
          count: strCounts[s] || 0,
          revenue: fmt(strRevenue[s] || 0),
        })).filter(x => x.count > 0),
      },

      psaControlCenterEquivalent: {
        note: 'Combined MIT + STR — what PSA Control Center shows (STR in pipeline buckets)',
        totalJobs: allScored.length,
        totalRevenue: fmt(allScored.reduce((s, sj) => s + sj.job.estimateAmount, 0)),
        byStatus: statusOrder.map(s => ({
          status: s,
          count: psaControlCenterCounts[s] || 0,
          revenue: fmt(psaControlCenterRevenue[s] || 0),
        })),
      },

      discrepancies: discrepancies.length > 0 ? discrepancies : ['None — counts match'],

      // Track the 12 specific T-19 completed-not-invoiced jobs Jason identified
      targetJobsCheck: locationId === 't19' ? (() => {
        const targetSeqs = [
          '3477', '3234', '3520', '3468', '3424', '3421', '3159',
          '3442', '3447', '3436', '3404', '3390',
        ];
        const found: { jobNumber: string; status: string; type: string; revenue: string; completedDate: string | null; invoicedDate: string | null }[] = [];
        const missing: string[] = [];
        for (const seq of targetSeqs) {
          const match = allScored.find(sj => sj.job.jobNumber.includes(seq));
          if (match) {
            found.push({
              jobNumber: match.job.jobNumber,
              status: match.job.status,
              type: match.job.type,
              revenue: fmt(match.job.estimateAmount),
              completedDate: match.job.completedDate,
              invoicedDate: match.job.invoicedDate,
            });
          } else {
            missing.push(seq);
          }
        }
        return { found, missing, foundCount: found.length, missingCount: missing.length };
      })() : undefined,

      zeroRevenueJobs: {
        count: zeroRevenueJobs.length,
        jobs: zeroRevenueJobs,
      },
      statusMismatches: statusMismatches.length > 0 ? statusMismatches : [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
