import * as cheerio from 'cheerio';
import { gunzipSync } from 'fflate';
import type { CrawlPage } from './crawl-csv';
import { isoDate } from './gsc';
import { pathKey } from './url';

const UA = 'RankcallBot/1.0 (+site owner requested crawl)';
const UA_TOKEN = 'rankcallbot';
const MAX_SITEMAPS = 200;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

async function get(url: string, timeoutMs = 20_000, redirect: RequestRedirect = 'follow'): Promise<Response> {
  return fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' }, redirect, signal: AbortSignal.timeout(timeoutMs) });
}

/** "fetch failed" says nothing; name the host and the underlying reason instead. */
function reachError(url: string, err: unknown): Error {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  const why = (err as Error)?.name === 'TimeoutError' ? 'it did not respond within 20 seconds'
    : cause?.code === 'ENOTFOUND' ? 'the domain does not exist'
    : cause?.code === 'ECONNREFUSED' ? 'the connection was refused'
    : cause?.code?.startsWith('CERT') || /certificate/i.test(cause?.message ?? '') ? 'its HTTPS certificate is not valid'
    : cause?.message ?? (err as Error)?.message ?? 'unknown error';
  return new Error(`Could not reach ${url}: ${why}.`);
}

// ---------- robots.txt ----------

export interface Robots { allows: (url: string) => boolean; crawlDelay: number | null }

const ALLOW_ALL: Robots = { allows: () => true, crawlDelay: null };

/** Parse robots.txt for our user agent (falling back to *). Longest matching rule wins; Allow wins a tie. */
export function parseRobots(text: string): Robots {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number | null };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'disallow' && val) cur.rules.push({ allow: false, path: val });
    else if (key === 'allow' && val) cur.rules.push({ allow: true, path: val });
    else if (key === 'crawl-delay' && Number.isFinite(Number(val))) cur.delay = Number(val);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && UA_TOKEN.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  if (!chosen.length) return ALLOW_ALL;
  const rules = chosen.flatMap((g) => g.rules).map((r) => {
    const anchored = r.path.endsWith('$');
    const body = (anchored ? r.path.slice(0, -1) : r.path).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return { allow: r.allow, len: r.path.length, re: new RegExp(`^${body}${anchored ? '$' : ''}`) };
  });
  const delay = chosen.map((g) => g.delay).find((d) => d != null) ?? null;
  return {
    crawlDelay: delay,
    allows(url: string) {
      let target: string;
      try { const u = new URL(url); target = u.pathname + u.search; } catch { return true; }
      let best: { allow: boolean; len: number } | null = null;
      for (const r of rules) if (r.re.test(target) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r;
      return best ? best.allow : true;
    },
  };
}

async function loadRobots(origin: string): Promise<Robots> {
  try {
    const res = await get(`${origin}/robots.txt`, 10_000);
    if (res.status >= 400 && res.status < 500) return ALLOW_ALL; // no robots.txt: everything allowed
    if (!res.ok) return ALLOW_ALL;
    return parseRobots(await res.text());
  } catch {
    return ALLOW_ALL;
  }
}

// ---------- sitemaps ----------

export interface SitemapEntry { url: string; lastmod: string | null }

/** Sitemap bytes to XML text: plain, or gzip (.xml.gz files served without Content-Encoding). */
async function sitemapText(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return new TextDecoder().decode(gunzipSync(bytes));
  return new TextDecoder().decode(bytes);
}

/** Reads a sitemap or sitemap index, following child sitemaps, up to `limit` URLs. Duplicate paths are kept once. */
export async function readSitemap(sitemapUrl: string, limit: number): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = [];
  const paths = new Set<string>();
  const queue = [sitemapUrl];
  const seen = new Set<string>();
  while (queue.length && out.length < limit && seen.size < MAX_SITEMAPS) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    let res: Response;
    try { res = await get(next); } catch (err) { if (next === sitemapUrl) throw reachError(next, err); continue; }
    if (!res.ok) {
      if (next === sitemapUrl) throw new Error(`The sitemap at ${next} returned ${res.status}${res.status === 404 ? ' (not found). Check the address, or look for it in robots.txt' : ''}.`);
      continue; // a broken child sitemap should not stop the rest
    }
    const text = await sitemapText(res);
    if (next === sitemapUrl && /^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error(`${next} is a web page, not an XML sitemap. Sitemaps are usually at /sitemap.xml or /sitemap_index.xml.`);
    const $ = cheerio.load(text, { xml: true });
    $('sitemap > loc').each((_i, el) => { queue.push($(el).text().trim()); });
    $('url').each((_i, el) => {
      if (out.length >= limit) return;
      const loc = $(el).find('loc').first().text().trim();
      const key = loc ? pathKey(loc) : null;
      if (!loc || !key || paths.has(key)) return;
      paths.add(key);
      out.push({ url: loc, lastmod: isoDate($(el).find('lastmod').first().text().trim()) });
    });
  }
  return out;
}

