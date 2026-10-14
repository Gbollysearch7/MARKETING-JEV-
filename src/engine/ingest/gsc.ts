import { unzipSync } from 'fflate';
import { decodeText, findCol, num, numOr0, parseTable, type Row } from './csv';
import { pathKey } from './url';

export interface GscPage {
  path: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
  prevClicks: number | null;
  prevImpressions: number | null;
  prevPosition: number | null;
}

export interface GscPageQuery {
  path: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface Period { start: string; end: string } // ISO dates

export interface GscImport {
  period: Period | null;
  hasPrevious: boolean;
  pages: GscPage[];
  pageQueries: GscPageQuery[];
  notes: string[];
}

const PAGE_ALIASES = ['top pages', 'page', 'pages', 'url', 'landing page', 'address'];
const QUERY_ALIASES = ['top queries', 'query', 'queries', 'search query', 'keyword'];

/** Accepts the Search Console Performance export (zip), its Pages.csv, or a page and query CSV. */
export function importGsc(fileName: string, bytes: Uint8Array): GscImport {
  if (fileName.toLowerCase().endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return importGscZip(bytes);
  }
  return importGscCsv(decodeText(bytes));
}

function importGscZip(bytes: Uint8Array): GscImport {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error('This zip file could not be opened. Download the export again and upload it without changing it.'); }
  const byName = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) {
    const base = name.split('/').pop()!.toLowerCase();
    if (base.endsWith('.csv')) byName.set(base, decodeText(data));
    else if (base === '[content_types].xml') byName.set(base, '');
  }
  if (byName.has('[content_types].xml')) throw new Error('This is an Excel file. In Search Console choose Export > Download CSV, or save the sheet as CSV first.');
  const pagesCsv = byName.get('pages.csv');
  if (!pagesCsv) {
    throw new Error('This zip has no Pages.csv. Export from Search Console > Performance > Export > Download CSV.');
  }
  const result = importGscCsv(pagesCsv);
  const datesCsv = byName.get('dates.csv');
  if (datesCsv) result.period = periodFromDates(datesCsv) ?? result.period;
  result.notes.push('Search Console website exports stop at 1,000 pages and do not link queries to pages. Upload a page and query CSV as well to detect cannibalisation.');
  return result;
}

export function importGscCsv(text: string): GscImport {
  const { headers, rows } = parseTable(text, [...PAGE_ALIASES, ...QUERY_ALIASES]);
  const pageCol = findCol(headers, PAGE_ALIASES);
  const queryCol = findCol(headers, QUERY_ALIASES);
  if (!pageCol) {
    if (queryCol) throw new Error('This file has queries but no page column. Upload Pages.csv or the whole zip, or a CSV with both page and query columns.');
    throw new Error('Could not find a page or URL column.');
  }
  return queryCol ? importPageQuery(headers, rows, pageCol, queryCol) : importPages(headers, rows, pageCol);
}

/** Columns for one metric, split into current and previous period when the export used Compare. */
function metricCols(headers: string[], metric: string): { cur?: string; prev?: string } {
  const matches = headers.filter((h) => h.toLowerCase().replace(/\s+/g, ' ').trim().endsWith(metric));
  if (matches.length === 0) return {};
  if (matches.length === 1) return { cur: matches[0] };
  const prev = matches.find((h) => /previous|prev\b|before/i.test(h));
  const cur = matches.find((h) => h !== prev);
  if (prev) return { cur, prev };
  // Custom date compare: "1/9/26 - 30/9/26 Clicks" vs "1/8/26 - 31/8/26 Clicks". The first is the current period.
  return { cur: matches[0], prev: matches[1] };
}

function ctrValue(v: string | undefined): number {
  const n = num(v);
  if (!Number.isFinite(n)) return 0;
  return v?.includes('%') || n > 1 ? n / 100 : n;
}

function importPages(headers: string[], rows: Row[], pageCol: string): GscImport {
  const c = metricCols(headers, 'clicks');
  const i = metricCols(headers, 'impressions');
  const p = metricCols(headers, 'position');
  const t = metricCols(headers, 'ctr');
  if (!c.cur || !i.cur) throw new Error('Could not find Clicks and Impressions columns.');
  const hasPrevious = Boolean(c.prev && i.prev);
  const merged = new Map<string, GscPage>();
  for (const r of rows) {
    const path = pathKey(r[pageCol]);
    if (!path) continue;
    const page: GscPage = {
      path,
      clicks: numOr0(r[c.cur]),
      impressions: numOr0(r[i.cur]),
      ctr: t.cur ? ctrValue(r[t.cur]) : 0,
      position: p.cur ? numOr0(r[p.cur]) : 0,
      prevClicks: hasPrevious ? numOr0(r[c.prev!]) : null,
      prevImpressions: hasPrevious ? numOr0(r[i.prev!]) : null,
      prevPosition: hasPrevious && p.prev ? num(r[p.prev]) || null : null,
    };
    const existing = merged.get(path);
    merged.set(path, existing ? mergePages(existing, page) : page);
  }
  const pages = [...merged.values()];
  for (const pg of pages) if (!pg.ctr && pg.impressions) pg.ctr = pg.clicks / pg.impressions;
  const notes: string[] = [];
  if (!hasPrevious) notes.push('No previous period found. Export with Compare turned on to detect decaying pages.');
  if (rows.length === 1000) notes.push('This export has 1,000 rows, the Search Console website limit. Pages beyond that are missing.');
  return { period: null, hasPrevious, pages, pageQueries: [], notes };
}

