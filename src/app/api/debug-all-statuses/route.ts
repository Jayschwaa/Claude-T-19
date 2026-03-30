import { NextRequest, NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location') || 't19';
    const configs = getLocationConfigs();
    const config = configs.find(c => c.id === locationId);
    if (!config) return NextResponse.json({ error: `No config for '${locationId}'. Available: ${configs.map(c => c.id).join(', ')}` });

    const adapter = createAdapterForLocation(config);
    const jobs = await adapter.getJobs();

    const statusBreakdown: Record<string, number> = {};
    const jobSummaries = jobs.map(j => {
      statusBreakdown[j.status] = (statusBreakdown[j.status] || 0) + 1;
      return {
        jobNumber: j.jobNumber,
        status: j.status,
        psaAltStatus: j.psaAltStatus,
        customer: j.customerName,
        revenue: j.estimateAmount,
        openedDate: j.openedDate,
        receivedDate: j.receivedDate,
        inspectedDate: j.inspectedDate,
        approvedDate: j.approvedDate,
        productionStartDate: j.productionStartDate,
        completedDate: j.completedDate,
        invoicedDate: j.invoicedDate,
        opsManager: j.opsManager,
        pm: j.projectManager,
        tech: j.assignedTech,
        bd: j.businessDev,
      };
    });

    return NextResponse.json({
      location: config.name,
      locationId: config.id,
      totalJobs: jobs.length,
      statusBreakdown,
      jobs: jobSummaries,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
