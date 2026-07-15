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
import { httpsCallable } from 'firebase/functions';
import { getBlob, ref } from 'firebase/storage';
import { db, functions, storage } from '../firebase/data';
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

export async function runApexSync(mode: 'dry-run' | 'apply') {
  if (!functions) throw new Error('Firebase is not configured.');
  const callable = httpsCallable<{ mode: 'dry-run' | 'apply' }, Record<string, unknown>>(functions, 'syncNow');
  const result = await callable({ mode });
  return result.data;
}

export async function getCvBlob(storagePath: string): Promise<Blob> {
  if (!storage) throw new Error('Firebase is not configured.');
  return getBlob(ref(storage, storagePath), 25 * 1024 * 1024 + 1);
}
