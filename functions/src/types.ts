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

export interface WordPressFile {
  field_id?: string;
  file_name?: string;
  file_path?: string;
  file_url?: string;
  mime_type?: string;
  success?: boolean;
  message?: string;
}

export interface WordPressEntry {
  entry_id: number;
  form_id: number;
  date_created: string | null;
  date_updated?: string | null;
  is_read?: boolean;
  fields: Record<string, unknown>;
  files?: WordPressFile[];
  cv_urls?: string[];
}

export interface WordPressEntriesPage {
  form_id: number;
  page: number;
  per_page: number;
  total: number;
  pages: number;
  entries: WordPressEntry[];
}

export interface NormalizedCv {
  status: CvStatus;
  sourcePresent: boolean;
  sourceUrl: string | null;
  sourcePath: string | null;
  sourceHash: string | null;
  originalFileName: string | null;
  sourceMimeType: string | null;
  storagePath: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  importedAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
}

export interface NormalizedApplication {
  id: string;
  source: 'apexhrm_forminator';
  formId: 2989;
  entryId: number;
  sourcePresent: true;
  fullName: string;
  email: string;
  applicationMessage: string;
  jobReference: string;
  submittedAt: Date | null;
  submittedAtRaw: string;
  sourceUpdatedAt: Date | null;
  sourceUpdatedAtRaw: string;
  rawFields: Record<string, unknown>;
  sourceHash: string;
  cv: NormalizedCv;
}

export interface CvTaskPayload {
  applicationId: string;
  cvSourceHash: string;
  syncRunId: string;
}

export interface SyncResult {
  mode: 'dry-run' | 'apply';
  sourceTotal: number;
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  missing: number;
  cvReferenced: number;
  cvQueued: number;
  cvQueueFailures: number;
  runId: string | null;
}
