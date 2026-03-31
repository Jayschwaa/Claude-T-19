import { DataAdapter, Job } from './types';
import { generateMockJobs } from './mock-data';
import { createPSAAdapter, createPSAAdapterForConfig } from './psa-adapter';
import { PSALocationConfig, getLocationConfigs } from './psa-config';

let cachedMockJobs: Job[] | null = null;

class MockAdapter implements DataAdapter {
  async getJobs(): Promise<Job[]> {
    if (!cachedMockJobs) cachedMockJobs = generateMockJobs();
    return cachedMockJobs;
  }
  async getJob(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === id) || null;
  }
}

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

// Background PSA loader — starts fetching immediately, serves mock until ready
let psaJobsReady: Job[] | null = null;
let psaLoadStarted = false;

function startBackgroundLoad(psa: DataAdapter): void {
  if (psaLoadStarted) return;
  psaLoadStarted = true;
  console.log('[PSA] Starting background data load...');
  psa.getJobs().then(
    (jobs) => {
      psaJobsReady = jobs;
      console.log(`[PSA] Background load complete: ${jobs.length} jobs`);
    },
    (err) => {
      console.error('[PSA] Background load failed:', err);
      // Will retry on next request
      psaLoadStarted = false;
    }
  );
}

// Wraps PSA adapter — NEVER falls back to mock. Waits for real data.
class SafePSAAdapter implements DataAdapter {
  private psa = createPSAAdapter();

  async getJobs(): Promise<Job[]> {
    // If PSA data is already cached, return it
    if (psaJobsReady) {
      console.log(`[PSA] Serving ${psaJobsReady.length} cached PSA jobs`);
      return psaJobsReady;
    }

    // Start background load if not started
    startBackgroundLoad(this.psa);

    // Wait up to 10 minutes for PSA data — enriching 188+ jobs takes time
    // Each job requires 3 HTTP requests (detail, financial, notes)
    try {
      const jobs = await withTimeout(this.psa.getJobs(), 600000, 'PSA getJobs');
      psaJobsReady = jobs;
      console.log(`[PSA] Got ${jobs.length} jobs from PSA`);
      return jobs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[PSA] Failed to fetch jobs: ${msg}`);
      // Retry — do NOT fall back to mock
      psaLoadStarted = false;
      throw new Error(`PSA data not available: ${msg}`);
    }
  }

  async getJob(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === id || j.jobNumber === id) || null;
  }
}

export function createAdapter(): DataAdapter {
  if (process.env.PSA_USERNAME && process.env.PSA_PASSWORD) {
    console.log('[Adapter] Using PSA adapter with mock fallback');
    return new SafePSAAdapter();
  }

  console.log('[Adapter] Using mock adapter (demo data)');
  return new MockAdapter();
}

/**
 * Create an adapter for a specific PSA location configuration.
 * Uses module-level singleton cache so the same adapter is reused across page loads.
 */
const locationAdapters = new Map<string, SafePSAAdapterForLocation>();

export function createAdapterForLocation(config: PSALocationConfig): DataAdapter {
  const existing = locationAdapters.get(config.id);
  if (existing) {
    console.log(`[Adapter] Reusing cached PSA adapter for location: ${config.name}`);
    return existing;
  }
  console.log(`[Adapter] Creating new PSA adapter for location: ${config.name}`);
  const adapter = new SafePSAAdapterForLocation(config);
  locationAdapters.set(config.id, adapter);
  return adapter;
}

/**
 * Force-refresh all cached location adapters.
 * Clears in-memory cache and re-fetches from PSA.
 * Used by the cron job for daily 4 AM refresh.
 */
export async function refreshAllLocations(): Promise<{ location: string; jobCount: number; error?: string }[]> {
  const configs = getLocationConfigs();
  const results: { location: string; jobCount: number; error?: string }[] = [];

  for (const config of configs) {
    try {
      console.log(`[Cron] Refreshing ${config.name}...`);
      // Remove cached adapter to force fresh fetch
      locationAdapters.delete(config.id);
      const adapter = new SafePSAAdapterForLocation(config);
      locationAdapters.set(config.id, adapter);
      const jobs = await adapter.getJobs();
      results.push({ location: config.name, jobCount: jobs.length });
      console.log(`[Cron] ${config.name}: ${jobs.length} jobs refreshed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Cron] ${config.name} failed: ${msg}`);
      results.push({ location: config.name, jobCount: 0, error: msg });
    }
  }

  return results;
}

/**
 * Wraps location-specific PSA adapter with SafePSAAdapter pattern.
 */
class SafePSAAdapterForLocation implements DataAdapter {
  private psa: DataAdapter;
  private psaJobsReady: Job[] | null = null;
  private psaLoadStarted = false;

  constructor(private config: PSALocationConfig) {
    this.psa = createPSAAdapterForConfig(config);
  }

  private startBackgroundLoad(): void {
    if (this.psaLoadStarted) return;
    this.psaLoadStarted = true;
    console.log(`[PSA:${this.config.id}] Starting background data load...`);
    this.psa.getJobs().then(
      (jobs) => {
        this.psaJobsReady = jobs;
        console.log(`[PSA:${this.config.id}] Background load complete: ${jobs.length} jobs`);
      },
      (err) => {
        console.error(`[PSA:${this.config.id}] Background load failed:`, err);
        this.psaLoadStarted = false;
      }
    );
  }

  async getJobs(): Promise<Job[]> {
    if (this.psaJobsReady) {
      console.log(`[PSA:${this.config.id}] Serving ${this.psaJobsReady.length} cached PSA jobs`);
      return this.psaJobsReady;
    }

    this.startBackgroundLoad();

    try {
      const jobs = await withTimeout(this.psa.getJobs(), 600000, `PSA getJobs [${this.config.id}]`);
      this.psaJobsReady = jobs;
      console.log(`[PSA:${this.config.id}] Got ${jobs.length} jobs from PSA`);
      return jobs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[PSA:${this.config.id}] Failed to fetch jobs: ${msg}`);
      this.psaLoadStarted = false;
      throw new Error(`PSA data not available for ${this.config.name}: ${msg}`);
    }
  }

  async getJob(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === id || j.jobNumber === id) || null;
  }
}
