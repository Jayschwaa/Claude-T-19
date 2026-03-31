import { DataAdapter, Job } from './types';
import { createPSAAdapterForConfig } from './psa-adapter';
import { PSALocationConfig, getLocationConfigs } from './psa-config';

// Timeout helper
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Location-specific PSA adapter with background loading and caching.
 * NEVER falls back to mock data — waits for real PSA data or throws.
 */
class CachedPSAAdapter implements DataAdapter {
  private psa: DataAdapter;
  private cached: Job[] | null = null;
  private loading = false;

  constructor(private config: PSALocationConfig) {
    this.psa = createPSAAdapterForConfig(config);
  }

  private startBackgroundLoad(): void {
    if (this.loading) return;
    this.loading = true;
    this.psa.getJobs().then(
      (jobs) => { this.cached = jobs; },
      () => { this.loading = false; },
    );
  }

  async getJobs(): Promise<Job[]> {
    if (this.cached) return this.cached;
    this.startBackgroundLoad();
    try {
      const jobs = await withTimeout(this.psa.getJobs(), 600000, `PSA [${this.config.id}]`);
      this.cached = jobs;
      return jobs;
    } catch (e) {
      this.loading = false;
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`PSA data not available for ${this.config.name}: ${msg}`);
    }
  }

  async getJob(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === id || j.jobNumber === id) || null;
  }
}

// Singleton cache — one adapter per location, reused across page loads
const adapters = new Map<string, CachedPSAAdapter>();

export function createAdapterForLocation(config: PSALocationConfig): DataAdapter {
  const existing = adapters.get(config.id);
  if (existing) return existing;
  const adapter = new CachedPSAAdapter(config);
  adapters.set(config.id, adapter);
  return adapter;
}

/**
 * Force-refresh all cached location adapters.
 * Used by the 4 AM cron job and /api/cron endpoint.
 */
export async function refreshAllLocations(): Promise<{ location: string; jobCount: number; error?: string }[]> {
  const configs = getLocationConfigs();
  const results: { location: string; jobCount: number; error?: string }[] = [];

  for (const config of configs) {
    try {
      adapters.delete(config.id);
      const adapter = new CachedPSAAdapter(config);
      adapters.set(config.id, adapter);
      const jobs = await adapter.getJobs();
      results.push({ location: config.name, jobCount: jobs.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ location: config.name, jobCount: 0, error: msg });
    }
  }

  return results;
}
