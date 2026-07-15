import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { requireOwner } from './auth.js';
import { createCvAccessUrl } from './cv-access.js';
import { importCv, PermanentCvError, recordCvFailure } from './cv.js';
import { performSync } from './sync.js';
import type { CvTaskPayload } from './types.js';

initializeApp();

const REGION = 'asia-south1';
const wordpressUsername = defineSecret('WORDPRESS_USERNAME');
const wordpressApplicationPassword = defineSecret('WORDPRESS_APPLICATION_PASSWORD');
const wordpressBaseUrl = defineString('WORDPRESS_BASE_URL', { default: 'https://apexhrm.com' });
const apexOwnerEmail = defineString('APEX_OWNER_EMAIL');
const apexRecruiterEmail = defineString('APEX_RECRUITER_EMAIL');

function emailList(value: string): Set<string> {
  return new Set(
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function wordpressConfig() {
  return {
    baseUrl: wordpressBaseUrl.value(),
    username: wordpressUsername.value(),
    applicationPassword: wordpressApplicationPassword.value(),
  };
}

export const scheduledApexSync = onSchedule(
  {
    region: REGION,
    schedule: '0 */4 * * *',
    timeZone: 'Asia/Colombo',
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 1,
    retryCount: 3,
    maxRetrySeconds: 3600,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 900,
    maxDoublings: 3,
    secrets: [wordpressUsername, wordpressApplicationPassword],
  },
  async () => {
    await performSync(wordpressConfig(), 'apply');
  },
);

export const provisionUserProfile = onCall({ region: REGION, maxInstances: 2 }, async (request) => {
  const email = String(request.auth?.token.email ?? '').trim().toLowerCase();
  const emailVerified = request.auth?.token.email_verified === true;
  if (!request.auth?.uid || !email || !emailVerified) {
    throw new HttpsError('unauthenticated', 'A verified Google account is required.');
  }

  const ownerEmails = emailList(apexOwnerEmail.value());
  const recruiterEmails = emailList(apexRecruiterEmail.value());
  const role = ownerEmails.has(email) ? 'owner' : recruiterEmails.has(email) ? 'recruiter' : null;
  if (!role) throw new HttpsError('permission-denied', 'This Google account is not approved for Apex Talent Archive.');

  const displayName = String(request.auth.token.name ?? (role === 'owner' ? 'Nilhan' : 'Prashanthi')).slice(0, 100);
  await getFirestore().collection('users').doc(request.auth.uid).set(
    {
      uid: request.auth.uid,
      email,
      displayName,
      role,
      approved: true,
      active: true,
      provisionedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { role, approved: true };
});

export const syncNow = onCall(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 1,
    secrets: [wordpressUsername, wordpressApplicationPassword],
  },
  async (request) => {
    await requireOwner(request.auth);
    const mode = request.data?.mode === 'apply' ? 'apply' : 'dry-run';
    try {
      return await performSync(wordpressConfig(), mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The ApexHRM sync failed.';
      throw new HttpsError('internal', message);
    }
  },
);

export const getCvAccessUrl = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 5,
  },
  async (request) => createCvAccessUrl(request.auth, request.data),
);

export const importCvTask = onTaskDispatched<CvTaskPayload>(
  {
    region: REGION,
    timeoutSeconds: 300,
    memory: '512MiB',
    maxInstances: 3,
    concurrency: 1,
    invoker: 'private',
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 60,
      maxBackoffSeconds: 900,
      maxRetrySeconds: 3600,
    },
    rateLimits: { maxConcurrentDispatches: 3, maxDispatchesPerSecond: 2 },
    secrets: [wordpressUsername, wordpressApplicationPassword],
  },
  async (request) => {
    const payload = request.data;
    if (!payload?.applicationId || !payload.cvSourceHash || !payload.syncRunId) return;
    try {
      await importCv(payload, {
        username: wordpressUsername.value(),
        applicationPassword: wordpressApplicationPassword.value(),
      });
    } catch (error) {
      const isLastAttempt = request.context.retryCount >= 4;
      if (error instanceof PermanentCvError || isLastAttempt) {
        await recordCvFailure(payload, error);
        return;
      }
      throw error;
    }
  },
);
