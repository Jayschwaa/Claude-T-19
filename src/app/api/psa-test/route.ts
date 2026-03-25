import { NextResponse } from 'next/server';
import { testPSAConnection } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';

export async function GET() {
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
    return NextResponse.json({
      mode: 'live',
      ...result,
      config: {
        PSA_BASE_URL: process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb',
        PSA_SCHEMA: process.env.PSA_SCHEMA || '1022',
        PSA_USERNAME: process.env.PSA_USERNAME ? '***set***' : '(not set)',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ mode: 'live', error: msg }, { status: 500 });
  }
}
