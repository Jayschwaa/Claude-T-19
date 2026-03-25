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

// Wraps PSA adapter with fallback to mock data if PSA fails
class SafePSAAdapter implements DataAdapter {
  private psa = createPSAAdapter();
  private mock = new MockAdapter();

  async getJobs(): Promise<Job[]> {
    try {
      const jobs = await this.psa.getJobs();
      console.log(`[PSA] Got ${jobs.length} jobs from PSA`);
      return jobs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[PSA] Failed to fetch jobs: ${msg}`);
      console.log('[PSA] Falling back to mock data');
      return this.mock.getJobs();
    }
  }

  async getJob(id: string): Promise<Job | null> {
    try {
      return await this.psa.getJob(id);
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
