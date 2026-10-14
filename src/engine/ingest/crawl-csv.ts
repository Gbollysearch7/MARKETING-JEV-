import { decodeText, findCol, num, parseTable } from './csv';
import { isoDate } from './gsc';
import { pathKey } from './url';

export interface CrawlPage {
  path: string;
  url: string;
  status: number;
  indexable: boolean;
  title: string;
  h1: string;
  metaDescription: string;
  wordCount: number | null;
  canonicalPath: string | null;
  inlinks: number | null;
  lastModified: string | null;
  headings: string[];
  excerpt: string;
}

export interface CrawlImport { pages: CrawlPage[]; notes: string[] }

const URL_ALIASES = ['address', 'url', 'page url', 'full url'];

/** Screaming Frog "Internal: HTML" export or a Sitebulb URL export. */
export function importCrawlCsv(bytes: Uint8Array): CrawlImport {
  const { headers, rows } = parseTable(decodeText(bytes), URL_ALIASES);
  const urlCol = findCol(headers, URL_ALIASES)!;
  const statusCol = findCol(headers, ['status code', 'http status code', 'http status']);
  const indexCol = findCol(headers, ['indexability', 'indexable']);
  const titleCol = findCol(headers, ['title 1', 'title', 'page title']);
  const h1Col = findCol(headers, ['h1 1', 'h1', 'first h1']);
  const metaCol = findCol(headers, ['meta description 1', 'meta description']);
  const wcCol = findCol(headers, ['word count', 'words', 'no words']);
  const canonCol = findCol(headers, ['canonical link element 1', 'canonical url', 'canonical']);
  const inlinksCol = findCol(headers, ['unique inlinks', 'inlinks', 'no unique internal links in', 'internal links in']);
  const lastModCol = findCol(headers, ['last modified', 'lastmod', 'date modified']);
  const contentTypeCol = findCol(headers, ['content type']);

  const pages: CrawlPage[] = [];
  for (const r of rows) {
    if (contentTypeCol && r[contentTypeCol] && !/html/i.test(r[contentTypeCol])) continue;
    const path = pathKey(r[urlCol]);
    if (!path) continue;
    const status = statusCol ? num(r[statusCol]) : 200;
    const idx = indexCol ? r[indexCol] : '';
    const canonical = canonCol && r[canonCol] ? pathKey(r[canonCol]) : null;
    pages.push({
      path,
      url: r[urlCol],
      status: Number.isFinite(status) ? status : 200,
      indexable: idx ? !/non|false|no\b/i.test(idx) : true,
      title: titleCol ? r[titleCol] : '',
      h1: h1Col ? r[h1Col] : '',
      metaDescription: metaCol ? r[metaCol] : '',
      wordCount: wcCol && Number.isFinite(num(r[wcCol])) ? num(r[wcCol]) : null,
      canonicalPath: canonical,
      inlinks: inlinksCol && Number.isFinite(num(r[inlinksCol])) ? num(r[inlinksCol]) : null,
      lastModified: lastModCol ? isoDate(r[lastModCol]) : null,
      headings: [],
      excerpt: '',
    });
  }
  const notes: string[] = [];
  if (!wcCol) notes.push('No word count column. Depth signals will be weaker.');
  if (!lastModCol) notes.push('No last-modified column. Content age is unknown, so the 30-day protection relies on other data.');
  return { pages, notes };
}
