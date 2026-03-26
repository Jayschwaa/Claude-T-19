import { Job, JobNote, JobType, WorkflowStatus } from './types';

// Seeded PRNG for consistent, deterministic output
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// South Florida specific data
const firstNames = [
  'James', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas',
  'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven',
  'Maria', 'Jennifer', 'Patricia', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica',
  'Sarah', 'Karen', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Catherine'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
];

const southFloridaStreets = [
  'Atlantic Ave', 'Ocean Blvd', 'Sunrise Blvd', 'Federal Hwy', 'Broward Blvd',
  'Las Olas Blvd', 'SE 17th St', 'Davie Blvd', 'Commercial Blvd', 'SW 10th Ave',
  'NE 26th St', 'Cypress Creek Rd', 'Sample Rd', 'Oakland Park Blvd', 'Pine Island Rd',
  'Deerfield Beach Blvd', 'Spanish River Blvd', 'Palmetto Park Rd', 'Glades Rd',
  'Meadows Rd', 'Military Trail', 'Powerline Rd', 'Congress Ave', 'Technology Dr',
  'Weston Rd', 'Nob Hill Rd', 'Yamato Rd', 'Hillsboro Blvd', 'Boynton Beach Blvd',
  'N Dixie Hwy', 'S Federal Hwy', 'University Dr', 'Forest Hill Blvd', 'Sheridan St',
  'Towerline Rd', 'Bee Ridge Rd'
];

const southFloridaCities = [
  'Fort Lauderdale', 'Boca Raton', 'Pompano Beach', 'Deerfield Beach', 'Coral Springs',
  'Davie', 'Lighthouse Point', 'Oakland Park', 'Lauderdale Lakes', 'Tamarac',
  'Margate', 'Coconut Creek', 'Parkland', 'Sunrise', 'Weston', 'Lauderhill',
  'Hallandale Beach', 'Sea Ranch Lakes', 'Lauderdale-by-the-Sea', 'Boynton Beach'
];

const realInsuranceCarriers = [
  'Citizens Insurance', 'State Farm', 'Universal Insurance', 'Heritage Insurance',
  'Federated National', 'HCI Group', 'Avatar Insurance', 'United Insurance',
  'Homeowners Choice', 'OrangeInsurance', 'FedNat', 'USAA', 'Allstate',
  'Security First Insurance', 'ASI Insurance', 'Florida Marine Insurance'
];

const adjusterFirstNames = [
  'Mark', 'Jennifer', 'David', 'Patricia', 'Robert', 'Linda', 'James', 'Barbara',
  'Michael', 'Elizabeth', 'Christopher', 'Susan', 'Daniel', 'Jessica', 'Paul', 'Sarah',
  'Andrew', 'Karen', 'Steven', 'Nancy'
];

const adjusterLastNames = [
  'Anderson', 'Bennett', 'Carter', 'Davies', 'Edwards', 'Fitzpatrick', 'Graham',
  'Harrison', 'Johnson', 'Kennedy', 'Lawrence', 'Matthews', 'Nelson', 'O\'Brien',
  'Peterson', 'Quinn', 'Robertson', 'Stevens', 'Thompson', 'Underwood', 'Voss',
  'Williams', 'Xander', 'Young', 'Zhang'
];

// T-19 team members
const technicians = ['Angel Torres', 'Richard Mejia', 'Chris Wallace', 'David Rodriguez', 'Marcus Jean-Baptiste'];
const businessDevs = ['Natalia Ramos', 'Tanya Rivera', 'Jim Lorincz'];

function generateClaimNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const random = String(randomInt(100000, 999999));
  return `${random}`;
}

function generatePhoneNumber(): string {
  const area = String(randomInt(561, 754)).padStart(3, '0');
  const prefix = String(randomInt(200, 999)).padStart(3, '0');
  const line = String(randomInt(1000, 9999)).padStart(4, '0');
  return `(${area}) ${prefix}-${line}`;
}

function generateJobNumber(index: number): string {
  return `JOB-${String(index + 1000).slice(-4)}`;
}

function generateCustomerName(): string {
  return `${randomElement(firstNames)} ${randomElement(lastNames)}`;
}

function generateAdjusterName(): string {
  return `${randomElement(adjusterFirstNames)} ${randomElement(adjusterLastNames)}`;
}

function generateAddress(): string {
  const number = randomInt(100, 9999);
  const street = randomElement(southFloridaStreets);
  return `${number} ${street}`;
}

