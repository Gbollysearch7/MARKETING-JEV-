import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { extractFromHtml, extractFromMarkdown, type PageDoc } from '../src/crawl/extract.js';
import { fetchPages, fetchSitemapUrls } from '../src/crawl/fetch.js';

export async function loadFromDir(dir: string): Promise<PageDoc[]> {
  const files = (await readdir(dir)).filter((f) => ['.html', '.htm', '.md', '.markdown'].includes(extname(f).toLowerCase())).sort();
  const docs: PageDoc[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), 'utf8');
    const url = `file://${join(dir, f)}`;
    docs.push(extname(f).toLowerCase().startsWith('.htm') ? extractFromHtml(url, raw) : extractFromMarkdown(url, raw));
  }
  return docs;
}

export async function loadPages(args: Record<string, string | boolean>, limit: number): Promise<PageDoc[]> {
  if (typeof args.dir === 'string') return (await loadFromDir(args.dir)).slice(0, limit);
  let urls: string[] = [];
  if (typeof args.sitemap === 'string') urls = await fetchSitemapUrls(args.sitemap);
  else if (typeof args.urls === 'string') urls = (await readFile(args.urls, 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean);
  else throw new Error('Provide --dir <folder>, --sitemap <url> or --urls <file>');
  if (typeof args.filter === 'string') urls = urls.filter((u) => u.includes(args.filter as string));
  return fetchPages(urls.slice(0, limit));
}
