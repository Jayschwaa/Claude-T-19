'use client';

import { useState } from 'react';
import { ScoredJob } from '@/lib/types';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Phone, MapPin, User } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function ScoreBar({ label, points, max }: { label: string; points: number; max: number }) {
  const pct = max > 0 ? Math.min((points / max) * 100, 100) : 0;
  const color = pct >= 60 ? 'bg-red-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-slate-300">{points}/{max}</span>
    </div>
  );
}

function CheckBadge({ present }: { present: boolean }) {
  return present
    ? <span className="text-green-400 text-xs">&#10003;</span>
    : <span className="text-red-400 text-xs">&#10007;</span>;
}

export default function JobCard({ scoredJob }: { scoredJob: ScoredJob }) {
  const [expanded, setExpanded] = useState(false);
  const { job, score, rank, iicrcItems, ticketItems, upsellItems, ticketExpansionItems } = scoredJob;

  const daysOpen = Math.floor((Date.now() - new Date(job.openedDate).getTime()) / 86400000);
  const daysSinceActivity = Math.floor((Date.now() - new Date(job.lastActivityDate).getTime()) / 86400000);

  const iicrcGaps = iicrcItems.filter(i => !i.present).length;
  const ticketGaps = ticketItems.filter(i => !i.present).length;
  const upsellCount = upsellItems.filter(i => i.flagged).length;
  const expansionCount = ticketExpansionItems.filter(i => i.flagged).length;

  const statusColors: Record<string, string> = {
    'Received': 'bg-blue-600', 'Scoped': 'bg-amber-600', 'Sales': 'bg-purple-600',
    'WIP': 'bg-orange-600', 'Completed': 'bg-green-600',
  };
  const typeColors: Record<string, string> = {
    'WTR': 'text-blue-300', 'MLD': 'text-purple-300', 'STR': 'text-orange-300', 'FIR': 'text-red-300',
  };

  return (
    <div className="card hover:border-slate-500 transition-all">
      {/* Main row */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Rank */}
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
          {rank}
        </div>

        {/* Job info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/jobs/${job.id}`} className="font-medium text-blue-400 hover:text-blue-300 text-sm" onClick={e => e.stopPropagation()}>
              {job.jobNumber}
            </Link>
            <span className="text-sm text-white font-medium truncate">{job.customerName}</span>
            <span className={`badge ${statusColors[job.status]} text-white text-[10px]`}>{job.status}</span>
            <span className={`text-xs font-medium ${typeColors[job.type] || 'text-slate-300'}`}>{job.type}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span>{daysOpen}d open</span>
            {daysSinceActivity > 5 && (
              <span className={daysSinceActivity > 14 ? 'text-red-400 font-medium' : 'text-yellow-400'}>
                {daysSinceActivity}d inactive
              </span>
            )}
            {job.opsManager && <span className="text-slate-500">{job.opsManager}</span>}
            {job.assignedTech && <span className="text-slate-500">{job.assignedTech}</span>}
            {job.businessDev && <span className="text-slate-500">{job.businessDev}</span>}
            <span className="truncate hidden md:inline">{job.city}</span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-1">
            {iicrcGaps > 0 && <span className="badge bg-red-900/40 text-red-300 border border-red-700 text-[10px]">IICRC:{iicrcGaps}</span>}
            {ticketGaps > 0 && <span className="badge bg-yellow-900/40 text-yellow-300 border border-yellow-700 text-[10px]">Ticket:{ticketGaps}</span>}
            {upsellCount > 0 && <span className="badge bg-green-900/40 text-green-300 border border-green-700 text-[10px]">${upsellCount} upsell</span>}
          </div>

          {/* Estimated revenue only */}
          {job.estimateAmount > 0 && (
            <div className="text-right">
              <p className="text-sm font-bold text-white">{fmt(job.estimateAmount)}</p>
            </div>
          )}

          {/* Score */}
          <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-600 flex flex-col items-center justify-center">
            <span className="text-xs font-bold text-white">{score.total}</span>
            <span className="text-[9px] text-slate-500">pts</span>
          </div>

          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-700 animate-slide-in">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

            {/* Score Breakdown */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">Why This Score?</h4>
              <div className="space-y-1.5">
                <ScoreBar label="Days Open" points={score.daysOpen.points} max={score.daysOpen.max} />
                <ScoreBar label="Revenue" points={score.revenue.points} max={score.revenue.max} />
                <ScoreBar label="Inactivity" points={score.inactivity.points} max={score.inactivity.max} />
                <ScoreBar label="IICRC Gaps" points={score.iicrcGaps.points} max={score.iicrcGaps.max} />
                <ScoreBar label="Ticket Gaps" points={score.ticketGaps.points} max={score.ticketGaps.max} />
                <ScoreBar label="Upsells" points={score.upsells.points} max={score.upsells.max} />
              </div>
            </div>

            {/* IICRC Compliance */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">IICRC Compliance</h4>
              <div className="space-y-1">
                {iicrcItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <CheckBadge present={item.present} />
                    <span className={item.present ? 'text-slate-400' : 'text-red-300'}>{item.label}</span>
                  </div>
                ))}
                {iicrcItems.length === 0 && <p className="text-xs text-slate-500">No items applicable yet</p>}
              </div>
            </div>

            {/* Ticket Completeness */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">Ticket Completeness</h4>
              <div className="space-y-1">
                {ticketItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <CheckBadge present={item.present} />
                    <span className={item.present ? 'text-slate-400' : 'text-yellow-300'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket Expansion + Upsell + Outreach + Contacts + People */}
            <div>
              {/* Ticket Expansion Opportunities */}
              <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">Ticket Expansion</h4>
              <div className="space-y-1">
                {ticketExpansionItems.filter(i => i.flagged).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-yellow-300">{item.label}</span>
                    <span className="text-yellow-400 font-medium">{item.potentialValue}</span>
                  </div>
                ))}
                {ticketExpansionItems.filter(i => i.flagged).length === 0 && (
                  <p className="text-xs text-slate-500">No expansion opportunities identified</p>
                )}
              </div>

              {/* Upsell Opportunities */}
              <h4 className="text-xs font-semibold text-slate-300 mt-4 mb-2 uppercase tracking-wide">Upsell Opportunities</h4>
              <div className="space-y-1">
                {upsellItems.filter(i => i.flagged).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-green-300">{item.label}</span>
                    <span className="text-green-400 font-medium">{item.potentialValue}</span>
                  </div>
                ))}
                {upsellItems.filter(i => i.flagged).length === 0 && (
                  <p className="text-xs text-slate-500">No upsell gaps identified</p>
                )}
              </div>

              {/* People */}
              <h4 className="text-xs font-semibold text-slate-300 mt-4 mb-2 uppercase tracking-wide">Assigned</h4>
              <div className="space-y-1 text-xs">
                {job.assignedTech && (
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">Tech:</span>
                    <span className="text-white">{job.assignedTech}</span>
                  </div>
                )}
                {job.opsManager && (
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">Ops Mgr:</span>
                    <span className="text-white">{job.opsManager}</span>
                  </div>
                )}
                {job.projectManager && (
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">PM:</span>
                    <span className="text-white">{job.projectManager}</span>
                  </div>
                )}
                {job.estimator && (
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">Estimator:</span>
                    <span className="text-white">{job.estimator}</span>
                  </div>
                )}
                {job.businessDev && (
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">BD:</span>
                    <span className="text-white">{job.businessDev}</span>
                  </div>
                )}
              </div>

              {/* Contacts */}
              <h4 className="text-xs font-semibold text-slate-300 mt-4 mb-2 uppercase tracking-wide">Contacts</h4>
              <div className="space-y-1 text-xs">
                {job.contacts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">{c.role}:</span>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="text-blue-400 hover:text-blue-300">{c.phone}</a>
                    ) : (
                      <span className="text-red-400">No phone</span>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-400">{job.address}, {job.city}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {job.notes.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-700/50">
              <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">Latest Notes</h4>
              <div className="space-y-1">
                {job.notes.slice(-3).map((note, i) => (
                  <p key={i} className="text-xs text-slate-400">
                    <span className="text-slate-500">{note.date}</span> — {note.text}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 text-right">
            <Link href={`/jobs/${job.id}`} className="text-xs text-blue-400 hover:text-blue-300">
              View Full Detail →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
