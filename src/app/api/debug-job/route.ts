import { NextResponse } from 'next/server';
import { debugJobDetail, testPSAConnection } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('id');

  if (!jobId) {
    // If no job ID provided, get first T-19 job from list and debug it
    try {
      const conn = await testPSAConnection();
      return NextResponse.json({
        message: 'Provide ?id=<jobId> to debug a specific job. Here is the PSA connection status:',
        ...conn,
      });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  const result = await debugJobDetail(parseInt(jobId, 10));
  return NextResponse.json(result, { status: 200 });
}
