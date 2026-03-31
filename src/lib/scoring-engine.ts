import { Job, ScoreBreakdown, ScoredJob, ChecklistItem, UpsellItem, TicketExpansionItem, OutreachTip } from './types';

// ─── Helper ──────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Factor 1: Days Open (max 20 pts) ────────────────────────────────────────

function scoreDaysOpen(job: Job): { points: number; explanation: string } {
  const days = daysAgo(job.openedDate);
  const points = Math.min(Math.floor(days / 7), 20);
  return { points, explanation: `${days} days open → ${points} pts` };
}

// ─── Factor 2: Revenue Size (max 60 pts) ─────────────────────────────────────

function scoreRevenue(job: Job): { points: number; explanation: string } {
  const total = job.estimateAmount + job.supplementAmount;
  let points = 0;
  let bracket = 'No estimate';
  if (total >= 100000)      { points = 60; bracket = '$100k+'; }
  else if (total >= 60000)  { points = 50; bracket = '$60k-100k'; }
  else if (total >= 30000)  { points = 40; bracket = '$30k-60k'; }
  else if (total >= 15000)  { points = 25; bracket = '$15k-30k'; }
  else if (total >= 5000)   { points = 15; bracket = '$5k-15k'; }
  else if (total > 0)       { points = 5;  bracket = 'Under $5k'; }
  return { points, explanation: `$${total.toLocaleString()} (${bracket}) → ${points} pts` };
}

// ─── Factor 3: Inactivity (max 60 pts) ───────────────────────────────────────

function scoreInactivity(job: Job): { points: number; explanation: string } {
  const days = daysAgo(job.lastActivityDate);
  const points = days > 3 ? Math.min((days - 3) * 3, 60) : 0;
  return { points, explanation: `${days} days since last activity → ${points} pts` };
}

// ─── Factor 4: IICRC Gaps (8 pts each) ───────────────────────────────────────

function getIICRCItems(job: Job): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const s = job.status;

  // Moisture readings & source documented always matter
  items.push({ label: 'Moisture readings', present: job.hasMoistureReadings });
  items.push({ label: 'Source documented', present: job.hasSourceDocumented });

  // Equipment placement: Scoped+
  if (['Scoped', 'Sales', 'WIP', 'Completed'].includes(s)) {
    items.push({ label: 'Equipment placement', present: job.hasEquipmentPlacement });
  }
  // Drying logs & daily monitoring: Sales+
  if (['Sales', 'WIP', 'Completed'].includes(s)) {
    items.push({ label: 'Drying logs', present: job.hasDryingLogs });
    items.push({ label: 'Daily monitoring', present: job.hasDailyMonitoring });
  }
  // Dry standard: WIP+
  if (['WIP', 'Completed'].includes(s)) {
    items.push({ label: 'Dry standard reached', present: job.hasDryStandard });
  }
  return items;
}

function scoreIICRCGaps(job: Job): { points: number; explanation: string; items: ChecklistItem[] } {
  const items = getIICRCItems(job);
  const gaps = items.filter(i => !i.present).length;
  const points = gaps * 8;
  const missing = items.filter(i => !i.present).map(i => i.label).join(', ');
  const explanation = gaps > 0
    ? `${gaps} gap${gaps > 1 ? 's' : ''} × 8 = ${points} pts (${missing})`
    : 'All IICRC items documented → 0 pts';
  return { points, explanation, items };
}

// ─── Factor 5: Ticket Gaps (5 pts each) ──────────────────────────────────────

function getTicketItems(job: Job): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const s = job.status;

  items.push({ label: 'Insurance info', present: job.hasInsuranceInfo });
  items.push({ label: 'Adjuster contact', present: job.hasAdjusterContact });
  items.push({ label: 'Claim number', present: job.hasClaimNumber });
  items.push({ label: 'Phone number', present: job.hasPhoneNumber });
  items.push({ label: 'Photos', present: job.hasPhotos });

  if (['Scoped', 'Sales', 'WIP', 'Completed'].includes(s)) {
    items.push({ label: 'Estimate', present: job.hasEstimate });
    items.push({ label: 'Scope of work', present: job.hasScopeOfWork });
  }
  if (['Sales', 'WIP', 'Completed'].includes(s)) {
    items.push({ label: 'Work authorization', present: job.hasWorkAuth });
  }
  return items;
}

function scoreTicketGaps(job: Job): { points: number; explanation: string; items: ChecklistItem[] } {
  const items = getTicketItems(job);
  const gaps = items.filter(i => !i.present).length;
  const points = gaps * 5;
  const missing = items.filter(i => !i.present).map(i => i.label).join(', ');
  const explanation = gaps > 0
    ? `${gaps} gap${gaps > 1 ? 's' : ''} × 5 = ${points} pts (${missing})`
    : 'All ticket fields complete → 0 pts';
  return { points, explanation, items };
}

// ─── Factor 6: Upsell Opportunities (6 pts each) ────────────────────────────

function getUpsellItems(job: Job): UpsellItem[] {
  const items: UpsellItem[] = [];
  const total = job.estimateAmount + job.supplementAmount;
  const isWtrMld = job.type === 'WTR' || job.type === 'MLD';

  items.push({
    label: 'Contents pack-out / inventory',
    flagged: isWtrMld && !job.hasContentsJob,
    potentialValue: '$2,500–$5,000',
  });
  items.push({
    label: 'Reconstruction estimate',
    flagged: total > 15000 && !job.hasReconEstimate,
    potentialValue: '$8,000–$25,000',
  });
  items.push({
    label: 'AC / duct cleaning',
    flagged: isWtrMld && !job.hasDuctCleaning,
    potentialValue: '$800–$1,500',
  });
  items.push({
    label: 'Source repair solution',
    flagged: !job.hasSourceSolution,
    potentialValue: '$1,200–$3,000',
  });
  return items;
}

