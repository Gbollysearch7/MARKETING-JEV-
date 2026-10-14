import { decodeText, findCol, num, numOr0, parseTable } from './csv';
import { isoDate, type Period } from './gsc';
import { pathKey } from './url';

export interface Ga4Page {
  path: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
  revenue: number;
}

export interface Ga4Import { period: Period | null; pages: Ga4Page[]; notes: string[] }

const PAGE_ALIASES = ['landing page + query string', 'landing page', 'page path + query string', 'page path and screen class', 'page path', 'page'];

/** GA4 Reports > Engagement > Landing page, exported as CSV (Share > Download file). */
export function importGa4(bytes: Uint8Array): Ga4Import {
  const text = decodeText(bytes);
  const { headers, rows } = parseTable(text, PAGE_ALIASES);
  const pageCol = findCol(headers, PAGE_ALIASES)!;
  const sessionsCol = findCol(headers, ['sessions']);
  const engagedCol = findCol(headers, ['engaged sessions']);
  const convCol = findCol(headers, ['key events', 'conversions']);
  const revCol = findCol(headers, ['total revenue', 'revenue']);
  if (!sessionsCol) throw new Error('Could not find a Sessions column. Export the Landing page report.');

  const pages = new Map<string, Ga4Page>();
  for (const r of rows) {
    const raw = r[pageCol] ?? '';
    if (!raw.startsWith('/') && !/^https?:/i.test(raw)) continue; // skips "(not set)" and totals rows
    const path = pathKey(raw);
    if (!path) continue;
    const p = pages.get(path) ?? { path, sessions: 0, engagedSessions: 0, conversions: 0, revenue: 0 };
    p.sessions += numOr0(r[sessionsCol]);
    p.engagedSessions += engagedCol ? numOr0(r[engagedCol]) : 0;
    p.conversions += convCol ? numOr0(r[convCol]) : 0;
    p.revenue += revCol ? numOr0(r[revCol]) : 0;
    pages.set(path, p);
  }

  // GA4 writes the date range into the comment header: "# Start date: 20260701" / "# End date: 20260930".
  const start = /#\s*Start date:\s*(\S+)/i.exec(text)?.[1];
  const end = /#\s*End date:\s*(\S+)/i.exec(text)?.[1];
  const period = start && end && isoDate(start) && isoDate(end) ? { start: isoDate(start)!, end: isoDate(end)! } : null;

  const notes: string[] = [];
  if (!convCol) notes.push('No Key events column. Conversions are treated as unknown, so pages are protected from pruning only by other rules.');
  return { period, pages: [...pages.values()], notes };
}

export const hasNumber = (v: string | undefined) => Number.isFinite(num(v));
