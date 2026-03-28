import { NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const configs = getLocationConfigs();
    const t19Config = configs.find(c => c.id === 't19');
    if (!t19Config) return NextResponse.json({ error: 'No T-19 config' });

    const adapter = createAdapterForLocation(t19Config);
    const jobs = await adapter.getJobs();

    const targetJobs = ['3234', '3233', '3520', '3468', '3494', '3424', '3421', '3486', '3159'];

    const jobSummaries = jobs.map(j => ({
      jobNumber: j.jobNumber,
      status: j.status,
      psaAltStatus: j.psaAltStatus,
      psaDateDescriptions: j.psaDateDescriptions,
      completed: j.completedDate,
      prodStart: j.productionStartDate,
      invoiced: j.invoicedDate,
    }));

    const targets = jobSummaries.filter(j => targetJobs.some(t => j.jobNumber.includes(t)));
    const completed = jobSummaries.filter(j => j.status === 'Completed');

    // Collect all unique date descriptions across all jobs
    const allDateDescs = new Set<string>();
    for (const j of jobs) {
      for (const d of j.psaDateDescriptions) allDateDescs.add(d);
    }

    return NextResponse.json({
      totalJobs: jobs.length,
      allUniqueDateDescriptions: Array.from(allDateDescs).sort(),
      targetJobsFound: targets,
      completedJobs: completed,
      missingTargets: targetJobs.filter(t => !jobs.some(j => j.jobNumber.includes(t))),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
