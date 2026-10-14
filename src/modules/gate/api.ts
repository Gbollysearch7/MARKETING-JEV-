import { finishBatch, MAX_BATCH_PAGES, normalisePage, type RawPage } from './parse';
import type { GatePageInput } from './types';

export type ApiPagesResult =
  | { ok: true; pages: GatePageInput[]; notes: string[]; name: string | null }
  | { ok: false; status: number; code: 'invalid_request' | 'no_usable_pages'; error: string; details?: string[] };

/** Validate the `{ pages: [...], name? }` body shared by every gate API route. Pure, so it is unit-tested. */
export function parseApiPages(body: unknown): ApiPagesResult {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as { pages?: unknown; name?: unknown };
  if (!Array.isArray(b.pages) || !b.pages.length) return { ok: false, status: 400, code: 'invalid_request', error: '`pages` must be a non-empty array.' };
  if (b.pages.length > MAX_BATCH_PAGES * 4) return { ok: false, status: 400, code: 'invalid_request', error: `Send at most ${MAX_BATCH_PAGES} pages per request.` };
  const pages: GatePageInput[] = [];
  const errors: string[] = [];
  b.pages.forEach((raw, i) => {
    const p = raw && typeof raw === 'object' ? normalisePage(raw as RawPage, i) : `Row ${i + 1}: must be an object.`;
    if (typeof p === 'string') errors.push(p);
    else pages.push(p);
  });
  if (!pages.length) return { ok: false, status: 422, code: 'no_usable_pages', error: 'No usable pages.', details: errors };
  const done = finishBatch(pages, errors);
  return { ok: true, pages: done.pages, notes: done.notes, name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 120) : null };
}
