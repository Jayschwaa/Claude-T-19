import { DataAdapter, Job, JobType, WorkflowStatus, JobNote, JobContact } from './types';
import { PSALocationConfig } from './psa-config';

// ─── Global Configuration ────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
if (typeof process !== 'undefined') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Debug target jobs — centralized list for tracking specific jobs through the pipeline
const TARGET_JOBS = ['3477', '3234', '3520', '3468', '3424', '3421', '3159', '3442', '3447', '3436', '3404', '3390'];
const isTargetJob = (jobNumber: string) => TARGET_JOBS.some(seq => jobNumber.includes(seq));

// ─── Team Role Registry ─────────────────────────────────────────────────────
// PSA doesn't have structured PM/Estimator/BD fields — only assigned_to (tech).
// We use a known team roster to map employee names to roles, then detect who's
// on each job from (a) assigned_to and (b) notes employee field.
type TeamRole = 'pm' | 'estimator' | 'bd' | 'ops_manager' | 'contents_manager' | 'tech';

interface TeamMember {
  role: TeamRole;
  displayRole: string; // For logging
}

// Keyed by lowercase name substring for fuzzy matching
const TEAM_REGISTRY: Record<string, Record<string, TeamMember>> = {
  t19: {
    'david kays': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'kays': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'dave': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'alejandra abel': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'abel': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'alejandra': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'jose': { role: 'pm', displayRole: 'Manager' },
    'natalie ramos': { role: 'bd', displayRole: 'Business Developer' },
    'ramos': { role: 'bd', displayRole: 'Business Developer' },
    'natalie': { role: 'bd', displayRole: 'Business Developer' },
    'natalia': { role: 'ops_manager', displayRole: 'Operations Manager' },
    'jondany gutierrez': { role: 'contents_manager', displayRole: 'Contents Manager' },
    'jondany': { role: 'contents_manager', displayRole: 'Contents Manager' },
    'gutierrez': { role: 'contents_manager', displayRole: 'Contents Manager' },
    'luis knight': { role: 'tech', displayRole: 'Technician' },
    'knight': { role: 'tech', displayRole: 'Technician' },
    'richard ali': { role: 'tech', displayRole: 'Technician' },
    'angel baloa': { role: 'tech', displayRole: 'Technician' },
    'baloa': { role: 'tech', displayRole: 'Technician' },
    'artsem babrouski': { role: 'tech', displayRole: 'Technician' },
    'artsem': { role: 'tech', displayRole: 'Technician' },
    'rovin corea-lazo': { role: 'tech', displayRole: 'Technician' },
    'rovin': { role: 'tech', displayRole: 'Technician' },
    'corea': { role: 'tech', displayRole: 'Technician' },
  },
  omaha: {
    // Will be populated as we discover the Omaha team
  },
};

function lookupTeamMember(locationId: string, name: string): TeamMember | null {
  if (!name) return null;
  const registry = TEAM_REGISTRY[locationId] || {};
  const lower = name.toLowerCase().trim();

  // Exact match first
  if (registry[lower]) return registry[lower];

  // Try last name match
  const parts = lower.split(/\s+/);
  if (parts.length > 1) {
    const lastName = parts[parts.length - 1];
    if (registry[lastName]) return registry[lastName];
  }

  // Try first name match (less reliable, only for unique first names)
  if (parts.length > 0 && registry[parts[0]]) {
    return registry[parts[0]];
  }

  return null;
}

/**
 * Given assigned_to + notes employees, figure out PM, BD, Estimator, and true Tech.
 */
function resolveRoles(
  locationId: string,
  assignedTo: string,
  noteEmployees: string[]
): { tech: string; pm: string; opsManager: string; estimator: string; bd: string } {
  const result = { tech: '', pm: '', opsManager: '', estimator: '', bd: '' };

  // Collect all unique people on this job
  const allPeople = new Set<string>();
  if (assignedTo) allPeople.add(assignedTo);
  for (const emp of noteEmployees) {
    if (emp && emp !== 'System' && emp.length > 1) allPeople.add(emp);
  }

  // Classify each person
  for (const person of allPeople) {
    const member = lookupTeamMember(locationId, person);
    if (!member) {
      // Unknown person — if they're the assigned_to, treat as tech
      if (person === assignedTo && !result.tech) {
        result.tech = person;
      }
      continue;
    }

    switch (member.role) {
      case 'ops_manager':
        if (!result.opsManager) result.opsManager = person;
        break;
      case 'pm':
        if (!result.pm) result.pm = person;
        break;
      case 'bd':
      case 'estimator':
        if (!result.bd) result.bd = person;
        if (!result.estimator) result.estimator = person;
        break;
      case 'contents_manager':
        // Jondany shows up as assigned_to on contents jobs — he's not a field tech
        // but put him in tech slot since he manages that division's fieldwork
        if (!result.tech) result.tech = person;
        break;
      case 'tech':
        if (!result.tech) result.tech = person;
        break;
    }
  }

  // If assigned_to is a PM/BD (e.g. David Kays assigned to a job),
  // don't put them in the tech slot — they're already in their correct role
  if (assignedTo) {
    const assignedMember = lookupTeamMember(locationId, assignedTo);
    if (!assignedMember || assignedMember.role === 'tech' || assignedMember.role === 'contents_manager') {
      // Actual tech or unknown — use as tech
      if (!result.tech) result.tech = assignedTo;
    }
  }

  return result;
}

// ─── PSA Session Class ───────────────────────────────────────────────────────

class PSASession {
  private config: PSALocationConfig;
  private sessionCookies: string[] = [];
  private sessionExpires = 0;
  private readonly SESSION_TTL = 25 * 60 * 1000; // 25 minutes

  constructor(config: PSALocationConfig) {
    this.config = config;
  }

  private getCookieHeader(): string {
    return this.sessionCookies.join('; ');
  }