// Generate revenue by distribution
function generateEstimateAmount(): number {
  const rand = rng();
  if (rand < 0.40) return randomInt(2000, 8000);      // 40% small jobs
  if (rand < 0.65) return randomInt(8000, 25000);     // 25% moderate
  if (rand < 0.85) return randomInt(25000, 60000);    // 20% larger
  if (rand < 0.95) return randomInt(60000, 100000);   // 10% major
  return randomInt(100000, 180000);                   // 5% catastrophic
}

// Realistic notes templates for restoration work
const noteTemplates = [
  // Received
  'Initial call received. Customer reporting water intrusion in living room from ceiling. Need to schedule inspection.',
  'Lead intake - potential water loss, customer requesting emergency response. Calling now.',
  'Message left with customer. Leak detected under kitchen sink, drywall potentially saturated.',
  'Estimated 2 rooms affected. Customer home available for inspection tomorrow morning.',

  // Scoped
  'Initial inspection - 3 rooms affected (kitchen, master bath, hallway). Water from upstairs unit overflow. Recommend immediate dehumidification.',
  'Walkthrough complete. Subfloor wet in 600 sq ft area. Baseboards need removal. Customer present, very concerned.',
  'Moisture readings taken: ambient 85%, wall cavity 94%. Set up containment and 4 dehumidifiers.',
  'Visible mold in drywall cavity. Structural integrity appears intact. Full demo needed for affected area.',
  'Photo documentation completed. Sent 18 images to insurance. Waiting on adjuster assignment.',

  // Sales / Awaiting Approval
  'Estimate prepared - $12,500 for water extraction, drying, demo, rebuild. Sent to Heritage yesterday.',
  'Called adjuster Mark B. at Citizens, left VM requesting approval meeting. This one is time-sensitive.',
  'Estimate reviewed with adjuster via phone. Approved scope but waiting on formal authorization.',
  'Insurance adjuster unresponsive for 5 days. Customer getting anxious. Left follow-up message.',
  'Set 4 dehus, 2 air movers. Containment in master bedroom. Daily monitoring logs started.',
  'Customer called - concerned about timeline. Promised update by end of week.',
  'Supplement identified. Additional mold found behind kitchen cabinets during demo inspection. Need $4,200 addendum.',
  'Work authorization received from State Farm. Production can commence immediately.',

  // WIP / Active Work
  'Day 1 of drying phase. All equipment operational. Ambient 72%, target 55%. On schedule.',
  'Equipment placement optimized based on moisture readings. Hallway wall cavity still elevated at 78%.',
  'Daily logs show good progress. Humidity dropping steadily. Drying logs attached.',
  'Mold remediation started in bedrooms. HEPA containment active. Workers in full PPE.',
  'Drying phase complete. Final moisture readings all below threshold. Ready for rebuild phase.',
  'Started demolition of affected drywall. Subfloor salvageable. Framing appears solid.',
  'Framing replacement started. New drywall delivered. Targeting completion in 4 days.',
  'Paint and final finishes ongoing. Baseboards being reinstalled. Looks great.',
  'Equipment pickup scheduled for Monday. Final readings taken - all below threshold.',
  'Customer walkthrough tomorrow at 10am. All work appears complete and satisfactory.',

  // Completed
  'Final walkthrough completed with customer. Work approved. Minor punch list items noted.',
  'Invoice prepared for $14,850 (estimate was $12,500, supplement $2,350). Sent to Heritage.',
  'Customer very satisfied with workmanship. Left positive feedback about communication.',
  'All equipment removed. Job site clean. Documentation package uploaded.',
  'Claim closed by adjuster. Payment received in full. Job archived.',
  'Post-inspection photos taken for records. Building back to pre-loss condition.',
];

function generateNotesForStatus(status: WorkflowStatus, customerName: string, jobType: JobType): JobNote[] {
  const notes: JobNote[] = [];
  let noteCount = 0;

  switch (status) {
    case 'Received':
      noteCount = randomInt(0, 2);
      break;
    case 'Scoped':
      noteCount = randomInt(2, 4);
      break;
    case 'Sales':
      noteCount = randomInt(2, 6);
      break;
    case 'WIP':
      noteCount = randomInt(4, 10);
      break;
    case 'Completed':
      noteCount = randomInt(5, 8);
      break;
  }

  const today = new Date();
  const lastActivityDaysAgo = randomInt(1, 45);

  for (let i = 0; i < noteCount; i++) {
    const daysAgo = Math.max(1, lastActivityDaysAgo - randomInt(0, Math.max(1, lastActivityDaysAgo - 1)));
    const noteDate = formatDate(addDays(today, -daysAgo));
    const template = randomElement(noteTemplates);

    notes.push({
      date: noteDate,
      author: 'System',
      text: template,
    });
  }

  return notes.sort((a, b) => a.date.localeCompare(b.date));
}

