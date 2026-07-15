import type { Candidate, SearchFilters, SearchResult } from '../types';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9@.+#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const typoAliases: Record<string, string[]> = {
  enginear: ['engineer', 'engineering'],
  enginer: ['engineer', 'engineering'],
  singapor: ['singapore'],
  tehnical: ['technical'],
  tecnical: ['technical'],
  sale: ['sales'],
};

const tokens = (value: string) => normalize(value).split(' ').filter(Boolean);

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  return matrix[a.length][b.length];
}

function tokenMatches(queryToken: string, hayTokens: string[]) {
  const aliases = typoAliases[queryToken] ?? [];
  return hayTokens.some((token) => {
    if (token.includes(queryToken) || queryToken.includes(token)) return true;
    if (aliases.some((alias) => token.includes(alias))) return true;
    if (queryToken.length >= 6 && token.length >= 6 && levenshtein(queryToken, token) <= 2) return true;
    return false;
  });
}

export function candidateHaystack(candidate: Candidate) {
  return [
    candidate.fullName,
    candidate.email,
    candidate.phone ?? '',
    candidate.message ?? '',
    candidate.stage,
    candidate.tags.join(' '),
    candidate.cv.fileName ?? '',
    candidate.cv.fileType ?? '',
    candidate.cv.downloadStatus,
    candidate.cv.extractedText ?? '',
    candidate.aiSummary.shortSummary,
    candidate.aiSummary.skills.join(' '),
    candidate.aiSummary.industries.join(' '),
    candidate.aiSummary.companies.join(' '),
    candidate.aiSummary.education.join(' '),
    candidate.aiSummary.strengths.join(' '),
    Object.values(candidate.rawFields).join(' '),
  ].join(' ');
}

function applyFilters(candidate: Candidate, filters: SearchFilters) {
  const submitted = candidate.submittedAt.slice(0, 10);
  if (filters.stage !== 'all' && candidate.stage !== filters.stage) return false;
  if (filters.sourceForm !== 'all' && candidate.formId !== filters.sourceForm) return false;
  if (filters.cvStatus !== 'all' && candidate.cv.downloadStatus !== filters.cvStatus) return false;
  if (filters.fileType !== 'all' && candidate.cv.fileType !== filters.fileType) return false;
  if (filters.hasCv && candidate.cv.downloadStatus === 'missing_upload') return false;
  if (filters.hasEmail && !candidate.email) return false;
  if (filters.submittedFrom && submitted < filters.submittedFrom) return false;
  if (filters.submittedTo && submitted > filters.submittedTo) return false;
  if (filters.tag && !candidate.tags.some((tag) => normalize(tag).includes(normalize(filters.tag)))) return false;
  if (filters.skill && !candidate.aiSummary.skills.join(' ').toLowerCase().includes(filters.skill.toLowerCase())) return false;
  if (filters.company && !candidate.aiSummary.companies.join(' ').toLowerCase().includes(filters.company.toLowerCase())) return false;
  if (filters.education && !candidate.aiSummary.education.join(' ').toLowerCase().includes(filters.education.toLowerCase())) return false;
  return true;
}

function findSnippets(candidate: Candidate, queryTokens: string[]) {
  const fields = [
    candidate.aiSummary.shortSummary,
    candidate.cv.extractedText ?? '',
    candidate.message ?? '',
    candidate.aiSummary.companies.join(', '),
    candidate.aiSummary.education.join(', '),
  ].filter(Boolean);

  return fields
    .map((field) => {
      const normalizedField = normalize(field);
      const hit = queryTokens.find((queryToken) => tokenMatches(queryToken, tokens(normalizedField)));
      if (!hit) return '';
      const index = normalizedField.indexOf(hit);
      if (index === -1) return field.slice(0, 150);
      return field.slice(Math.max(0, index - 55), Math.min(field.length, index + 110));
    })
    .filter(Boolean)
    .slice(0, 2);
}

export function searchCandidates(candidates: Candidate[], query: string, filters: SearchFilters): SearchResult[] {
  const queryTokens = tokens(query);

  return candidates
    .filter((candidate) => applyFilters(candidate, filters))
    .map((candidate) => {
      const hay = candidateHaystack(candidate);
      const hayTokens = tokens(hay);
      const tokenHits = queryTokens.filter((queryToken) => tokenMatches(queryToken, hayTokens));
      const exactHit = query ? normalize(hay).includes(normalize(query)) : true;
      const queryMatched = queryTokens.length === 0 || exactHit || tokenHits.length === queryTokens.length;

      if (!queryMatched) return null;

      const reasons = [
        tokenHits.some((hit) => normalize(candidate.fullName).includes(hit)) ? 'name' : '',
        tokenHits.some((hit) => normalize(candidate.email).includes(hit)) ? 'email' : '',
        tokenHits.some((hit) => candidate.aiSummary.skills.join(' ').toLowerCase().includes(hit)) ? 'skills' : '',
        tokenHits.some((hit) => candidate.aiSummary.companies.join(' ').toLowerCase().includes(hit)) ? 'company' : '',
        tokenHits.some((hit) => candidate.aiSummary.education.join(' ').toLowerCase().includes(hit)) ? 'education' : '',
        tokenHits.some((hit) => normalize(candidate.cv.extractedText ?? '').includes(hit) || typoAliases[hit]?.some((alias) => normalize(candidate.cv.extractedText ?? '').includes(alias))) ? 'CV text' : '',
      ].filter(Boolean);

      const score = exactHit ? 100 : tokenHits.length * 20 + reasons.length * 5;
      return {
        candidate,
        reasons: reasons.length ? reasons : ['profile'],
        snippets: queryTokens.length ? findSnippets(candidate, queryTokens) : [candidate.aiSummary.shortSummary],
        score,
      };
    })
    .filter((result): result is SearchResult => Boolean(result))
    .sort((a, b) => b.score - a.score || b.candidate.submittedAt.localeCompare(a.candidate.submittedAt));
}

export const defaultFilters: SearchFilters = {
  stage: 'all',
  sourceForm: 'all',
  cvStatus: 'all',
  fileType: 'all',
  tag: '',
  skill: '',
  company: '',
  education: '',
  submittedFrom: '',
  submittedTo: '',
  hasCv: false,
  hasEmail: true,
};