  private extractSetCookies(headers: Headers): void {
    // Try getSetCookie() first (Node 20+), fall back to get('set-cookie') for Node 18
    let setCookieValues: string[] = [];

    if (typeof headers.getSetCookie === 'function') {
      setCookieValues = headers.getSetCookie();
    } else {
      // Node 18 fallback: get('set-cookie') returns all values joined by ', '
      // We need to split carefully since cookie values can contain commas in expires
      const raw = headers.get('set-cookie');
      if (raw) {
        // Split on ', ' followed by a cookie name pattern (word=)
        setCookieValues = raw.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_]*=)/);
      }
    }

    for (const sc of setCookieValues) {
      const nameVal = sc.split(';')[0].trim();
      if (!nameVal || !nameVal.includes('=')) continue;
      const name = nameVal.split('=')[0];
      // Replace existing cookie with same name, or add new
      this.sessionCookies = this.sessionCookies.filter(c => !c.startsWith(name + '='));
      this.sessionCookies.push(nameVal);
    }

    if (setCookieValues.length > 0) {
      console.log(`[PSA:${this.config.id}] Extracted ${setCookieValues.length} cookies. Total: ${this.sessionCookies.length}`);
    }
  }

  async login(): Promise<void> {
    // Return if session is still valid
    if (this.sessionCookies.length > 0 && Date.now() < this.sessionExpires) {
      return;
    }

    // Reset cookies
    this.sessionCookies = [];

    console.log(`[PSA:${this.config.id}] Logging in...`);

    // Step 1: POST to /Account/Login with form data
    const loginBody = new URLSearchParams({
      Username: this.config.username,
      Password: this.config.password,
      Schema: this.config.schema,
    });

    const loginRes = await fetch(`${this.config.baseUrl}/Account/Login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
      },
      body: loginBody.toString(),
      redirect: 'manual',
    });

    // Capture cookies from login response
    this.extractSetCookies(loginRes.headers);

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
      console.log(`[PSA:${this.config.id}] Login response status=${loginRes.status}, body length=${body.length}, first 300 chars: ${body.substring(0, 300).replace(/\n/g, ' ')}`);

      const match = body.match(/href="([^"]*Transfer\?Token=[^"]*)"/);
      if (match) {
        transferUrl = match[1];
        if (!transferUrl.startsWith('http')) {
          transferUrl = `https://uwrg.psarcweb.com${transferUrl}`;
        }
      } else {
        // Also try looking for a meta refresh or JS redirect with token
        const metaMatch = body.match(/url=([^"]*Transfer\?Token=[^"]*)/i);
        const jsMatch = body.match(/window\.location\s*=\s*['"]([^'"]*Transfer\?Token=[^'"]*)['"]/i);
        const actionMatch = body.match(/action="([^"]*Transfer[^"]*)"/i);

        if (metaMatch) {
          transferUrl = metaMatch[1];
        } else if (jsMatch) {
          transferUrl = jsMatch[1];
        } else if (actionMatch) {
          transferUrl = actionMatch[1];
        }

        if (transferUrl && !transferUrl.startsWith('http')) {
          transferUrl = `https://uwrg.psarcweb.com${transferUrl}`;
        }

        if (!transferUrl) {
          if (loginRes.ok) {
            // Login may have succeeded directly
            console.log(`[PSA:${this.config.id}] Login succeeded directly (no transfer needed)`);
            this.sessionExpires = Date.now() + this.SESSION_TTL;
            return;
          }
          // Check for error messages in the body
          const errorMatch = body.match(/class="validation-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          throw new Error(`PSA login failed: ${loginRes.status} ${loginRes.statusText}. ${errorText ? 'Error: ' + errorText : 'No transfer URL found. Check credentials/schema.'}`);
        }
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
            'Cookie': this.getCookieHeader(),
          },
          redirect: 'manual',
        });
        this.extractSetCookies(transferRes.headers);

        // Follow any additional redirects
        if (transferRes.status === 302) {
          const nextUrl = transferRes.headers.get('Location');
          if (nextUrl) {
            const fullUrl = nextUrl.startsWith('http') ? nextUrl : `https://uwrg.psarcweb.com${nextUrl}`;
            const followRes = await fetch(fullUrl, {
              headers: { 'User-Agent': UA, 'Cookie': this.getCookieHeader() },
              redirect: 'manual',
            });
            this.extractSetCookies(followRes.headers);
          }
        }
      } catch {
        // 302 redirect is expected and OK
      }
    }

    this.sessionExpires = Date.now() + this.SESSION_TTL;
    console.log(`[PSA:${this.config.id}] Login successful. Cookies: ${this.sessionCookies.length}: ${this.sessionCookies.map(c => c.split('=')[0]).join(', ')}`);
  }

  async psaGet(url: string): Promise<string> {
    await this.login();
    const fullUrl = url.startsWith('http') ? url : `${this.config.baseUrl}${url}`;
    const res = await fetch(fullUrl, {
      headers: {
        'User-Agent': UA,
        'Cookie': this.getCookieHeader(),
        'Accept': 'text/html,application/json',
      },
    });
    this.extractSetCookies(res.headers);
    if (!res.ok) {
      throw new Error(`PSA GET ${res.status}: ${res.statusText} for ${fullUrl}`);
    }
    // Check if we got redirected to login page
    const text = await res.text();
    const isActualLoginPage = text.includes('id="Password"') && text.includes('/Account/Login') && !text.includes('Entity_AlternativeStatusID') && text.length < 50000;
    if (isActualLoginPage) {
      console.warn(`[PSA:${this.config.id}] Got login page for GET ${url} — session may have expired`);
      // Reset session and retry once
      this.sessionCookies = [];
      this.sessionExpires = 0;
      await this.login();
      const retry = await fetch(fullUrl, {
        headers: { 'User-Agent': UA, 'Cookie': this.getCookieHeader(), 'Accept': 'text/html,application/json' },
      });
      this.extractSetCookies(retry.headers);
      if (!retry.ok) throw new Error(`PSA GET retry ${retry.status}: ${retry.statusText}`);
      return retry.text();
    }
    return text;
  }

  async psaPost(url: string, data: Record<string, string | number>): Promise<string> {
    await this.login();
    const fullUrl = url.startsWith('http') ? url : `${this.config.baseUrl}${url}`;
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      body.append(k, String(v));
    }
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Cookie': this.getCookieHeader(),
        'Accept': 'application/json',
      },
      body: body.toString(),
    });
    this.extractSetCookies(res.headers);
    if (!res.ok) {
      throw new Error(`PSA POST ${res.status}: ${res.statusText} for ${fullUrl}`);
    }
    return res.text();
  }

  // ─── Column Mapping ───────────────────────────────────────────────────────
  // PSA returns different column orders depending on schema/configuration.
  // T-19 (schema 1022): [job_number, client, contact, insurance, address, state, city, assigned_to, date, status, id]
  // Omaha (schema 1520): [date, job_number, client, address, insurance, ??, assigned_to, amount, status, contact, id]
  // We auto-detect by checking if row[0] looks like a date vs a job number.

  private parseRowToJob(row: string[]): PSARawJob {
    const isDateFirst = /^\d{1,2}\/\d{1,2}\/\d{4}/.test(row[0]);

    if (isDateFirst) {
      // Omaha layout: [date, job_number, client, address, insurance, alt_status, assigned_to, amount, status, contact, id]
      const addr = (row[3] || '');
      // Parse city from address like "308 S 19th, Omaha, NE, 68102"
      const addrParts = addr.split(',').map(s => s.trim());
      const city = addrParts.length >= 2 ? addrParts[addrParts.length - 3] || addrParts[1] || '' : '';
      const state = addrParts.length >= 3 ? addrParts[addrParts.length - 2] || '' : '';

      return {
        job_number: row[1] || '',
        client_name: row[2] || '',
        contact_name: (row[9] || '').replace(/&nbsp;/g, '').trim(),
        insurance_info: (row[4] || '').replace(/&nbsp;/g, '').trim(),
        address: addr,
        state: state,
        city: city,
        assigned_to: row[6] || '',
        date: row[0] || '',
        status: row[8] || '',
        list_alt_status: (row[5] || '').replace(/&nbsp;/g, '').replace(/%/g, '').trim(),
        list_amount: parseFloat((row[7] || '0').replace(/[^0-9.-]/g, '')) || 0,
        job_id: parseInt(row[10]) || 0,
        territory: '', year: '', seq: '', job_type_code: '',
      };
    } else {
      // T-19 Pompano layout: [job_number, client, contact, insurance, address, state, city, assigned_to, date, status, id]
      return {
        job_number: row[0] || '',
        client_name: row[1] || '',
        contact_name: row[2] || '',
        insurance_info: (row[3] || '').replace(/&nbsp;/g, '').trim(),
        address: row[4] || '',
        state: row[5] || '',
        city: row[6] || '',
        assigned_to: row[7] || '',
        date: row[8] || '',
        status: row[9] || '',
        list_alt_status: '',  // T-19 layout doesn't have alt_status in list
        list_amount: 0,
        job_id: parseInt(row[10]) || 0,
        territory: '', year: '', seq: '', job_type_code: '',
      };
    }
  }

  private parseJobNumber(job: PSARawJob): void {
    const parts = job.job_number.split('-');
    if (parts.length >= 4) {
      job.territory = parts[0];
      job.year = parts[1];
      job.seq = parts[2];
      job.job_type_code = parts[3].split(';')[0];
    }
  }

  // ─── Data Fetching Methods (use session's HTTP methods) ──────────────────

  async fetchJobsByOption(option: string, pageSize = 100): Promise<PSARawJob[]> {
    const allJobs: PSARawJob[] = [];
    let offset = 0;
    let total: number | null = null;

    while (total === null || offset < total) {
      const formData: Record<string, string | number> = {
        option,
        iDisplayStart: offset,
        iDisplayLength: pageSize,
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

      const body = await this.psaPost('/Job/Job/ListFilter', formData);

      // Check if we got HTML instead of JSON (login failure / session issue)
      if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
        console.error(`[PSA:${this.config.id}] ListFilter returned HTML instead of JSON. First 200 chars: ${body.substring(0, 200)}`);
        // Force re-login and retry once
        this.sessionCookies = [];
        this.sessionExpires = 0;
        await this.login();
        const retryBody = await this.psaPost('/Job/Job/ListFilter', formData);
        if (retryBody.trimStart().startsWith('<!DOCTYPE') || retryBody.trimStart().startsWith('<html')) {
          throw new Error(`PSA ListFilter returns HTML after re-login. Login may have failed for schema ${this.config.schema}. First 300 chars: ${retryBody.substring(0, 300)}`);
        }
        const retryData = JSON.parse(retryBody);
        total = retryData.iTotalDisplayRecords;
        for (const row of retryData.aaData) {
          const job = this.parseRowToJob(row);
          this.parseJobNumber(job);
          allJobs.push(job);
        }
        offset += pageSize;
        console.log(`[PSA:${this.config.id}] Fetched ${allJobs.length}/${total} jobs (after retry)...`);
        continue;
      }

      const data = JSON.parse(body);
      total = data.iTotalDisplayRecords;

      // Log first row to understand column mapping per location
      if (offset === 0 && data.aaData && data.aaData.length > 0) {
        const firstRow = data.aaData[0];
        console.log(`[PSA:${this.config.id}] First row ALL columns (${firstRow.length} cols): ${JSON.stringify(firstRow)}`);
      }

      for (const row of data.aaData) {
        const job = this.parseRowToJob(row);
        this.parseJobNumber(job);

        allJobs.push(job);
      }

      // Log target jobs found in this page
      offset += pageSize;
      console.log(`[PSA:${this.config.id}] Fetched ${allJobs.length}/${total} ${option} jobs...`);
    }

    return allJobs;
  }

  /**
   * Fetch recent closed jobs with pagination (up to maxPages pages).
   * Pre-filters by territory and year to avoid enriching irrelevant historical jobs.
   * Paginates to find more completed-not-invoiced jobs that PSA moved to "Closed".
   */
  async fetchRecentClosedJobs(pageSize = 300): Promise<PSARawJob[]> {
    const maxPages = 5; // Up to 5 pages = 1500 closed jobs scanned
    const jobs: PSARawJob[] = [];
    let totalInPSA = 0;
    let totalFetched = 0;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      const formData: Record<string, string | number> = {
        option: 'Closed',
        iDisplayStart: offset,
        iDisplayLength: pageSize,
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

      const body = await this.psaPost('/Job/Job/ListFilter', formData);
      if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
        console.warn(`[PSA:${this.config.id}] Closed jobs page ${page + 1} returned HTML — stopping`);
        break;
      }

      const data = JSON.parse(body);
      totalInPSA = data.iTotalDisplayRecords || 0;
      const rows = data.aaData || [];
      totalFetched += rows.length;

      console.log(`[PSA:${this.config.id}] Closed jobs page ${page + 1}: fetched ${rows.length} (offset ${offset}, total in PSA: ${totalInPSA})`);

      for (const row of rows) {
        const job = this.parseRowToJob(row);
        this.parseJobNumber(job);

        if (isTargetJob(job.job_number)) {
          console.log(`[PSA:${this.config.id}] TARGET CLOSED: ${job.job_number} (t=${job.territory}, y=${job.year})`);
        }

        // Pre-filter: only keep jobs matching territory and year
        if (this.config.territoryFilter && job.territory !== this.config.territoryFilter) continue;
        if (this.config.yearFilter.length > 0 && !this.config.yearFilter.includes(job.year)) continue;
        if (EXCLUDED_PSA_TYPES.has(job.job_type_code.toUpperCase())) continue;
        jobs.push(job);
      }

      // Stop if we've fetched all available or no more rows
      if (rows.length < pageSize || offset + rows.length >= totalInPSA) break;
    }

    console.log(`[PSA:${this.config.id}] Closed jobs after territory/year filter: ${jobs.length} (scanned ${totalFetched} of ${totalInPSA} total in PSA)`);
    return jobs;
  }

  async fetchJobDetail(jobId: number): Promise<PSAJobDetail> {
    const html = await this.psaGet(`/Job/Job/Edit/${jobId}`);

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
      projectManager: '',
      estimator: '',
      dates: {},
      phones: [],
      emails: [],
      site_address1: '',
      site_city: '',
      site_region: '',
      site_postalcode: '',
    };

    // Financial fields
    const completedVal = extractInputValue(html, 'Entity_CompletedDisplay');
    if (completedVal) detail.completeddisplay = parseFloat(completedVal) || 0;
    const revenueVal = extractInputValue(html, 'Entity_RevenueDisplay');
    if (revenueVal) detail.revenuedisplay = parseFloat(revenueVal) || 0;
    const deductibleVal = extractInputValue(html, 'Entity_Deductible');
    if (deductibleVal) detail.deductible = parseFloat(deductibleVal) || 0;

    detail.job_type = extractSelectValue(html, 'Entity_JobTypeID');

    // Alt status
    const altSection = html.match(/id="Entity_AlternativeStatusID"[^>]*>([\s\S]*?)<\/select>/);
    if (altSection) {
      const sel = findSelectedOption(altSection[1]);
      if (sel) {
        detail.alt_status_id = sel.value;
        detail.alt_status = sel.text;
      }
    }

    // Location, team, referrer
    detail.location = extractSelectValue(html, 'Entity_LocationID');
    const teamSection = html.match(/name="Entity\.TeamID"[^>]*>(.*?)<\/select>/s);
    if (teamSection) {
      const selected = teamSection[1].match(/selected[^>]*>([^<]*)/);
      if (selected) detail.team = selected[1].trim();
    }
    detail.referrer = extractSelectValue(html, 'Entity_ReferrerID');

    // Log all Entity_ select fields for debugging people/roles
    const entitySelectRegex = /<select[^>]*?id="(Entity_[^"]*?)"[^>]*>([\s\S]*?)<\/select>/g;
    let entityMatch;
    const entityFields: Record<string, string> = {};
    const htmlCopy = html; // don't mutate
    while ((entityMatch = entitySelectRegex.exec(htmlCopy)) !== null) {
      const fieldId = entityMatch[1];
      const sel = findSelectedOption(entityMatch[2]);
      if (sel && sel.text && sel.text !== '-- Not Set --' && sel.text !== '-- Select --') {
        entityFields[fieldId] = sel.text;
      }
    }
    console.log(`[PSA:${this.config.id}] Entity selects for job: ${JSON.stringify(entityFields)}`);

    // Note: PSA does NOT have PM/Estimator/BD person fields as selects.
    // Entity_ selects only contain: JobTypeID, LocationID, BuildingTypeID, TeamID, ReferrerID.
    // People roles are resolved via team registry + notes employee analysis in enrichJob().
    detail.projectManager = '';
    detail.estimator = '';

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
    const addr1 = extractInputValue(html, 'Entity_rm_site_Address1');
    if (addr1) detail.site_address1 = addr1;
    const cityVal = extractInputValue(html, 'Entity_rm_site_City');
    if (cityVal) detail.site_city = cityVal;
    const regionVal = extractInputValue(html, 'Entity_rm_site_Region');
    if (regionVal) detail.site_region = regionVal;
    const postalVal = extractInputValue(html, 'Entity_rm_site_PostalCode');
    if (postalVal) detail.site_postalcode = postalVal;

    // Detail fetched for jobId (alt_status, revenue, dates, phones parsed)
    return detail;
  }

  async fetchJobFinancial(jobId: number): Promise<PSAFinancial> {
    const html = await this.psaGet(`/Job/Financial/List?linkID=${jobId}&UpdateTargetId=FinancialTab&Source=Job`);

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
      // Also try with underscores (TotalRevenue_Estimate) and by id attribute
      const escapedUnderscore = name.replace(/\./g, '_');
      const regexes = [
        new RegExp(`name="${escapedName}"[^>]*value="([^"]*)"`, 'i'),
        new RegExp(`value="([^"]*)"[^>]*name="${escapedName}"`, 'i'),
        new RegExp(`id="${escapedUnderscore}"[^>]*value="([^"]*)"`, 'i'),
        new RegExp(`value="([^"]*)"[^>]*id="${escapedUnderscore}"`, 'i'),
        new RegExp(`name="${escapedUnderscore}"[^>]*value="([^"]*)"`, 'i'),
      ];
      for (const regex of regexes) {
        const match = html.match(regex);
        if (match && match[1]) {
          const val = parseFloat(match[1]) || 0;
          if (val > 0) {
            financial[key] = val;
            break;
          }
        }
      }
    }

    // Parse financial table
    const clean = html.replace(/<script[^>]*>.*?<\/script>/gs, '').replace(/<[^>]+>/g, '\t');
    const tokens = clean.split('\t').map(t => t.trim()).filter(Boolean);

    const financialLabels = ['Material', 'Labor', 'Subtrade', 'Equipment', 'Expense',
      'Revenue Overhead', 'Cost', 'Revenue', 'Profit', 'Gross Margin',
      'Invoiced', 'Paid', 'Outstanding'];

    for (let i = 0; i < tokens.length; i++) {
      if (financialLabels.includes(tokens[i])) {
        const amounts: number[] = [];
        for (let j = 1; j <= 5; j++) {
          if (i + j >= tokens.length) break;
          const next = tokens[i + j];
          if (financialLabels.includes(next) || next === 'Totals' || next === 'Actual' || next === 'Estimate') break;
          const dollarVals = next.match(/\(?\$?[\d,]+\.?\d*\)?%?/g) || [];
          for (const dv of dollarVals) {
            const cleaned = dv.replace(/\$/g, '').replace(/,/g, '').replace('(', '-').replace(')', '').replace('%', '').trim();
            if (cleaned) {
              const n = parseFloat(cleaned);
              if (!isNaN(n)) amounts.push(n);
            }
          }
        }
        const label = tokens[i].toLowerCase().replace(/ /g, '_');
        if (label === 'revenue') {
          if (amounts.length >= 1 && !financial.revenue_actual) financial.revenue_actual = amounts[0];
          if (amounts.length >= 2 && !financial.revenue_estimate) financial.revenue_estimate = amounts[1];
        } else if (label === 'cost') {
          if (amounts.length >= 1 && !financial.cost_actual) financial.cost_actual = amounts[0];
          if (amounts.length >= 2 && !financial.cost_estimate) financial.cost_estimate = amounts[1];
        } else if (label === 'invoiced' && amounts.length >= 1) {
          financial.invoiced = amounts[0];
        } else if (label === 'paid' && amounts.length >= 1) {
          financial.paid = amounts[0];
        } else if (label === 'outstanding' && amounts.length >= 1) {
          financial.outstanding = amounts[0];
        }
      }
    }

    return financial;
  }

  /**
   * Fetch estimates from the PSA estimate/attachment folder for a job.
   * Returns estimates sorted by due date (most recent first).
   * Used as a fallback revenue source when financial table returns $0.
   */
  async fetchJobEstimates(jobId: number): Promise<{ amount: number; dueDate: string; name: string }[]> {
    // Try multiple possible PSA endpoints for estimates
    const endpoints = [
      `/Job/Estimate/List?linkID=${jobId}&Source=Job`,
      `/Estimate/Estimate/ListFilter?linkID=${jobId}&linkSource=Job`,
    ];

    for (const endpoint of endpoints) {
      try {
        const html = await this.psaGet(endpoint);
        if (!html || html.length < 50) continue;
        if (html.includes('404') || html.includes('Not Found')) continue;

        const estimates: { amount: number; dueDate: string; name: string }[] = [];

        // Strip scripts, parse table rows
        const clean = html.replace(/<script[^>]*>.*?<\/script>/gs, '');

        // Look for table rows with estimate data
        // PSA tables typically have: Name, Due Date, Amount columns
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(clean)) !== null) {
          const rowHtml = rowMatch[1];
          const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
          const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, '').trim());

          // Find amount (dollar value) and date in this row
          let amount = 0;
          let dueDate = '';
          let name = '';

          for (const text of cellTexts) {
            // Check for dollar amounts
            const dollarMatch = text.match(/\$?([\d,]+\.?\d*)/);
            if (dollarMatch && !amount) {
              const val = parseFloat(dollarMatch[1].replace(/,/g, ''));
              if (val > 0) amount = val;
            }
            // Check for dates
            const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
            if (dateMatch && !dueDate) {
              dueDate = parseDateStr(dateMatch[1]) || '';
            }
            // First non-date non-dollar text is the name
            if (text.length > 2 && !text.match(/^\$/) && !text.match(/^\d{1,2}\//) && !name) {
              name = text;
            }
          }

          if (amount > 0) {
            estimates.push({ amount, dueDate, name });
          }
        }

        // Also try hidden inputs for total estimate amount
        const totalMatch = html.match(/name="[^"]*[Tt]otal[^"]*"[^>]*value="([^"]*)"/) ||
                          html.match(/value="([^"]*)"[^>]*name="[^"]*[Tt]otal[^"]*"/);
        if (totalMatch) {
          const val = parseFloat(totalMatch[1].replace(/,/g, ''));
          if (val > 0 && !estimates.some(e => e.amount === val)) {
            estimates.push({ amount: val, dueDate: '', name: 'Total Estimate' });
          }
        }

        // Sort by due date descending (most recent first)
        estimates.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return b.dueDate.localeCompare(a.dueDate);
        });

        if (estimates.length > 0) {
          console.log(`[PSA:${this.config.id}] Estimates for job ${jobId}: ${estimates.length} found, highest=$${estimates[0].amount} (via ${endpoint})`);
          return estimates;
        }
      } catch {
        // Endpoint doesn't exist or error — try next
        continue;
      }
    }

    return [];
  }

  async fetchJobNotes(jobId: number, limit = 20): Promise<PSANote[]> {
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

    const body = await this.psaPost(
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

  async enrichJob(raw: PSARawJob, allJobNumbers: string[]): Promise<Job> {
    let detail: PSAJobDetail | null = null;
    let financial: PSAFinancial | null = null;
    let psaNotes: PSANote[] = [];
    let estimateFolderAmount = 0;

    try {
      detail = await this.fetchJobDetail(raw.job_id);
    } catch (e) {
      console.error(`[PSA:${this.config.id}] Detail error for ${raw.job_number}:`, e);
    }

    try {
      financial = await this.fetchJobFinancial(raw.job_id);
    } catch (e) {
      console.error(`[PSA:${this.config.id}] Financial error for ${raw.job_number}:`, e);
    }

    try {
      psaNotes = await this.fetchJobNotes(raw.job_id);
    } catch (e) {
      console.error(`[PSA:${this.config.id}] Notes error for ${raw.job_number}:`, e);
    }

    // Check primary revenue sources first; only fetch estimate folder if all are $0
    const primaryRevenue = Math.max(
      financial?.revenue_estimate || 0,
      financial?.revenue_actual || 0,
      detail?.revenuedisplay || 0,
      detail?.completeddisplay || 0,
      raw.list_amount || 0,
    );

    if (primaryRevenue === 0) {
      // Fallback: fetch from estimate folder (most recent due date)
      try {
        const estimates = await this.fetchJobEstimates(raw.job_id);
        if (estimates.length > 0) {
          estimateFolderAmount = estimates[0].amount; // Most recent by due date
          console.log(`[PSA:${this.config.id}] Estimate folder fallback for ${raw.job_number}: $${estimateFolderAmount} (${estimates[0].name})`);
        }
      } catch (e) {
        console.error(`[PSA:${this.config.id}] Estimate folder error for ${raw.job_number}:`, e);
      }
    }

    // Map notes
    const notes: JobNote[] = psaNotes.map(n => ({
      date: parseDateStr(n.created) || new Date().toISOString().split('T')[0],
      author: n.employee || 'System',
      text: n.note || n.subject || '',
    }));

    // Revenue — take the highest non-zero value across all sources
    // Financial table and detail page can each have different amounts; the highest is most accurate
    // Estimate folder is only fetched/used as fallback when primary sources return $0
    const estimateAmount = Math.max(
      financial?.revenue_estimate || 0,
      financial?.revenue_actual || 0,
      detail?.revenuedisplay || 0,
      detail?.completeddisplay || 0,
      raw.list_amount || 0,
      estimateFolderAmount,  // Fallback from estimate folder (0 if primary sources had values)
    );
    const supplementAmount = 0;
    if (estimateAmount > 0) {
      // Revenue logged only for target jobs to reduce noise
      if (isTargetJob(raw.job_number)) console.log(`[PSA:${this.config.id}] Revenue ${raw.job_number}: $${estimateAmount}`);
    }

    // Type
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
    let invoicedDate: string | null = null;

    let estimateCompletedDate: string | null = null;
    let estimateSubmittedDate: string | null = null;

    for (const [desc, val] of Object.entries(dates)) {
      const d = desc.toLowerCase();
      if (d.includes('received') || d.includes('created') || d.includes('reported') || d.includes('open')) {
        receivedDate = receivedDate || parseDateStr(val);
        if (!openedDate) openedDate = parseDateStr(val);
      }
      if (d.includes('inspect') || d.includes('assess') || d.includes('scope')) {
        inspectedDate = inspectedDate || parseDateStr(val);
      }
      if (d.includes('complet') && d.includes('estimate')) {
        estimateCompletedDate = estimateCompletedDate || parseDateStr(val);
      }
      if ((d.includes('estimate') && d.includes('sent')) || d.includes('submitted') || d === 'esn submitted') {
        estimateSubmittedDate = estimateSubmittedDate || parseDateStr(val);
      }
      if (d.includes('approv')) {
        approvedDate = approvedDate || parseDateStr(val);
      }
      if (d.includes('production') || d.includes('work start') || d === 'start date' ||
          d.includes('mitigation start') || (d.includes('start') && !d.includes('restart') && !d.includes('estimate'))) {
        productionStartDate = productionStartDate || parseDateStr(val);
      }
      const isFullJobComplete = (
        (d.includes('complet') || d.includes('finish')) &&
        !d.includes('mitig') && !d.includes('phase') && !d.includes('clear') &&
        !d.includes('demo') && !d.includes('drying') && !d.includes('pack') &&
        !d.includes('estimate')
      ) || d.includes('close out') || d.includes('job close') || d.includes('final close') ||
        d.includes('production closed');
      if (isFullJobComplete) {
        completedDate = completedDate || parseDateStr(val);
      }
      if (d.includes('invoic') || d.includes('accounting closed')) {
        invoicedDate = invoicedDate || parseDateStr(val);
      }
    }

    estimateSentDate = estimateSubmittedDate || estimateCompletedDate;

    if (!openedDate) openedDate = new Date().toISOString().split('T')[0];

    // Status derivation — use PSA's STAGE/alt_status field as primary source,
    // with date-based logic as fallback
    let status: WorkflowStatus;
    const psaListStatus = (raw.status || '').toLowerCase().trim();  // OPEN/CLOSED
    const listAltStatus = (raw.list_alt_status || '').toLowerCase().trim(); // Stage from list (Omaha col5)
    const detailAltStatus = (detail?.alt_status || '').toLowerCase();
    // Use the best available stage: list alt_status > detail alt_status > list status
    const altStatus = listAltStatus || detailAltStatus;
    const psaStage = listAltStatus || psaListStatus;

    // Map PSA stage values to our workflow statuses
    const stageStatus = mapStatus(psaStage);

    // Date-based overrides for more precision
    const subPhaseWords = ['mitig', 'estimate', 'pack', 'demo', 'drying', 'phase', 'clear'];
    const isSubPhaseComplete = altStatus.includes('complete') && subPhaseWords.some(w => altStatus.includes(w));
    const altStatusIsJobComplete = (
      altStatus.includes('paid') || altStatus.includes('collections') ||
      altStatus.includes('closed') || altStatus.includes('write off') || altStatus.includes('invoiced') ||
      (altStatus.includes('complete') && !isSubPhaseComplete)
    );

    if (completedDate || altStatusIsJobComplete) {
      status = 'Completed';
    } else if (stageStatus !== 'Received') {
      // Trust the PSA stage if it's anything other than the default
      status = stageStatus;
    } else if (productionStartDate) {
      status = 'WIP';
    } else if (approvedDate || estimateSubmittedDate) {
      status = 'Sales';
    } else if (inspectedDate || estimateCompletedDate) {
      status = 'Scoped';
    } else {
      status = 'Received';
    }

    console.log(`[PSA:${this.config.id}] Status for ${raw.job_number}: listStatus="${psaListStatus}" listAlt="${listAltStatus}" detailAlt="${detailAltStatus}" stage="${psaStage}" → ${stageStatus}, final=${status}`);

    // ─── Resolve People Roles via Team Registry ─────────────────────────────
    const noteEmployees = psaNotes.map(n => n.employee).filter(Boolean);
    const roles = resolveRoles(this.config.id, raw.assigned_to || '', noteEmployees);

    console.log(`[PSA:${this.config.id}] Job ${raw.job_number}: dates=[${Object.keys(dates).join(',')}] alt="${detail?.alt_status || ''}" → status="${status}" | roles: tech="${roles.tech}" pm="${roles.pm}" ops="${roles.opsManager}" bd="${roles.bd}" est="${roles.estimator}" | assigned_to="${raw.assigned_to}" noteEmployees=[${[...new Set(noteEmployees)].join(', ')}]`);

    // Last activity from notes
    let lastActivityDate = openedDate;
    if (notes.length > 0) {
      const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));
      lastActivityDate = sorted[0].date;
    }

    // Insurance and Contacts
    const insuranceCarrier = raw.insurance_info || '';
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

    // IICRC compliance
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

    // Upsell tracking
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
      invoicedDate,
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
      assignedTech: roles.tech,
      projectManager: roles.pm,
      opsManager: roles.opsManager,
      estimator: roles.estimator,
      businessDev: roles.bd,
      psaAltStatus: `list:${raw.status || ''}|listAlt:${raw.list_alt_status || ''}|amt:${raw.list_amount || 0}|detailAlt:${detail?.alt_status || ''}|dates:${Object.keys(detail?.dates || {}).length}`,
      psaDateDescriptions: Object.keys(detail?.dates || {}),
    };
  }

  async fetchJobs(): Promise<Job[]> {
    console.log(`[PSA:${this.config.id}] Fetching all open jobs...`);
    const openJobs = await this.fetchJobsByOption('Open', 100);
    console.log(`[PSA:${this.config.id}] Total open jobs: ${openJobs.length}`);

    // Also fetch recent closed jobs — PSA moves completed jobs to "Closed" even if not invoiced
    // We include them and let the post-enrich filter remove completed+invoiced ones
    console.log(`[PSA:${this.config.id}] Fetching recent closed jobs...`);
    const closedJobs = await this.fetchRecentClosedJobs(500);
    console.log(`[PSA:${this.config.id}] Recent closed jobs (filtered): ${closedJobs.length}`);

    const seenIds = new Set(openJobs.map(j => j.job_id));
    const closedJobIds = new Set<number>(); // Track which jobs came from the closed list
    const allJobs = [...openJobs];
    for (const j of closedJobs) {
      if (!seenIds.has(j.job_id)) {
        allJobs.push(j);
        seenIds.add(j.job_id);
        closedJobIds.add(j.job_id);
      }
    }
    console.log(`[PSA:${this.config.id}] Combined: ${allJobs.length} (${openJobs.length} open + ${allJobs.length - openJobs.length} closed)`);

    // Log sample job numbers for debugging format differences across locations
    if (allJobs.length > 0) {
      const sample = allJobs.slice(0, 5).map(j => `${j.job_number} (t=${j.territory}, y=${j.year}, type=${j.job_type_code})`);
      console.log(`[PSA:${this.config.id}] Sample job numbers: ${sample.join(' | ')}`);
    }

    // Filter by territory (if configured) and year, excluding STR/PLM sub-jobs
    let filtered = allJobs;
    if (this.config.territoryFilter) {
      filtered = filtered.filter(j => j.territory === this.config.territoryFilter);
    }
    // Year filter: if yearFilter is set, apply it; if all jobs get filtered out,
    // fall back to showing all jobs (handles different job number formats)
    const yearFiltered = filtered.filter(j => {
      if (this.config.yearFilter.length > 0 && !this.config.yearFilter.includes(j.year)) return false;
      if (EXCLUDED_PSA_TYPES.has(j.job_type_code.toUpperCase())) return false;
      return true;
    });

    if (yearFiltered.length === 0 && filtered.length > 0) {
      console.warn(`[PSA:${this.config.id}] Year filter '${this.config.yearFilter.join(',')}' removed all ${filtered.length} jobs. Falling back to no year filter.`);
      filtered = filtered.filter(j => !EXCLUDED_PSA_TYPES.has(j.job_type_code.toUpperCase()));
    } else {
      filtered = yearFiltered;
    }

    console.log(`[PSA:${this.config.id}] Filtered jobs: ${filtered.length}`);

    // Log target jobs status through filter
    const targetPassed = filtered.filter(j => isTargetJob(j.job_number));
    const targetFailed = allJobs.filter(j => isTargetJob(j.job_number) && !filtered.find(f => f.job_id === j.job_id));
    if (targetPassed.length) console.log(`[PSA:${this.config.id}] Targets passed: ${targetPassed.map(j => j.job_number).join(', ')}`);
    if (targetFailed.length) console.log(`[PSA:${this.config.id}] Targets filtered out: ${targetFailed.map(j => `${j.job_number}(t=${j.territory},y=${j.year})`).join(', ')}`);

    const allJobNumbers = allJobs.map(j => j.job_number);

    // Enrich jobs in parallel batches
    const enriched: Job[] = [];
    const batchSize = 10;

    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(j => this.enrichJob(j, allJobNumbers))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          enriched.push(result.value);
        }
      }

      console.log(`[PSA:${this.config.id}] Enriched ${Math.min(i + batchSize, filtered.length)}/${filtered.length}`);
    }

    // Post-enrich: handle closed-sourced jobs
    // PSA moves ALL finished jobs (completed, canceled, abandoned) to "Closed" list.
    // Only mark as Completed if there's evidence of real completion:
    // - Has a completedDate detected from date descriptions
    // - Has WIP-level dates (actual start) suggesting work was done
    // - Has significant revenue (work was performed)
    // Otherwise, these are likely canceled/abandoned jobs — exclude them.
    const closedKept: Job[] = [];
    const closedExcluded: string[] = [];
    for (const j of enriched) {
      const isFromClosedList = closedJobIds.has(Number(j.id));
      if (isFromClosedList) {
        const hasCompletionEvidence = j.completedDate ||
          j.status === 'Completed' ||
          j.status === 'WIP' ||  // Had actual start date = work was done
          j.estimateAmount > 500; // Significant revenue = real job

        if (hasCompletionEvidence) {
          // Mark as Completed if not already
          if (j.status !== 'Completed') {
            console.log(`[PSA:${this.config.id}] Closed-sourced job ${j.jobNumber} status ${j.status} → Completed (has evidence: completed=${j.completedDate}, revenue=$${j.estimateAmount})`);
            (j as any).status = 'Completed';
          }
          if (!j.completedDate) {
            (j as any).completedDate = j.lastActivityDate;
          }
          closedKept.push(j);
        } else {
          // No evidence of completion — likely canceled/abandoned
          console.log(`[PSA:${this.config.id}] Excluding closed job without completion evidence: ${j.jobNumber} (status=${j.status}, revenue=$${j.estimateAmount})`);
          closedExcluded.push(j.jobNumber);
        }
      }
    }

    // Remove excluded closed jobs from enriched list
    const afterClosedFilter = enriched.filter(j => {
      if (closedJobIds.has(Number(j.id)) && closedExcluded.includes(j.jobNumber)) return false;
      return true;
    });
    if (closedExcluded.length > 0) {
      console.log(`[PSA:${this.config.id}] Excluded ${closedExcluded.length} closed jobs without completion evidence`);
    }

    // Exclude completed+invoiced jobs (fully done, no action needed)
    const active = afterClosedFilter.filter(j => {
      if (j.completedDate && j.invoicedDate) {
        if (isTargetJob(j.jobNumber)) console.log(`[PSA:${this.config.id}] Target excluded (invoiced): ${j.jobNumber}`);
        return false;
      }
      return true;
    });

    console.log(`[PSA:${this.config.id}] After filter: ${active.length} active jobs (excluded ${afterClosedFilter.length - active.length} completed+invoiced, ${closedExcluded.length} abandoned closed)`);
    return active;
  }
}

