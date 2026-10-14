import Papa from 'papaparse';

export type Row = Record<string, string>;

/**
 * Bytes to text for any export: UTF-8 (with or without BOM), or UTF-16 LE/BE, which Excel ("Unicode text"),
 * Ahrefs and some GA4 downloads produce. UTF-16 without a BOM is detected from its zero bytes.
 * Binary files (images, spreadsheets) fail here with a clear message instead of a confusing header error.
 */
export function decodeText(bytes: Uint8Array): string {
  const b = bytes;
  let text: string;
  if (b[0] === 0xff && b[1] === 0xfe) text = new TextDecoder('utf-16le').decode(b.subarray(2));
  else if (b[0] === 0xfe && b[1] === 0xff) text = new TextDecoder('utf-16be').decode(b.subarray(2));
  else {
    // Zero bytes in every other position of the first few hundred bytes means UTF-16 without a BOM.
    const n = Math.min(b.length, 400);
    let evenZero = 0, oddZero = 0;
    for (let i = 0; i < n; i++) if (b[i] === 0) { if (i % 2) oddZero++; else evenZero++; }
    if (n >= 8 && oddZero > n / 4 && evenZero === 0) text = new TextDecoder('utf-16le').decode(b);
    else if (n >= 8 && evenZero > n / 4 && oddZero === 0) text = new TextDecoder('utf-16be').decode(b);
    else text = new TextDecoder('utf-8').decode(b);
  }
  text = text.replace(/^\uFEFF/, '');
  if (looksBinary(b)) throw new Error('This is not a CSV or text export. Upload the CSV, TSV or zip file the tool downloads (Excel .xlsx files need saving as CSV first).');
  return text;
}

function looksBinary(b: Uint8Array): boolean {
  if (b[0] === 0x50 && b[1] === 0x4b) return true; // zip or xlsx where text was expected
  if (b[0] === 0x89 && b[1] === 0x50) return true; // png
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return true; // pdf
  if (b[0] === 0xff && b[1] === 0xd8) return true; // jpeg
  return false;
}

/** Lowercase, strip punctuation and collapse spaces so "Title 1", "title_1" and "Title-1" match. */
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9%+]+/g, ' ').trim();

/**
 * Parse CSV or TSV text. Skips leading comment lines (GA4 starts with "# ..." lines) and
 * title rows (older Screaming Frog exports start with a one-cell "Internal - HTML" row) by
 * picking the first row that contains one of the expected header names.
 */
export function parseTable(text: string, expectAnyOf: string[]): { headers: string[]; rows: Row[] } {
  const clean = text.replace(/^\uFEFF/, '');
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
