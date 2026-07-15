export type PipelineStage =
  | 'New'
  | 'Review'
  | 'Shortlisted'
  | 'Contacted'
  | 'Interview'
  | 'Hold'
  | 'Rejected'
  | 'Placed';

export type CandidateSource = 'apexhrm_forminator';

export type CvDownloadStatus =
  | 'missing_upload'
  | 'url_known'
  | 'downloaded'
  | 'text_indexed'
  | 'failed';

export type CvExtractedTextStatus = 'none' | 'pending' | 'complete' | 'failed';

export interface CandidateContact {
  fullName: string;
  email: string;
  phone?: string;
  locationText?: string;
}

export interface CandidateApplication {
  formId: number;
  entryId: number;
  submittedAt: string;
  rawFields: Record<string, unknown>;
  message?: string;
  sourceUrl?: string;
}

export interface CandidateCv {
  storagePath?: string;
  originalUrl?: string;
  fileName?: string;
  fileType?: 'pdf' | 'docx' | 'txt' | 'jpg' | 'png' | 'unknown';
  sizeBytes?: number;
  downloadStatus: CvDownloadStatus;
  extractedTextStatus: CvExtractedTextStatus;
  extractedText?: string;
}

export interface CandidateAiSummary {
  shortSummary: string;
  skills: string[];
  industries: string[];
  companies: string[];
  education: string[];
  senioritySignals: string[];
  strengths: string[];
  questionsToAsk: string[];
  redFlags: string[];
  generatedAt?: string;
  model?: string;
}

export interface CandidateSearchIndex {
  candidateId: string;
  normalizedText: string;
  cvText: string;
  companies: string[];
  education: string[];
  skills: string[];
  tags: string[];
}

export interface CandidateNote {
  id: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: string;
  internalOnly: true;
}

export interface CandidateActivity {
  id: string;
  type:
    | 'imported'
    | 'cv_downloaded'
    | 'ai_summary_generated'
    | 'note_added'
    | 'stage_changed'
    | 'exported';
  label: string;
  createdAt: string;
  actorName?: string;
}

export interface Candidate {
  id: string;
  source: CandidateSource;
  formId: number;
  entryId: number;
  fullName: string;
  email: string;
  phone?: string;
  submittedAt: string;
  rawFields: Record<string, unknown>;
  message?: string;
  cv: CandidateCv;
  aiSummary: CandidateAiSummary;
  stage: PipelineStage;
  tags: string[];
  assignedTo?: 'Nilhan' | 'Prashanthi';
  favorite?: boolean;
  duplicateSignals?: string[];
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes: CandidateNote[];
  activity: CandidateActivity[];
}

export interface ImportRun {
  id: string;
  subcommand: 'wp-sync' | 'cv-import' | 'ai-index';
  startedAt: string;
  endedAt?: string;
  insertedSubmissions: number;
  copiedCvs: number;
  archivedEmails: number;
  errorCount: number;
  exitStatus: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: 'Nilhan' | 'Prashanthi';
  role: 'owner' | 'recruiter';
  approved: boolean;
}

export interface SearchFilters {
  stage: PipelineStage | 'all';
  sourceForm: number | 'all';
  cvStatus: CvDownloadStatus | 'all';
  fileType: CandidateCv['fileType'] | 'all';
  tag: string;
  skill: string;
  company: string;
  education: string;
  submittedFrom: string;
  submittedTo: string;
  hasCv: boolean;
  hasEmail: boolean;
}

export interface SearchResult {
  candidate: Candidate;
  reasons: string[];
  snippets: string[];
  score: number;
}

export interface AiSearchResponse {
  answer: string;
  interpretedCriteria: string[];
  excludedUnsafeCriteria: string[];
  results: Array<{
    candidateId: string;
    confidence: 'High' | 'Medium' | 'Low';
    evidence: string[];
  }>;
}
