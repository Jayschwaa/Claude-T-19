'use client';

import { DashboardSummary } from '@/lib/types';
import type { ViewMode } from './DashboardClient';

interface Props {
  summary: DashboardSummary;
  activeView: ViewMode;
  activeStatus: string | null;
  onBoxClick: (mode: ViewMode) => void;
  onStatusClick: (status: string) => void;
}

export default function SummaryBar({ summary, activeView, activeStatus, onBoxClick, onStatusClick }: Props) {
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const statusOrder = ['No Dates', 'Received', 'Inspected', 'Pending', 'Approved', 'WIP', 'Completed'];
  const statusColors: Record<string, string> = {
    'No Dates': 'bg-slate-500', 'Received': 'bg-blue-500', 'Inspected': 'bg-cyan-500',
    'Pending': 'bg-yellow-500', 'Approved': 'bg-orange-500', 'WIP': 'bg-green-500', 'Completed': 'bg-emerald-400',
  };
  const statusRingColors: Record<string, string> = {
    'No Dates': 'ring-slate-500', 'Received': 'ring-blue-500', 'Inspected': 'ring-cyan-500',
    'Pending': 'ring-yellow-500', 'Approved': 'ring-orange-500', 'WIP': 'ring-green-500', 'Completed': 'ring-emerald-400',
  };

  function boxClass(mode: ViewMode, borderColor: string): string {
    const active = activeView === mode;
    return `card p-3 cursor-pointer transition-all ${borderColor} ${
      active ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/60 scale-[1.02]' : 'hover:scale-[1.01] hover:brightness-110'
    }`;
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Top row — clickable metric boxes */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className={boxClass('revenue', 'border-blue-700/50')} onClick={() => onBoxClick('revenue')}>
          <p className="text-xs text-slate-400">Estimated Revenue</p>
          <p className="text-xl font-bold text-white">{fmt(summary.estimatedRevenue)}</p>
          <p className="text-[10px] text-slate-500">{summary.totalJobs} jobs in pipeline</p>
          {activeView === 'revenue' && <p className="text-[10px] text-blue-400 mt-1">Sorted by revenue</p>}
        </div>
        <div className={boxClass('ticket-expansion', 'border-yellow-700/50')} onClick={() => onBoxClick('ticket-expansion')}>
          <p className="text-xs text-slate-400">Ticket Expansion</p>
          <p className="text-xl font-bold text-yellow-400">{fmt(summary.ticketExpansion)}</p>
          <p className="text-[10px] text-slate-500">supplements identified</p>
          {activeView === 'ticket-expansion' && <p className="text-[10px] text-yellow-400 mt-1">Showing jobs with supplements</p>}
        </div>
        <div className={boxClass('upsell', 'border-green-700/50')} onClick={() => onBoxClick('upsell')}>
          <p className="text-xs text-slate-400">Upsell Potential</p>
          <p className="text-xl font-bold text-green-400">{fmt(summary.upsellPotential)}</p>
          <p className="text-[10px] text-slate-500">contents, recon, duct, source</p>
          {activeView === 'upsell' && <p className="text-[10px] text-green-400 mt-1">Sorted by upsell opportunity</p>}
        </div>
        <div className={boxClass('iicrc-gaps', '')} onClick={() => onBoxClick('iicrc-gaps')}>
          <p className="text-xs text-slate-400">IICRC Compliance</p>
          <p className="text-xl font-bold" style={{ color: summary.iicrcComplianceRate >= 70 ? '#4ade80' : summary.iicrcComplianceRate >= 40 ? '#facc15' : '#f87171' }}>
            {summary.iicrcComplianceRate}%
          </p>
          <p className="text-[10px] text-slate-500">across all open jobs</p>
          {activeView === 'iicrc-gaps' && <p className="text-[10px] text-red-400 mt-1">Worst compliance first</p>}
        </div>
        <div className={boxClass('ticket-gaps', '')} onClick={() => onBoxClick('ticket-gaps')}>
          <p className="text-xs text-slate-400">Ticket Complete</p>
          <p className="text-xl font-bold" style={{ color: summary.ticketCompletenessRate >= 70 ? '#4ade80' : summary.ticketCompletenessRate >= 40 ? '#facc15' : '#f87171' }}>
            {summary.ticketCompletenessRate}%
          </p>
          <p className="text-[10px] text-slate-500">fields filled in</p>
          {activeView === 'ticket-gaps' && <p className="text-[10px] text-red-400 mt-1">Most gaps first</p>}
        </div>
      </div>

      {/* Pipeline bar — clickable segments */}
      <div className="card p-3">
        <div className="flex h-8 rounded overflow-hidden mb-2">
          {statusOrder.map(status => {
            const rev = summary.revenueByStatus[status] || 0;
            const pct = summary.estimatedRevenue > 0 ? (rev / summary.estimatedRevenue) * 100 : 0;
            if (pct === 0) return null;
            const isActive = activeStatus === status;
            return (
              <div
                key={status}
                className={`${statusColors[status]} relative group cursor-pointer transition-all ${
                  isActive ? 'brightness-125 ring-2 ring-white/70 ring-inset z-10' : 'hover:brightness-110'
                } ${activeStatus && !isActive ? 'opacity-40' : ''}`}
                style={{ width: `${pct}%` }}
                onClick={() => onStatusClick(status)}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100">
                  {fmt(rev)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          {statusOrder.map(status => {
            const count = summary.jobsByStatus[status] || 0;
            const rev = summary.revenueByStatus[status] || 0;
            if (count === 0) return null;
            const isActive = activeStatus === status;
            return (
              <span
                key={status}
                className={`flex items-center gap-1 cursor-pointer transition-all ${
                  isActive ? 'text-white font-semibold' : activeStatus ? 'opacity-50 hover:opacity-80' : 'hover:text-white'
                }`}
                onClick={() => onStatusClick(status)}
              >
                <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                {status}: {count} jobs · {fmt(rev)}
              </span>
            );
          })}
        </div>
        {activeStatus && (
          <p className="text-[10px] text-slate-500 mt-2">
            Showing {activeStatus} jobs · click again to clear
          </p>
        )}
      </div>
    </div>
  );
}
