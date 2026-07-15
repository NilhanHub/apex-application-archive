import { createHash } from 'node:crypto';
import type { NormalizedApplication, WordPressEntry, WordPressFile } from './types.js';

const FORM_ID = 2989 as const;
const MAX_STRING_LENGTH = 50_000;
const MAX_ARRAY_LENGTH = 200;
const MAX_DEPTH = 8;

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_STRING_LENGTH) : '';
}

function personName(value: unknown): string {
  if (typeof value === 'string') return cleanString(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const record = value as Record<string, unknown>;
  return [record['first-name'], record['middle-name'], record['last-name']]
    .map(cleanString)
    .filter(Boolean)
    .join(' ');
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === '_forminator_user_ip') continue;
      result[key] = sanitizeValue(child, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, MAX_STRING_LENGTH);
}

export function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(fields) as Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function parseWordPressDate(value: unknown): Date | null {
  const raw = cleanString(value);
  if (!raw) return null;

  const sqlDate = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  const parsed = sqlDate ? new Date(`${sqlDate[1]}T${sqlDate[2]}+05:30`) : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').slice(0, 255);
  } catch {
    return '';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recursivelyDiscoverFiles(value: unknown, fieldId: string, files: WordPressFile[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => recursivelyDiscoverFiles(item, fieldId, files));
    return;
  }
  if (!isRecord(value)) return;

  const sourceUrl = cleanString(value.file_url);
  const sourcePath = cleanString(value.file_path);
  const sourceName = cleanString(value.file_name);
  if (sourceUrl || sourcePath || sourceName) {
    files.push({
      field_id: fieldId,
      file_name: sourceName,
      file_path: sourcePath,
      file_url: sourceUrl,
      mime_type: cleanString(value.mime_type),
      success: typeof value.success === 'boolean' ? value.success : true,
      message: cleanString(value.message),
    });
  }

  Object.values(value).forEach((child) => recursivelyDiscoverFiles(child, fieldId, files));
}

export function discoverFiles(entry: WordPressEntry): WordPressFile[] {
  const candidates: WordPressFile[] = Array.isArray(entry.files) ? [...entry.files] : [];
  for (const [fieldId, value] of Object.entries(entry.fields ?? {})) {
    recursivelyDiscoverFiles(value, fieldId, candidates);
  }
  for (const url of entry.cv_urls ?? []) {
    candidates.push({ field_id: 'upload-1', file_url: url, file_name: fileNameFromUrl(url), success: true });
  }

  const unique = new Map<string, WordPressFile>();
  for (const candidate of candidates) {
    const sourceUrl = cleanString(candidate.file_url);
    const sourcePath = cleanString(candidate.file_path);
    const sourceName = cleanString(candidate.file_name) || fileNameFromUrl(sourceUrl);
    const identity = sourceUrl || sourcePath || sourceName;
    if (!identity) continue;
    unique.set(identity, {
      field_id: cleanString(candidate.field_id),
      file_name: sourceName,
      file_path: sourcePath,
      file_url: sourceUrl,
      mime_type: cleanString(candidate.mime_type),
      success: candidate.success !== false,
      message: cleanString(candidate.message),
    });
  }
  return [...unique.values()];
}

export function isAllowedCvSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (host === 'apexhrm.com' || host === 'www.apexhrm.com') &&
      url.pathname.toLowerCase().includes('/wp-content/uploads/forminator/')
    );
  } catch {
    return false;
  }
}

export function normalizeEntry(entry: WordPressEntry): NormalizedApplication {
  if (Number(entry.form_id) !== FORM_ID) throw new Error(`Unexpected form id: ${entry.form_id}`);
  const entryId = Number(entry.entry_id);
  if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new Error('Entry id must be a positive integer.');

  const rawFields = sanitizeFields(entry.fields ?? {});
  const files = discoverFiles(entry).filter((file) => file.success !== false);
  const primaryFile = files.find((file) => cleanString(file.file_url)) ?? files[0];
  const sourceUrl = cleanString(primaryFile?.file_url) || null;
  const sourcePath = cleanString(primaryFile?.file_path) || null;
  const originalFileName = cleanString(primaryFile?.file_name) || (sourceUrl ? fileNameFromUrl(sourceUrl) : '') || null;
  const sourceMimeType = cleanString(primaryFile?.mime_type) || null;
  const cvSourceHash = primaryFile
    ? stableHash({ sourceUrl, sourcePath, originalFileName, sourceMimeType })
    : null;

  const sourceShape = {
    formId: FORM_ID,
    entryId,
    dateCreated: cleanString(entry.date_created),
    dateUpdated: cleanString(entry.date_updated),
    isRead: Boolean(entry.is_read),
    rawFields,
    files,
  };

  return {
    id: `${FORM_ID}_${entryId}`,
    source: 'apexhrm_forminator',
    formId: FORM_ID,
    entryId,
    sourcePresent: true,
    fullName: personName(rawFields['name-1']),
    email: cleanString(rawFields['email-1']).toLowerCase(),
    applicationMessage: cleanString(rawFields['textarea-1']),
    jobReference: cleanString(rawFields['hidden-1']),
    submittedAt: parseWordPressDate(entry.date_created),
    submittedAtRaw: cleanString(entry.date_created),
    sourceUpdatedAt: parseWordPressDate(entry.date_updated),
    sourceUpdatedAtRaw: cleanString(entry.date_updated),
    rawFields,
    sourceHash: stableHash(sourceShape),
    cv: {
      status: sourceUrl ? 'queued' : 'missing',
      sourcePresent: Boolean(sourceUrl),
      sourceUrl,
      sourcePath,
      sourceHash: cvSourceHash,
      originalFileName,
      sourceMimeType,
      storagePath: null,
      contentType: null,
      sizeBytes: null,
      importedAt: null,
      lastAttemptAt: null,
      lastError: null,
    },
  };
}
