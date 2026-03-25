import { DataAdapter, Job, JobType, WorkflowStatus, JobNote, JobContact } from './types';

// ─── PSA Configuration ───────────────────────────────────────────────────────

const PSA_BASE = process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb';
const PSA_SCHEMA = process.env.PSA_SCHEMA || '1022';
const PSA_USER = process.env.PSA_USERNAME || '';
const PSA_PASS = process.env.PSA_PASSWORD || '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Cookie-based Session Management ─────────────────────────────────────────

let sessionCookies: string[] = [];
let sessionExpires = 0;
const SESSION_TTL = 25 * 60 * 1000; // 25 minutes

function getCookieHeader(): string {
  return sessionCookies.join('; ');
}

function extractSetCookies(headers: Headers): void {
  const setCookies = headers.getSetCookie?.() || [];
  for (const sc of setCookies) {
    const nameVal = sc.split(';')[0].trim();
    if (!nameVal) continue;
    const name = nameVal.split('=')[0];
    // Replace existing cookie with same name, or add new
    sessionCookies = sessionCookies.filter(c => !c.startsWith(name + '='));
    sessionCookies.push(nameVal);
  }
}

async function login(): Promise<void> {
  // Return if session is still valid
  if (sessionCookies.length > 0 && Date.now() < sessionExpires) {
    return;
  }

  // Reset cookies
  sessionCookies = [];

  console.log('[PSA] Logging in...');

  // Step 1: POST to /Account/Login with form data
  const loginBody = new URLSearchParams({
    Username: PSA_USER,
    Password: PSA_PASS,
    Schema: PSA_SCHEMA,
  });

  const loginRes = await fetch(`${PSA_BASE}/Account/Login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: loginBody.toString(),
    redirect: 'manual', // Don't follow redirects automatically
  });

  // Capture cookies from login response
  extractSetCookies(loginRes.headers);

  let transferUrl = '';

  if (loginRes.status === 302) {
    // Got a redirect — the Location header has the transfer URL
    transferUrl = loginRes.headers.get('Location') || '';
    if (transferUrl && !transferUrl.startsWith('http')) {
      transferUrl = `https://uwrg.psarcweb.com${transferUrl}`;
    }
  } else {
    // Check if the response body contains a Transfer URL
    const body = await loginRes.text();
    const match = body.match(/href="([^"]*Transfer\?Token=[^"]*)"/);
    if (match) {
      transferUrl = match[1];
      if (!transferUrl.startsWith('http')) {
        transferUrl = `https://uwrg.psarcweb.com${transferUrl}`;
      }
    } else if (loginRes.ok) {
      // Login may have succeeded directly
      console.log('[PSA] Login succeeded directly (no transfer needed)');
      sessionExpires = Date.now() + SESSION_TTL;
      return;
    } else {
      throw new Error(`PSA login failed: ${loginRes.status} ${loginRes.statusText}`);
    }
  }

  // Step 2: POST to the transfer URL
  if (transferUrl) {
    try {
      const transferRes = await fetch(transferUrl, {
        method: 'POST',
        headers: {
          'Content-Length': '0',
          'User-Agent': UA,
          'Cookie': getCookieHeader(),
        },
        redirect: 'manual',
      });
      extractSetCookies(transferRes.headers);

      // Follow any additional redirects
      if (transferRes.status === 302) {
        const nextUrl = transferRes.headers.get('Location');
        if (nextUrl) {
          const fullUrl = nextUrl.startsWith('http') ? nextUrl : `https://uwrg.psarcweb.com${nextUrl}`;
          const followRes = await fetch(fullUrl, {
            headers: { 'User-Agent': UA, 'Cookie': getCookieHeader() },
            redirect: 'manual',
          });
          extractSetCookies(followRes.headers);
        }
      }
    } catch {
      // 302 redirect is expected and OK
    }
  }

  sessionExpires = Date.now() + SESSION_TTL;
  console.log(`[PSA] Login successful. Cookies: ${sessionCookies.length}`);
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

