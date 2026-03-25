import { DataAdapter, Job } from './types';
import { generateMockJobs } from './mock-data';
import { createPSAAdapter } from './psa-adapter';

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

// Wraps PSA adapter with fallback to mock data if PSA fails or is slow
class SafePSAAdapter implements DataAdapter {
  private psa = createPSAAdapter();
  private mock = new MockAdapter();

  async getJobs(): Promise<Job[]> {
    // If PSA data is already cached, return it
    if (psaJobsReady) {
      console.log(`[PSA] Serving ${psaJobsReady.length} cached PSA jobs`);
      return psaJobsReady;
    }

    // Start background load if not started
    startBackgroundLoad(this.psa);

    // Try to get PSA data with a 120s timeout for the request
    try {
      const jobs = await withTimeout(this.psa.getJobs(), 120000, 'PSA getJobs');
      psaJobsReady = jobs;
      console.log(`[PSA] Got ${jobs.length} jobs from PSA`);
      return jobs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[PSA] Failed to fetch jobs: ${msg}`);
      console.log('[PSA] Falling back to mock data (PSA loading in background)');
      return this.mock.getJobs();
    }
  }

  async getJob(id: string): Promise<Job | null> {
    try {
      const jobs = await this.getJobs();
      return jobs.find(j => j.id === id || j.jobNumber === id) || null;
    } catch {
      return this.mock.getJob(id);
    }
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
