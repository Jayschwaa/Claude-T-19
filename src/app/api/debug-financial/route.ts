import { NextRequest, NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';
import { debugJobDetail } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug-financial?location=t19&job=3190
 *
 * Looks up a job by sequence number from cached data, then fetches its
 * detail page via debugJobDetail to show raw revenue/financial parsing.
 * Also shows the enriched job data for comparison.
 */
export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('location') || 't19';
  const jobSeq = request.nextUrl.searchParams.get('job') || '';
  const jobIdParam = request.nextUrl.searchParams.get('jobId');

  const config = getLocationConfigs().find(c => c.id === locationId);
  if (!config) {
    return NextResponse.json({ error: `No config for '${locationId}'` }, { status: 400 });
  }

  try {
    const adapter = createAdapterForLocation(config);
    const jobs = await adapter.getJobs();

    // Find the job by sequence number or direct jobId
    let jobId: number | null = jobIdParam ? parseInt(jobIdParam) : null;
    let matchedJob = null;

    if (jobSeq) {
      matchedJob = jobs.find(j => j.jobNumber.includes(jobSeq));
      if (matchedJob) {
        jobId = parseInt(matchedJob.id);
      }
    } else if (jobId) {
      matchedJob = jobs.find(j => j.id === String(jobId));
    }

    if (!jobId) {
      // List available jobs for reference
      const available = jobs.slice(0, 20).map(j => ({
        jobNumber: j.jobNumber,
        id: j.id,
        revenue: j.estimateAmount,
      }));
      return NextResponse.json({
        error: `Job not found. Use ?job=3190 (seq) or ?jobId=12345 (PSA ID)`,
        availableJobs: available,
      });
    }

    // Fetch raw detail from PSA
    const rawDetail = await debugJobDetail(jobId);

    // Show the enriched job data for comparison
    const enrichedData = matchedJob ? {
      jobNumber: matchedJob.jobNumber,
      customer: matchedJob.customerName,
      status: matchedJob.status,
      estimateAmount: matchedJob.estimateAmount,
      supplementAmount: matchedJob.supplementAmount,
      type: matchedJob.type,
      openedDate: matchedJob.openedDate,
      receivedDate: matchedJob.receivedDate,
      completedDate: matchedJob.completedDate,
      invoicedDate: matchedJob.invoicedDate,
      psaAltStatus: matchedJob.psaAltStatus,
      psaDateDescriptions: matchedJob.psaDateDescriptions,
    } : null;

    return NextResponse.json({
      jobId,
      enrichedJob: enrichedData,
      rawPSADetail: rawDetail,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
