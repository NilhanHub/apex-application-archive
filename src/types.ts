export type RecruiterStage =
  | 'New'
  | 'Review'
  | 'Shortlisted'
  | 'Contacted'
  | 'Interview'
  | 'Hold'
  | 'Rejected'
  | 'Placed';

export type CvStatus = 'missing' | 'queued' | 'downloaded' | 'failed';
export type SortOption = 'relevance' | 'newest' | 'oldest' | 'name' | 'reviewed';

export interface ApplicationCv {
  status: CvStatus;
  sourcePresent: boolean;
  sourceUrl: string | null;
  sourceHash: string | null;
  originalFileName: string | null;
  storagePath: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  importedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface RecruiterState {
  stage: RecruiterStage;
  tags: string[];
  assignedTo: string | null;
  favorite: boolean;
  lastReviewedAt: string | null;
}

export interface ApplicationRecord {
  id: string;
  source: 'apexhrm_forminator';
  formId: 2989;
  entryId: number;
  sourcePresent: boolean;
  sourceMissingSince: string | null;
  fullName: string;
  email: string;
  applicationMessage: string;
  jobReference: string;
  submittedAt: string | null;
  submittedAtRaw: string;
  sourceUpdatedAt: string | null;
  rawFields: Record<string, unknown>;
  cv: ApplicationCv;
  recruiter: RecruiterState;
  firstImportedAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'recruiter';
  approved: boolean;
  active: boolean;
}

export interface SyncRun {
  id: string;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  sourceTotal: number;
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  missing: number;
  cvReferenced: number;
  cvQueued: number;
  cvCompleted: number;
  cvFailures: number;
  error: string | null;
}

export interface SyncState {
  status: 'never_run' | 'running' | 'idle' | 'completed_with_errors' | 'failed';
  sourceTotal: number;
  activeApplications: number;
  lastSuccessfulAt: string | null;
  lastAttemptAt: string | null;
  nextExpectedAt: string | null;
  lastError: string | null;
}

export interface SearchFilters {
  stage: RecruiterStage | 'all';
  cvStatus: CvStatus | 'all';
  assignedTo: string | 'all';
  tag: string;
  submittedFrom: string;
  submittedTo: string;
  hasCv: boolean;
  favoritesOnly: boolean;
  sourcePresentOnly: boolean;
}

export interface SearchResult {
  application: ApplicationRecord;
  score: number;
  reasons: string[];
  snippets: string[];
}

export const PIPELINE_STAGES: RecruiterStage[] = [
  'New',
  'Review',
  'Shortlisted',
  'Contacted',
  'Interview',
  'Hold',
  'Rejected',
  'Placed',
];
