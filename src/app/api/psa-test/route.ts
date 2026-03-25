import { NextResponse } from 'next/server';
import { testPSAConnection, debugJobDetail } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const autoDebug = searchParams.get('debug') === '1';

  const hasCredentials = !!(process.env.PSA_USERNAME && process.env.PSA_PASSWORD);

  if (!hasCredentials) {
    return NextResponse.json({
      mode: 'mock',
      message: 'No PSA credentials configured. Set PSA_USERNAME, PSA_PASSWORD, PSA_BASE_URL, and PSA_SCHEMA environment variables.',
      env: {
        PSA_BASE_URL: process.env.PSA_BASE_URL || '(not set)',
        PSA_SCHEMA: process.env.PSA_SCHEMA || '(not set)',
        PSA_USERNAME: '(not set)',
        PSA_PASSWORD: '(not set)',
      },
    });
  }

  try {
    const result = await testPSAConnection();

    // If debug mode, also fetch detail for first T-19 job
    let debugInfo = null;
    if (autoDebug && result.authenticated && result.sampleJobs) {
      // Get a T-19 job ID from sample jobs
      const t19Sample = result.sampleJobs.find((s: string) => s.startsWith('19-'));
      if (t19Sample) {
        // Parse job ID from sample - we need to fetch list to get IDs
        debugInfo = { message: 'Use /api/debug-job?id=<jobId> to debug a specific job' };
      }
    }

    return NextResponse.json({
      mode: 'live',
      ...result,
      debugInfo,
      config: {
        PSA_BASE_URL: process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb',
        PSA_SCHEMA: process.env.PSA_SCHEMA || '1022',
        PSA_USERNAME: process.env.PSA_USERNAME ? '***set***' : '(not set)',
        NODE_VERSION: process.version,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ mode: 'live', error: msg }, { status: 500 });
  }
}
