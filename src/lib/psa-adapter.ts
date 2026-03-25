import { DataAdapter, Job, JobType, WorkflowStatus, JobNote, JobContact } from './types';

// ─── PSA Configuration ───────────────────────────────────────────────────────

const PSA_BASE = process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb';
const PSA_SCHEMA = process.env.PSA_SCHEMA || '1022';
const PSA_USER = process.env.PSA_USERNAME || '';
const PSA_PASS = process.env.PSA_PASSWORD || '';

// ─── Token Cache ─────────────────────────────────────────────────────────────

let tokenCache: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (tokenCache && tokenCache.expires > Date.now() + 300000) {
    return tokenCache.token;
  }

  // Try multiple common auth endpoint patterns
  const authEndpoints = [
    `${PSA_BASE}/api/auth/login`,
    `${PSA_BASE}/api/login`,
    `${PSA_BASE}/api/v1/auth/login`,
    `${PSA_BASE}/api/token`,
    `${PSA_BASE}/api/authenticate`,
    `${PSA_BASE}/Token`,
  ];

  const authBodies = [
    // JSON body patterns
    JSON.stringify({ username: PSA_USER, password: PSA_PASS, schema: PSA_SCHEMA }),
    JSON.stringify({ UserName: PSA_USER, Password: PSA_PASS, Schema: PSA_SCHEMA }),
    JSON.stringify({ userName: PSA_USER, password: PSA_PASS, schemaId: PSA_SCHEMA }),
    // Form-encoded (for OAuth-style /Token endpoint)
    `grant_type=password&username=${encodeURIComponent(PSA_USER)}&password=${encodeURIComponent(PSA_PASS)}`,
  ];

  const errors: string[] = [];

  for (const endpoint of authEndpoints) {
    for (const body of authBodies) {
      const isForm = body.includes('grant_type=');
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
            'Accept': 'application/json',
          },
          body,
        });

        if (res.ok) {
          const data = await res.json();
          // Look for token in common response shapes
          const token = data.token || data.access_token || data.Token || data.AccessToken ||
                        data.data?.token || data.result?.token || data.bearerToken;

          if (token) {
            // Cache for 1 hour by default, or use expires_in if provided
            const expiresIn = (data.expires_in || data.expiresIn || 3600) * 1000;
            tokenCache = { token, expires: Date.now() + expiresIn };
            console.log(`[PSA] Authenticated via ${endpoint}`);
            return token;
          }
          errors.push(`${endpoint}: 200 OK but no token found in response keys: ${Object.keys(data).join(', ')}`);
        } else {
          errors.push(`${endpoint}: ${res.status} ${res.statusText}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${endpoint}: ${msg}`);
      }
    }
  }

  throw new Error(`PSA authentication failed. Tried:\n${errors.join('\n')}`);
}

// ─── API Request Helper ──────────────────────────────────────────────────────

