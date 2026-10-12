import { mapPool } from '../util/pool.js';
import { extractFromHtml, type PageDoc } from './extract.js';

const UA = 'jev-marketing-engine/0.1 (+https://github.com/Gbollysearch7/MARKETING-JEV-)';

export async function fetchText(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Promise<string> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,text/xml,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/** Reads a sitemap or a sitemap index (one level deep). */
export async function fetchSitemapUrls(sitemapUrl: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const xml = await fetchText(sitemapUrl, fetchImpl);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (/<sitemapindex/i.test(xml)) {
    const nested = await mapPool(locs, 4, async (u) => {
      try {
        const x = await fetchText(u, fetchImpl);
        return [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
      } catch {
        return [];
      }
    });
    return [...new Set(nested.flat())];
  }
  return [...new Set(locs)];
}

export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch): Promise<PageDoc | null> {
  try {
    const html = await fetchText(url, fetchImpl);
    return extractFromHtml(url, html);
  } catch {
    return null;
  }
}

export async function fetchPages(urls: string[], concurrency = 6, fetchImpl: typeof fetch = fetch): Promise<PageDoc[]> {
  const docs = await mapPool(urls, concurrency, (u) => fetchPage(u, fetchImpl));
  return docs.filter((d): d is PageDoc => !!d && d.wordCount > 50);
}