function scoreUpsells(job: Job): { points: number; explanation: string; items: UpsellItem[] } {
  const items = getUpsellItems(job);
  const flagged = items.filter(i => i.flagged).length;
  const points = flagged * 6;
  const labels = items.filter(i => i.flagged).map(i => i.label).join(', ');
  const explanation = flagged > 0
    ? `${flagged} opportunit${flagged > 1 ? 'ies' : 'y'} × 6 = ${points} pts (${labels})`
    : 'No upsell gaps → 0 pts';
  return { points, explanation, items };
}

// ─── Ticket Expansion Opportunities (dollar ranges) ──────────────────────────

function getTicketExpansionItems(job: Job): TicketExpansionItem[] {
  const items: TicketExpansionItem[] = [];
  const isWtrMld = job.type === 'WTR' || job.type === 'MLD';
  const isActive = ['Scoped', 'Sales', 'WIP'].includes(job.status);

  // Supplement review — most jobs have line items that can be supplemented
  items.push({
    label: 'Supplement / line item review',
    flagged: isActive && job.estimateAmount > 0 && job.supplementAmount === 0,
    potentialValue: '$500–$3,000',
  });

  // Additional dry-out days from proper moisture documentation
  items.push({
    label: 'Extended drying charges',
    flagged: isWtrMld && !job.hasMoistureReadings && ['WIP', 'Scoped', 'Sales'].includes(job.status),
    potentialValue: '$800–$2,500',
  });

  // Containment / barrier charges often missed
  items.push({
    label: 'Containment & barrier setup',
    flagged: isWtrMld && !job.hasEquipmentPlacement && isActive,
    potentialValue: '$300–$1,200',
  });

  // Air quality / clearance testing
  items.push({
    label: 'Air quality / clearance testing',
    flagged: job.type === 'MLD' && isActive,
    potentialValue: '$250–$800',
  });

  // Equipment charges — often under-documented
  items.push({
    label: 'Equipment rental documentation',
    flagged: isWtrMld && !job.hasDryingLogs && ['WIP'].includes(job.status),
    potentialValue: '$400–$1,500',
  });

  return items;
}

// ─── Commercial Outreach Tips ────────────────────────────────────────────────

function getOutreachTips(job: Job): OutreachTip[] {
  const tips: OutreachTip[] = [];

  // Detect commercial / multi-unit properties from referrer, customer name, or address keywords
  const name = job.customerName.toLowerCase();
  const bd = job.businessDev.toLowerCase();
  const isCommercial = bd.includes('property management') || bd.includes('contractor') ||
    bd.includes('realtor') || bd.includes('tpa') ||
    name.includes('condo') || name.includes('apartment') || name.includes('llc') ||
    name.includes('inc') || name.includes('management') || name.includes('village') ||
    name.includes('acres') || name.includes('bend') || name.includes('loc #') ||
    name.includes('m/y') || name.includes('studios');

  if (isCommercial) {
    tips.push({ label: 'Visit neighboring units — check for water migration', icon: 'door' });
    tips.push({ label: 'Meet property management on-site — introduce full services', icon: 'handshake' });
    tips.push({ label: 'Leave business cards with HOA / front desk / property manager', icon: 'card' });
    tips.push({ label: 'Ask about other units or common areas needing assessment', icon: 'search' });
  }

  return tips;
}

// ─── Main Scoring ────────────────────────────────────────────────────────────

function scoreJob(job: Job): { score: ScoreBreakdown; iicrcItems: ChecklistItem[]; ticketItems: ChecklistItem[]; upsellItems: UpsellItem[]; ticketExpansionItems: TicketExpansionItem[]; outreachTips: OutreachTip[] } {
  const d = scoreDaysOpen(job);
  const r = scoreRevenue(job);
  const i = scoreInactivity(job);
  const ic = scoreIICRCGaps(job);
  const tk = scoreTicketGaps(job);
  const up = scoreUpsells(job);
  const adj = job.priorityOverride * 25;

  const total = d.points + r.points + i.points + ic.points + tk.points + up.points + adj;

  return {
    score: {
      total,
      daysOpen: { points: d.points, max: 20, explanation: d.explanation },
      revenue: { points: r.points, max: 60, explanation: r.explanation },
      inactivity: { points: i.points, max: 60, explanation: i.explanation },
      iicrcGaps: { points: ic.points, max: 48, explanation: ic.explanation },
      ticketGaps: { points: tk.points, max: 40, explanation: tk.explanation },
      upsells: { points: up.points, max: 24, explanation: up.explanation },
      ownerAdjustment: { points: adj, explanation: `Override ${job.priorityOverride} × 25 = ${adj} pts` },
    },
    iicrcItems: ic.items,
    ticketItems: tk.items,
    upsellItems: up.items,
    ticketExpansionItems: getTicketExpansionItems(job),
    outreachTips: getOutreachTips(job),
  };
}

export function scoreOneJob(job: Job): ScoredJob {
  const result = scoreJob(job);
  return { job, score: result.score, rank: 0, iicrcItems: result.iicrcItems, ticketItems: result.ticketItems, upsellItems: result.upsellItems, ticketExpansionItems: result.ticketExpansionItems, outreachTips: result.outreachTips };
}

export function scoreAllJobs(jobs: Job[]): ScoredJob[] {
  const scored = jobs.map(j => scoreOneJob(j));
  scored.sort((a, b) => b.score.total - a.score.total);
  scored.forEach((s, idx) => { s.rank = idx + 1; });
  return scored;
}
