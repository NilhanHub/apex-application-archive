import { randomUUID } from 'node:crypto';
import { getFunctions } from 'firebase-admin/functions';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { normalizeEntry, stableHash } from './normalize.js';
import type { CvTaskPayload, NormalizedApplication, SyncResult } from './types.js';
import { fetchAllApplications, type WordPressConfig } from './wordpress.js';

const REGION = 'asia-south1';
const FORM_ID = 2989;
const LOCK_MINUTES = 20;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown sync error.';
}

function isTaskAlreadyQueued(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 'functions/task-already-exists' || code === 6;
}

async function acquireLease(token: string): Promise<void> {
  const db = getFirestore();
  const lockRef = db.collection('syncLocks').doc('apexhrm');
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const expiresAt = snapshot.data()?.expiresAt;
    if (snapshot.data()?.token && expiresAt instanceof Timestamp && expiresAt.toMillis() > Date.now()) {
      throw new Error('Another ApexHRM sync is already running.');
    }
    transaction.set(lockRef, {
      token,
      acquiredAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + LOCK_MINUTES * 60_000),
    });
  });
}

async function releaseLease(token: string): Promise<void> {
  const db = getFirestore();
  const lockRef = db.collection('syncLocks').doc('apexhrm');
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    if (snapshot.data()?.token === token) transaction.delete(lockRef);
  });
}

function sourceFields(application: NormalizedApplication, now: Timestamp) {
  return {
    id: application.id,
    source: application.source,
    formId: application.formId,
    entryId: application.entryId,
    sourcePresent: true,
    sourceMissingSince: null,
    fullName: application.fullName,
    email: application.email,
    applicationMessage: application.applicationMessage,
    jobReference: application.jobReference,
    submittedAt: application.submittedAt,
    submittedAtRaw: application.submittedAtRaw,
    sourceUpdatedAt: application.sourceUpdatedAt,
    sourceUpdatedAtRaw: application.sourceUpdatedAtRaw,
    rawFields: application.rawFields,
    sourceHash: application.sourceHash,
    lastSeenAt: now,
    updatedAt: now,
  };
}

function nextCvState(application: NormalizedApplication, current: Record<string, unknown> | undefined) {
  const currentCv = current?.cv && typeof current.cv === 'object' ? (current.cv as Record<string, unknown>) : undefined;
  if (!application.cv.sourceUrl) {
    if (currentCv?.status === 'downloaded' && currentCv.storagePath) {
      return { ...currentCv, sourcePresent: false };
    }
    return application.cv;
  }

  const sourceUnchanged = currentCv?.sourceHash === application.cv.sourceHash;
  if (sourceUnchanged && currentCv?.status === 'downloaded') {
    return {
      ...currentCv,
      sourcePresent: true,
      sourceUrl: application.cv.sourceUrl,
      sourcePath: application.cv.sourcePath,
      originalFileName: application.cv.originalFileName,
      sourceMimeType: application.cv.sourceMimeType,
    };
  }

  return application.cv;
}

