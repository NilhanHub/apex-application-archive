import { describe, expect, it } from 'vitest';
import { discoverFiles, isAllowedCvSourceUrl, normalizeEntry, sanitizeFields, stableHash } from './normalize.js';
import { hasCurrentDownloadedCv } from './sync.js';
import type { WordPressEntry } from './types.js';

const nestedEntry: WordPressEntry = {
  entry_id: 14,
  form_id: 2989,
  date_created: '2026-06-15 10:30:00',
  date_updated: '2026-06-15 10:35:00',
  fields: {
    _forminator_user_ip: '203.0.113.10',
    'name-1': 'Jane Applicant',
    'email-1': 'Jane@Example.com',
    'textarea-1': 'Commercial engineer with B2B experience.',
    'hidden-1': 'Technical Sales Executive',
    'upload-1': {
      file: {
        file_name: 'Jane CV.pdf',
        file_path: '/srv/uploads/Jane CV.pdf',
        file_url: 'https://apexhrm.com/wp-content/uploads/forminator/Jane-CV.pdf',
        success: true,
      },
    },
  },
};

describe('Forminator normalization', () => {
  it('discovers nested upload metadata', () => {
    expect(discoverFiles(nestedEntry)).toEqual([
      expect.objectContaining({
        field_id: 'upload-1',
        file_name: 'Jane CV.pdf',
        file_url: 'https://apexhrm.com/wp-content/uploads/forminator/Jane-CV.pdf',
      }),
    ]);
  });

  it('normalizes application fields and removes the Forminator IP address', () => {
    const application = normalizeEntry(nestedEntry);
    expect(application.id).toBe('2989_14');
    expect(application.fullName).toBe('Jane Applicant');
    expect(application.email).toBe('jane@example.com');
    expect(application.cv.status).toBe('queued');
    expect(application.rawFields).not.toHaveProperty('_forminator_user_ip');
  });

  it('removes nested IP fields and creates stable hashes regardless of key order', () => {
    expect(sanitizeFields({ child: { _forminator_user_ip: 'hidden', keep: true } })).toEqual({ child: { keep: true } });
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });
});

describe('CV source allowlist', () => {
  it('allows Apex Forminator uploads only', () => {
    expect(isAllowedCvSourceUrl('https://apexhrm.com/wp-content/uploads/forminator/cv.pdf')).toBe(true);
    expect(isAllowedCvSourceUrl('http://apexhrm.com/wp-content/uploads/forminator/cv.pdf')).toBe(false);
    expect(isAllowedCvSourceUrl('https://example.com/wp-content/uploads/forminator/cv.pdf')).toBe(false);
    expect(isAllowedCvSourceUrl('https://apexhrm.com/private/cv.pdf')).toBe(false);
  });
});

describe('sync CV reconciliation', () => {
  it('counts only the current securely stored CV', () => {
    const application = normalizeEntry(nestedEntry);
    expect(hasCurrentDownloadedCv(application, {
      cv: {
        status: 'downloaded',
        sourceHash: application.cv.sourceHash,
        storagePath: 'cvs/2989/14/Jane-CV.pdf',
      },
    })).toBe(true);
    expect(hasCurrentDownloadedCv(application, {
      cv: {
        status: 'downloaded',
        sourceHash: 'superseded-source',
        storagePath: 'cvs/2989/14/Jane-CV.pdf',
      },
    })).toBe(false);
  });
});
