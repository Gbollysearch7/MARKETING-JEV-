import { findCol, num, parseTable, type Row } from '../../engine/ingest/csv';
import type { LocalCitation, LocalLocation, LocalQuestion, LocalReview, UploadKind } from './types';

/**
 * CSV parsing for the four local exports. Headers are matched loosely (GBP, Yext, BrightLocal and
 * hand-made spreadsheets all name columns differently), and every row-level problem is reported back
 * instead of being silently dropped.
 */

const A = {
  locId: ['location id', 'location_id', 'store code', 'store id', 'location code', 'branch id', 'site id', 'id', 'location'],
  name: ['name', 'business name', 'location name', 'store name', 'listed name', 'title'],
  address: ['address', 'address line 1', 'street address', 'full address', 'address 1'],
  postcode: ['postcode', 'post code', 'postal code', 'zip', 'zip code'],
  phone: ['phone', 'primary phone', 'phone number', 'telephone', 'tel'],
  website: ['website', 'website url', 'url', 'web site', 'site url'],
  primaryCategory: ['primary category', 'main category', 'category'],
  additionalCategories: ['additional categories', 'secondary categories', 'other categories'],
  hours: ['hours', 'opening hours', 'business hours', 'regular hours'],
  description: ['description', 'business description', 'from the business', 'about'],
  photoCount: ['photo count', 'photos', 'number of photos', 'images'],
  lastPostDate: ['last post date', 'last post', 'latest post', 'last update post'],
  rating: ['rating', 'average rating', 'avg rating', 'star rating', 'stars'],
  reviewCount: ['review count', 'reviews', 'number of reviews', 'total reviews'],
  author: ['author', 'reviewer', 'reviewer name', 'name', 'customer'],
  reviewText: ['text', 'review text', 'review', 'comment', 'review comment', 'content'],
  date: ['date', 'review date', 'created', 'create time', 'posted', 'question date', 'asked'],
  replied: ['replied', 'has reply', 'responded', 'reply status', 'owner replied'],
  replyText: ['reply text', 'reply', 'response', 'owner response', 'reply comment'],
  reviewId: ['review id', 'review_id', 'reviewid'],
  question: ['question', 'question text', 'text'],
  answered: ['answered', 'has answer', 'answer status'],
  directory: ['directory', 'source', 'site', 'publisher', 'platform', 'citation source'],
  listedName: ['listed name', 'name', 'business name', 'name on listing'],
  citationUrl: ['url', 'listing url', 'link', 'website', 'listing link'],
};

export interface ParseResult<T> { rows: T[]; warnings: string[] }

const WORD_RATING: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

export function parseRating(v: string | undefined): number {
  if (!v) return NaN;
  const s = v.trim().toLowerCase();
  if (WORD_RATING[s] != null) return WORD_RATING[s];
  const stars = (s.match(/★/g) ?? []).length;
  if (stars) return stars;
  const n = num(s.replace(/\/\s*5$/, '').replace(/stars?/, ''));
  return n;
}

