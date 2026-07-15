import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireApprovedUser } from './auth.js';

const ACCESS_URL_LIFETIME_MS = 5 * 60 * 1000;

interface CallableAuth {
  uid?: string;
  token?: Record<string, unknown>;
}

export type CvAccessMode = 'preview' | 'download';

export function isValidApplicationCvPath(applicationId: string, entryId: number, storagePath: string): boolean {
  return applicationId === `2989_${entryId}`
    && /^cvs\/2989\/\d+\/[a-zA-Z0-9][a-zA-Z0-9._ -]{0,139}$/.test(storagePath)
    && storagePath.startsWith(`cvs/2989/${entryId}/`);
}

export function safeDispositionFileName(value: unknown): string {
  const cleaned = String(value ?? '')
    .replace(/[\r\n"\\]/g, '_')
    .replace(/[^a-zA-Z0-9._ ()-]/g, '_')
    .slice(0, 140);
  return cleaned || 'candidate-cv';
}

export async function createCvAccessUrl(
  auth: CallableAuth | undefined,
  data: unknown,
): Promise<{ url: string; expiresAt: string }> {
  await requireApprovedUser(auth);

  const input = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const applicationId = String(input.applicationId ?? '');
  const mode: CvAccessMode = input.mode === 'download' ? 'download' : 'preview';
  if (!/^2989_\d+$/.test(applicationId)) {
    throw new HttpsError('invalid-argument', 'A valid ApexHRM application is required.');
  }

  const application = await getFirestore().collection('applications').doc(applicationId).get();
  if (!application.exists) throw new HttpsError('not-found', 'The application was not found.');

  const record = application.data() ?? {};
  const cv = record.cv && typeof record.cv === 'object' ? record.cv as Record<string, unknown> : {};
  const entryId = Number(record.entryId);
  const storagePath = String(cv.storagePath ?? '');
  if (cv.status !== 'downloaded' || !Number.isInteger(entryId) || !isValidApplicationCvPath(applicationId, entryId, storagePath)) {
    throw new HttpsError('failed-precondition', 'This application does not have an archived CV.');
  }

  const fileName = safeDispositionFileName(cv.originalFileName ?? storagePath.split('/').pop());
  const expires = Date.now() + ACCESS_URL_LIFETIME_MS;
  const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires,
    responseDisposition: `${mode === 'download' ? 'attachment' : 'inline'}; filename="${fileName}"`,
  });

  return { url, expiresAt: new Date(expires).toISOString() };
}
