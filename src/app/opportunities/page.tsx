import { createAdapter } from '@/lib/adapter';
import { scoreAllJobs } from '@/lib/scoring-engine';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default async function OpportunitiesPage() {
  const adapter = createAdapter();
  const jobs = await adapter.getJobs();
  const scored = scoreAllJobs(jobs);

  // Group by upsell type
  const contents = scored.filter(s => s.upsellItems.some(u => u.flagged && u.label.includes('Contents')));
  const recon = scored.filter(s => s.upsellItems.some(u => u.flagged && u.label.includes('Reconstruction')));
  const duct = scored.filter(s => s.upsellItems.some(u => u.flagged && u.label.includes('duct')));
  const source = scored.filter(s => s.upsellItems.some(u => u.flagged && u.label.includes('Source')));

  const sections = [
    { title: 'Contents Pack-out / Inventory', jobs: contents, value: '$2,500–5,000 each' },
    { title: 'Reconstruction Estimates', jobs: recon, value: '$8,000–25,000 each' },
    { title: 'AC / Duct Cleaning', jobs: duct, value: '$800–1,500 each' },
    { title: 'Source Repair Solutions', jobs: source, value: '$1,200–3,000 each' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Upsell Opportunities</h1>
        <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">← Back to Priority Board</Link>
      </div>

      <div className="space-y-8">
        {sections.map(section => (
          <div key={section.title}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <span className="text-sm text-green-400">{section.jobs.length} opportunities · {section.value}</span>
            </div>
            {section.jobs.length > 0 ? (
              <div className="space-y-2">
                {section.jobs.slice(0, 10).map(sj => (
                  <div key={sj.job.id} className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Link href={`/jobs/${sj.job.id}`} className="text-sm font-medium text-blue-400 hover:text-blue-300">
                        {sj.job.jobNumber}
                      </Link>
                      <span className="text-sm text-white">{sj.job.customerName}</span>
                      <span className="text-xs text-slate-400">{sj.job.type} · {sj.job.status}</span>
                    </div>
                    <div className="text-right">
                      {(sj.job.estimateAmount + sj.job.supplementAmount) > 0 && (
                        <span className="text-sm font-medium text-white">{fmt(sj.job.estimateAmount + sj.job.supplementAmount)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {section.jobs.length > 10 && (
                  <p className="text-xs text-slate-500 pl-4">+{section.jobs.length - 10} more</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No opportunities in this category</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