// ---------- pages ----------

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
  const path = pathKey(url) ?? '/';
  return {
    path,
    url,
    status,
    // A page that names another URL as canonical is not the indexable version (Screaming Frog calls it canonicalised).
    indexable: status === 200 && !robots.includes('noindex') && (!canonicalPath || canonicalPath === path),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crawl the URLs in a sitemap politely: robots.txt is respected (including Crawl-delay, capped at 5 seconds),
 * at most a few requests at once, redirects recorded as redirects, and non-HTML files skipped.
 * Inlinks are counted from the crawled set.
 */
export async function crawlSitemap(
  sitemapUrl: string,
  opts: { limit: number; concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ pages: CrawlPage[]; notes: string[] }> {
  let origin: string;
  try { origin = new URL(sitemapUrl).origin; } catch { throw new Error('Enter a valid sitemap URL.'); }
  const robots = await loadRobots(origin);
  const listed = await readSitemap(sitemapUrl, opts.limit);
  if (!listed.length) throw new Error('The sitemap has no URLs. Check it opens in a browser and lists <url> entries.');
  const entries = listed.filter((e) => robots.allows(e.url));
  const blocked = listed.length - entries.length;
  if (!entries.length) throw new Error('robots.txt blocks every URL in this sitemap for crawlers. Upload a Screaming Frog export instead.');
  const delayMs = Math.min(5, robots.crawlDelay ?? 0) * 1000;
  const concurrency = delayMs ? 1 : Math.min(opts.concurrency ?? 4, 4);

  const results: Fetched[] = [];
  let failed = 0;
  let nonHtml = 0;
  let redirects = 0;
  let done = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < entries.length) {
      const e = entries[idx++];
      try {
        // Do not follow redirects: a redirecting sitemap URL is itself a finding.
        const res = await get(e.url, 20_000, 'manual');
        if (res.status >= 300 && res.status < 400) {
          redirects++;
          const loc = res.headers.get('location');
          let target: string | null = null;
          try { target = loc ? pathKey(new URL(loc, e.url).toString()) : null; } catch { /* ignore */ }
          const page = extractPage(e.url, res.status, '');
          page.canonicalPath = target;
          page.lastModified = e.lastmod;
          results.push(page);
          await res.body?.cancel();
        } else {
          const type = (res.headers.get('content-type') ?? '').toLowerCase();
          if (res.ok && type && !type.includes('html')) {
            nonHtml++;
            await res.body?.cancel();
          } else {
            const len = Number(res.headers.get('content-length') ?? 0);
            const html = len > MAX_HTML_BYTES ? '' : await res.text();
            const page = extractPage(e.url, res.status, html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html);
            page.path = pathKey(e.url) ?? page.path;
            page.lastModified = e.lastmod;
            results.push(page);
          }
        }
      } catch {
        failed++;
      }
      done++;
      opts.onProgress?.(done, entries.length);
      if (delayMs) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (!results.length) throw new Error(`None of the ${entries.length} sitemap URLs could be fetched. The site may be blocking crawlers; upload a Screaming Frog export instead.`);

  const inlinks = new Map<string, number>();
  for (const r of results) for (const p of new Set(r.outlinks)) if (p !== r.path) inlinks.set(p, (inlinks.get(p) ?? 0) + 1);
  const pages: CrawlPage[] = results.map((r) => {
    const { outlinks, ...p } = r;
    void outlinks;
    return { ...p, inlinks: inlinks.get(p.path) ?? 0 };
  });
  const notes = [`Crawled ${pages.length} of ${listed.length} sitemap URLs.`];
  if (redirects) notes.push(`${redirects} sitemap ${redirects === 1 ? 'URL redirects' : 'URLs redirect'} elsewhere; sitemaps should list final URLs only.`);
  if (blocked) notes.push(`${blocked} URLs skipped because robots.txt disallows them.`);
  if (nonHtml) notes.push(`${nonHtml} non-HTML files (PDFs, images) skipped.`);
  if (failed) notes.push(`${failed} URLs could not be fetched (timeouts or connection errors).`);
  if (listed.length >= opts.limit) notes.push(`Stopped at the page limit of ${opts.limit.toLocaleString('en-GB')}; the sitemap may list more.`);
  return { pages, notes };
}
