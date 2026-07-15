import type { Unsubscribe } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { auth } from '../firebase/auth';
import { db } from '../firebase/data';
import type { ApplicationRecord, RecruiterState, SyncRun, SyncState } from '../types';

function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function applicationFromData(id: string, data: DocumentData): ApplicationRecord {
  const recruiter = (data.recruiter ?? {}) as Record<string, unknown>;
  const cv = (data.cv ?? {}) as Record<string, unknown>;
  return {
    id,
    source: 'apexhrm_forminator',
    formId: 2989,
    entryId: numberValue(data.entryId),
    sourcePresent: data.sourcePresent !== false,
    sourceMissingSince: iso(data.sourceMissingSince),
    fullName: String(data.fullName ?? ''),
    email: String(data.email ?? ''),
    applicationMessage: String(data.applicationMessage ?? ''),
    jobReference: String(data.jobReference ?? ''),
    submittedAt: iso(data.submittedAt),
    submittedAtRaw: String(data.submittedAtRaw ?? ''),
    sourceUpdatedAt: iso(data.sourceUpdatedAt),
    rawFields: data.rawFields && typeof data.rawFields === 'object' ? (data.rawFields as Record<string, unknown>) : {},
    cv: {
      status: ['missing', 'queued', 'downloaded', 'failed'].includes(String(cv.status))
        ? (cv.status as ApplicationRecord['cv']['status'])
        : 'missing',
      sourcePresent: cv.sourcePresent === true,
      sourceUrl: typeof cv.sourceUrl === 'string' ? cv.sourceUrl : null,
      sourceHash: typeof cv.sourceHash === 'string' ? cv.sourceHash : null,
      originalFileName: typeof cv.originalFileName === 'string' ? cv.originalFileName : null,
      storagePath: typeof cv.storagePath === 'string' ? cv.storagePath : null,
      contentType: typeof cv.contentType === 'string' ? cv.contentType : null,
      sizeBytes: typeof cv.sizeBytes === 'number' ? cv.sizeBytes : null,
      importedAt: iso(cv.importedAt),
      lastAttemptAt: iso(cv.lastAttemptAt),
      lastError: typeof cv.lastError === 'string' ? cv.lastError : null,
    },
    recruiter: {
      stage: typeof recruiter.stage === 'string' ? (recruiter.stage as RecruiterState['stage']) : 'New',
      tags: Array.isArray(recruiter.tags) ? recruiter.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      assignedTo: typeof recruiter.assignedTo === 'string' ? recruiter.assignedTo : null,
      favorite: recruiter.favorite === true,
      lastReviewedAt: iso(recruiter.lastReviewedAt),
    },
    firstImportedAt: iso(data.firstImportedAt),
    lastSeenAt: iso(data.lastSeenAt),
    updatedAt: iso(data.updatedAt),
  };
}

export function subscribeApplications(
  onData: (applications: ApplicationRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!db) throw new Error('Firebase is not configured.');
  const applicationsQuery = query(collection(db, 'applications'), where('formId', '==', 2989));
  return onSnapshot(
    applicationsQuery,
    (snapshot) => onData(snapshot.docs.map((document) => applicationFromData(document.id, document.data()))),
    (error) => onError(new Error(error.message)),
  );
}

export function subscribeSyncState(
  onData: (state: SyncState) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!db) throw new Error('Firebase is not configured.');
  return onSnapshot(
    doc(db, 'syncState', 'apexhrm'),
    (snapshot) => {
      const data = snapshot.data() ?? {};
      onData({
        status: snapshot.exists() ? (String(data.status ?? 'never_run') as SyncState['status']) : 'never_run',
        sourceTotal: numberValue(data.sourceTotal),
        activeApplications: numberValue(data.activeApplications),
        lastSuccessfulAt: iso(data.lastSuccessfulAt),
        lastAttemptAt: iso(data.lastAttemptAt),
        nextExpectedAt: iso(data.nextExpectedAt),
        lastError: typeof data.lastError === 'string' ? data.lastError : null,
      });
    },
    (error) => onError(new Error(error.message)),
  );
}

export function subscribeSyncRuns(onData: (runs: SyncRun[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!db) throw new Error('Firebase is not configured.');
  const runsQuery = query(collection(db, 'syncRuns'), orderBy('startedAt', 'desc'), limit(20));
  return onSnapshot(
    runsQuery,
    (snapshot) =>
      onData(
        snapshot.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            status: String(data.status ?? 'failed') as SyncRun['status'],
            startedAt: iso(data.startedAt),
            completedAt: iso(data.completedAt),
            sourceTotal: numberValue(data.sourceTotal),
            scanned: numberValue(data.scanned),
            inserted: numberValue(data.inserted),
            updated: numberValue(data.updated),
            unchanged: numberValue(data.unchanged),
            missing: numberValue(data.missing),
            cvReferenced: numberValue(data.cvReferenced),
            cvQueued: numberValue(data.cvQueued),
            cvCompleted: numberValue(data.cvCompleted),
            cvFailures: numberValue(data.cvFailures),
            error: typeof data.error === 'string' ? data.error : null,
          };
        }),
      ),
    (error) => onError(new Error(error.message)),
  );
}

export async function updateRecruiterState(applicationId: string, recruiter: RecruiterState): Promise<void> {
  if (!db) throw new Error('Firebase is not configured.');
  await updateDoc(doc(db, 'applications', applicationId), {
    recruiter: {
      ...recruiter,
      lastReviewedAt: recruiter.lastReviewedAt ? new Date(recruiter.lastReviewedAt) : null,
    },
    updatedAt: serverTimestamp(),
  });
}

function callableError(status: unknown, message: unknown): Error & { code: string } {
  const normalized = String(status ?? 'INTERNAL').toLowerCase().replace(/_/g, '-');
  const error = new Error(typeof message === 'string' ? message : 'The archive service could not complete the request.') as Error & { code: string };
  error.code = `functions/${normalized}`;
  return error;
}

async function callHostedFunction<TRequest, TResponse>(path: string, data: TRequest): Promise<TResponse> {
  const user = auth?.currentUser;
  if (!user) throw callableError('UNAUTHENTICATED', 'Sign in is required.');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as {
      data?: TResponse;
      result?: TResponse;
      error?: { status?: string; message?: string };
    };
    if (!response.ok || body.error) throw callableError(body.error?.status, body.error?.message);
    const result = body.data ?? body.result;
    if (result === undefined) throw callableError('INTERNAL', 'The archive service returned an invalid response.');
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw callableError('UNAVAILABLE', 'The archive service timed out. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function runApexSync(mode: 'dry-run' | 'apply') {
  return callHostedFunction<{ mode: 'dry-run' | 'apply' }, Record<string, unknown>>('/api/sync-now', { mode });
}

export async function getCvBlob(applicationId: string, mode: 'preview' | 'download'): Promise<Blob> {
  const result = await callHostedFunction<
    { applicationId: string; mode: 'preview' | 'download' },
    { url: string; expiresAt: string }
  >('/api/cv-access', { applicationId, mode });
  const url = new URL(result.url);
  if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com') {
    throw new Error('The archive returned an invalid CV download address.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error(`The archived CV returned HTTP ${response.status}.`);
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > 25 * 1024 * 1024) throw new Error('The archived CV exceeds the 25 MiB size limit.');
    const blob = await response.blob();
    if (blob.size > 25 * 1024 * 1024) throw new Error('The archived CV exceeds the 25 MiB size limit.');
    return blob;
  } finally {
    window.clearTimeout(timeout);
  }
}
