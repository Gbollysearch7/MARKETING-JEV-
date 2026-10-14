import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importBacklinks } from '../src/engine/ingest/backlinks';
import { importCrawlCsv } from '../src/engine/ingest/crawl-csv';
import { importGa4 } from '../src/engine/ingest/ga4';
import { importGsc, importGscCsv } from '../src/engine/ingest/gsc';
import { pathKey, templateOf } from '../src/engine/ingest/url';
import { MockProvider } from '../src/engine/jev/client';
import { buildSiteData } from '../src/engine/site';
import { ctrCurve, findCannibalPairs } from '../src/engine/verdict/context';
import { mockVerdictAnswer } from '../src/engine/verdict/mock-verdict';
import { runVerdicts } from '../src/engine/verdict/run';
import { DEFAULT_THRESHOLDS } from '../src/engine/verdict/types';

const file = (n: string) => new Uint8Array(readFileSync(`samples/${n}`));

describe('url keys', () => {
  it('joins full URLs, paths and trailing slashes on one key', () => {
    expect(pathKey('https://www.Example.com/Blog/Post/?utm=1#x')).toBe('/blog/post');
    expect(pathKey('/blog/post/')).toBe('/blog/post');
    expect(pathKey('example.com/blog/post')).toBe('/blog/post');
    expect(pathKey('https://example.com')).toBe('/');
    expect(pathKey('(not set)')).toBeNull();
  });
  it('derives templates', () => {
    expect(templateOf('/guides/best-tent')).toBe('/guides/*');
    expect(templateOf('/products/tent/x')).toBe('/products/*/*');
    expect(templateOf('/')).toBe('home');
  });
});

describe('importers', () => {
  it('reads the Search Console zip with compare columns and the date range', () => {
    const g = importGsc('search-console-performance.zip', file('search-console-performance.zip'));
    expect(g.hasPrevious).toBe(true);
    expect(g.period).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    const home = g.pages.find((p) => p.path === '/')!;
    expect(home.clicks).toBeGreaterThan(0);
    expect(home.prevClicks).not.toBeNull();
    expect(home.ctr).toBeGreaterThan(0.05);
  });
  it('reads a page and query CSV and derives page totals', () => {
    const g = importGsc('pq.csv', file('search-console-page-queries.csv'));
    expect(g.pageQueries.length).toBeGreaterThan(400);
    expect(g.pages.find((p) => p.path === '/')!.impressions).toBeGreaterThan(1000);
  });
  it('rejects a queries-only file with a clear message', () => {
    expect(() => importGscCsv('Top queries,Clicks,Impressions\nfoo,1,2')).toThrow(/no page column/);
  });
  it('reads GA4 with comment lines, period and key events', () => {
    const g = importGa4(file('ga4-landing-pages.csv'));
    expect(g.period).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(g.pages.some((p) => p.conversions > 0)).toBe(true);
    expect(g.pages.every((p) => p.path.startsWith('/'))).toBe(true);
  });
  it('reads a Screaming Frog export', () => {
    const c = importCrawlCsv(file('screaming-frog-internal-html.csv'));
    expect(c.pages.length).toBe(91);
    expect(c.pages.find((p) => p.path === '/search')!.indexable).toBe(false);
    expect(c.pages[0].wordCount).toBeGreaterThan(0);
  });
  it('reads an Ahrefs export, including UTF-16', () => {
    expect(importBacklinks(file('ahrefs-best-by-links.csv')).pages.length).toBeGreaterThan(5);
    const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('URL\tReferring domains\nhttps://x.com/a\t7\n', 'utf16le')]);
    expect(importBacklinks(utf16).pages[0]).toMatchObject({ path: '/a', referringDomains: 7 });
  });
});