// ─── Data Mapping Functions (static, used by all sessions) ───────────────────

// No longer excluding STR/PLM — user wants to see all job types including plumbing and structural
const EXCLUDED_PSA_TYPES = new Set<string>();

function mapJobTypeCode(code: string): JobType {
  const c = (code || '').toUpperCase().trim();
  if (c === 'WTR' || c.includes('WATER')) return 'WTR';
  if (c === 'MLD' || c.includes('MOLD')) return 'MLD';
  if (c === 'FIR' || c.includes('FIRE')) return 'FIR';
  if (c === 'BIO') return 'BIO';
  if (c === 'CON' || c === 'CNTNT' || c.includes('CONTENT')) return 'CNTNT';
  if (c === 'DUCT' || c.includes('HVAC')) return 'DUCT';
  if (c === 'STR') return 'STR';
  if (c === 'RCN' || c === 'RECON' || c.includes('REBUILD') || c.includes('STORM')) return 'RECON';
  if (c === 'FRM' || c === 'CPT' || c === 'STC') return 'WTR';
  return 'WTR';
}

function mapStatus(psaStatus: string): WorkflowStatus {
  const s = (psaStatus || '').toLowerCase().trim();
  if (s.includes('paid') || s.includes('invoic') || s.includes('collect') || s.includes('write off')) return 'Completed';
  if (s.includes('complet') || s.includes('closed') || s.includes('done')) return 'Completed';
  if (s.includes('wip') || s.includes('work in') || s.includes('active') || s.includes('production') || s.includes('in progress')) return 'WIP';
  if (s === 'sales' || s.includes('approv') || s.includes('pending') || s.includes('estimat') || s.includes('waiting') || s.includes('submitted')) return 'Sales';
  if (s.includes('inspect') || s.includes('assess') || s.includes('scope')) return 'Scoped';
  if (s.includes('receiv') || s.includes('intake') || s === 'open' || !s || s === 'new' || s.includes('no date')) return 'Received';
  return 'Received';
}

