import MiniSearch, { type SearchResult as MiniSearchResult } from 'minisearch';
import type { ApplicationRecord, SearchFilters, SearchResult, SortOption } from '../types';

interface SearchDocument {
  id: string;
  fullName: string;
  email: string;
  jobReference: string;
  applicationMessage: string;
  tags: string;
  fileName: string;
  rawFields: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9@.+#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenSafeValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenSafeValues);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(flattenSafeValues);
  return [];
}

function searchDocument(application: ApplicationRecord): SearchDocument {
  return {
    id: application.id,
    fullName: application.fullName,
    email: application.email,
    jobReference: application.jobReference,
    applicationMessage: application.applicationMessage,
    tags: application.recruiter.tags.join(' '),
    fileName: application.cv.originalFileName ?? '',
    rawFields: flattenSafeValues(application.rawFields).join(' '),
  };
}

function passesFilters(application: ApplicationRecord, filters: SearchFilters): boolean {
  const submitted = application.submittedAt?.slice(0, 10) ?? '';
  if (filters.stage !== 'all' && application.recruiter.stage !== filters.stage) return false;
  if (filters.cvStatus !== 'all' && application.cv.status !== filters.cvStatus) return false;
  if (filters.assignedTo !== 'all' && application.recruiter.assignedTo !== filters.assignedTo) return false;
  if (filters.tag && !application.recruiter.tags.some((tag) => normalize(tag).includes(normalize(filters.tag)))) return false;
  if (filters.submittedFrom && (!submitted || submitted < filters.submittedFrom)) return false;
  if (filters.submittedTo && (!submitted || submitted > filters.submittedTo)) return false;
  if (filters.hasCv && application.cv.status === 'missing') return false;
  if (filters.favoritesOnly && !application.recruiter.favorite) return false;
  if (filters.sourcePresentOnly && !application.sourcePresent) return false;
  return true;
}

function fieldsFromMatch(result: MiniSearchResult): string[] {
  const fields = new Set<string>();
  Object.values(result.match).forEach((matchedFields) => matchedFields.forEach((field) => fields.add(field)));
  const labels: Record<string, string> = {
    fullName: 'Name',
    email: 'Email',
    jobReference: 'Job reference',
    applicationMessage: 'Application',
    tags: 'Tags',
    fileName: 'CV filename',
    rawFields: 'Submitted fields',
  };
  return [...fields].map((field) => labels[field] ?? field);
}

function snippet(value: string, terms: string[]): string {
  const clean = value.trim();
  if (!clean) return '';
  const normalized = normalize(clean);
  const index = terms.map((term) => normalized.indexOf(normalize(term))).find((position) => position >= 0) ?? -1;
  if (index < 0) return clean.slice(0, 170);
  const start = Math.max(0, index - 55);
  const end = Math.min(clean.length, index + 120);
  return `${start > 0 ? '...' : ''}${clean.slice(start, end)}${end < clean.length ? '...' : ''}`;
}

function snippetsFor(application: ApplicationRecord, terms: string[]): string[] {
  return [
    snippet(application.applicationMessage, terms),
    snippet(application.jobReference, terms),
    snippet(flattenSafeValues(application.rawFields).join(' '), terms),
  ]
    .filter(Boolean)
    .slice(0, 2);
}

function compareApplications(left: SearchResult, right: SearchResult, sort: SortOption, hasQuery: boolean): number {
  if (sort === 'relevance' && hasQuery && right.score !== left.score) return right.score - left.score;
  if (sort === 'oldest') return (left.application.submittedAt ?? '').localeCompare(right.application.submittedAt ?? '');
  if (sort === 'name') return left.application.fullName.localeCompare(right.application.fullName);
  if (sort === 'reviewed') return (right.application.recruiter.lastReviewedAt ?? '').localeCompare(left.application.recruiter.lastReviewedAt ?? '');
  return (right.application.submittedAt ?? '').localeCompare(left.application.submittedAt ?? '');
}

export function searchApplications(
  applications: ApplicationRecord[],
  query: string,
  filters: SearchFilters,
  sort: SortOption,
): SearchResult[] {
  const filtered = applications.filter((application) => passesFilters(application, filters));
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return filtered
      .map((application) => ({ application, score: 0, reasons: [], snippets: [] }))
      .sort((left, right) => compareApplications(left, right, sort, false));
  }

  const index = new MiniSearch<SearchDocument>({
    fields: ['fullName', 'email', 'jobReference', 'applicationMessage', 'tags', 'fileName', 'rawFields'],
    storeFields: ['id'],
    searchOptions: {
      combineWith: 'AND',
      prefix: (term) => term.length >= 3,
      fuzzy: (term) => (term.length >= 8 ? 0.25 : term.length >= 6 ? 0.17 : false),
      maxFuzzy: 2,
      boost: { fullName: 7, email: 7, jobReference: 5, tags: 4, fileName: 3, applicationMessage: 2, rawFields: 1 },
      weights: { fuzzy: 0.55, prefix: 0.8 },
    },
  });
  index.addAll(filtered.map(searchDocument));
  const byId = new Map(filtered.map((application) => [application.id, application]));

  return index
    .search(trimmedQuery)
    .map((result) => {
      const application = byId.get(String(result.id));
      if (!application) return null;
      return {
        application,
        score: result.score,
        reasons: fieldsFromMatch(result),
        snippets: snippetsFor(application, result.terms),
      };
    })
    .filter((result): result is SearchResult => Boolean(result))
    .sort((left, right) => compareApplications(left, right, sort, true));
}

export const defaultFilters: SearchFilters = {
  stage: 'all',
  cvStatus: 'all',
  assignedTo: 'all',
  tag: '',
  submittedFrom: '',
  submittedTo: '',
  hasCv: false,
  favoritesOnly: false,
  sourcePresentOnly: true,
};
