import { findCol, parseTable } from '../../engine/ingest/csv';
import { pathKey, templateOf } from '../../engine/ingest/url';
import { stripHtml } from './text';
import type { GatePageInput } from './types';

export const MAX_BATCH_PAGES = 500;

const URL_ALIASES = ['url', 'page url', 'address', 'full url', 'slug', 'path', 'page path', 'permalink'];
const TITLE_ALIASES = ['title', 'page title', 'title 1', 'seo title', 'meta title'];
const H1_ALIASES = ['h1', 'h1 1', 'heading', 'h1 heading', 'headline'];
const META_ALIASES = ['meta description', 'meta description 1', 'description', 'meta'];
const BODY_ALIASES = ['body', 'body text', 'body html', 'content', 'html', 'text', 'page content', 'copy', 'main content'];
const QUERY_ALIASES = ['target query', 'query', 'target keyword', 'keyword', 'focus keyword', 'primary keyword'];
const TEMPLATE_ALIASES = ['template', 'template name', 'page template', 'pattern', 'page type'];

/** A slug, path or full URL to the gate's path key. Bare slugs ("walks/keswick" or "keswick") become paths. */
export function toPath(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const direct = pathKey(s);
  if (direct) return direct;
  if (/^[\p{L}\p{N}][\p{L}\p{N}/_.~-]*$/u.test(s)) return pathKey(`/${s}`);
  return null;
}

export interface RawPage { url?: unknown; slug?: unknown; path?: unknown; title?: unknown; h1?: unknown; meta_description?: unknown; meta?: unknown; description?: unknown; body?: unknown; html?: unknown; text?: unknown; content?: unknown; target_query?: unknown; query?: unknown; keyword?: unknown; template?: unknown }

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Normalise one page from any source (CSV row, API JSON, paste form). Returns an error string when unusable. */
export function normalisePage(r: RawPage, i: number): GatePageInput | string {
  const where = str(r.url) || str(r.slug) || str(r.path);
  const title = stripHtml(str(r.title));
  let path = toPath(where);
  if (!path && !where && title) path = `/${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || `page-${i + 1}`}`;
  if (!path) return `Row ${i + 1}: needs a URL, slug or title.`;
  const body = stripHtml(str(r.body) || str(r.html) || str(r.content) || str(r.text));
  const tpl = str(r.template).trim();
  return {
    path,
    url: /^https?:\/\//i.test(where) ? where.trim() : null,
    title,
    h1: stripHtml(str(r.h1)),
    meta: stripHtml(str(r.meta_description) || str(r.meta) || str(r.description)),
    body,
    query: str(r.target_query) || str(r.query) || str(r.keyword),
    template: tpl || templateOf(path),
  };
}

export interface ParsedBatch { pages: GatePageInput[]; notes: string[] }

/** Dedupe by path (first wins) and cap at MAX_BATCH_PAGES. */
export function finishBatch(pages: GatePageInput[], notes: string[] = []): ParsedBatch {
  const seen = new Set<string>();
  const out: GatePageInput[] = [];
  let dupes = 0;
  for (const p of pages) {
    if (seen.has(p.path)) { dupes++; continue; }
    seen.add(p.path);
    out.push(p);
  }
  if (dupes) notes.push(`${dupes} repeated ${dupes === 1 ? 'URL was' : 'URLs were'} skipped.`);
  if (out.length > MAX_BATCH_PAGES) {
    notes.push(`Only the first ${MAX_BATCH_PAGES} of ${out.length} pages were kept; split larger runs into batches.`);
    out.length = MAX_BATCH_PAGES;
  }
  return { pages: out, notes };
}

/** CSV of generated pages. Column names are matched loosely; body may be text or HTML. */
export function parseGateCsv(text: string): ParsedBatch {
  const { headers, rows } = parseTable(text, [...URL_ALIASES, ...TITLE_ALIASES, ...BODY_ALIASES]);
  const col = {
    url: findCol(headers, URL_ALIASES), title: findCol(headers, TITLE_ALIASES), h1: findCol(headers, H1_ALIASES),
    meta: findCol(headers, META_ALIASES), body: findCol(headers, BODY_ALIASES), query: findCol(headers, QUERY_ALIASES), template: findCol(headers, TEMPLATE_ALIASES),
  };
  // "meta description" also prefix-matches "description"-like body columns; make sure body is not the meta column.
  if (col.body && col.body === col.meta) col.body = undefined;
  if (!col.url && !col.title) throw new Error('The CSV needs a url (or slug) column or a title column.');
  if (!col.body) throw new Error('The CSV needs a body column (body text or HTML) to score the pages.');
  const notes: string[] = [];
  const pages: GatePageInput[] = [];
  const get = (r: Record<string, string>, c: string | undefined) => (c ? r[c] ?? '' : '');
  rows.forEach((r, i) => {
    const p = normalisePage({
      url: get(r, col.url), title: get(r, col.title), h1: get(r, col.h1), meta: get(r, col.meta), body: get(r, col.body), query: get(r, col.query), template: get(r, col.template),
    }, i);
    if (typeof p === 'string') notes.push(p);
    else pages.push(p);
  });
  if (!pages.length) throw new Error('No usable rows found in the CSV.');
  if (notes.length > 5) notes.splice(5, notes.length - 5, `…and ${notes.length - 5} more rows skipped.`);
  return finishBatch(pages, notes);
}

/** A list of URLs, one per line (or comma separated). Returns absolute http(s) URLs only. */
export function parseUrlList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\/[^\s]+$/i.test(s)))];
}
