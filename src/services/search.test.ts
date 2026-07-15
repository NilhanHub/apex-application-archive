import { describe, expect, it } from 'vitest';
import { demoApplications } from '../data/demoApplications';
import { defaultFilters, searchApplications } from './search';

describe('application search', () => {
  it('finds exact names and email addresses', () => {
    expect(searchApplications(demoApplications, 'Anushka Perera', defaultFilters, 'relevance').map((result) => result.application.id)).toEqual(['2989_201']);
    expect(searchApplications(demoApplications, 'fathima.nazeer@example.com', defaultFilters, 'relevance').map((result) => result.application.id)).toEqual(['2989_200']);
  });

  it('matches sensible misspellings without flooding results', () => {
    const results = searchApplications(demoApplications, 'enginear', defaultFilters, 'relevance');
    expect(results.map((result) => result.application.fullName)).toEqual(['Ravindu Jayasinghe']);
  });

  it('requires all query terms and reports why a result matched', () => {
    const results = searchApplications(demoApplications, 'technical sales', defaultFilters, 'relevance');
    expect(results).toHaveLength(1);
    expect(results[0].application.fullName).toBe('Anushka Perera');
    expect(results[0].reasons).toContain('Application');
  });

  it('combines stage and CV filters', () => {
    const results = searchApplications(
      demoApplications,
      '',
      { ...defaultFilters, stage: 'Review', cvStatus: 'downloaded' },
      'newest',
    );
    expect(results.map((result) => result.application.fullName)).toEqual(['Anushka Perera']);
  });
});