// Generate realistic IICRC compliance flags based on job status
function generateIICRCCompliance(status: WorkflowStatus): {
  hasMoistureReadings: boolean;
  hasDryingLogs: boolean;
  hasEquipmentPlacement: boolean;
  hasDailyMonitoring: boolean;
  hasDryStandard: boolean;
  hasSourceDocumented: boolean;
} {
  let moistureReadings = false;
  let dryingLogs = false;
  let equipmentPlacement = false;
  let dailyMonitoring = false;
  let dryStandard = false;
  let sourceDocumented = false;

  if (status === 'Received') {
    sourceDocumented = rng() > 0.6;
    return { hasMoistureReadings: false, hasDryingLogs: false, hasEquipmentPlacement: false, hasDailyMonitoring: false, hasDryStandard: false, hasSourceDocumented: sourceDocumented };
  }

  if (status === 'Scoped') {
    moistureReadings = rng() > 0.2;
    sourceDocumented = rng() > 0.3;
    equipmentPlacement = rng() > 0.6;
    return { hasMoistureReadings: moistureReadings, hasDryingLogs: false, hasEquipmentPlacement: equipmentPlacement, hasDailyMonitoring: false, hasDryStandard: false, hasSourceDocumented: sourceDocumented };
  }

  if (status === 'Sales') {
    moistureReadings = rng() > 0.05;
    sourceDocumented = rng() > 0.15;
    equipmentPlacement = rng() > 0.2;
    dryingLogs = rng() > 0.4;
    dailyMonitoring = rng() > 0.3;
    return { hasMoistureReadings: moistureReadings, hasDryingLogs: dryingLogs, hasEquipmentPlacement: equipmentPlacement, hasDailyMonitoring: dailyMonitoring, hasDryStandard: false, hasSourceDocumented: sourceDocumented };
  }

  if (status === 'WIP') {
    moistureReadings = rng() > 0.02;
    sourceDocumented = rng() > 0.1;
    equipmentPlacement = rng() > 0.1;
    dryingLogs = rng() > 0.15;
    dailyMonitoring = rng() > 0.2;
    dryStandard = rng() > 0.3;
    return { hasMoistureReadings: moistureReadings, hasDryingLogs: dryingLogs, hasEquipmentPlacement: equipmentPlacement, hasDailyMonitoring: dailyMonitoring, hasDryStandard: dryStandard, hasSourceDocumented: sourceDocumented };
  }

  // Completed
  moistureReadings = rng() > 0.05;
  sourceDocumented = rng() > 0.1;
  equipmentPlacement = rng() > 0.1;
  dryingLogs = rng() > 0.1;
  dailyMonitoring = rng() > 0.15;
  dryStandard = rng() > 0.15;
  return { hasMoistureReadings: moistureReadings, hasDryingLogs: dryingLogs, hasEquipmentPlacement: equipmentPlacement, hasDailyMonitoring: dailyMonitoring, hasDryStandard: dryStandard, hasSourceDocumented: sourceDocumented };
}

// Generate realistic ticket completeness
function generateTicketCompleteness(status: WorkflowStatus): {
  hasInsuranceInfo: boolean;
  hasAdjusterContact: boolean;
  hasClaimNumber: boolean;
  hasPhoneNumber: boolean;
  hasScopeOfWork: boolean;
} {
  const hasInsuranceInfo = rng() > 0.15;  // ~85%
  const hasAdjusterContact = rng() > 0.25; // ~75%
  const hasClaimNumber = rng() > 0.20;    // ~80%
  const hasPhoneNumber = rng() > 0.10;    // ~90%
  const hasScopeOfWork = status !== 'Received' && rng() > 0.4; // increases with status

  return { hasInsuranceInfo, hasAdjusterContact, hasClaimNumber, hasPhoneNumber, hasScopeOfWork };
}

