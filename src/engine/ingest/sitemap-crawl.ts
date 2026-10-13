import * as cheerio from 'cheerio';
import type { CrawlPage } from './crawl-csv';
import { isoDate } from './gsc';
import { pathKey } from './url';

const UA = 'SEODecisionBot/0.1 (+site owner requested crawl)';

async function get(url: string, timeoutMs = 20_000): Promise<Response> {
  return fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
}

export interface SitemapEntry { url: string; lastmod: string | null }

/** Reads a sitemap or sitemap index, following child sitemaps, up to `limit` URLs. */
export async function readSitemap(sitemapUrl: string, limit: number): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = [];
  const queue = [sitemapUrl];
  const seen = new Set<string>();
  while (queue.length && out.length < limit) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const res = await get(next);
    if (!res.ok) throw new Error(`Sitemap ${next} returned ${res.status}.`);
    const $ = cheerio.load(await res.text(), { xml: true });
    $('sitemap > loc').each((_i, el) => { queue.push($(el).text().trim()); });
    $('url').each((_i, el) => {
      if (out.length >= limit) return;
      const loc = $(el).find('loc').first().text().trim();
      if (loc) out.push({ url: loc, lastmod: isoDate($(el).find('lastmod').first().text().trim()) });
    });
  }
  return out;
}

interface Fetched extends CrawlPage { outlinks: string[] }

export function extractPage(url: string, status: number, html: string): Fetched {
  const $ = cheerio.load(html);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const robots = ($('meta[name="robots"]').attr('content') ?? '').toLowerCase();
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  let canonicalPath: string | null = null;
  if (canonicalHref) {
    try { canonicalPath = pathKey(new URL(canonicalHref, url).toString()); } catch { /* ignore */ }
  }
  const outlinks: string[] = [];
  $('a[href]').each((_i, a) => {
    try {
      const u = new URL($(a).attr('href')!, url);
      if (u.hostname.replace(/^www\./, '') === host) {
        const p = pathKey(u.toString());
        if (p) outlinks.push(p);
      }
    } catch { /* ignore bad hrefs */ }
  });
  $('script, style, noscript, nav, header, footer, aside, form').remove();
  const main = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  const text = main.text().replace(/\s+/g, ' ').trim();
  const headings = main.find('h2, h3').map((_i, h) => $(h).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 20);
  return {
    path: pathKey(url) ?? '/',
    url,
    status,
    indexable: status === 200 && !robots.includes('noindex'),
    title: $('title').first().text().trim(),
    h1: $('h1').first().text().replace(/\s+/g, ' ').trim(),
    metaDescription: ($('meta[name="description"]').attr('content') ?? '').trim(),
    wordCount: text ? text.split(' ').length : 0,
    canonicalPath,
    inlinks: null,
    lastModified: null,
    headings,
    excerpt: text.slice(0, 1200),
    outlinks,
  };
}

/** Crawl the URLs in a sitemap with bounded concurrency. Inlinks are counted from the crawled set. */
export async function crawlSitemap(
  sitemapUrl: string,
  opts: { limit: number; concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ pages: CrawlPage[]; notes: string[] }> {
  const entries = await readSitemap(sitemapUrl, opts.limit);
  if (!entries.length) throw new Error('The sitemap has no URLs.');
  const results: Fetched[] = [];
  let failed = 0;
  let done = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < entries.length) {
      const e = entries[idx++];
      try {
        const res = await get(e.url);
        const type = res.headers.get('content-type') ?? '';
        const html = type.includes('html') ? await res.text() : '';
        const page = extractPage(res.url || e.url, res.status, html);
        page.path = pathKey(e.url) ?? page.path; // key by the sitemap URL, not the redirect target
        page.lastModified = e.lastmod;
        results.push(page);
      } catch {
        failed++;
      }
      done++;
      opts.onProgress?.(done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));

  const inlinks = new Map<string, number>();
  for (const r of results) for (const p of new Set(r.outlinks)) if (p !== r.path) inlinks.set(p, (inlinks.get(p) ?? 0) + 1);
  const pages: CrawlPage[] = results.map((r) => {
    const { outlinks, ...p } = r;
    void outlinks;
    return { ...p, inlinks: inlinks.get(p.path) ?? 0 };
  });
  const notes = [`Crawled ${pages.length} of ${entries.length} sitemap URLs.`];
  if (failed) notes.push(`${failed} URLs could not be fetched.`);
  return { pages, notes };
}
