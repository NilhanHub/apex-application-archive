import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const unsafeRecruitmentFilters = [
  /\b(male|female|man|woman|gender)\b/i,
  /\b(age|aged|young|older|in his \d{2}s|in her \d{2}s|\d{2}s)\b/i,
  /\b(flood|flooded|residential address|home address|socioeconomic)\b/i,
  /\b(ethnicity|religion|marital|pregnant|disability|health condition)\b/i,
];

function requireApprovedUser(auth: { uid?: string; token?: Record<string, unknown> } | undefined) {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  return auth.uid;
}

function containsUnsafeRecruitmentFilter(query: string) {
  return unsafeRecruitmentFilters.some((pattern) => pattern.test(query));
}

export const importCvForCandidate = onCall(async (request) => {
  const uid = requireApprovedUser(request.auth);
  const candidateId = String(request.data?.candidateId ?? '');
  if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required.');

  const db = getFirestore();
  const candidateRef = db.collection('candidates').doc(candidateId);
  const snapshot = await candidateRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Candidate not found.');

  // TODO: Download the stored Forminator originalUrl, validate file type, upload to Storage.
  // Keep WordPress credentials and signed URLs server-side only.
  await candidateRef.update({
    'cv.downloadStatus': 'downloaded',
    updatedAt: new Date().toISOString(),
    lastImportedBy: uid,
  });

  return { ok: true, candidateId };
});

export const importAllMissingCvs = onCall(async (request) => {
  requireApprovedUser(request.auth);
  // TODO: Page through candidates where cv.downloadStatus in ["url_known", "failed"].
  return { ok: true, queued: true };
});

export const extractCvText = onCall(async (request) => {
  requireApprovedUser(request.auth);
  const candidateId = String(request.data?.candidateId ?? '');
  if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required.');

  const bucket = getStorage().bucket();
  const db = getFirestore();
  const candidate = await db.collection('candidates').doc(candidateId).get();
  if (!candidate.exists) throw new HttpsError('not-found', 'Candidate not found.');

  // TODO: Use PDF/DOCX/TXT parsers and OCR for images. Store large text in searchDocuments.
  await db.collection('searchDocuments').doc(candidateId).set(
    {
      candidateId,
      extractedTextStatus: 'pending',
      storageBucket: bucket.name,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { ok: true, candidateId };
});

export const generateCvSummary = onCall({ secrets: [geminiApiKey] }, async (request) => {
  requireApprovedUser(request.auth);
  const candidateId = String(request.data?.candidateId ?? '');
  if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required.');

  // TODO: Call Gemini with minimum necessary CV/application text.
  // Do not log raw CV text, prompts, or model responses containing personal data.
  await getFirestore().collection('aiSummaries').doc(candidateId).set(
    {
      candidateId,
      status: 'queued',
      model: 'gemini-secret-manager',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { ok: true, candidateId };
});

export const aiCandidateSearch = onCall({ secrets: [geminiApiKey] }, async (request) => {
  requireApprovedUser(request.auth);
  const query = String(request.data?.query ?? '');
  if (!query.trim()) throw new HttpsError('invalid-argument', 'query is required.');

  if (containsUnsafeRecruitmentFilter(query)) {
    return {
      refusedParts: true,
      message:
        "I can't filter candidates by protected characteristics or sensitive residential proxies for recruitment decisions. I can search compliant skills, experience, employers, education, and CV text instead.",
      results: [],
    };
  }

  // TODO: Retrieve compact searchDocuments, call Gemini, and return source-grounded evidence snippets.
  return {
    refusedParts: false,
    message: 'AI search placeholder. Wire Gemini through this server-side function.',
    results: [],
  };
});
