import { describe, expect, it } from 'vitest';
import { mockCandidates } from '../data/mockCandidates';
import { runMockAiSearch } from './ai';
import { defaultFilters, searchCandidates } from './search';

describe('candidate search', () => {
  it('finds CV text with a fuzzy misspelling', () => {
    const results = searchCandidates(mockCandidates, 'enginear', defaultFilters);
    expect(results.some((result) => result.candidate.fullName === 'Malith Senanayake')).toBe(true);
  });

  it('finds PLC and Singapore signals', () => {
    const results = searchCandidates(mockCandidates, 'PLC Singapore', defaultFilters);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('AI compliance', () => {
  it('refuses protected-trait recruitment filters', () => {
    const response = runMockAiSearch('find me a male in his 30s with sales and technical experience', mockCandidates);
    expect(response.excludedUnsafeCriteria).toContain('gender');
    expect(response.excludedUnsafeCriteria).toContain('age');
    expect(response.answer).toContain("can't filter");
  });
});
