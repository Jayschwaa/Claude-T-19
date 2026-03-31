import { createAdapterForLocation } from '@/lib/adapter';
import { getLocationConfigs } from '@/lib/psa-config';
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
  // Search all locations for this job
  const configs = getLocationConfigs();
  let job = null;
  for (const config of configs) {
    const adapter = createAdapterForLocation(config);
    job = await adapter.getJob(id);
    if (job) break;
  }

  if (!job) notFound();

  const scored = scoreOneJob(job);

  return <JobDetail scoredJob={scored} />;
}
