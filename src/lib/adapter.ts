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
