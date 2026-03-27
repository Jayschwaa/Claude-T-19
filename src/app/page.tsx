import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';
import { scoreAllJobs } from '@/lib/scoring-engine';
import DashboardClient from '@/components/DashboardClient';
import { LocationData, DashboardSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

function buildSummary(scored: ReturnType<typeof scoreAllJobs>): DashboardSummary {
  const summary: DashboardSummary = {
    totalJobs: 0,
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

  summary.totalJobs = scored.length;

  let totalDays = 0;
  let totalIicrc = 0;
  let totalIicrcPresent = 0;
  let totalTicket = 0;
  let totalTicketPresent = 0;
  const techSet = new Set<string>();
  const bdSet = new Set<string>();

  for (const sj of scored) {
    const j = sj.job;

    summary.estimatedRevenue += j.estimateAmount;
    summary.jobsByStatus[j.status] = (summary.jobsByStatus[j.status] || 0) + 1;
    summary.revenueByStatus[j.status] = (summary.revenueByStatus[j.status] || 0) + j.estimateAmount;
    summary.jobsByType[j.type] = (summary.jobsByType[j.type] || 0) + 1;

    totalDays += Math.floor((Date.now() - new Date(j.openedDate).getTime()) / 86400000);

    totalIicrc += sj.iicrcItems.length;
    totalIicrcPresent += sj.iicrcItems.filter(i => i.present).length;
    totalTicket += sj.ticketItems.length;
    totalTicketPresent += sj.ticketItems.filter(i => i.present).length;

    function extractRange(val: string): [number, number] {
      const nums = val.match(/\$([\d,]+)/g) ?? [];
      const low = nums[0] ? parseInt(nums[0].replace(/[$,]/g, '')) : 0;
      const high = nums[1] ? parseInt(nums[1].replace(/[$,]/g, '')) : low;
      return [low, high];
    }

    for (const u of sj.upsellItems) {
      if (u.flagged) {
        const [low, high] = extractRange(u.potentialValue);
        summary.upsellPotential += low;
        summary.upsellPotentialHigh += high;
      }
    }

    for (const te of sj.ticketExpansionItems) {
      if (te.flagged) {
        const [low, high] = extractRange(te.potentialValue);
        summary.ticketExpansion += low;
        summary.ticketExpansionHigh += high;
      }
    }

    if (j.assignedTech) techSet.add(j.assignedTech);
    if (j.businessDev) bdSet.add(j.businessDev);
  }

  summary.avgDaysOpen = scored.length > 0 ? Math.round(totalDays / scored.length) : 0;
  summary.iicrcComplianceRate = totalIicrc > 0 ? Math.round((totalIicrcPresent / totalIicrc) * 100) : 0;
  summary.ticketCompletenessRate = totalTicket > 0 ? Math.round((totalTicketPresent / totalTicket) * 100) : 0;
  summary.allTechs = Array.from(techSet).sort();
  summary.allBDs = Array.from(bdSet).sort();

  return summary;
}

export default async function Dashboard() {
  const configs = getLocationConfigs();
  const locationDataList: LocationData[] = [];

  // Fetch data for all configured locations in parallel
  const results = await Promise.allSettled(
    configs.map(async (config) => {
      const adapter = createAdapterForLocation(config);
      const jobs = await adapter.getJobs();
      const scored = scoreAllJobs(jobs);
      const summary = buildSummary(scored);
      return { id: config.id, name: config.name, scoredJobs: scored, summary };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      locationDataList.push(result.value);
    } else {
      console.error('Failed to load location data:', result.reason);
    }
  }

  // If single location, show without tabs; if multiple, show with tabs
  const showTabs = locationDataList.length > 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Operations Dashboard</h1>
        <span className="text-sm text-slate-400">{locationDataList.reduce((sum, ld) => sum + ld.scoredJobs.length, 0)} total jobs</span>
      </div>

      <DashboardClient locationDataList={locationDataList} showTabs={showTabs} />
    </div>
  );
}