describe('verdicts on the sample site', async () => {
  const site = buildSiteData({
    gsc: importGsc('z', file('search-console-performance.zip')),
    gscQueries: importGsc('q', file('search-console-page-queries.csv')),
    ga4: importGa4(file('ga4-landing-pages.csv')),
    crawl: importCrawlCsv(file('screaming-frog-internal-html.csv')),
    backlinks: importBacklinks(file('ahrefs-best-by-links.csv')),
    today: '2026-10-13',
  });
  const res = await runVerdicts(site.urls, site.ctx, new MockProvider(mockVerdictAnswer));
  const by = (p: string) => res.verdicts.find((v) => v.path === p)!;

  it('scores every URL or says why not', () => {
    expect(res.verdicts.length).toBe(site.urls.length);
    for (const v of res.verdicts) expect(v.skipped ?? v.verdict).toBeTruthy();
  });
  it('locks protected pages to Leave without a model call', () => {
    expect(by('/privacy-policy')).toMatchObject({ verdict: 'leave', model: 'rules' });
    expect(by('/').verdict).toBe('leave');
  });
  it('skips noindex pages', () => expect(by('/search').skipped).toMatch(/Not indexable/));
  it('never prunes or redirects a converting page', () => {
    const v = by('/products/hiking-boots/trailmaster-0');
    expect(v.rulesApplied.join(' ')).toMatch(/conversions/);
    expect(['prune', 'redirect']).not.toContain(v.verdict);
  });
  it('never prunes or redirects a page updated in the last 30 days', () => {
    for (const p of ['/guides/new-route-0', '/guides/new-route-1', '/guides/new-route-2']) {
      expect(['prune', 'redirect']).not.toContain(by(p).verdict);
      expect(by(p).rulesApplied.join(' ')).toMatch(/never pruned or redirected/);
    }
  });
  it('removes Refresh and Expand from pages with no search demand', () => {
    const v = by('/blog/spring-sale-camping-stove');
    expect(v.rulesApplied.join(' ')).toMatch(/No search demand/);
    expect(Object.keys(v.probabilities)).not.toContain('refresh');
    expect(Object.keys(v.probabilities)).not.toContain('expand');
  });
  it('finds the matching guide as the redirect destination for an old sale page', () => {
    const v = by('/blog/spring-sale-camping-stove');
    expect((v.state as { overlap: { closest_pages: { url_path: string }[] } }).overlap.closest_pages[0].url_path).toBe('/guides/best-camping-stove');
  });
  it('detects cannibalisation on 3+ shared top-20 queries', () => {
    expect(res.pairs.some((p) => [p.a, p.b].includes('/guides/how-to-choose-hiking-boots'))).toBe(true);
  });
  it('requires approval for prune and redirect regardless of confidence', () => {
    for (const v of res.verdicts) if (v.verdict === 'prune' || v.verdict === 'redirect') expect(v.needsApproval).toBe(true);
  });
  it('gives impact as a range with low <= high', () => {
    for (const v of res.verdicts) expect(v.impact.low).toBeLessThanOrEqual(v.impact.high);
  });
  it('uses all six verdicts across the sample', () => {
    const seen = new Set(res.verdicts.map((v) => v.verdict).filter(Boolean));
    expect([...seen].sort()).toEqual(['expand', 'leave', 'merge', 'prune', 'redirect', 'refresh']);
  });
});

describe('cannibal pairs', () => {
  it('needs at least three shared top-20 queries', () => {
    const q = (path: string, query: string, position = 5) => ({ path, query, clicks: 1, impressions: 100, position });
    const two = [q('/a', 'x'), q('/b', 'x'), q('/a', 'y'), q('/b', 'y')];
    expect(findCannibalPairs(two, DEFAULT_THRESHOLDS, new Set(['/a', '/b']))).toHaveLength(0);
    const three = [...two, q('/a', 'z'), q('/b', 'z')];
    expect(findCannibalPairs(three, DEFAULT_THRESHOLDS, new Set(['/a', '/b']))).toHaveLength(1);
    const outside = [...two, q('/a', 'z'), q('/b', 'z', 35)];
    expect(findCannibalPairs(outside, DEFAULT_THRESHOLDS, new Set(['/a', '/b']))).toHaveLength(0);
  });
  it('builds a monotonic CTR curve', () => {
    const c = ctrCurve([], []);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThanOrEqual(c[i - 1]);
  });
});
