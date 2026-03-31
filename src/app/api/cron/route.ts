import { NextResponse } from 'next/server';
import { refreshAllLocations } from '@/lib/adapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

/**
 * GET /api/cron — Force-refresh all PSA data caches.
 * Called daily at 4:00 AM ET by the built-in scheduler, or manually.
 * Protected by CRON_SECRET env var (optional — if not set, anyone can call it).
 */
export async function GET(request: Request) {
  // Optional secret protection
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const token = url.searchParams.get('secret') || request.headers.get('authorization')?.replace('Bearer ', '');
    if (token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startTime = Date.now();
  console.log('[Cron] Starting daily PSA data refresh...');

  try {
    const results = await refreshAllLocations();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[Cron] Refresh complete in ${duration}s:`, JSON.stringify(results));

    return NextResponse.json({
      status: 'ok',
      refreshedAt: new Date().toISOString(),
      durationSeconds: parseFloat(duration),
      locations: results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Cron] Refresh failed:', msg);
    return NextResponse.json({ status: 'error', error: msg }, { status: 500 });
  }
}
