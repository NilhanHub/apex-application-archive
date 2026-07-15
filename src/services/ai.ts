import type { AiSearchResponse, Candidate } from '../types';
import { candidateHaystack } from './search';

const unsafeRules = [
  {
    label: 'gender',
    pattern: /\b(male|female|man|woman|gender|boys?|girls?|gentlemen|ladies)\b/i,
  },
  {
    label: 'age',
    pattern: /\b(age|aged|young|younger|older|elderly|in his \d{2}s|in her \d{2}s|\d{2}s)\b/i,
  },
  {
    label: 'residential flood-risk or socioeconomic proxy',
    pattern: /\b(flood|flooded|flooding|residential address|home address|poor area|rich area|socioeconomic)\b/i,
  },
  {
    label: 'other protected characteristic',
    pattern: /\b(ethnicity|religion|marital|pregnant|disability|disabled|health condition)\b/i,
  },
];

const criteriaMap = [
  { label: 'sales experience', tokens: ['sales', 'account', 'b2b', 'customer'] },
  { label: 'technical or engineering experience', tokens: ['technical', 'engineer', 'engineering', 'software', 'erp', 'sql'] },
  { label: 'Sri Lankan PLC experience', tokens: ['plc'] },
  { label: 'Singapore education', tokens: ['singapore', 'nus', 'smu'] },
  { label: 'agriculture-related work keywords', tokens: ['agriculture', 'paddy', 'irrigation', 'plantations', 'rural'] },
  { label: 'customer-facing software exposure', tokens: ['saas', 'crm', 'software', 'customer success'] },
];

export function inspectUnsafeAiQuery(query: string) {
  return unsafeRules.filter((rule) => rule.pattern.test(query)).map((rule) => rule.label);
}

export function runMockAiSearch(query: string, candidates: Candidate[]): AiSearchResponse {
  const excludedUnsafeCriteria = inspectUnsafeAiQuery(query);
  const lowered = query.toLowerCase();
  const interpretedCriteria = criteriaMap
    .filter((criterion) => criterion.tokens.some((token) => lowered.includes(token)))
    .map((criterion) => criterion.label);

  const allowedTokens = criteriaMap
    .filter((criterion) => interpretedCriteria.includes(criterion.label))
    .flatMap((criterion) => criterion.tokens);

  const results = candidates
    .map((candidate) => {
      const hay = candidateHaystack(candidate).toLowerCase();
      const hits = allowedTokens.filter((token) => hay.includes(token));
      const evidence = [
        candidate.aiSummary.shortSummary,
        candidate.cv.extractedText ?? '',
        candidate.aiSummary.companies.join(', '),
        candidate.aiSummary.education.join(', '),
      ]
        .filter((field) => hits.some((hit) => field.toLowerCase().includes(hit)))
        .slice(0, 3);

      if (hits.length === 0) return null;
      const confidence: 'High' | 'Medium' | 'Low' = hits.length >= 5 ? 'High' : hits.length >= 3 ? 'Medium' : 'Low';

      return {
        candidateId: candidate.id,
        confidence,
        evidence: evidence.length ? evidence : [candidate.aiSummary.shortSummary],
        score: hits.length,
      };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _score, ...result }) => result);

  const answer = excludedUnsafeCriteria.length
    ? "I can't filter candidates by protected characteristics or sensitive residential proxies for recruitment decisions. I searched only the compliant skills, experience, company, education, and CV-content criteria."
    : 'I searched the archive using compliant skills, experience, company, education, and CV-content criteria.';

  return {
    answer,
    interpretedCriteria: interpretedCriteria.length ? interpretedCriteria : ['general CV/profile relevance'],
    excludedUnsafeCriteria,
    results,
  };
}
