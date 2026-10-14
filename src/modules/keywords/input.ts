import { findCol, num, parseTable } from '../../engine/ingest/csv';
import { pathKey } from '../../engine/ingest/url';
import type { GscPageQuery } from '../../engine/ingest/gsc';

/** Keywords per run this round. The PRD target is 50,000; runs above this cap are out of scope for now. */
export const MAX_KEYWORDS = 5000;

export interface KeywordRow {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  currentPath: string | null;
  position: number | null;
}

export interface KeywordInput {
  rows: KeywordRow[];
  notes: string[];
  /** What the volume column means: searches a month, or Search Console impressions as a proxy. */
  volumeSource: 'searches' | 'impressions';
}

const KEYWORD_ALIASES = ['keyword', 'keywords', 'query', 'search query', 'search term', 'top queries', 'term', 'keyword text', 'keyphrase'];
const VOLUME_ALIASES = ['volume', 'search volume', 'avg monthly searches', 'avg. monthly searches', 'monthly searches', 'monthly volume', 'global volume', 'sv', 'searches', 'impressions'];
const CPC_ALIASES = ['cpc', 'cost per click', 'avg cpc', 'top of page bid high range'];
const URL_ALIASES = ['current url', 'url', 'ranking url', 'current page', 'page', 'landing page', 'address', 'top pages'];
const POSITION_ALIASES = ['position', 'current position', 'rank', 'ranking', 'pos', 'average position', 'avg position'];

/** Lowercase, trim, strip wrapping quotes and collapse inner whitespace. */
export function normaliseKeyword(raw: string): string {
  return raw.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Decode an uploaded file. Keyword Planner exports UTF-16 TSV; everything else is UTF-8. */
export function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

const finite = (n: number) => (Number.isFinite(n) ? n : null);

/** Merge duplicate keywords (keep the highest volume, the best position and its page), drop blanks, cap the run. */
export function finalise(rows: KeywordRow[], notes: string[], volumeSource: KeywordInput['volumeSource'] = 'searches'): KeywordInput {
  const by = new Map<string, KeywordRow>();
  let dupes = 0;
  let blanks = 0;
  for (const r of rows) {
    const k = normaliseKeyword(r.keyword);
    if (!k || k.length > 200) { blanks++; continue; }
    const prev = by.get(k);
    if (!prev) { by.set(k, { ...r, keyword: k }); continue; }
    dupes++;
    if ((r.volume ?? -1) > (prev.volume ?? -1)) prev.volume = r.volume;
    if (prev.cpc == null) prev.cpc = r.cpc;
    if (r.position != null && (prev.position == null || r.position < prev.position)) { prev.position = r.position; prev.currentPath = r.currentPath ?? prev.currentPath; }
    if (!prev.currentPath) prev.currentPath = r.currentPath;
  }
  let out = [...by.values()];
  if (dupes) notes.push(`${dupes.toLocaleString('en-GB')} duplicate keyword${dupes === 1 ? '' : 's'} merged.`);
  if (blanks) notes.push(`${blanks.toLocaleString('en-GB')} blank or over-long row${blanks === 1 ? '' : 's'} skipped.`);
  if (out.length > MAX_KEYWORDS) {
    out = out.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, MAX_KEYWORDS);
    notes.push(`${(by.size - MAX_KEYWORDS).toLocaleString('en-GB')} lowest-volume keywords dropped: runs are capped at ${MAX_KEYWORDS.toLocaleString('en-GB')} keywords for now.`);
  }
  return { rows: out, notes, volumeSource };
}

/** A keyword CSV or TSV export (own list, Ahrefs, Semrush or Keyword Planner). Only the keyword column is required. */
export function parseKeywordCsv(text: string): KeywordInput {
  const { headers, rows } = parseTable(text, KEYWORD_ALIASES);
  const kCol = findCol(headers, KEYWORD_ALIASES)!;
  const vCol = findCol(headers, VOLUME_ALIASES);
  const cCol = findCol(headers, CPC_ALIASES);
  const uCol = findCol(headers, URL_ALIASES);
  const pCol = findCol(headers, POSITION_ALIASES);
  const notes: string[] = [];
  const missing = [!vCol && 'volume', !uCol && 'current URL', !pCol && 'position'].filter(Boolean);
  if (missing.length) notes.push(`No ${missing.join(', ')} column found; those fields are left blank.`);
  const volumeSource = vCol && /impression/i.test(vCol) ? 'impressions' : 'searches';
  const out: KeywordRow[] = rows.map((r) => {
    const pos = pCol ? finite(num(r[pCol])) : null;
    return {
      keyword: r[kCol] ?? '',
      volume: vCol ? finite(num(r[vCol])) : null,
      cpc: cCol ? finite(num(r[cCol])) : null,
      currentPath: uCol && r[uCol] ? pathKey(r[uCol]) : null,
      position: pos != null && pos > 0 ? pos : null,
    };
  });
  return finalise(out, notes, volumeSource);
}

/**
 * Pasted text: a CSV with a keyword header, or one keyword per line. A line may carry a volume after a
 * tab or comma ("hiking boots, 1200").
 */
export function parsePasted(text: string): KeywordInput {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], notes: [], volumeSource: 'searches' };
  const head = lines[0].split(/[\t,;]/).map((c) => c.trim());
  if (head.length > 1 && findCol(head, KEYWORD_ALIASES)) {
    try { return parseKeywordCsv(lines.join('\n')); } catch { /* fall through to line mode */ }
  }
  const rows: KeywordRow[] = lines.map((l) => {
    const parts = l.split(/\t|,(?=\s*[\d.,]+\s*$)/);
    const v = parts.length > 1 ? num(parts[parts.length - 1]) : NaN;
    return { keyword: Number.isFinite(v) ? parts.slice(0, -1).join(' ') : l, volume: finite(v), cpc: null, currentPath: null, position: null };
  });
  return finalise(rows, []);
}

/** Search Console page-and-query rows, one per query: impressions stand in for volume; keep the best-ranking page. */
export function fromSearchConsole(pageQueries: GscPageQuery[]): KeywordInput {
  const by = new Map<string, KeywordRow>();
  for (const q of pageQueries) {
    const k = normaliseKeyword(q.query);
    if (!k) continue;
    const row = by.get(k);
    if (!row) { by.set(k, { keyword: k, volume: q.impressions, cpc: null, currentPath: q.path, position: q.position || null }); continue; }
    row.volume = (row.volume ?? 0) + q.impressions;
    if (q.position && (row.position == null || q.position < row.position)) { row.position = q.position; row.currentPath = q.path; }
  }
  const notes = ['Volume is Search Console impressions for the export period, summed across pages. The current page is the best-ranking one.'];
  return finalise([...by.values()], notes, 'impressions');
}