// Generate realistic upsell opportunities
function generateUpsells(status: WorkflowStatus, jobType: JobType, estimateAmount: number): {
  hasContentsJob: boolean;
  hasReconEstimate: boolean;
  hasDuctCleaning: boolean;
  hasSourceSolution: boolean;
} {
  let hasContentsJob = false;
  let hasReconEstimate = false;
  let hasDuctCleaning = false;
  let hasSourceSolution = false;

  // Contents job: ~60% of WTR/MLD jobs lack it (40% have)
  if ((jobType === 'WTR' || jobType === 'MLD') && status !== 'Received') {
    hasContentsJob = rng() > 0.6;
  }

  // Recon estimate: ~60% of jobs over $15k lack it
  if (estimateAmount > 15000 && status !== 'Received' && status !== 'Scoped') {
    hasReconEstimate = rng() > 0.6;
  }

  // Duct cleaning: ~70% of ceiling/leak jobs lack it
  if ((jobType === 'WTR' || jobType === 'MLD') && rng() > 0.7) {
    hasDuctCleaning = true;
  }

  // Source solution: ~50% of jobs lack it
  if (status !== 'Received') {
    hasSourceSolution = rng() > 0.5;
  }

  return { hasContentsJob, hasReconEstimate, hasDuctCleaning, hasSourceSolution };
}

