import { Buffer } from 'node:buffer';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isAllowedCvSourceUrl } from './normalize.js';
import type { CvTaskPayload } from './types.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export class PermanentCvError extends Error {}

function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-140);
  return cleaned || 'cv-file';
}

function contentMatches(buffer: Buffer, extension: string): boolean {
  if (extension === 'pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === 'jpg' || extension === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === 'doc') return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === 'docx') return buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (extension === 'txt') return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
  return false;
}

async function fetchWithSafeRedirects(urlValue: string, headers: Record<string, string>, redirects = 0): Promise<Response> {
  if (!isAllowedCvSourceUrl(urlValue)) throw new PermanentCvError('The CV source URL is not an approved ApexHRM upload URL.');
  const response = await fetch(urlValue, { headers, redirect: 'manual', signal: AbortSignal.timeout(45_000) });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= 2) throw new PermanentCvError('The CV source redirected too many times.');
    const location = response.headers.get('location');
    if (!location) throw new PermanentCvError('The CV source returned an invalid redirect.');
    return fetchWithSafeRedirects(new URL(location, urlValue).toString(), headers, redirects + 1);
  }
  return response;
}

async function downloadCv(url: string, username: string, applicationPassword: string): Promise<Response> {
  let response = await fetchWithSafeRedirects(url, { Accept: '*/*' });
  if (response.status === 401 || response.status === 403) {
    const authorization = Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64');
    response = await fetchWithSafeRedirects(url, { Accept: '*/*', Authorization: `Basic ${authorization}` });
  }
  return response;
}

export async function importCv(
  payload: CvTaskPayload,
  credentials: { username: string; applicationPassword: string },
): Promise<'downloaded' | 'superseded'> {
  const db = getFirestore();
  const applicationRef = db.collection('applications').doc(payload.applicationId);
  const snapshot = await applicationRef.get();
  if (!snapshot.exists) throw new PermanentCvError('Application no longer exists.');

  const application = snapshot.data()!;
  const cv = application.cv as Record<string, unknown>;
  if (cv.sourceHash !== payload.cvSourceHash) return 'superseded';
  const sourceUrl = String(cv.sourceUrl ?? '');
  const originalFileName = String(cv.originalFileName ?? '');
  const extension = extensionOf(originalFileName || new URL(sourceUrl).pathname);
  const contentType = ALLOWED_TYPES[extension];
  if (!contentType) throw new PermanentCvError('The CV file type is not allowed.');

  const response = await downloadCv(sourceUrl, credentials.username, credentials.applicationPassword);
  if (response.status === 404 || response.status === 410) throw new PermanentCvError(`The CV source returned HTTP ${response.status}.`);
  if (!response.ok) throw new Error(`The CV source returned HTTP ${response.status}.`);
  if ((response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    throw new PermanentCvError('The CV source returned HTML instead of a file.');
  }

  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_FILE_SIZE) throw new PermanentCvError('The CV exceeds the 25 MiB size limit.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new PermanentCvError('The CV file is empty.');
  if (buffer.length > MAX_FILE_SIZE) throw new PermanentCvError('The CV exceeds the 25 MiB size limit.');
  if (!contentMatches(buffer, extension)) throw new PermanentCvError('The CV contents do not match its file extension.');

  const latest = await applicationRef.get();
  if ((latest.data()?.cv as Record<string, unknown> | undefined)?.sourceHash !== payload.cvSourceHash) return 'superseded';

  const fileName = safeFileName(originalFileName);
  const storagePath = `cvs/2989/${application.entryId}/${fileName}`;
  const disposition = ['doc', 'docx'].includes(extension) ? 'attachment' : 'inline';
  await getStorage().bucket().file(storagePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      contentDisposition: `${disposition}; filename="${fileName}"`,
      cacheControl: 'private, max-age=3600',
      metadata: {
        applicationId: payload.applicationId,
        cvSourceHash: payload.cvSourceHash,
      },
    },
  });

  const importedAt = Timestamp.now();
  await applicationRef.update({
    'cv.status': 'downloaded',
    'cv.sourcePresent': true,
    'cv.storagePath': storagePath,
    'cv.contentType': contentType,
    'cv.sizeBytes': buffer.length,
    'cv.importedAt': importedAt,
    'cv.lastAttemptAt': importedAt,
    'cv.lastError': null,
    updatedAt: importedAt,
  });
  await db.collection('syncRuns').doc(payload.syncRunId).set(
    { cvCompleted: FieldValue.increment(1) },
    { merge: true },
  );
  return 'downloaded';
}

export async function recordCvFailure(payload: CvTaskPayload, error: unknown): Promise<void> {
  const db = getFirestore();
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown CV import error.';
  await Promise.all([
    db.collection('applications').doc(payload.applicationId).update({
      'cv.status': 'failed',
      'cv.lastAttemptAt': FieldValue.serverTimestamp(),
      'cv.lastError': message,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.collection('syncRuns').doc(payload.syncRunId).set(
      { cvFailures: FieldValue.increment(1) },
      { merge: true },
    ),
  ]);
}
