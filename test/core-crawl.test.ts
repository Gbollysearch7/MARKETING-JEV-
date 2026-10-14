import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crawlSitemap, parseRobots, readSitemap } from '../src/engine/ingest/sitemap-crawl';
import { decodeText } from '../src/engine/ingest/csv';
import { importGsc } from '../src/engine/ingest/gsc';

describe('robots.txt', () => {
  it('uses the * group, longest match wins, Allow wins ties, wildcards and $ work', () => {
    const r = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\nCrawl-delay: 2\n');
    expect(r.allows('https://x.test/')).toBe(true);
    expect(r.allows('https://x.test/private/secret')).toBe(false);
    expect(r.allows('https://x.test/private/ok/page')).toBe(true);
    expect(r.allows('https://x.test/file.pdf')).toBe(false);
    expect(r.allows('https://x.test/file.pdf?x=1')).toBe(true);
    expect(r.crawlDelay).toBe(2);
  });
  it('prefers a group naming our bot and treats an empty Disallow as allow all', () => {
    expect(parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: RankcallBot\nDisallow:\n').allows('https://x.test/a')).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow:\n').allows('https://x.test/a')).toBe(true);
  });
});

describe('decoding exports', () => {
  it('reads UTF-16 with and without a BOM, and UTF-8 with a BOM', () => {
    const csv = 'Page,Clicks,Impressions\nhttps://a.test/x,5,50\n';
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, 'utf16le')]);
    expect(importGsc('p.csv', new Uint8Array(le)).pages[0].clicks).toBe(5);
    expect(importGsc('p.csv', new Uint8Array(Buffer.from(csv, 'utf16le'))).pages[0].clicks).toBe(5);
    expect(decodeText(new Uint8Array(Buffer.from('﻿Page', 'utf8')))).toBe('Page');
  });
  it('rejects images and spreadsheets with a clear message', () => {
    expect(() => decodeText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toThrow(/not a CSV/);
  });
  it('only warns about the 1,000 row limit at exactly 1,000 rows', () => {
    const rows = (n: number) => 'Top pages,Clicks,Impressions\n' + Array.from({ length: n }, (_, i) => `https://a.test/p${i},1,10`).join('\n');
    expect(importGsc('p.csv', new TextEncoder().encode(rows(1000))).notes.join(' ')).toMatch(/1,000 rows/);
    expect(importGsc('p.csv', new TextEncoder().encode(rows(1500))).notes.join(' ')).not.toMatch(/1,000 rows/);
  });
});

describe('sitemap crawl against a real HTTP server', () => {
  let server: Server;
  let base = '';
  const html = (body: string, head = '') => `<!doctype html><html><head><title>T</title>${head}</head><body><main>${body}</main></body></html>`;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const u = req.url ?? '/';
      const send = (status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': type, ...extra }); res.end(body); };
      if (u === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nDisallow: /private\n');
      if (u === '/sitemap_index.xml') return send(200, 'application/xml', `<sitemapindex><sitemap><loc>${base}/a.xml.gz</loc></sitemap><sitemap><loc>${base}/missing.xml</loc></sitemap></sitemapindex>`);
      if (u === '/a.xml.gz') return send(200, 'application/x-gzip', gzipSync(`<urlset>${['/', '/about/', '/about', '/old', '/doc.pdf', '/private/x', '/canon', '/list?page=2', '/slow'].map((p) => `<url><loc>${base}${p}</loc><lastmod>2026-01-02</lastmod></url>`).join('')}</urlset>`));
      if (u === '/') return send(200, 'text/html', html('<a href="/about">About</a> <a href="/canon">C</a> hello world'));
      if (u === '/about/') return send(200, 'text/html; charset=utf-8', html('About us <a href="/">home</a>'));
      if (u === '/old') return send(301, 'text/html', '', { location: '/about/' });
      if (u === '/doc.pdf') return send(200, 'application/pdf', '%PDF-1.4');
      if (u === '/canon') return send(200, 'text/html', html('dup', `<link rel="canonical" href="${base}/about/">`));
      if (u.startsWith('/list')) return send(200, 'text/html', html('list'));
      if (u === '/page.html') return send(200, 'text/html', html('x'));
      return send(404, 'text/html', 'nope');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => { server.close(); });

  it('follows a sitemap index, reads gzip, de-duplicates paths and skips a broken child', async () => {
    const entries = await readSitemap(`${base}/sitemap_index.xml`, 100);
    const paths = entries.map((e) => new URL(e.url).pathname);
    expect(paths).toContain('/about/');
    expect(paths.filter((p) => p.startsWith('/about'))).toHaveLength(1);
  });

  it('respects robots.txt, records redirects, skips non-HTML and marks canonicalised pages', async () => {
    const { pages, notes } = await crawlSitemap(`${base}/sitemap_index.xml`, { limit: 100 });
    const by = new Map(pages.map((p) => [p.path, p]));
    expect(by.has('/private/x')).toBe(false);
    expect(by.has('/doc.pdf')).toBe(false);
    expect(by.get('/old')?.status).toBe(301);
    expect(by.get('/old')?.indexable).toBe(false);
    expect(by.get('/old')?.canonicalPath).toBe('/about');
    expect(by.get('/canon')?.indexable).toBe(false);
    expect(by.get('/about')?.indexable).toBe(true);
    expect(by.get('/about')?.inlinks).toBe(1);
    expect(by.get('/about')?.lastModified).toBe('2026-01-02');
    expect(notes.join(' ')).toMatch(/robots\.txt/);
    expect(notes.join(' ')).toMatch(/non-HTML/);
    expect(notes.join(' ')).toMatch(/redirect/);
  });

  it('explains a missing sitemap and a web page given as a sitemap', async () => {
    await expect(readSitemap(`${base}/nope.xml`, 10)).rejects.toThrow(/404/);
    await expect(readSitemap(`${base}/page.html`, 10)).rejects.toThrow(/web page, not an XML sitemap/);
    await expect(readSitemap('http://127.0.0.1:1/sitemap.xml', 10)).rejects.toThrow(/Could not reach/);
  });
});
