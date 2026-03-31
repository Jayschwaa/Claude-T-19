/**
 * Next.js Instrumentation — runs once on server startup.
 * Schedules a daily 4:00 AM ET data refresh from PSA.
 */
export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Scheduler] Initializing daily PSA refresh scheduler...');

    // Calculate ms until next 4:00 AM ET
    function msUntilNext4AM(): number {
      const now = new Date();
      // Convert to Eastern Time
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const target = new Date(et);
      target.setHours(4, 0, 0, 0);

      // If 4 AM already passed today, schedule for tomorrow
      if (et >= target) {
        target.setDate(target.getDate() + 1);
      }

      // Calculate difference using UTC offsets
      const nowUTC = now.getTime();
      const etOffset = et.getTime() - nowUTC; // should be ~0 but accounts for timezone diff
      const targetUTC = target.getTime() - etOffset;

      return Math.max(targetUTC - nowUTC, 60000); // at least 1 minute
    }

    function scheduleNextRefresh() {
      const delay = msUntilNext4AM();
      const hours = Math.floor(delay / 3600000);
      const mins = Math.floor((delay % 3600000) / 60000);
      console.log(`[Scheduler] Next PSA refresh in ${hours}h ${mins}m (4:00 AM ET)`);

      setTimeout(async () => {
        console.log('[Scheduler] 4:00 AM ET — Starting daily PSA data refresh...');
        try {
          // Dynamically import to avoid circular dependencies
          const { refreshAllLocations } = await import('@/lib/adapter');
          const results = await refreshAllLocations();
          console.log('[Scheduler] Daily refresh complete:', JSON.stringify(results));
        } catch (e) {
          console.error('[Scheduler] Daily refresh failed:', e);
        }

        // Schedule next day's refresh
        scheduleNextRefresh();
      }, delay);
    }

    // Also do an initial refresh 30 seconds after startup (warm the cache)
    setTimeout(async () => {
      console.log('[Scheduler] Initial startup refresh (warming cache)...');
      try {
        const { refreshAllLocations } = await import('@/lib/adapter');
        const results = await refreshAllLocations();
        console.log('[Scheduler] Startup refresh complete:', JSON.stringify(results));
      } catch (e) {
        console.error('[Scheduler] Startup refresh failed:', e);
      }
    }, 30000);

    // Schedule the daily 4 AM refresh
    scheduleNextRefresh();
  }
}
