'use client';

import { useState } from 'react';
import { ScoredJob } from '@/lib/types';
import Link from 'next/link';
import { ArrowLeft, Phone, MapPin, Calendar, DollarSign, User } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function ScoreBar({ label, points, max }: { label: string; points: number; max: number }) {
  const pct = max > 0 ? Math.min((points / max) * 100, 100) : 0;
  const color = pct >= 60 ? 'bg-red-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-slate-700 rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right text-slate-300 font-medium">{points}/{max}</span>
    </div>
  );
}

function Check({ ok }: { ok: boolean }) {
  return ok ? <span className="text-green-400">&#10003;</span> : <span className="text-red-400">&#10007;</span>;
}

export default function JobDetail({ scoredJob }: { scoredJob: ScoredJob }) {
  const [comment, setComment] = useState('');
  const { job, score, iicrcItems, ticketItems, upsellItems } = scoredJob;
  const daysOpen = Math.floor((Date.now() - new Date(job.openedDate).getTime()) / 86400000);

  return (
    <div>
      <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Priority Board
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{job.jobNumber} — {job.customerName}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
            <span className="badge bg-slate-700 text-white">{job.status}</span>
            <span className="font-medium text-slate-300">{job.type}</span>
            <span>{daysOpen} days open</span>
            <span>{job.insuranceCarrier}</span>
            {job.claimNumber && <span>Claim: {job.claimNumber}</span>}
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-slate-400"><User className="w-3 h-3 inline mr-1" />Tech: <span className="text-white">{job.assignedTech}</span></span>
            <span className="text-slate-400"><User className="w-3 h-3 inline mr-1" />BD: <span className="text-white">{job.businessDev}</span></span>
          </div>
        </div>
        <div className="text-right">
          {job.estimateAmount > 0 && <p className="text-2xl font-bold text-white">{fmt(job.estimateAmount)}</p>}
          {job.supplementAmount > 0 && <p className="text-sm text-yellow-400">+{fmt(job.supplementAmount)} supplement</p>}
          <p className="text-sm text-slate-400">Priority Score: <span className="font-bold text-white">{score.total}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Score Breakdown */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Why This Score?</h3>
          <div className="space-y-2">
            <ScoreBar label="Days Open" points={score.daysOpen.points} max={score.daysOpen.max} />
            <ScoreBar label="Revenue" points={score.revenue.points} max={score.revenue.max} />
            <ScoreBar label="Inactivity" points={score.inactivity.points} max={score.inactivity.max} />
            <ScoreBar label="IICRC Gaps" points={score.iicrcGaps.points} max={score.iicrcGaps.max} />
            <ScoreBar label="Ticket Gaps" points={score.ticketGaps.points} max={score.ticketGaps.max} />
            <ScoreBar label="Upsells" points={score.upsells.points} max={score.upsells.max} />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700 space-y-1 text-xs text-slate-500">
            <p>{score.daysOpen.explanation}</p>
            <p>{score.revenue.explanation}</p>
            <p>{score.inactivity.explanation}</p>
            <p>{score.iicrcGaps.explanation}</p>
            <p>{score.ticketGaps.explanation}</p>
            <p>{score.upsells.explanation}</p>
          </div>
        </div>

        {/* Contacts & Location */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Contacts & Location</h3>
          <div className="space-y-3">
            {job.contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <p className="text-sm text-white">{c.name} <span className="text-slate-400">({c.role})</span></p>
                  {c.phone && <a href={`tel:${c.phone}`} className="text-sm text-blue-400 hover:text-blue-300">{c.phone}</a>}
                </div>
              </div>
            ))}
            {job.adjusterName && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <p className="text-sm text-white">{job.adjusterName} <span className="text-slate-400">(Adjuster)</span></p>
                  {job.adjusterPhone && <a href={`tel:${job.adjusterPhone}`} className="text-sm text-blue-400 hover:text-blue-300">{job.adjusterPhone}</a>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
              <p className="text-sm text-slate-300">{job.address}, {job.city}, FL</p>
            </div>
          </div>

          {/* Key Dates */}
          <h3 className="text-sm font-semibold text-slate-300 mt-6 mb-3 uppercase tracking-wide">Key Dates</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Opened', job.openedDate],
              ['Received', job.receivedDate],
              ['Inspected', job.inspectedDate],
              ['Estimate Sent', job.estimateSentDate],
              ['Approved', job.approvedDate],
              ['Production Start', job.productionStartDate],
              ['Completed', job.completedDate],
              ['Last Activity', job.lastActivityDate],
            ].map(([label, date]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-slate-500">{label}</span>
                <span className={date ? 'text-slate-300' : 'text-red-400'}>{(date as string) || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* IICRC Compliance */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">IICRC Compliance</h3>
          <div className="space-y-2">
            {iicrcItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <Check ok={item.present} />
                <span className={item.present ? 'text-slate-400' : 'text-red-300 font-medium'}>{item.label}</span>
              </div>
            ))}
            {iicrcItems.length === 0 && <p className="text-sm text-slate-500">No items applicable for this status</p>}
          </div>

          <h3 className="text-sm font-semibold text-slate-300 mt-6 mb-3 uppercase tracking-wide">Ticket Completeness</h3>
          <div className="space-y-2">
            {ticketItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <Check ok={item.present} />
                <span className={item.present ? 'text-slate-400' : 'text-yellow-300 font-medium'}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upsell Opportunities */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Upsell Opportunities</h3>
          <div className="space-y-3">
            {upsellItems.map((item, i) => (
              <div key={i} className={`flex items-center justify-between text-sm ${item.flagged ? '' : 'opacity-40'}`}>
                <div className="flex items-center gap-2">
                  {item.flagged ? <span className="text-green-400">$</span> : <span className="text-slate-600">—</span>}
                  <span className={item.flagged ? 'text-green-300' : 'text-slate-500'}>{item.label}</span>
                </div>
                {item.flagged && <span className="text-green-400 font-medium">{item.potentialValue}</span>}
              </div>
            ))}
          </div>

          {/* Comment Box */}
          <h3 className="text-sm font-semibold text-slate-300 mt-6 mb-3 uppercase tracking-wide">Add Comment</h3>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a note — will post to PSA activity log..."
            className="input-field w-full h-20 text-sm resize-none"
          />
          <button
            className="btn btn-primary mt-2 text-sm w-full"
            onClick={() => { alert('PSA integration coming soon — note saved locally'); setComment(''); }}
          >
            Post to PSA
          </button>
        </div>
      </div>

      {/* Notes History */}
      <div className="card mt-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Activity Notes ({job.notes.length})</h3>
        {job.notes.length > 0 ? (
          <div className="space-y-2">
            {job.notes.map((note, i) => (
              <div key={i} className="pb-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span className="text-xs text-slate-500">{note.date}</span>
                  <span className="text-xs text-slate-600">{note.author}</span>
                </div>
                <p className="text-sm text-slate-300">{note.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No notes on file</p>
        )}
      </div>
    </div>
  );
}
