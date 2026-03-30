import { NextRequest, NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createAdapterForLocation } from '@/lib/adapter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location') || 't19';
    const jobNum = request.nextUrl.searchParams.get('job');
    const configs = getLocationConfigs();
    const config = configs.find(c => c.id === locationId);
    if (!config) return NextResponse.json({ error: `No config for '${locationId}'` });

    const adapter = createAdapterForLocation(config);
    const jobs = await adapter.getJobs();

    // Find a job to inspect
    let target = jobs[0];
    if (jobNum) {
      const found = jobs.find(j => j.jobNumber.includes(jobNum));
      if (found) target = found;
    }

    if (!target) return NextResponse.json({ error: 'No jobs found' });

    return NextResponse.json({
      location: config.name,
      job: target.jobNumber,
      customer: target.customerName,
      status: target.status,
      type: target.type,
      revenue: target.estimateAmount,
      dates: {
        opened: target.openedDate,
        received: target.receivedDate,
        inspected: target.inspectedDate,
        approved: target.approvedDate,
        prodStart: target.productionStartDate,
        completed: target.completedDate,
        invoiced: target.invoicedDate,
      },
      psaAltStatus: target.psaAltStatus,
      psaDateDescriptions: target.psaDateDescriptions,
      opsManager: target.opsManager,
      tech: target.assignedTech,
      pm: target.projectManager,
      bd: target.businessDev,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