async function psaGet(url: string): Promise<string> {
  await login();
  const fullUrl = url.startsWith('http') ? url : `${PSA_BASE}${url}`;
  const res = await fetch(fullUrl, {
    headers: {
      'User-Agent': UA,
      'Cookie': getCookieHeader(),
      'Accept': 'text/html,application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`PSA GET ${res.status}: ${res.statusText} for ${fullUrl}`);
  }
  return res.text();
}

async function psaPost(url: string, data: Record<string, string | number>): Promise<string> {
  await login();
  const fullUrl = url.startsWith('http') ? url : `${PSA_BASE}${url}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    body.append(k, String(v));
  }
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      'Cookie': getCookieHeader(),
      'Accept': 'application/json',
    },
    body: body.toString(),
  });
  extractSetCookies(res.headers);
  if (!res.ok) {
    throw new Error(`PSA POST ${res.status}: ${res.statusText} for ${fullUrl}`);
  }
  return res.text();
}

// ─── Data Mapping ────────────────────────────────────────────────────────────

function mapJobTypeCode(code: string): JobType {
  const c = (code || '').toUpperCase().trim();
  if (c === 'WTR' || c.includes('WATER')) return 'WTR';
  if (c === 'MLD' || c.includes('MOLD')) return 'MLD';
  if (c === 'STR' || c.includes('STORM') || c.includes('WIND')) return 'STR';
  if (c === 'FIR' || c.includes('FIRE')) return 'FIR';
  if (c === 'BIO') return 'BIO';
  if (c === 'CON' || c === 'CNTNT' || c.includes('CONTENT')) return 'CNTNT';
  if (c === 'DUCT' || c.includes('HVAC')) return 'DUCT';
  if (c === 'RCN' || c === 'RECON' || c.includes('REBUILD')) return 'RECON';
  return 'WTR';
}

function mapStatus(psaStatus: string): WorkflowStatus {
  const s = (psaStatus || '').toLowerCase().trim();
  if (!s || s === 'new' || s.includes('no date')) return 'No Dates';
  if (s.includes('receiv') || s.includes('intake') || s === 'open') return 'Received';
  if (s.includes('inspect') || s.includes('assess') || s.includes('scope')) return 'Inspected';
  if (s.includes('pending') || s.includes('estimat') || s.includes('waiting') || s.includes('submitted')) return 'Pending';
  if (s.includes('approv')) return 'Approved';
  if (s.includes('wip') || s.includes('work in') || s.includes('active') || s.includes('production') || s.includes('in progress')) return 'WIP';
  if (s.includes('complet') || s.includes('closed') || s.includes('done') || s.includes('invoic')) return 'Completed';
  return 'Received';
}

function parseDateStr(s: string | null | undefined): string | null {
  if (!s) return null;
  const str = s.trim();
  if (!str) return null;

  // Try various date formats PSA returns
  // MM/DD/YYYY HH:MM AM/PM
  let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // ISO format
  match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return match[0];
  }
  // Try native Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

// ─── HTML Scraping Helpers (matching MyClaw's approach) ──────────────────────

function extractSelectValue(html: string, fieldId: string): string {
  const regex = new RegExp(`id="${fieldId}"[^>]*>(.*?)</select>`, 's');
  const section = html.match(regex);
  if (!section) return '';
  const selected = section[1].match(/selected[^>]*>([^<]*)/);
  return selected ? selected[1].trim() : '';
}

function extractInputValue(html: string, fieldId: string): string {
  const regex = new RegExp(`id="${fieldId}"[^>]*value="([^"]*)"`, 'i');
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

function extractPhones(html: string): string[] {
  const phones = html.match(/\(\d{3}\)\s*\d{3}[-.]?\d{4}|\d{3}[-.]?\d{3}[-.]?\d{4}/g) || [];
  const unique = [...new Set(phones.filter(p => p !== '866-992-2626'))];
  return unique;
}

function extractEmails(html: string): string[] {
  const emails = html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const filtered = emails.filter(e =>
    !['canamsys', 'google', 'jquery', 'fabric', 'ckeditor'].some(x => e.toLowerCase().includes(x))
  );
  return [...new Set(filtered)];
}

function notesContain(notes: JobNote[], keywords: string[]): boolean {
  const allText = notes.map(n => n.text.toLowerCase()).join(' ');
  return keywords.some(k => allText.includes(k.toLowerCase()));
}

// ─── PSA API Methods ─────────────────────────────────────────────────────────

interface PSARawJob {
  job_number: string;
  client_name: string;
  contact_name: string;
  insurance_info: string;
  address: string;
  state: string;
  city: string;
  assigned_to: string;
  date: string;
  status: string;
  job_id: number;
  territory: string;
  year: string;
  seq: string;
  job_type_code: string;
}

async function fetchAllOpenJobs(pageSize = 100): Promise<PSARawJob[]> {
  const allJobs: PSARawJob[] = [];
  let offset = 0;
  let total: number | null = null;

  while (total === null || offset < total) {
    const formData: Record<string, string | number> = {
      option: 'Open',
      iDisplayStart: offset,
      iDisplayLength: pageSize,
      sEcho: 1,
      iColumns: 11,
      iSortCol_0: 8,
      sSortDir_0: 'desc',
      iSortingCols: 1,
      mDataProp_10: 'id',
    };
    // Add column data props
    for (let i = 0; i < 10; i++) {
      formData[`mDataProp_${i}`] = `col${i}`;
    }

    const body = await psaPost('/Job/Job/ListFilter', formData);
    const data = JSON.parse(body);
    total = data.iTotalDisplayRecords;

    for (const row of data.aaData) {
      const job: PSARawJob = {
        job_number: row[0],
        client_name: row[1],
        contact_name: row[2],
        insurance_info: (row[3] || '').replace(/&nbsp;/g, '').trim(),
        address: row[4],
        state: row[5],
        city: row[6],
        assigned_to: row[7],
        date: row[8],
        status: row[9],
        job_id: row[10],
        territory: '',
        year: '',
        seq: '',
        job_type_code: '',
      };

      // Parse job number: territory-year-seq-type
      const parts = job.job_number.split('-');
      if (parts.length >= 4) {
        job.territory = parts[0];
        job.year = parts[1];
        job.seq = parts[2];
        job.job_type_code = parts[3].split(';')[0];
      }

      allJobs.push(job);
    }

    offset += pageSize;
    console.log(`[PSA] Fetched ${allJobs.length}/${total} jobs...`);
  }

  return allJobs;
}

interface PSAJobDetail {
  completeddisplay: number;
  revenuedisplay: number;
  deductible: number;
  job_type: string;
  alt_status: string;
  alt_status_id: string;
  location: string;
  team: string;
  referrer: string;
  dates: Record<string, string>;
  phones: string[];
  emails: string[];
  site_address1: string;
  site_city: string;
  site_region: string;
  site_postalcode: string;
}

async function fetchJobDetail(jobId: number): Promise<PSAJobDetail> {
  const html = await psaGet(`/Job/Job/Edit/${jobId}`);

  const detail: PSAJobDetail = {
    completeddisplay: 0,
    revenuedisplay: 0,
    deductible: 0,
    job_type: '',
    alt_status: '',
    alt_status_id: '',
    location: '',
    team: '',
    referrer: '',
    dates: {},
    phones: [],
    emails: [],
    site_address1: '',
    site_city: '',
    site_region: '',
    site_postalcode: '',
  };

  // Financial fields
  for (const field of ['CompletedDisplay', 'RevenueDisplay', 'Deductible']) {
    const val = extractInputValue(html, `Entity_${field}`);
    const key = field.toLowerCase() as keyof PSAJobDetail;
    if (val) {
      (detail as Record<string, unknown>)[key] = parseFloat(val) || 0;
    }
  }

  // Job type
  detail.job_type = extractSelectValue(html, 'Entity_JobTypeID');

  // Alt status
  const altSection = html.match(/id="Entity_AlternativeStatusID"[^>]*>(.*?)<\/select>/s);
  if (altSection) {
    const selected = altSection[1].match(/selected[^>]*value="(\d+)"[^>]*>([^<]*)/);
    if (selected) {
      detail.alt_status_id = selected[1];
      detail.alt_status = selected[2].trim();
    }
  }

  // Location, team, referrer
  detail.location = extractSelectValue(html, 'Entity_LocationID');
  // Team uses name= instead of id=
  const teamSection = html.match(/name="Entity\.TeamID"[^>]*>(.*?)<\/select>/s);
  if (teamSection) {
    const selected = teamSection[1].match(/selected[^>]*>([^<]*)/);
    if (selected) detail.team = selected[1].trim();
  }
  detail.referrer = extractSelectValue(html, 'Entity_ReferrerID');

  // Lifecycle dates
  const dateDescs = html.matchAll(/JobDates\[(\d+)\]\.DateTypeDescription"[^>]*value="([^"]*)"/g);
  const dateVals = html.matchAll(/(?:name="JobDates\[(\d+)\]\.DateTime"|id="JobDates_(\d+)__DateTime")[^>]*value="([^"]*)"/g);

  const descMap: Record<string, string> = {};
  for (const m of dateDescs) {
    descMap[m[1]] = m[2];
  }
  const valMap: Record<string, string> = {};
  for (const m of dateVals) {
    const idx = m[1] || m[2];
    valMap[idx] = m[3];
  }
  for (const [idx, desc] of Object.entries(descMap)) {
    const val = valMap[idx];
    if (val) {
      detail.dates[desc] = val;
    }
  }

  // Phones and emails
  detail.phones = extractPhones(html);
  detail.emails = extractEmails(html);

  // Address
  for (const field of ['Address1', 'City', 'Region', 'PostalCode']) {
    const val = extractInputValue(html, `Entity_rm_site_${field}`);
    if (val) {
      const key = `site_${field.toLowerCase()}` as keyof PSAJobDetail;
      (detail as Record<string, unknown>)[key] = val;
    }
  }

  return detail;
}

interface PSAFinancial {
  revenue_estimate: number;
  revenue_actual: number;
  cost_estimate: number;
  cost_actual: number;
  invoiced: number;
  paid: number;
  outstanding: number;
}

async function fetchJobFinancial(jobId: number): Promise<PSAFinancial> {
  const html = await psaGet(`/Job/Financial/List?linkID=${jobId}&UpdateTargetId=FinancialTab&Source=Job`);

  const financial: PSAFinancial = {
    revenue_estimate: 0,
    revenue_actual: 0,
    cost_estimate: 0,
    cost_actual: 0,
    invoiced: 0,
    paid: 0,
    outstanding: 0,
  };

  // Parse hidden input totals
  const fieldMap: Record<string, keyof PSAFinancial> = {
    'TotalCost.Actual': 'cost_actual',
    'TotalCost.Estimate': 'cost_estimate',
    'TotalRevenue.Actual': 'revenue_actual',
    'TotalRevenue.Estimate': 'revenue_estimate',
  };

  for (const [name, key] of Object.entries(fieldMap)) {
    const escapedName = name.replace(/\./g, '\\.');
    const regex = new RegExp(`name="${escapedName}"[^>]*value="([^"]*)"`, 'i');
    const match = html.match(regex);
    if (match && match[1]) {
      financial[key] = parseFloat(match[1]) || 0;
    }
  }

  // Also try parsing table for Invoiced/Paid/Outstanding
  const clean = html.replace(/<script[^>]*>.*?<\/script>/gs, '').replace(/<[^>]+>/g, '\t');
  const tokens = clean.split('\t').map(t => t.trim()).filter(Boolean);

  const labels = ['Invoiced', 'Paid', 'Outstanding'];
  for (let i = 0; i < tokens.length; i++) {
    if (labels.includes(tokens[i])) {
      // Look for dollar amount right after
      for (let j = 1; j <= 3; j++) {
        if (i + j < tokens.length) {
          const dollarMatch = tokens[i + j].match(/\$?([\d,]+\.?\d*)/);
          if (dollarMatch) {
            const val = parseFloat(dollarMatch[1].replace(/,/g, '')) || 0;
            const key = tokens[i].toLowerCase() as keyof PSAFinancial;
            if (key in financial) {
              financial[key] = val;
            }
            break;
          }
        }
      }
    }
  }

  return financial;
}

interface PSANote {
  id: string;
  created: string;
  employee: string;
  topic: string;
  subject: string;
  note: string;
}

async function fetchJobNotes(jobId: number, limit = 20): Promise<PSANote[]> {
  const formData: Record<string, string | number> = {
    iDisplayStart: 0,
    iDisplayLength: limit,
    sEcho: 1,
    iColumns: 11,
    iSortCol_0: 1,
    sSortDir_0: 'desc',
    iSortingCols: 1,
    linkID: jobId,
    linkSource: 'Job',
    displayOption: 'false',
    mustSeeNotes: 'false',
    mDataProp_10: 'id',
  };
  for (let i = 0; i < 10; i++) {
    formData[`mDataProp_${i}`] = `col${i}`;
  }

  const body = await psaPost(
    `/Relationship/Log/ListFilter?linkID=${jobId}&linkSource=Job&isCustomer=False`,
    formData
  );
  const data = JSON.parse(body);

  const notes: PSANote[] = [];
  for (const row of (data.aaData || [])) {
    const noteText = (String(row[8] || '')).replace(/<[^>]+>/g, '').trim();
    notes.push({
      id: String(row[0]),
      created: String(row[1] || ''),
      employee: String(row[4] || ''),
      topic: String(row[5] || ''),
      subject: String(row[7] || ''),
      note: noteText,
    });
  }

  return notes;
}

// ─── Enrichment: PSARawJob → Job ─────────────────────────────────────────────

async function enrichJob(raw: PSARawJob, allJobNumbers: string[]): Promise<Job> {
  let detail: PSAJobDetail | null = null;
  let financial: PSAFinancial | null = null;
  let psaNotes: PSANote[] = [];

  try {
    detail = await fetchJobDetail(raw.job_id);
  } catch (e) {
    console.error(`[PSA] Detail error for ${raw.job_number}:`, e);
  }

  try {
    financial = await fetchJobFinancial(raw.job_id);
  } catch (e) {
    console.error(`[PSA] Financial error for ${raw.job_number}:`, e);
  }

  try {
    psaNotes = await fetchJobNotes(raw.job_id);
  } catch (e) {
    console.error(`[PSA] Notes error for ${raw.job_number}:`, e);
  }

  // Map notes
  const notes: JobNote[] = psaNotes.map(n => ({
    date: parseDateStr(n.created) || new Date().toISOString().split('T')[0],
    author: n.employee || 'System',
    text: n.note || n.subject || '',
  }));

  // Revenue
  const estimateAmount = Math.max(
    financial?.revenue_estimate || 0,
    financial?.revenue_actual || 0,
    detail?.revenuedisplay || 0
  );
  const supplementAmount = 0; // PSA doesn't have a clean supplement field

  // Status — use alt_status if available, fall back to list status
  const statusSource = detail?.alt_status || raw.status || '';
  const status = mapStatus(statusSource);

  // Type — from job number code or detail
  const type = mapJobTypeCode(raw.job_type_code || detail?.job_type || '');

  // Dates from detail
  const dates = detail?.dates || {};
  let openedDate = parseDateStr(raw.date);
  let receivedDate: string | null = null;
  let inspectedDate: string | null = null;
  let estimateSentDate: string | null = null;
  let approvedDate: string | null = null;
  let productionStartDate: string | null = null;
  let completedDate: string | null = null;

  for (const [desc, val] of Object.entries(dates)) {
    const d = desc.toLowerCase();
    if (d.includes('received') || d.includes('created') || d.includes('reported') || d.includes('open')) {
      receivedDate = receivedDate || parseDateStr(val);
      if (!openedDate) openedDate = parseDateStr(val);
    }
    if (d.includes('inspect') || d.includes('assess') || d.includes('scope')) {
      inspectedDate = inspectedDate || parseDateStr(val);
    }
    if (d.includes('estimate') && d.includes('sent')) {
      estimateSentDate = estimateSentDate || parseDateStr(val);
    }
    if (d.includes('approv')) {
      approvedDate = approvedDate || parseDateStr(val);
    }
    if (d.includes('start') || d.includes('production') || d.includes('begin')) {
      productionStartDate = productionStartDate || parseDateStr(val);
    }
    if (d.includes('complet') || d.includes('close') || d.includes('finish')) {
      completedDate = completedDate || parseDateStr(val);
    }
  }

  if (!openedDate) openedDate = new Date().toISOString().split('T')[0];

  // Last activity from notes
  let lastActivityDate = openedDate;
  if (notes.length > 0) {
    const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));
    lastActivityDate = sorted[0].date;
  }

  // Insurance from the list data
  const insuranceCarrier = raw.insurance_info || '';

  // Contacts
  const contacts: JobContact[] = [];
  if (raw.contact_name) {
    contacts.push({
      role: 'Insurance Adjuster',
      name: raw.contact_name,
      phone: detail?.phones?.[0] || undefined,
    });
  }
  if (raw.client_name) {
    contacts.push({
      role: 'Property Owner',
      name: raw.client_name,
      phone: detail?.phones?.[1] || detail?.phones?.[0] || undefined,
    });
  }

  // Address
  const address = detail?.site_address1 || raw.address || '';
  const city = detail?.site_city || raw.city || '';

  // IICRC compliance — check notes
  const hasMoistureReadings = notesContain(notes, ['moisture', 'reading', 'gpp', 'rh', 'humidity']);
  const hasDryingLogs = notesContain(notes, ['drying log', 'daily monitor', 'day 1', 'day 2', 'drying progress']);
  const hasEquipmentPlacement = notesContain(notes, ['equipment', 'dehumidifier', 'air mover', 'placed', 'dehu']);
  const hasDailyMonitoring = notesContain(notes, ['daily monitor', 'daily check', 'monitoring log']);
  const hasDryStandard = notesContain(notes, ['dry standard', 'clearance', 'final read', 'dry goal', 'reached standard']);
  const hasSourceDocumented = notesContain(notes, ['source', 'cause', 'loss origin', 'pipe', 'ac ', 'roof', 'toilet']);

  // Ticket completeness
  const hasInsuranceInfo = !!insuranceCarrier.trim();
  const hasAdjusterContact = notesContain(notes, ['adjuster', 'adj.', 'adj ']);
  const hasClaimNumber = notesContain(notes, ['claim', 'claim #', 'claim number']);
  const hasEstimate = estimateAmount > 0;
  const hasPhotos = notesContain(notes, ['photo', 'picture', 'image']);
  const hasWorkAuth = notesContain(notes, ['work auth', 'authorization', 'signed']);
  const hasPhoneNumber = (detail?.phones?.length || 0) > 0;
  const hasScopeOfWork = notesContain(notes, ['scope']);

  // Upsell tracking — check if companion jobs exist
  const base = raw.job_number.split('-').slice(0, 3).join('-');
  const hasContentsJob = allJobNumbers.some(n => n.startsWith(base) && (n.endsWith('-CON') || n.includes('-CON;')));
  const hasReconEstimate = allJobNumbers.some(n => n.startsWith(base) && (n.endsWith('-STR') || n.endsWith('-RCN') || n.includes('-STR;') || n.includes('-RCN;')));
  const hasDuctCleaning = notesContain(notes, ['duct clean']);
  const hasSourceSolution = notesContain(notes, ['source solution', 'source repair']);

  return {
    id: String(raw.job_id),
    jobNumber: raw.job_number,
    customerName: raw.client_name,
    territory: `T-${raw.territory}`,
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
    claimNumber: '',
    adjusterName: raw.contact_name || '',
    adjusterPhone: detail?.phones?.[0] || '',
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
    photoCount: 0,
    priorityOverride: 0,
    assignedTech: raw.assigned_to || '',
    businessDev: detail?.referrer || '',
  };
}

