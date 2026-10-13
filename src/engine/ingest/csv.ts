import Papa from 'papaparse';

export type Row = Record<string, string>;

/** Lowercase, strip punctuation and collapse spaces so "Title 1", "title_1" and "Title-1" match. */
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9%+]+/g, ' ').trim();

/**
 * Parse CSV or TSV text. Skips leading comment lines (GA4 starts with "# ..." lines) and
 * title rows (older Screaming Frog exports start with a one-cell "Internal - HTML" row) by
 * picking the first row that contains one of the expected header names.
 */
export function parseTable(text: string, expectAnyOf: string[]): { headers: string[]; rows: Row[] } {
  const clean = text.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  const grid = (parsed.data as string[][]).filter((r) => Array.isArray(r) && !(r.length === 1 && r[0].startsWith('#')));
  const wanted = expectAnyOf.map(normHeader);
  const headerIdx = grid.findIndex((r) => r.some((c) => wanted.includes(normHeader(c ?? ''))));
  if (headerIdx < 0) {
    throw new Error(`Could not find a header row. Expected a column named one of: ${expectAnyOf.join(', ')}.`);
  }
  const headers = grid[headerIdx].map((h) => (h ?? '').trim());
  const rows: Row[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    if (r.length === 1 && !r[0]) continue;
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = (r[i] ?? '').trim()));
    rows.push(row);
  }
  return { headers, rows };
}

/** Find the first header matching any alias (normalised exact match first, then prefix match). */
export function findCol(headers: string[], aliases: string[]): string | undefined {
  const norm = headers.map(normHeader);
  for (const a of aliases.map(normHeader)) {
    const i = norm.indexOf(a);
    if (i >= 0) return headers[i];
  }
  for (const a of aliases.map(normHeader)) {
    const i = norm.findIndex((h) => h.startsWith(a));
    if (i >= 0) return headers[i];
  }
  return undefined;
}

/** "1,234" -> 1234, "3.4%" -> 3.4, "" -> NaN. */
export function num(v: string | undefined): number {
  if (v == null) return NaN;
  const s = v.replace(/[,\s%£$€]/g, '');
  if (s === '' || s === '-' || s === '—') return NaN;
  return Number(s);
}

export const numOr0 = (v: string | undefined) => {
  const n = num(v);
  return Number.isFinite(n) ? n : 0;
};
