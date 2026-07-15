import { describe, expect, it } from 'vitest';
import { isArchiveStale, isDevelopmentDemoAllowed } from './App';
import type { SyncState } from './types';

describe('authentication boundary', () => {
  it('allows the fictional demo only in development builds', () => {
    expect(isDevelopmentDemoAllowed(true, '?demo=1')).toBe(true);
    expect(isDevelopmentDemoAllowed(false, '?demo=1')).toBe(false);
    expect(isDevelopmentDemoAllowed(true, '')).toBe(false);
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

  it('marks never-synced and older-than-eight-hour archives as stale', () => {
    expect(isArchiveStale({ ...state, lastSuccessfulAt: null })).toBe(true);
    expect(isArchiveStale({ ...state, lastSuccessfulAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString() })).toBe(true);
    expect(isArchiveStale(state)).toBe(false);
  });
});
