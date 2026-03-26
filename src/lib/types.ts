// Job types
export type JobType = 'WTR' | 'MLD' | 'STR' | 'FIR' | 'BIO' | 'CNTNT' | 'DUCT' | 'RECON' | 'OTHER';
export type WorkflowStatus = 'Received' | 'Scoped' | 'Sales' | 'WIP' | 'Completed';

export interface JobNote {
  date: string;
  author: string;
  text: string;
}

export interface JobContact {
  role: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface Job {
  id: string;
  jobNumber: string;
  customerName: string;
  territory: string;
  type: JobType;
  status: WorkflowStatus;
  address: string;
  city: string;

  // Dates
  openedDate: string;
  receivedDate: string | null;
  inspectedDate: string | null;
  estimateSentDate: string | null;
  approvedDate: string | null;
  productionStartDate: string | null;
  completedDate: string | null;
  lastActivityDate: string;

  // Financials
  estimateAmount: number;
  supplementAmount: number;

  // Contacts
  contacts: JobContact[];
  insuranceCarrier: string;
  claimNumber: string;
  adjusterName: string;
  adjusterPhone: string;

  // Notes
  notes: JobNote[];

  // IICRC Compliance fields
  hasMoistureReadings: boolean;
  hasDryingLogs: boolean;
  hasEquipmentPlacement: boolean;
  hasDailyMonitoring: boolean;
  hasDryStandard: boolean;
  hasSourceDocumented: boolean;

  // Ticket Completeness fields
  hasInsuranceInfo: boolean;
  hasAdjusterContact: boolean;
  hasClaimNumber: boolean;
  hasEstimate: boolean;
  hasPhotos: boolean;
  hasWorkAuth: boolean;
  hasPhoneNumber: boolean;
  hasScopeOfWork: boolean;

  // Upsell tracking
  hasContentsJob: boolean;
  hasReconEstimate: boolean;
  hasDuctCleaning: boolean;
  hasSourceSolution: boolean;

  photoCount: number;
  priorityOverride: number;

  // People
  assignedTech: string;
  businessDev: string;    // BD / job source
}

// Scoring
export interface ScoreFactorDetail {
  points: number;
  max: number;
  explanation: string;
}

export interface ChecklistItem {
  label: string;
  present: boolean;
}

export interface UpsellItem {
  label: string;
  flagged: boolean;
  potentialValue: string;
}

export interface ScoreBreakdown {
  total: number;
  daysOpen: ScoreFactorDetail;
  revenue: ScoreFactorDetail;
  inactivity: ScoreFactorDetail;
  iicrcGaps: ScoreFactorDetail;
  ticketGaps: ScoreFactorDetail;
  upsells: ScoreFactorDetail;
  ownerAdjustment: { points: number; explanation: string };
}

export interface ScoredJob {
  job: Job;
  score: ScoreBreakdown;
  rank: number;
  iicrcItems: ChecklistItem[];
  ticketItems: ChecklistItem[];
  upsellItems: UpsellItem[];
}

// Dashboard summary
export interface DashboardSummary {
  totalJobs: number;
  estimatedRevenue: number;         // sum of estimateAmount on all jobs
  ticketExpansion: number;          // sum of supplementAmount potential
  upsellPotential: number;         // sum of flagged upsell dollar values
  jobsByStatus: Record<string, number>;
  revenueByStatus: Record<string, number>;
  jobsByType: Record<string, number>;
  avgDaysOpen: number;
  iicrcComplianceRate: number;
  ticketCompletenessRate: number;
  allTechs: string[];
  allBDs: string[];
}

// Data adapter
export interface DataAdapter {
  getJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
}
