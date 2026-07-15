import { describe, expect, it } from 'vitest';
import { archiveFreshness, displayError, isArchiveStale, isDevelopmentDemoAllowed } from './App';
import type { SyncState } from './types';

describe('authentication boundary', () => {
  it('allows the fictional demo only in development builds', () => {
    expect(isDevelopmentDemoAllowed(true, '?demo=1')).toBe(true);
    expect(isDevelopmentDemoAllowed(false, '?demo=1')).toBe(false);
    expect(isDevelopmentDemoAllowed(true, '')).toBe(false);
  });

  it('turns Firebase authentication failures into useful messages', () => {
    expect(displayError({ code: 'auth/internal-error' })).toContain('Google sign-in');
    expect(displayError({ code: 'auth/popup-blocked' })).toContain('pop-ups');
    expect(displayError({ code: 'functions/permission-denied' })).toContain('not approved');
    expect(displayError({ code: 'functions/not-found' })).toContain('not available yet');
    expect(displayError({ code: 'auth/unknown-failure' })).not.toContain('auth/unknown-failure');
  });
});

describe('sync freshness', () => {
  const state: SyncState = {
    status: 'idle',
    sourceTotal: 164,
    activeApplications: 164,
    lastSuccessfulAt: new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
    nextExpectedAt: null,
    lastError: null,
  };

  it('marks never-synced and older-than-five-hour archives as stale', () => {
    expect(isArchiveStale({ ...state, lastSuccessfulAt: null })).toBe(true);
    expect(isArchiveStale({ ...state, lastSuccessfulAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() })).toBe(true);
    expect(isArchiveStale({ ...state, lastSuccessfulAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() })).toBe(false);
    expect(isArchiveStale(state)).toBe(false);
    expect(archiveFreshness({ ...state, lastSuccessfulAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() })).toBe('overdue');
    expect(archiveFreshness({ ...state, lastSuccessfulAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString() })).toBe('critical');
    expect(archiveFreshness({ ...state, lastSuccessfulAt: 'invalid-date' })).toBe('critical');
  });
});
