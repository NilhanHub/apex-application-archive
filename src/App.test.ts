import { describe, expect, it } from 'vitest';
import { fileStatusLabel, getInitialSessionFromSearch } from './App';

describe('auth gate initialization', () => {
  it('requires a user unless an explicit demo route is used', () => {
    expect(getInitialSessionFromSearch('')).toEqual({ user: null, view: 'workspace' });
    expect(getInitialSessionFromSearch('?demo=Nilhan&view=ai')).toEqual({ user: 'Nilhan', view: 'ai' });
  });
});

describe('CV status rendering labels', () => {
  it('maps CV state to recruiter-readable text', () => {
    expect(fileStatusLabel('missing_upload')).toBe('Missing upload');
    expect(fileStatusLabel('text_indexed')).toBe('Text indexed');
    expect(fileStatusLabel('failed')).toBe('Failed');
  });
});
