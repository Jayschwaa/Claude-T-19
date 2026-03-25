import { createAdapter } from '@/lib/adapter';
import { scoreOneJob } from '@/lib/scoring-engine';
import JobDetail from '@/components/JobDetail';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const adapter = createAdapter();
  const job = await adapter.getJob(id);

  if (!job) notFound();

  const scored = scoreOneJob(job);

  return <JobDetail scoredJob={scored} />;
}