export async function performSync(config: WordPressConfig, mode: 'dry-run' | 'apply'): Promise<SyncResult> {
  const db = getFirestore();
  const token = randomUUID();
  const runId = mode === 'apply' ? token : null;
  let leaseHeld = false;

  if (mode === 'apply') {
    await acquireLease(token);
    leaseHeld = true;
  }

  try {
    if (runId) {
      await db.collection('syncRuns').doc(runId).set({
        id: runId,
        mode,
        trigger: 'wordpress-full-scan',
        status: 'running',
        formId: FORM_ID,
        startedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('syncState').doc('apexhrm').set(
        { status: 'running', activeRunId: runId, lastAttemptAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    const source = await fetchAllApplications(config);
    const normalized = source.entries.map(normalizeEntry);
    const currentSnapshot = await db.collection('applications').where('formId', '==', FORM_ID).get();
    const current = new Map(currentSnapshot.docs.map((document) => [document.id, document.data()]));
    const seen = new Set(normalized.map((application) => application.id));
    const now = Timestamp.now();

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let missing = 0;
    const queuePayloads: CvTaskPayload[] = [];

    for (const application of normalized) {
      const existing = current.get(application.id);
      const cv = nextCvState(application, existing);
      const sourceChanged = !existing || existing.sourceHash !== application.sourceHash || existing.sourcePresent !== true;
      const shouldQueue = Boolean(
        application.cv.sourceUrl &&
          application.cv.sourceHash &&
          (!existing ||
            (existing.cv as Record<string, unknown> | undefined)?.sourceHash !== application.cv.sourceHash ||
            ['queued', 'failed'].includes(String((existing.cv as Record<string, unknown> | undefined)?.status ?? ''))),
      );

      if (!existing) inserted += 1;
      else if (sourceChanged || shouldQueue) updated += 1;
      else unchanged += 1;

      if (shouldQueue && application.cv.sourceHash) {
        queuePayloads.push({ applicationId: application.id, cvSourceHash: application.cv.sourceHash, syncRunId: runId ?? 'dry-run' });
      }

      if (mode === 'apply') {
        const applicationRef = db.collection('applications').doc(application.id);
        if (!existing) {
          await applicationRef.set({
            ...sourceFields(application, now),
            cv,
            recruiter: {
              stage: 'New',
              tags: [],
              assignedTo: null,
              favorite: false,
              lastReviewedAt: null,
            },
            firstImportedAt: now,
          });
        } else {
          await applicationRef.update({ ...sourceFields(application, now), cv });
        }
      }
    }

    for (const document of currentSnapshot.docs) {
      if (!seen.has(document.id) && document.data().sourcePresent === true) {
        missing += 1;
        if (mode === 'apply') {
          await document.ref.update({ sourcePresent: false, sourceMissingSince: now, updatedAt: now });
        }
      }
    }

    let cvQueueFailures = 0;
    if (mode === 'apply' && runId) {
      const queue = getFunctions().taskQueue<CvTaskPayload>(`locations/${REGION}/functions/importCvTask`);
      for (const payload of queuePayloads) {
        try {
          await queue.enqueue(payload, {
            id: stableHash(`${payload.applicationId}:${payload.cvSourceHash}:${runId}`),
            dispatchDeadlineSeconds: 300,
          });
        } catch (error) {
          if (isTaskAlreadyQueued(error)) continue;
          cvQueueFailures += 1;
          await db.collection('applications').doc(payload.applicationId).update({
            'cv.status': 'failed',
            'cv.lastError': 'The CV import task could not be queued.',
            'cv.lastAttemptAt': now,
          });
        }
      }
    }

    const result: SyncResult = {
      mode,
      sourceTotal: source.total,
      scanned: normalized.length,
      inserted,
      updated,
      unchanged,
      missing,
      cvReferenced: normalized.filter((application) => Boolean(application.cv.sourceUrl)).length,
      cvQueued: queuePayloads.length - cvQueueFailures,
      cvQueueFailures,
      runId,
    };

    if (mode === 'apply' && runId) {
      const completedAt = Timestamp.now();
      await db.collection('syncRuns').doc(runId).update({
        ...result,
        status: cvQueueFailures ? 'completed_with_errors' : 'completed',
        completedAt,
        cvCompleted: 0,
        cvFailures: cvQueueFailures,
      });
      await db.collection('syncState').doc('apexhrm').set(
        {
          status: cvQueueFailures ? 'completed_with_errors' : 'idle',
          activeRunId: null,
          sourceTotal: result.sourceTotal,
          activeApplications: result.scanned,
          lastSuccessfulAt: completedAt,
          nextExpectedAt: Timestamp.fromMillis(completedAt.toMillis() + 4 * 60 * 60 * 1000),
          lastResult: result,
        },
        { merge: true },
      );
    }

    return result;
  } catch (error) {
    if (runId) {
      await Promise.allSettled([
        db.collection('syncRuns').doc(runId).set(
          { status: 'failed', completedAt: FieldValue.serverTimestamp(), error: errorMessage(error) },
          { merge: true },
        ),
        db.collection('syncState').doc('apexhrm').set(
          { status: 'failed', activeRunId: null, lastFailureAt: FieldValue.serverTimestamp(), lastError: errorMessage(error) },
          { merge: true },
        ),
      ]);
    }
    throw error;
  } finally {
    if (leaseHeld) await releaseLease(token).catch(() => undefined);
  }
}