function parseDateStr(s: string | null | undefined): string | null {
  if (!s) return null;
  const str = s.trim();
  if (!str) return null;

  let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return match[0];
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

function findSelectedOption(optionsHtml: string): { value: string; text: string } | null {
  const optionRegex = /<option\s([^>]*)>([^<]*)<\/option>/gi;
  let m;
  while ((m = optionRegex.exec(optionsHtml)) !== null) {
    const attrs = m[1];
    const text = m[2].trim();
    if (/\bselected\b/i.test(attrs)) {
      const valueMatch = attrs.match(/value="([^"]*)"/);
      return { value: valueMatch ? valueMatch[1] : '', text };
    }
  }
  return null;
}

function extractSelectValue(html: string, fieldId: string): string {
  const regex = new RegExp(`id="${fieldId}"[^>]*>([\\s\\S]*?)</select>`);
  const section = html.match(regex);
  if (!section) return '';
  const sel = findSelectedOption(section[1]);
  return sel ? sel.text : '';
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

// ─── Type Definitions ─────────────────────────────────────────────────────────

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
  status: string;       // PSA list status (OPEN/CLOSED)
  list_alt_status: string; // PSA list alt_status/stage column (Omaha col5)
  list_amount: number;     // PSA list amount column (Omaha col7)
  job_id: number;
  territory: string;
  year: string;
  seq: string;
  job_type_code: string;
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
  projectManager: string;
  estimator: string;
  dates: Record<string, string>;
  phones: string[];
  emails: string[];
  site_address1: string;
  site_city: string;
  site_region: string;
  site_postalcode: string;
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

interface PSANote {
  id: string;
  created: string;
  employee: string;
  topic: string;
  subject: string;
  note: string;
}

// ─── Adapter Implementation ──────────────────────────────────────────────────

class PSAAdapter implements DataAdapter {
  private session: PSASession;
  private cachedJobs: Job[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  constructor(config: PSALocationConfig) {
    this.session = new PSASession(config);
  }

  async getJobs(): Promise<Job[]> {
    if (this.cachedJobs && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cachedJobs;
    }

    this.cachedJobs = await this.session.fetchJobs();
    this.cacheTime = Date.now();
    return this.cachedJobs;
  }

  async getJob(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === id || j.jobNumber === id) || null;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPSAAdapterForConfig(config: PSALocationConfig): DataAdapter {
  return new PSAAdapter(config);
}

// ─── Debug Functions ─────────────────────────────────────────────────────────

export async function testPSAConnection(): Promise<{
  authenticated: boolean;
  jobCount?: number;
  sampleJobs?: string[];
  authError?: string;
}> {
  try {
    const config: PSALocationConfig = {
      id: 't19',
      name: 'T-19 Pompano',
      username: process.env.PSA_USERNAME || '',
      password: process.env.PSA_PASSWORD || '',
      baseUrl: process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb',
      schema: process.env.PSA_SCHEMA || '1022',
      territoryFilter: '19',
      yearFilter: ['26'],
    };

    const session = new PSASession(config);
    await session.login();

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

    const body = await session.psaPost('/Job/Job/ListFilter', formData);
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

export async function debugJobDetail(jobId: number): Promise<Record<string, unknown>> {
  try {
    const config: PSALocationConfig = {
      id: 't19',
      name: 'T-19 Pompano',
      username: process.env.PSA_USERNAME || '',
      password: process.env.PSA_PASSWORD || '',
      baseUrl: process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb',
      schema: process.env.PSA_SCHEMA || '1022',
      territoryFilter: '19',
      yearFilter: ['26'],
    };

    const session = new PSASession(config);
    const html = await session.psaGet(`/Job/Job/Edit/${jobId}`);

    const selectRegex = /<select[^>]*(?:id="([^"]*)")?[^>]*(?:name="([^"]*)")?[^>]*>([\s\S]*?)<\/select>/g;
    const allSelects: Record<string, { name: string; selectedValue: string; selectedText: string; options: string[] }> = {};
    let match;
    while ((match = selectRegex.exec(html)) !== null) {
      const id = match[1] || '';
      const name = match[2] || '';
      const optionsHtml = match[3];
      const key = id || name || `unknown_${Object.keys(allSelects).length}`;

      const sel = findSelectedOption(optionsHtml);
      const opts: string[] = [];
      const optMatches = optionsHtml.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g);
      for (const om of optMatches) {
        const isSel = om[0].includes('selected');
        if (isSel || opts.length < 5) {
          opts.push(`${isSel ? '>>>' : '   '} "${om[1]}" => "${om[2].trim()}"`);
        }
      }

      allSelects[key] = {
        name: name || id,
        selectedValue: sel?.value || '',
        selectedText: sel?.text || '',
        options: opts,
      };
    }

    const detail = await session.fetchJobDetail(jobId);

    return {
      jobId,
      htmlLength: html.length,
      allSelectFields: allSelects,
      detailResult: {
        alt_status: detail.alt_status,
        alt_status_id: detail.alt_status_id,
        job_type: detail.job_type,
        revenue: detail.revenuedisplay,
        completed: detail.completeddisplay,
        dates: detail.dates,
        referrer: detail.referrer,
        team: detail.team,
        location: detail.location,
        projectManager: detail.projectManager,
        estimator: detail.estimator,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