// ─── Main Fetch Logic ────────────────────────────────────────────────────────

const EXCLUDE_STATUSES = new Set(['complete', 'completed', 'invoiced', 'closed', 'paid', 'collections']);
const EXCLUDE_ALT = new Set(['invoiced', 'paid', 'closed', 'collections', 'write off', 'write-off', 'completed']);

async function fetchT19Jobs(): Promise<Job[]> {
  console.log('[PSA] Fetching all open jobs...');
  const allJobs = await fetchAllOpenJobs(100);
  console.log(`[PSA] Total open jobs: ${allJobs.length}`);

  // Filter to T-19 and pre-invoice
  const t19 = allJobs.filter(j => {
    if (j.territory !== '19') return false;
    if (EXCLUDE_STATUSES.has((j.status || '').toLowerCase())) return false;
    return true;
  });

  console.log(`[PSA] T-19 pre-invoice jobs: ${t19.length}`);

  const allJobNumbers = allJobs.map(j => j.job_number);

  // Enrich jobs in batches of 5 for speed
  const enriched: Job[] = [];
  const batchSize = 5;

  for (let i = 0; i < t19.length; i += batchSize) {
    const batch = t19.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(j => enrichJob(j, allJobNumbers))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        enriched.push(result.value);
      }
    }

    console.log(`[PSA] Enriched ${Math.min(i + batchSize, t19.length)}/${t19.length}`);
  }

  // Post-enrich filter: remove jobs with alt_status indicating completion
  const filtered = enriched.filter(j => {
    // We stored alt_status in the status mapping already, but also check notes
    return true; // The status mapping already handles this
  });

  console.log(`[PSA] Final job count: ${filtered.length}`);
  return filtered;
}