async function psaFetch(path: string): Promise<unknown> {
  const token = await getToken();
  const url = path.startsWith('http') ? path : `${PSA_BASE}${path}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`PSA API ${res.status}: ${res.statusText} for ${url}`);
  }

  return res.json();
}

// ─── Data Mapping ────────────────────────────────────────────────────────────

// Map PSA status strings to our WorkflowStatus
function mapStatus(psaStatus: string): WorkflowStatus {
  const s = (psaStatus || '').toLowerCase().trim();

  if (s.includes('no date') || s === '' || s === 'new') return 'No Dates';
  if (s.includes('receiv') || s.includes('intake') || s === 'open') return 'Received';
  if (s.includes('inspect') || s.includes('assess')) return 'Inspected';
  if (s.includes('pending') || s.includes('estimat') || s.includes('waiting') || s.includes('submitted')) return 'Pending';
  if (s.includes('approv')) return 'Approved';
  if (s.includes('wip') || s.includes('work in') || s.includes('active') || s.includes('production') || s.includes('in progress')) return 'WIP';
  if (s.includes('complet') || s.includes('closed') || s.includes('done') || s.includes('invoic')) return 'Completed';

  return 'Received'; // safe default
}

// Map PSA job type to our JobType
function mapJobType(psaType: string): JobType {
  const t = (psaType || '').toUpperCase().trim();

  if (t.includes('WTR') || t.includes('WATER') || t.includes('FLOOD')) return 'WTR';
  if (t.includes('MLD') || t.includes('MOLD') || t.includes('MOULD')) return 'MLD';
  if (t.includes('STR') || t.includes('STORM') || t.includes('WIND')) return 'STR';
  if (t.includes('FIR') || t.includes('FIRE') || t.includes('SMOKE')) return 'FIR';
  if (t.includes('BIO') || t.includes('BIOHAZ')) return 'BIO';
  if (t.includes('CONT') || t.includes('CONTENT')) return 'CNTNT';
  if (t.includes('DUCT') || t.includes('HVAC')) return 'DUCT';
  if (t.includes('RECON') || t.includes('REBUILD')) return 'RECON';

  return 'WTR'; // most common default
}

// Safely get string from PSA data
function str(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// Safely get number from PSA data
function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

// Safely get boolean from PSA data
function bool(val: unknown): boolean {
  if (val === true || val === 'true' || val === '1' || val === 1 || val === 'Yes' || val === 'yes' || val === 'Y') return true;
  return false;
}

// Safely get date string from PSA data
function dateStr(val: unknown): string | null {
  if (!val) return null;
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

// ─── PSA Job → Our Job Mapping ───────────────────────────────────────────────

function mapPSAJob(raw: Record<string, unknown>, index: number): Job {
  // PSA field names may vary — try common patterns
  const id = str(raw.Id || raw.id || raw.JobId || raw.jobId || raw.JobID || `psa-${index}`);
  const jobNumber = str(raw.JobNumber || raw.jobNumber || raw.JobNum || raw.jobNum || raw.Number || raw.FileNumber || raw.fileNumber || id);

  // Customer name: might be a field or nested
  const customerName = str(
    raw.CustomerName || raw.customerName || raw.Customer || raw.customer ||
    raw.InsuredName || raw.insuredName || raw.Insured || raw.ClientName ||
    (raw.Customer && typeof raw.Customer === 'object' ? (raw.Customer as Record<string, unknown>).Name || (raw.Customer as Record<string, unknown>).name : null) ||
    'Unknown'
  );

  // Territory
  const territory = str(raw.Territory || raw.territory || raw.TerritoryId || raw.Branch || raw.branch || 'T-19');

  // Type & status
  const type = mapJobType(str(raw.JobType || raw.jobType || raw.Type || raw.type || raw.Category || raw.LossType || raw.lossType || ''));
  const status = mapStatus(str(raw.Status || raw.status || raw.JobStatus || raw.jobStatus || raw.WorkflowStatus || ''));

  // Address
  const address = str(
    raw.Address || raw.address || raw.JobAddress || raw.LossAddress || raw.lossAddress ||
    raw.PropertyAddress || raw.SiteAddress || ''
  );
  const city = str(
    raw.City || raw.city || raw.JobCity || raw.LossCity || raw.PropertyCity || ''
  );

  // Dates
  const openedDate = dateStr(raw.OpenDate || raw.openDate || raw.DateOpened || raw.CreatedDate || raw.createDate || raw.DateCreated) || new Date().toISOString().split('T')[0];
  const receivedDate = dateStr(raw.ReceivedDate || raw.receivedDate || raw.DateReceived || raw.IntakeDate);
  const inspectedDate = dateStr(raw.InspectedDate || raw.inspectedDate || raw.InspectionDate || raw.DateInspected);
  const estimateSentDate = dateStr(raw.EstimateSentDate || raw.estimateSentDate || raw.DateEstimateSent);
  const approvedDate = dateStr(raw.ApprovedDate || raw.approvedDate || raw.DateApproved || raw.ApprovalDate);
  const productionStartDate = dateStr(raw.ProductionStartDate || raw.productionStartDate || raw.StartDate || raw.WorkStartDate);
  const completedDate = dateStr(raw.CompletedDate || raw.completedDate || raw.DateCompleted || raw.CloseDate);
  const lastActivityDate = dateStr(raw.LastActivityDate || raw.lastActivityDate || raw.LastModified || raw.ModifiedDate || raw.LastUpdated) || openedDate;

  // Financials
  const estimateAmount = num(raw.EstimateAmount || raw.estimateAmount || raw.Estimate || raw.estimate || raw.EstimateTotal || raw.TotalEstimate || raw.ContractAmount || 0);
  const supplementAmount = num(raw.SupplementAmount || raw.supplementAmount || raw.Supplement || raw.supplement || raw.SupplementTotal || 0);

  // Insurance
  const insuranceCarrier = str(raw.InsuranceCarrier || raw.insuranceCarrier || raw.Carrier || raw.carrier || raw.InsuranceCompany || raw.Insurance || '');
  const claimNumber = str(raw.ClaimNumber || raw.claimNumber || raw.Claim || raw.claim || raw.ClaimNo || '');
  const adjusterName = str(raw.AdjusterName || raw.adjusterName || raw.Adjuster || raw.adjuster || '');
  const adjusterPhone = str(raw.AdjusterPhone || raw.adjusterPhone || raw.AdjusterPhoneNumber || '');

  // Build contacts
  const contacts: JobContact[] = [];
  if (adjusterName) {
    contacts.push({ role: 'Insurance Adjuster', name: adjusterName, phone: adjusterPhone || undefined });
  }
  if (customerName && customerName !== 'Unknown') {
    const custPhone = str(raw.CustomerPhone || raw.customerPhone || raw.InsuredPhone || raw.Phone || raw.phone || '');
    contacts.push({ role: 'Property Owner', name: customerName, phone: custPhone || undefined });
  }

  // Notes — could be array or nested
  const notes: JobNote[] = [];
  const rawNotes = raw.Notes || raw.notes || raw.JobNotes || raw.Logs || raw.logs || [];
  if (Array.isArray(rawNotes)) {
    for (const item of rawNotes) {
      const n = item as Record<string, unknown>;
      notes.push({
        date: dateStr(n.Date || n.date || n.CreatedDate || n.NoteDate) || openedDate,
        author: str(n.Author || n.author || n.CreatedBy || n.User || n.user || 'System'),
        text: str(n.Text || n.text || n.Note || n.note || n.Content || n.content || n.Description || ''),
      });
    }
  }

  // People
  const assignedTech = str(
    raw.AssignedTech || raw.assignedTech || raw.Technician || raw.technician ||
    raw.ProjectManager || raw.TechnicianName || raw.AssignedTo || ''
  );
  const businessDev = str(
    raw.BusinessDev || raw.businessDev || raw.BD || raw.JobSource || raw.jobSource ||
    raw.Referral || raw.ReferralSource || raw.SalesRep || raw.MarketingRep || ''
  );

  // IICRC compliance — check for flags or derive from notes/data
  const hasMoistureReadings = bool(raw.HasMoistureReadings || raw.hasMoistureReadings || raw.MoistureReadings) || notesContain(notes, ['moisture', 'reading', 'meter']);
  const hasDryingLogs = bool(raw.HasDryingLogs || raw.hasDryingLogs || raw.DryingLogs) || notesContain(notes, ['drying log', 'dry log']);
  const hasEquipmentPlacement = bool(raw.HasEquipmentPlacement || raw.hasEquipmentPlacement || raw.EquipmentPlacement) || notesContain(notes, ['equipment', 'dehu', 'air mover', 'fan']);
  const hasDailyMonitoring = bool(raw.HasDailyMonitoring || raw.hasDailyMonitoring || raw.DailyMonitoring) || notesContain(notes, ['daily monitor', 'daily check', 'monitoring log']);
  const hasDryStandard = bool(raw.HasDryStandard || raw.hasDryStandard || raw.DryStandard) || notesContain(notes, ['dry standard', 'below threshold', 'goal met']);
  const hasSourceDocumented = bool(raw.HasSourceDocumented || raw.hasSourceDocumented || raw.SourceDocumented) || notesContain(notes, ['source', 'cause', 'origin']);

  // Ticket completeness
  const hasInsuranceInfo = !!insuranceCarrier;
  const hasAdjusterContact = !!adjusterName;
  const hasClaimNumber = !!claimNumber;
  const hasEstimate = estimateAmount > 0;
  const hasPhotos = bool(raw.HasPhotos || raw.hasPhotos || raw.Photos) || num(raw.PhotoCount || raw.photoCount) > 0 || notesContain(notes, ['photo']);
  const hasWorkAuth = bool(raw.HasWorkAuth || raw.hasWorkAuth || raw.WorkAuthorization || raw.WorkAuth) || notesContain(notes, ['work auth', 'authorization']);
  const hasPhoneNumber = contacts.some(c => !!c.phone);
  const hasScopeOfWork = bool(raw.HasScopeOfWork || raw.hasScopeOfWork || raw.ScopeOfWork) || notesContain(notes, ['scope']);

  // Upsell tracking
  const hasContentsJob = bool(raw.HasContentsJob || raw.hasContentsJob || raw.ContentsJob) || notesContain(notes, ['contents', 'pack-out', 'packout', 'inventory']);
  const hasReconEstimate = bool(raw.HasReconEstimate || raw.hasReconEstimate || raw.ReconEstimate) || notesContain(notes, ['recon', 'rebuild', 'reconstruction']);
  const hasDuctCleaning = bool(raw.HasDuctCleaning || raw.hasDuctCleaning || raw.DuctCleaning) || notesContain(notes, ['duct', 'hvac', 'ac clean']);
  const hasSourceSolution = bool(raw.HasSourceSolution || raw.hasSourceSolution || raw.SourceSolution) || notesContain(notes, ['source repair', 'plumb', 'roof repair', 'leak repair']);

  const photoCount = num(raw.PhotoCount || raw.photoCount || (Array.isArray(raw.Photos) ? raw.Photos.length : 0));

  return {
    id,
    jobNumber,
    customerName,
    territory,
    type,
    status,
    address,
    city,
    openedDate,
    receivedDate,
    inspectedDate,
    estimateSentDate,
    approvedDate,
    productionStartDate,
    completedDate,
    lastActivityDate,
    estimateAmount,
    supplementAmount,
    contacts,
    insuranceCarrier,
    claimNumber,
    adjusterName,
    adjusterPhone,
    notes,
    hasMoistureReadings,
    hasDryingLogs,
    hasEquipmentPlacement,
    hasDailyMonitoring,
    hasDryStandard,
    hasSourceDocumented,
    hasInsuranceInfo,
    hasAdjusterContact,
    hasClaimNumber,
    hasEstimate,
    hasPhotos,
    hasWorkAuth,
    hasPhoneNumber,
    hasScopeOfWork,
    hasContentsJob,
    hasReconEstimate,
    hasDuctCleaning,
    hasSourceSolution,
    photoCount,
    priorityOverride: 0,
    assignedTech,
    businessDev,
  };
}

// Helper: search notes for keywords
function notesContain(notes: JobNote[], keywords: string[]): boolean {
  const allText = notes.map(n => n.text.toLowerCase()).join(' ');
  return keywords.some(k => allText.includes(k.toLowerCase()));
}

// ─── Job Fetching ────────────────────────────────────────────────────────────

// Common endpoint patterns for job listing in PSA-like systems
const JOB_ENDPOINTS = [
  '/api/jobs',
  '/api/v1/jobs',
  '/api/Job/List',
  '/api/Job/GetAll',
  '/api/jobs/list',
  '/api/v1/job/list',
  '/api/ProvenJobs',
  '/api/Job',
  '/api/FileList',
  '/api/Files',
];

// Filter params we'll try appending
function buildQueryParams(): string {
  const params = new URLSearchParams();
  // Try to filter to Territory 19 and open jobs only
  params.set('territory', '19');
  params.set('status', 'open');
  return params.toString();
}

let jobEndpointCache: string | null = null;

async function fetchJobs(): Promise<Job[]> {
  // If we already found the working endpoint, use it
  if (jobEndpointCache) {
    const data = await psaFetch(`${jobEndpointCache}?${buildQueryParams()}`) as Record<string, unknown> | unknown[];
    return parseJobResponse(data);
  }

  // Discovery: try each endpoint pattern
  const errors: string[] = [];

  for (const endpoint of JOB_ENDPOINTS) {
    try {
      // Try with query params first
      const data = await psaFetch(`${endpoint}?${buildQueryParams()}`) as Record<string, unknown> | unknown[];
      const jobs = parseJobResponse(data);
      if (jobs.length > 0) {
        jobEndpointCache = endpoint;
        console.log(`[PSA] Found job endpoint: ${endpoint} (${jobs.length} jobs)`);
        return jobs;
      }
    } catch {
      // Try without query params
      try {
        const data = await psaFetch(endpoint) as Record<string, unknown> | unknown[];
        const jobs = parseJobResponse(data);
        if (jobs.length > 0) {
          jobEndpointCache = endpoint;
          console.log(`[PSA] Found job endpoint: ${endpoint} (${jobs.length} jobs)`);
          return jobs;
        }
      } catch (e2: unknown) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        errors.push(`${endpoint}: ${msg}`);
      }
    }
  }

  throw new Error(`Could not find PSA job endpoint. Tried:\n${errors.join('\n')}`);
}

// Parse the response — the job array might be nested
function parseJobResponse(data: Record<string, unknown> | unknown[]): Job[] {
  let rawJobs: unknown[] = [];

  if (Array.isArray(data)) {
    rawJobs = data;
  } else if (data && typeof data === 'object') {
    // Try common nesting: data.jobs, data.data, data.result, data.Items, etc.
    const nested = data.jobs || data.Jobs || data.data || data.Data || data.result ||
              data.Result || data.Items || data.items || data.records || data.Records ||
              data.list || data.List || data.value;

    rawJobs = Array.isArray(nested) ? nested : [];
  }

  // Map and filter to Territory 19 open jobs
  const mapped = rawJobs.map((raw, i) => mapPSAJob(raw as Record<string, unknown>, i));

  return mapped.filter(j => {
    // Only T-19
    const isT19 = j.territory.includes('19') || j.territory === 'T-19' || j.territory === '';
    // Only pre-invoice (not completed/closed)
    const isOpen = j.status !== 'Completed';
    return isT19 && isOpen;
  });
}

// ─── Adapter Class ───────────────────────────────────────────────────────────

let cachedJobs: Job[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache

class PSAAdapter implements DataAdapter {
  async getJobs(): Promise<Job[]> {
    // Return cached if fresh
    if (cachedJobs && Date.now() - cacheTime < CACHE_TTL) {
      return cachedJobs;
    }

    cachedJobs = await fetchJobs();
    cacheTime = Date.now();
    return cachedJobs;
  }

  async getJob(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === id || j.jobNumber === id) || null;
  }
}

export function createPSAAdapter(): DataAdapter {
  return new PSAAdapter();
}

// ─── Discovery / Debug (used by /api/psa-test route) ─────────────────────────

export async function testPSAConnection(): Promise<{
  authenticated: boolean;
  token?: string;
  authError?: string;
  endpoints: { path: string; status: number; sampleKeys?: string[]; count?: number }[];
}> {
  const result: {
    authenticated: boolean;
    token?: string;
    authError?: string;
    endpoints: { path: string; status: number; sampleKeys?: string[]; count?: number }[];
  } = {
    authenticated: false,
    endpoints: [],
  };

  // Step 1: Try to authenticate
  try {
    const token = await getToken();
    result.authenticated = true;
    result.token = token.slice(0, 20) + '...'; // truncated for safety
  } catch (e: unknown) {
    result.authError = e instanceof Error ? e.message : String(e);
    return result;
  }

  // Step 2: Probe each endpoint
  for (const endpoint of JOB_ENDPOINTS) {
    try {
      const token = await getToken();
      const res = await fetch(`${PSA_BASE}${endpoint}`, {
        headers: {
          'Authorization': `bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      const entry: { path: string; status: number; sampleKeys?: string[]; count?: number } = {
        path: endpoint,
        status: res.status,
      };

      if (res.ok) {
        try {
          const data: unknown = await res.json();
          if (Array.isArray(data)) {
            entry.count = data.length;
            if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
              entry.sampleKeys = Object.keys(data[0] as Record<string, unknown>).slice(0, 20);
            }
          } else if (typeof data === 'object' && data !== null) {
            const obj = data as Record<string, unknown>;
            entry.sampleKeys = Object.keys(obj).slice(0, 20);
            // Check for nested arrays
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (Array.isArray(val)) {
                entry.count = val.length;
                if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                  entry.sampleKeys = [`[${key}] → `, ...Object.keys(val[0] as Record<string, unknown>).slice(0, 18)];
                }
                break;
              }
            }
          }
        } catch {
          // not JSON
        }
      }

      result.endpoints.push(entry);
    } catch {
      result.endpoints.push({ path: endpoint, status: 0 });
    }
  }

  return result;
}