/** Two URLs can collapse to one path (http/https, trailing slash). Sum them; weight position by impressions. */
function mergePages(a: GscPage, b: GscPage): GscPage {
  const imp = a.impressions + b.impressions;
  const pos = imp ? (a.position * a.impressions + b.position * b.impressions) / imp : a.position;
  return {
    path: a.path,
    clicks: a.clicks + b.clicks,
    impressions: imp,
    ctr: imp ? (a.clicks + b.clicks) / imp : 0,
    position: pos,
    prevClicks: a.prevClicks == null ? b.prevClicks : a.prevClicks + (b.prevClicks ?? 0),
    prevImpressions: a.prevImpressions == null ? b.prevImpressions : a.prevImpressions + (b.prevImpressions ?? 0),
    prevPosition: a.prevPosition ?? b.prevPosition,
  };
}

function importPageQuery(headers: string[], rows: Row[], pageCol: string, queryCol: string): GscImport {
  const clicksCol = findCol(headers, ['clicks', 'url clicks']);
  const impCol = findCol(headers, ['impressions']);
  const posCol = findCol(headers, ['position', 'avg position', 'average position', 'sum top position']);
  const dateCol = findCol(headers, ['date', 'data date']);
  if (!clicksCol || !impCol) throw new Error('Could not find Clicks and Impressions columns.');

  const agg = new Map<string, { path: string; query: string; clicks: number; impressions: number; posImp: number }>();
  let minDate = '';
  let maxDate = '';
  for (const r of rows) {
    const path = pathKey(r[pageCol]);
    const query = (r[queryCol] ?? '').trim().toLowerCase();
    if (!path || !query) continue;
    if (dateCol) {
      const d = isoDate(r[dateCol]);
      if (d) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }
    const key = `${path}\u0000${query}`;
    const cur = agg.get(key) ?? { path, query, clicks: 0, impressions: 0, posImp: 0 };
    const imp = numOr0(r[impCol]);
    cur.clicks += numOr0(r[clicksCol]);
    cur.impressions += imp;
    cur.posImp += (posCol ? numOr0(r[posCol]) : 0) * imp;
    agg.set(key, cur);
  }
  const pageQueries: GscPageQuery[] = [...agg.values()].map((a) => ({
    path: a.path,
    query: a.query,
    clicks: a.clicks,
    impressions: a.impressions,
    position: a.impressions ? a.posImp / a.impressions : 0,
  }));

  // Page totals derived from the query rows. Anonymised queries are missing, so these undercount slightly.
  const pages = new Map<string, GscPage>();
  for (const q of pageQueries) {
    const p = pages.get(q.path) ?? { path: q.path, clicks: 0, impressions: 0, ctr: 0, position: 0, prevClicks: null, prevImpressions: null, prevPosition: null };
    p.position = (p.position * p.impressions + q.position * q.impressions) / Math.max(1, p.impressions + q.impressions);
    p.clicks += q.clicks;
    p.impressions += q.impressions;
    pages.set(q.path, p);
  }
  for (const p of pages.values()) p.ctr = p.impressions ? p.clicks / p.impressions : 0;

  return {
    period: minDate && maxDate ? { start: minDate, end: maxDate } : null,
    hasPrevious: false,
    pages: [...pages.values()],
    pageQueries,
    notes: ['Page and query data loaded. Cannibalisation detection is available.'],
  };
}

function periodFromDates(text: string): Period | null {
  try {
    const { headers, rows } = parseTable(text, ['date']);
    const col = findCol(headers, ['date']);
    if (!col) return null;
    const dates = rows.map((r) => isoDate(r[col])).filter((d): d is string => Boolean(d)).sort();
    return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
  } catch {
    return null;
  }
}

/** Accepts 2026-10-01, 20261001 (BigQuery), 10/1/26 and 1 Oct 2026. Returns YYYY-MM-DD or null. */
export function isoDate(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
