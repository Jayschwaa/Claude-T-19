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

    const statusBreakdown: Record<string, number> = {};
    const jobSummaries = jobs.map(j => {
      statusBreakdown[j.status] = (statusBreakdown[j.status] || 0) + 1;
      return {
        jobNumber: j.jobNumber,
        status: j.status,
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
      totalJobs: jobs.length,
      statusBreakdown,
      jobs: jobSummaries,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
