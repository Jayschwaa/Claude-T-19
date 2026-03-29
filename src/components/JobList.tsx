'use client';

import { useState, useMemo } from 'react';
import { ScoredJob, WorkflowStatus, JobType, DashboardSummary } from '@/lib/types';
import type { ViewMode } from './DashboardClient';
import JobCard from './JobCard';

interface JobListProps {
  scoredJobs: ScoredJob[];
  strJobs: ScoredJob[];
  summary: DashboardSummary;
  viewMode: ViewMode;
  statusFromBar: string | null;
}

export default function JobList({ scoredJobs, strJobs, summary, viewMode, statusFromBar }: JobListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');

  const statuses: WorkflowStatus[] = ['Received', 'Scoped', 'Sales', 'WIP', 'Completed'];
  const types: JobType[] = ['WTR', 'MLD', 'FIR', 'RECON', 'OTHER'];

  // Build person list
  const personOptions: { label: string; value: string }[] = [];
  for (const t of summary.allTechs) {
    personOptions.push({ label: `${t} (Tech)`, value: `tech:${t}` });
  }
  for (const b of summary.allBDs) {
    personOptions.push({ label: `${b} (BD)`, value: `bd:${b}` });
  }

  const filtered = useMemo(() => {
    // STR summary view shows STR jobs instead of MIT jobs
    if (viewMode === 'str-summary') {
      let result = [...strJobs];
      if (search) {
        const q = search.toLowerCase();
        result = result.filter(s =>
          s.job.jobNumber.toLowerCase().includes(q) ||
          s.job.customerName.toLowerCase().includes(q) ||
          s.job.address.toLowerCase().includes(q)
        );
      }
      result.sort((a, b) => (b.job.estimateAmount + b.job.supplementAmount) - (a.job.estimateAmount + a.job.supplementAmount));
      return result;
    }

    let result = [...scoredJobs];

    // --- Filtering ---

    // Pipeline bar status filter (overrides dropdown if set)
    if (statusFromBar) {
      result = result.filter(s => s.job.status === statusFromBar);
    } else if (statusFilter !== 'all') {
      result = result.filter(s => s.job.status === statusFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.job.jobNumber.toLowerCase().includes(q) ||
        s.job.customerName.toLowerCase().includes(q) ||
        s.job.address.toLowerCase().includes(q) ||
        s.job.insuranceCarrier.toLowerCase().includes(q) ||
        s.job.assignedTech.toLowerCase().includes(q) ||
        s.job.businessDev.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter(s => s.job.type === typeFilter);
    }

    if (personFilter !== 'all') {
      const [role, name] = personFilter.split(':');
      if (role === 'tech') {
        result = result.filter(s => s.job.assignedTech === name);
      } else {
        result = result.filter(s => s.job.businessDev === name);
      }
    }

    if (flagFilter === 'iicrc') {
      result = result.filter(s => s.iicrcItems.some(i => !i.present));
    } else if (flagFilter === 'ticket') {
      result = result.filter(s => s.ticketItems.some(i => !i.present));
    } else if (flagFilter === 'upsell') {
      result = result.filter(s => s.upsellItems.some(i => i.flagged));
    } else if (flagFilter === 'stale') {
      result = result.filter(s => s.score.inactivity.points > 0);
    }

    // --- View-mode filtering & sorting ---

    switch (viewMode) {
      case 'revenue':
        // Sort by estimate amount descending (highest revenue first)
        result.sort((a, b) => (b.job.estimateAmount + b.job.supplementAmount) - (a.job.estimateAmount + a.job.supplementAmount));
        break;

      case 'ticket-expansion':
        // Jobs with flagged ticket expansion opportunities, sorted by total expansion potential
        result = result.filter(s => s.ticketExpansionItems.some(i => i.flagged));
        result.sort((a, b) => {
          const aCount = a.ticketExpansionItems.filter(i => i.flagged).length;
          const bCount = b.ticketExpansionItems.filter(i => i.flagged).length;
          if (bCount !== aCount) return bCount - aCount;
          return (b.job.estimateAmount + b.job.supplementAmount) - (a.job.estimateAmount + a.job.supplementAmount);
        });
        break;

      case 'upsell':
        // Only jobs with upsell opportunities, sorted by # of flagged upsells then by estimate
        result = result.filter(s => s.upsellItems.some(i => i.flagged));
        result.sort((a, b) => {
          const aCount = a.upsellItems.filter(i => i.flagged).length;
          const bCount = b.upsellItems.filter(i => i.flagged).length;
          if (bCount !== aCount) return bCount - aCount;
          return (b.job.estimateAmount + b.job.supplementAmount) - (a.job.estimateAmount + a.job.supplementAmount);
        });
        break;

      case 'iicrc-gaps':
        // Only jobs with IICRC gaps, sorted by most gaps first
        result = result.filter(s => s.iicrcItems.some(i => !i.present));
        result.sort((a, b) => {
          const aGaps = a.iicrcItems.filter(i => !i.present).length;
          const bGaps = b.iicrcItems.filter(i => !i.present).length;
          if (bGaps !== aGaps) return bGaps - aGaps;
          return b.score.iicrcGaps.points - a.score.iicrcGaps.points;
        });
        break;

      case 'ticket-gaps':
        // Only jobs with ticket gaps, sorted by most gaps first
        result = result.filter(s => s.ticketItems.some(i => !i.present));
        result.sort((a, b) => {
          const aGaps = a.ticketItems.filter(i => !i.present).length;
          const bGaps = b.ticketItems.filter(i => !i.present).length;
          if (bGaps !== aGaps) return bGaps - aGaps;
          return b.score.ticketGaps.points - a.score.ticketGaps.points;
        });
        break;

      case 'priority':
      default:
        // Already sorted by priority score from scoreAllJobs
        break;
    }

    return result;
  }, [scoredJobs, strJobs, search, statusFilter, typeFilter, flagFilter, personFilter, viewMode, statusFromBar]);

  // Calculate filtered totals
  const filteredRevenue = filtered.reduce((s, sj) => s + sj.job.estimateAmount, 0);
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const viewModeLabels: Record<ViewMode, string> = {
    priority: 'sorted by priority',
    revenue: 'sorted by revenue',
    'ticket-expansion': 'with expansion opportunities',
    upsell: 'with upsell opportunities',
    'iicrc-gaps': 'with IICRC gaps (worst first)',
    'ticket-gaps': 'with ticket gaps (worst first)',
    'str-summary': 'STR jobs by revenue',
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search jobs, customers, techs, BDs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field flex-1 min-w-[200px] text-sm"
        />
        <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="input-field text-sm">
          <option value="all">All People</option>
          {personOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={statusFromBar ? statusFromBar : statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          disabled={!!statusFromBar}
          className={`input-field text-sm ${statusFromBar ? 'opacity-50' : ''}`}
        >
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field text-sm">
          <option value="all">All Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={flagFilter} onChange={e => setFlagFilter(e.target.value)} className="input-field text-sm">
          <option value="all">All Jobs</option>
          <option value="iicrc">IICRC Gaps</option>
          <option value="ticket">Ticket Gaps</option>
          <option value="upsell">Upsell Opportunities</option>
          <option value="stale">Stale / Stuck</option>
        </select>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {filtered.length} jobs · {fmt(filteredRevenue)} estimated revenue · {viewModeLabels[viewMode]}
        {statusFromBar && <span className="text-slate-400"> · filtered to {statusFromBar}</span>}
      </p>

      {/* Job cards */}
      <div className="space-y-2">
        {filtered.map(sj => (
          <JobCard key={sj.job.id} scoredJob={sj} />
        ))}
        {filtered.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            No jobs match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
