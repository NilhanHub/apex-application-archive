import type { WordPressEntriesPage, WordPressEntry } from './types.js';

export interface WordPressConfig {
  baseUrl: string;
  username: string;
  applicationPassword: string;
}

function validatedBaseUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (host !== 'apexhrm.com' && host !== 'www.apexhrm.com')) {
    throw new Error('WORDPRESS_BASE_URL must use HTTPS on apexhrm.com.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function parsePage(value: unknown): WordPressEntriesPage {
  if (!value || typeof value !== 'object') throw new Error('WordPress returned an invalid response.');
  const page = value as Partial<WordPressEntriesPage>;
  if (
    Number(page.form_id) !== 2989 ||
    !Number.isSafeInteger(Number(page.page)) ||
    !Number.isSafeInteger(Number(page.total)) ||
    !Number.isSafeInteger(Number(page.pages)) ||
    !Array.isArray(page.entries)
  ) {
    throw new Error('WordPress returned an invalid entries page.');
  }
  return page as WordPressEntriesPage;
}

async function fetchPage(config: WordPressConfig, page: number): Promise<WordPressEntriesPage> {
  const baseUrl = validatedBaseUrl(config.baseUrl);
  const endpoint = new URL(`/wp-json/apex-forminator/v1/forms/2989/entries`, baseUrl);
  endpoint.searchParams.set('page', String(page));
  endpoint.searchParams.set('per_page', '200');

  const authorization = Buffer.from(`${config.username}:${config.applicationPassword}`, 'utf8').toString('base64');
  const response = await fetch(endpoint, {
    headers: { Authorization: `Basic ${authorization}`, Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error('WordPress bridge redirected unexpectedly. Verify WORDPRESS_BASE_URL.');
  }
  if (!response.ok) {
    throw new Error(`WordPress bridge request failed with HTTP ${response.status}.`);
  }

  return parsePage(await response.json());
}

export async function fetchAllApplications(config: WordPressConfig): Promise<{ entries: WordPressEntry[]; total: number }> {
  if (!config.username || !config.applicationPassword) throw new Error('WordPress credentials are not configured.');

  const first = await fetchPage(config, 1);
  if (first.pages < 1 || first.pages > 100) throw new Error('WordPress returned an unsafe page count.');

  const entries = [...first.entries];
  for (let page = 2; page <= first.pages; page += 1) {
    const next = await fetchPage(config, page);
    if (next.total !== first.total || next.pages !== first.pages) {
      throw new Error('WordPress application totals changed during the scan; retry without applying partial data.');
    }
    entries.push(...next.entries);
  }

  const entryIds = new Set(entries.map((entry) => Number(entry.entry_id)));
  if (entryIds.size !== entries.length || entries.length !== first.total) {
    throw new Error(`WordPress reconciliation failed: expected ${first.total}, received ${entries.length}.`);
  }

  return { entries, total: first.total };
}