export function generateMockJobs(): Job[] {
  const jobs: Job[] = [];
  const today = new Date();

  // Exact status distribution for 85 jobs
  const statusDistribution: Record<WorkflowStatus, number> = {
    'Received': 8,
    'Scoped': 8,
    'Sales': 34,
    'WIP': 25,
    'Completed': 10,
  };

  // Job type distribution: 55% WTR, 25% MLD, 10% STR, 5% FIR, 5% other
  const jobTypeArray: JobType[] = [];
  for (let i = 0; i < 47; i++) jobTypeArray.push('WTR');      // 55% of 85 = 46.75 ≈ 47
  for (let i = 0; i < 21; i++) jobTypeArray.push('MLD');      // 25% of 85 = 21.25 ≈ 21
  for (let i = 0; i < 9; i++) jobTypeArray.push('STR');       // 10% of 85 = 8.5 ≈ 9
  for (let i = 0; i < 4; i++) jobTypeArray.push('FIR');       // 5% of 85 = 4.25 ≈ 4
  for (let i = 0; i < 4; i++) jobTypeArray.push(randomElement(['BIO', 'CNTNT', 'DUCT', 'RECON'])); // 5%

  let jobIndex = 0;
  const statusList: WorkflowStatus[] = ['Received', 'Scoped', 'Sales', 'WIP', 'Completed'];

  for (const status of statusList) {
    const count = statusDistribution[status];

    for (let i = 0; i < count; i++) {
      const jobNumber = generateJobNumber(jobIndex);
      const customerName = generateCustomerName();
      const adjusterName = generateAdjusterName();
      const address = generateAddress();
      const city = randomElement(southFloridaCities);
      const carrier = randomElement(realInsuranceCarriers);
      const claimNumber = generateClaimNumber();
      const jobType = jobTypeArray[jobIndex % jobTypeArray.length];

      // Generate realistic job ages based on status
      let openedDate: Date;
      let daysOld: number;

      switch (status) {
        case 'Received':
          daysOld = randomInt(0, 7);
          break;
        case 'Scoped':
          daysOld = randomInt(5, 20);
          break;
        case 'Sales':
          daysOld = randomInt(10, 90);
          break;
        case 'WIP':
          daysOld = randomInt(20, 120);
          break;
        case 'Completed':
          daysOld = randomInt(30, 150);
          break;
      }

      openedDate = addDays(today, -daysOld);

      let receivedDate: Date | null = null;
      let inspectedDate: Date | null = null;
      let estimateSentDate: Date | null = null;
      let approvedDate: Date | null = null;
      let productionStartDate: Date | null = null;
      let completedDate: Date | null = null;
      let estimateAmount = 0;
      let supplementAmount = 0;

      if (status !== 'Received') {
        receivedDate = addDays(openedDate, randomInt(0, 5));
      }

      if (status !== 'Received' && status !== 'Scoped') {
        inspectedDate = addDays(receivedDate || openedDate, randomInt(1, 8));
      }

      if (status === 'Sales' || status === 'WIP' || status === 'Completed') {
        estimateAmount = generateEstimateAmount();
        estimateSentDate = addDays(inspectedDate || openedDate, randomInt(1, 10));
      }

      if (status === 'Sales' || status === 'WIP' || status === 'Completed') {
        approvedDate = addDays(estimateSentDate || openedDate, randomInt(2, 30));
      }

      if (status === 'WIP' || status === 'Completed') {
        productionStartDate = addDays(approvedDate || openedDate, randomInt(1, 10));
      }

      if (status === 'Completed') {
        completedDate = addDays(productionStartDate || openedDate, randomInt(10, 60));
        supplementAmount = Math.round(estimateAmount * randomInt(0, 25) / 100);
      }

      // Generate realistic last activity
      let lastActivityDate = openedDate;
      if (completedDate) {
        lastActivityDate = completedDate;
      } else {
        const activityRand = rng();
        if (activityRand < 0.60) {
          // Activity within 1-5 days
          lastActivityDate = addDays(today, -randomInt(1, 5));
        } else if (activityRand < 0.85) {
          // Activity 5-14 days ago
          lastActivityDate = addDays(today, -randomInt(5, 14));
        } else {
          // Activity 15-45 days ago (stale)
          lastActivityDate = addDays(today, -randomInt(15, 45));
        }
      }

      const hasPhotos = status !== 'Received' && rng() > 0.3; // ~70%
      const hasEstimate = (status === 'Sales' || status === 'WIP' || status === 'Completed') ||
                          (status === 'Scoped' && rng() > 0.5);
      const hasWorkAuth = (status === 'WIP' || status === 'Completed') || (status === 'Sales' && rng() > 0.4);

      const iicrc = generateIICRCCompliance(status);
      const ticketInfo = generateTicketCompleteness(status);
      const upsells = generateUpsells(status, jobType, estimateAmount);

      const photoCount = hasPhotos ? randomInt(
        status === 'Completed' ? 15 : status === 'WIP' ? 8 : status === 'Sales' ? 6 : 3,
        status === 'Completed' ? 45 : status === 'WIP' ? 20 : status === 'Sales' ? 15 : 10
      ) : 0;

      const notes = generateNotesForStatus(status, customerName, jobType);

      const job: Job = {
        id: `job-${jobIndex}`,
        jobNumber,
        customerName,
        territory: 'T-19',
        type: jobType,
        status,
        address,
        city,
        openedDate: formatDate(openedDate),
        receivedDate: receivedDate ? formatDate(receivedDate) : null,
        inspectedDate: inspectedDate ? formatDate(inspectedDate) : null,
        estimateSentDate: estimateSentDate ? formatDate(estimateSentDate) : null,
        approvedDate: approvedDate ? formatDate(approvedDate) : null,
        productionStartDate: productionStartDate ? formatDate(productionStartDate) : null,
        completedDate: completedDate ? formatDate(completedDate) : null,
        lastActivityDate: formatDate(lastActivityDate),
        estimateAmount,
        supplementAmount,
        contacts: [
          {
            role: 'Insurance Adjuster',
            name: adjusterName,
            phone: generatePhoneNumber(),
          },
          {
            role: 'Property Owner',
            name: customerName,
            phone: generatePhoneNumber(),
          },
        ],
        insuranceCarrier: carrier,
        claimNumber,
        adjusterName,
        adjusterPhone: generatePhoneNumber(),
        notes,
        // IICRC Compliance
        hasMoistureReadings: iicrc.hasMoistureReadings,
        hasDryingLogs: iicrc.hasDryingLogs,
        hasEquipmentPlacement: iicrc.hasEquipmentPlacement,
        hasDailyMonitoring: iicrc.hasDailyMonitoring,
        hasDryStandard: iicrc.hasDryStandard,
        hasSourceDocumented: iicrc.hasSourceDocumented,
        // Ticket Completeness
        hasInsuranceInfo: ticketInfo.hasInsuranceInfo,
        hasAdjusterContact: ticketInfo.hasAdjusterContact,
        hasClaimNumber: ticketInfo.hasClaimNumber,
        hasEstimate: hasEstimate,
        hasPhotos: hasPhotos,
        hasWorkAuth: hasWorkAuth,
        hasPhoneNumber: ticketInfo.hasPhoneNumber,
        hasScopeOfWork: ticketInfo.hasScopeOfWork,
        // Upsell Opportunities
        hasContentsJob: upsells.hasContentsJob,
        hasReconEstimate: upsells.hasReconEstimate,
        hasDuctCleaning: upsells.hasDuctCleaning,
        hasSourceSolution: upsells.hasSourceSolution,
        // Other
        photoCount,
        priorityOverride: 0,
        // People
        assignedTech: randomElement(technicians),
        businessDev: randomElement(businessDevs),
      };

      jobs.push(job);
      jobIndex++;
    }
  }

  return jobs;
}