export function parseBool(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'replied', 'answered', 'responded', 'x', '✓'].includes(s);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** ISO yyyy-mm-dd from "2026-10-01", "2026-10-01T09:00Z", "01/10/2026" (UK order), "1 Oct 2026". Null when unreadable. */
export function parseDate(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})$/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(+m[1])}`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

export function splitList(v: string | undefined): string[] {
  return (v ?? '').split(/[;|,\n]/).map((x) => x.trim()).filter(Boolean);
}

/** Short stable hex key (FNV-1a) for de-duplicating rows across uploads. */
export function stableKey(...parts: string[]): string {
  let h = 0x811c9dc5;
  const s = parts.join('\u0001');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function cols(headers: string[], spec: Record<string, string[]>, exclude: string[] = []) {
  const out: Record<string, string | undefined> = {};
  const used = new Set(exclude);
  for (const [k, aliases] of Object.entries(spec)) {
    const c = findCol(headers.filter((h) => !used.has(h)), aliases);
    out[k] = c;
    if (c) used.add(c);
  }
  return out;
}

const get = (r: Row, c: string | undefined) => (c ? (r[c] ?? '').trim() : '');

/** Location ids are matched across files ignoring case and stray spaces ("so-kes " and "SO-KES" are one shop). */
export const normLocId = (v: string) => v.trim().replace(/\s+/g, ' ').toUpperCase();
const getLoc = (r: Row, c: string | undefined) => normLocId(get(r, c));

export function parseLocations(text: string): ParseResult<LocalLocation> {
  const { headers, rows } = parseTable(text, [...A.locId, ...A.name]);
  // Match the specific columns first so "name" does not swallow "location name" style ids.
  const c = cols(headers, { locId: A.locId.filter((a) => a !== 'location'), locality: ['locality', 'city', 'town', 'address line 2'], postcode: A.postcode, primaryCategory: A.primaryCategory, additionalCategories: A.additionalCategories, lastPostDate: A.lastPostDate, photoCount: A.photoCount, reviewCount: A.reviewCount, rating: A.rating, phone: A.phone, website: A.website, hours: A.hours, description: A.description, address: A.address, name: A.name });
  const warnings: string[] = [];
  if (!c.locId && !c.name) throw new Error('Locations need a "location id" or "name" column.');
  const out = new Map<string, LocalLocation>();
  rows.forEach((r, i) => {
    const name = get(r, c.name);
    const locId = normLocId(get(r, c.locId) || name);
    if (!locId) { warnings.push(`Row ${i + 2}: no location id or name, skipped.`); return; }
    if (out.has(locId)) warnings.push(`Row ${i + 2}: ${locId} appears more than once; the later row was used.`);
    const line1 = get(r, c.address);
    const town = get(r, c.locality);
    const address = town && !line1.toLowerCase().includes(town.toLowerCase()) ? [line1, town].filter(Boolean).join(', ') : line1;
    const photos = num(get(r, c.photoCount));
    const rating = num(get(r, c.rating));
    const reviews = num(get(r, c.reviewCount));
    out.set(locId, {
      locId, name: name || locId,
      address, postcode: get(r, c.postcode), phone: get(r, c.phone), website: get(r, c.website),
      primaryCategory: get(r, c.primaryCategory), additionalCategories: splitList(get(r, c.additionalCategories)),
      hours: get(r, c.hours), description: get(r, c.description),
      photoCount: Number.isFinite(photos) ? photos : null,
      lastPostDate: parseDate(get(r, c.lastPostDate)),
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
      reviewCount: Number.isFinite(reviews) ? reviews : null,
    });
  });
  return { rows: [...out.values()], warnings };
}

export function parseReviews(text: string): ParseResult<LocalReview> {
  const { headers, rows } = parseTable(text, [...A.reviewText, ...A.rating, 'star rating']);
  const c = cols(headers, { reviewId: A.reviewId, locId: A.locId, rating: A.rating, replyText: A.replyText, replied: A.replied, date: A.date, reviewText: A.reviewText, author: A.author });
  if (!c.locId) throw new Error('Reviews need a "location id" column that matches your locations file.');
  if (!c.rating) throw new Error('Reviews need a "rating" column (1 to 5).');
  const warnings: string[] = [];
  const out: LocalReview[] = [];
  rows.forEach((r, i) => {
    const locId = getLoc(r, c.locId);
    const rating = parseRating(get(r, c.rating));
    if (!locId) { warnings.push(`Row ${i + 2}: no location id, skipped.`); return; }
    if (!(rating >= 1 && rating <= 5)) { warnings.push(`Row ${i + 2}: rating "${get(r, c.rating)}" is not 1 to 5, skipped.`); return; }
    const text = get(r, c.reviewText);
    const author = get(r, c.author) || 'A customer';
    const date = parseDate(get(r, c.date));
    const replyText = get(r, c.replyText);
    const repliedCell = get(r, c.replied);
    out.push({
      locId, author, rating: Math.round(rating), text, date,
      replied: c.replied && repliedCell ? parseBool(repliedCell) : Boolean(replyText),
      replyText,
      key: get(r, c.reviewId) || stableKey(locId, author, date ?? '', text.slice(0, 120)),
    });
  });
  return { rows: out, warnings };
}

export function parseQuestions(text: string): ParseResult<LocalQuestion> {
  const { headers, rows } = parseTable(text, A.question);
  const c = cols(headers, { locId: A.locId, answered: A.answered, date: A.date, question: A.question });
  if (!c.locId) throw new Error('Questions need a "location id" column.');
  if (!c.question) throw new Error('Questions need a "question" column.');
  const warnings: string[] = [];
  const out: LocalQuestion[] = [];
  rows.forEach((r, i) => {
    const locId = getLoc(r, c.locId);
    const question = get(r, c.question);
    if (!locId || !question) { warnings.push(`Row ${i + 2}: missing location id or question, skipped.`); return; }
    const date = parseDate(get(r, c.date));
    out.push({ locId, question, date, answered: parseBool(get(r, c.answered)), key: stableKey(locId, question, date ?? '') });
  });
  return { rows: out, warnings };
}

export function parseCitations(text: string): ParseResult<LocalCitation> {
  const { headers, rows } = parseTable(text, A.directory);
  const c = cols(headers, { locId: A.locId, directory: A.directory, listedName: A.listedName, address: A.address, phone: A.phone, url: A.citationUrl });
  if (!c.locId) throw new Error('Citations need a "location id" column.');
  if (!c.directory) throw new Error('Citations need a "directory" column (for example Google, Apple, Yell).');
  const warnings: string[] = [];
  const out: LocalCitation[] = [];
  rows.forEach((r, i) => {
    const locId = getLoc(r, c.locId);
    const directory = get(r, c.directory);
    if (!locId || !directory) { warnings.push(`Row ${i + 2}: missing location id or directory, skipped.`); return; }
    out.push({ locId, directory, listedName: get(r, c.listedName), address: get(r, c.address), phone: get(r, c.phone), url: get(r, c.url) });
  });
  return { rows: out, warnings };
}

export type Parsed =
  | { kind: 'locations'; result: ParseResult<LocalLocation> }
  | { kind: 'reviews'; result: ParseResult<LocalReview> }
  | { kind: 'questions'; result: ParseResult<LocalQuestion> }
  | { kind: 'citations'; result: ParseResult<LocalCitation> };

export function parseUpload(kind: UploadKind, text: string): Parsed {
  switch (kind) {
    case 'locations': return { kind, result: parseLocations(text) };
    case 'reviews': return { kind, result: parseReviews(text) };
    case 'questions': return { kind, result: parseQuestions(text) };
    case 'citations': return { kind, result: parseCitations(text) };
  }
}
