import { createAdapter } from '@/lib/adapter';
import { scoreAllJobs } from '@/lib/scoring-engine';
import DashboardClient from '@/components/DashboardClient';
import { DashboardSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const adapter = createAdapter();
  const jobs = await adapter.getJobs();
  const scored = scoreAllJobs(jobs);

  const summary: DashboardSummary = {
    totalJobs: jobs.length,
    estimatedRevenue: 0,
    ticketExpansion: 0,
    ticketExpansionHigh: 0,
    upsellPotential: 0,
    upsellPotentialHigh: 0,
    jobsByStatus: {},
    revenueByStatus: {},
    jobsByType: {},
    avgDaysOpen: 0,
    iicrcComplianceRate: 0,
    ticketCompletenessRate: 0,
    allTechs: [],
    allBDs: [],
  };

  let totalDays = 0;
  let totalIicrc = 0;
  let totalIicrcPresent = 0;
  let totalTicket = 0;
  let totalTicketPresent = 0;
  const techSet = new Set<string>();
  const bdSet = new Set<string>();

  for (const sj of scored) {
    const j = sj.job;

    // Revenue
    summary.estimatedRevenue += j.estimateAmount;

    // Status counts and revenue
    summary.jobsByStatus[j.status] = (summary.jobsByStatus[j.status] || 0) + 1;
    summary.revenueByStatus[j.status] = (summary.revenueByStatus[j.status] || 0) + j.estimateAmount;
    summary.jobsByType[j.type] = (summary.jobsByType[j.type] || 0) + 1;

    // Days open
    totalDays += Math.floor((Date.now() - new Date(j.openedDate).getTime()) / 86400000);

    // Compliance rates
    totalIicrc += sj.iicrcItems.length;
    totalIicrcPresent += sj.iicrcItems.filter(i => i.present).length;
    totalTicket += sj.ticketItems.length;
    totalTicketPresent += sj.ticketItems.filter(i => i.present).length;

    // Helper to extract low/high from a range string like "$2,500–5,000"
    function extractRange(val: string): [number, number] {
      const nums = val.match(/\$([\d,]+)/g) ?? [];
      const low = nums[0] ? parseInt(nums[0].replace(/[$,]/g, '')) : 0;
      const high = nums[1] ? parseInt(nums[1].replace(/[$,]/g, '')) : low;
      return [low, high];
    }

    // Upsell potential (extract low and high from range)
    for (const u of sj.upsellItems) {
      if (u.flagged) {
        const [low, high] = extractRange(u.potentialValue);
        summary.upsellPotential += low;
        summary.upsellPotentialHigh += high;
      }
    }

    // Ticket expansion potential (same range approach)
    for (const te of sj.ticketExpansionItems) {
      if (te.flagged) {
        const [low, high] = extractRange(te.potentialValue);
        summary.ticketExpansion += low;
        summary.ticketExpansionHigh += high;
      }
    }

    // People
    if (j.assignedTech) techSet.add(j.assignedTech);
    if (j.businessDev) bdSet.add(j.businessDev);
  }

  summary.avgDaysOpen = jobs.length > 0 ? Math.round(totalDays / jobs.length) : 0;
  summary.iicrcComplianceRate = totalIicrc > 0 ? Math.round((totalIicrcPresent / totalIicrc) * 100) : 0;
  summary.ticketCompletenessRate = totalTicket > 0 ? Math.round((totalTicketPresent / totalTicket) * 100) : 0;
  summary.allTechs = Array.from(techSet).sort();
  summary.allBDs = Array.from(bdSet).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">T-19 Job Priority Board</h1>
        <span className="text-sm text-slate-400">{jobs.length} open jobs</span>
      </div>

      <DashboardClient scoredJobs={scored} summary={summary} />
    </div>
  );
}
