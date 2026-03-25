import { NextResponse } from 'next/server';
import { debugT19Status } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Auto-finds T-19 jobs and debugs their alt_status extraction
export async function GET() {
  try {
    const result = await debugT19Status();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
