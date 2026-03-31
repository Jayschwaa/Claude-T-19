import { NextRequest, NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug-revenue?location=t19&limit=10
 *
 * Shows revenue breakdown for each job — which source provided the revenue value.
 * Helps diagnose why revenue might be $0 or missing.
 */
export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location') || 't19';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');
    const configs = getLocationConfigs();
    const config = configs.find(c => c.id === locationId);
    if (!config) return NextResponse.json({ error: `No config for '${locationId}'` });

    const adapter = createAdapterForLocation(config);
    const jobs = await adapter.getJobs();

    const withRevenue = jobs.filter(j => j.estimateAmount > 0);
    const withoutRevenue = jobs.filter(j => j.estimateAmount === 0);

    const jobDetails = jobs.slice(0, limit).map(j => ({
      jobNumber: j.jobNumber,
      customer: j.customerName,
      status: j.status,
      estimateAmount: j.estimateAmount,
      supplementAmount: j.supplementAmount,
      type: j.type,
      psaAltStatus: j.psaAltStatus,
    }));

    return NextResponse.json({
      location: config.name,
      totalJobs: jobs.length,
      withRevenue: withRevenue.length,
      withoutRevenue: withoutRevenue.length,
      totalRevenue: jobs.reduce((sum, j) => sum + j.estimateAmount, 0),
      topByRevenue: jobs
        .filter(j => j.estimateAmount > 0)
        .sort((a, b) => b.estimateAmount - a.estimateAmount)
        .slice(0, 10)
        .map(j => ({ job: j.jobNumber, revenue: j.estimateAmount, customer: j.customerName })),
      sampleJobs: jobDetails,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