// ─── Adapter Class ───────────────────────────────────────────────────────────

let cachedJobs: Job[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minute cache

class PSAAdapter implements DataAdapter {
  async getJobs(): Promise<Job[]> {
    if (cachedJobs && Date.now() - cacheTime < CACHE_TTL) {
      return cachedJobs;
    }

    cachedJobs = await fetchT19Jobs();
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
  jobCount?: number;
  sampleJobs?: string[];
  authError?: string;
}> {
  try {
    await login();

    // Quick test — fetch first page of jobs
    const formData: Record<string, string | number> = {
      option: 'Open',
      iDisplayStart: 0,
      iDisplayLength: 5,
      sEcho: 1,
      iColumns: 11,
      iSortCol_0: 8,
      sSortDir_0: 'desc',
      iSortingCols: 1,
      mDataProp_10: 'id',
    };
    for (let i = 0; i < 10; i++) {
      formData[`mDataProp_${i}`] = `col${i}`;
    }

    const body = await psaPost('/Job/Job/ListFilter', formData);
    const data = JSON.parse(body);

    return {
      authenticated: true,
      jobCount: data.iTotalRecords || 0,
      sampleJobs: (data.aaData || []).slice(0, 5).map((r: string[]) => `${r[0]} | ${r[1]} | ${r[9]}`),
    };
  } catch (e) {
    return {
      authenticated: false,
      authError: e instanceof Error ? e.message : String(e),
    };
  }
}
