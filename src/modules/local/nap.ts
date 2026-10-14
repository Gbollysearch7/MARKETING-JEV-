import type { LocalCitation, LocalLocation } from './types';

/**
 * NAP (name, address, phone) normalisation and mismatch detection. All in code: two listings match
 * when they mean the same thing after case, punctuation, common UK abbreviations, postcode spacing
 * and phone prefixes are normalised.
 */

const ABBR: Record<string, string> = {
  rd: 'road', ave: 'avenue', av: 'avenue', ln: 'lane', sq: 'square', pl: 'place', ct: 'court', dr: 'drive',
  cres: 'crescent', ter: 'terrace', terr: 'terrace', gdns: 'gardens', gr: 'grove', pde: 'parade', bldgs: 'buildings',
  hse: 'house', clo: 'close', cl: 'close', mkt: 'market', yd: 'yard', wy: 'way', bvd: 'boulevard', blvd: 'boulevard',
  nr: 'near', opp: 'opposite', rbt: 'roundabout', est: 'estate', ind: 'industrial',
};

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** "la124bd" -> "LA12 4BD". Returns the trimmed upper-case input when it is not a UK postcode. */
export function normPostcode(v: string): string {
  const m = v.trim().match(POSTCODE_RE);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : v.trim().toUpperCase();
}

export function extractPostcode(address: string): string | null {
  const m = address.match(POSTCODE_RE);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
}

/** Digits in UK national format: "+44 (0)17687 72178", "0044 17687 72178" and "017687-72178" all give "01768772178". */
export function normPhone(v: string): string {
  let d = v.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('440')) d = d.slice(2);
  else if (d.startsWith('44') && d.length >= 11) d = '0' + d.slice(2);
  return d;
}

/** "01768772178" -> "017687 72178"-style display is locale-specific; we keep a readable grouping. */
export function displayPhone(v: string): string {
  const d = normPhone(v);
  if (d.length === 11 && d.startsWith('07')) return `${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 11 && d.startsWith('02')) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (d.length === 11) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return v.trim();
}

function words(v: string): string[] {
  return v.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Business name: case, punctuation, "&"/"and", and legal suffixes ignored. */
export function normName(v: string): string {
  return words(v).filter((w) => !['ltd', 'limited', 'plc', 'llp', 'the'].includes(w)).join(' ');
}

/**
 * Address without its postcode. "St" is "Street" when it ends a part of the address
 * ("12 Lake St, Keswick") and "Saint" when a name follows ("St Johns Street").
 */
export function normAddress(v: string): string {
  const withoutPc = v.replace(POSTCODE_RE, ' ');
  const parts = withoutPc.split(/[,\n]/).map((p) => words(p)).filter((p) => p.length);
  const out: string[] = [];
  for (const p of parts) {
    p.forEach((w, i) => {
      if (w === 'st') out.push(i === p.length - 1 || /^\d/.test(p[i + 1] ?? '') ? 'street' : 'saint');
      else out.push(ABBR[w] ?? w);
    });
  }
  // Drop a trailing "uk"/"united kingdom" and county names often added by directories.
  while (out.length && ['uk', 'gb', 'united', 'kingdom', 'england', 'scotland', 'wales', 'cumbria', 'derbyshire', 'highland', 'conwy'].includes(out[out.length - 1])) out.pop();
  return out.join(' ');
}

/**
 * Same address after normalisation. A listing that leaves off the town ("12 Lake Road" against
 * "12 Lake Road, Keswick") still matches; a different street, number or town does not.
 */
export function sameAddress(a: string, b: string): boolean {
  const x = normAddress(a);
  const y = normAddress(b);
  if (!x || !y) return true;
  return x === y || (x.length < y.length ? y.startsWith(x + ' ') : x.startsWith(y + ' '));
}

/** Host and path, lower case, without scheme, "www." or a trailing slash. */
export function normUrl(v: string): string {
  const s = v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return s;
}

// ---------- directory importance ----------

const DIRECTORY_ORDER = ['google', 'apple', 'bing', 'facebook', 'yelp', 'yell', 'thomson local'];
const DIRECTORY_FIX: Record<string, string> = {
  google: 'Google Business Profile → Edit profile → Business information. Changes can take a few days to go live.',
  apple: 'Apple Business Connect → your location → Location details.',
  bing: 'Bing Places for Business → Edit business, or re-import from Google Business Profile.',
  facebook: 'Facebook Page → Settings → Page setup → Contact info and location.',
  yelp: 'Yelp for Business → Business information. Claim the listing first if it is unclaimed.',
  yell: 'Yell Business account → Manage listing → Business details.',
  'thomson local': 'Claim the listing on Thomson Local, then edit the business details.',
};

export function directoryKey(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/google|gbp|gmb/.test(n)) return 'google';
  if (/apple/.test(n)) return 'apple';
  if (/bing/.test(n)) return 'bing';
  if (/facebook|meta/.test(n)) return 'facebook';
  if (/yelp/.test(n)) return 'yelp';
  if (/^yell\b|yell com/.test(n)) return 'yell';
  if (/thomson/.test(n)) return 'thomson local';
  return n;
}

/** 1 for the big three (Google, Apple, Bing), 2 for major directories, 3 for everything else. */
export function directoryTier(name: string): 1 | 2 | 3 {
  const i = DIRECTORY_ORDER.indexOf(directoryKey(name));
  return i < 0 ? 3 : i < 3 ? 1 : 2;
}

/** Sort rank: Google first, then Apple, Bing, Facebook, Yelp, Yell, Thomson Local, then the rest alphabetically. */
export function directoryRank(name: string): number {
  const i = DIRECTORY_ORDER.indexOf(directoryKey(name));
  return i < 0 ? 100 : i;
}

export function directoryFixPath(name: string): string {
  return DIRECTORY_FIX[directoryKey(name)] ?? 'Update the listing on the directory itself, or push the correct details through your citation tool (Yext or BrightLocal).';
}

// ---------- mismatch detection ----------

export type NapField = 'name' | 'address' | 'postcode' | 'phone' | 'website';
export const NAP_FIELD_LABEL: Record<NapField, string> = { name: 'Name', address: 'Address', postcode: 'Postcode', phone: 'Phone', website: 'Website' };

export interface NapMismatch { field: NapField; listed: string; expected: string }

export interface CitationIssue {
  locId: string;
  directory: string;
  tier: 1 | 2 | 3;
  rank: number;
  mismatches: NapMismatch[];
  duplicate: boolean;
  fixPath: string;
  url: string;
}

/** Compare one citation with the location's own details. Blank listed fields are not mismatches. */
export function compareCitation(loc: LocalLocation, c: LocalCitation): NapMismatch[] {
  const out: NapMismatch[] = [];
  if (c.listedName && loc.name && normName(c.listedName) !== normName(loc.name)) out.push({ field: 'name', listed: c.listedName, expected: loc.name });
  if (c.address && loc.address) {
    if (!sameAddress(c.address, loc.address)) out.push({ field: 'address', listed: c.address.replace(POSTCODE_RE, '').replace(/[,\s]+$/, ''), expected: loc.address });
    const pc = extractPostcode(c.address);
    const expectedPc = loc.postcode ? normPostcode(loc.postcode) : extractPostcode(loc.address);
    if (pc && expectedPc && pc !== expectedPc) out.push({ field: 'postcode', listed: pc, expected: expectedPc });
  }
  if (c.phone && loc.phone && normPhone(c.phone) !== normPhone(loc.phone)) out.push({ field: 'phone', listed: c.phone, expected: loc.phone });
  if (c.url && loc.website && !/google|apple|bing|facebook|yelp|yell|thomson/.test(normUrl(c.url)) && normUrl(c.url) !== normUrl(loc.website)) {
    out.push({ field: 'website', listed: c.url, expected: loc.website });
  }
  return out;
}

/** Every citation with at least one mismatch or a duplicate listing, most important directory first. */
export function citationIssues(loc: LocalLocation, citations: LocalCitation[]): CitationIssue[] {
  const seen = new Map<string, number>();
  for (const c of citations) seen.set(directoryKey(c.directory), (seen.get(directoryKey(c.directory)) ?? 0) + 1);
  const out: CitationIssue[] = [];
  const dupDone = new Set<string>();
  for (const c of citations) {
    const mm = compareCitation(loc, c);
    const key = directoryKey(c.directory);
    const dup = (seen.get(key) ?? 0) > 1 && !dupDone.has(key);
    if (dup) dupDone.add(key);
    if (!mm.length && !dup) continue;
    out.push({ locId: loc.locId, directory: c.directory, tier: directoryTier(c.directory), rank: directoryRank(c.directory), mismatches: mm, duplicate: dup, fixPath: directoryFixPath(c.directory), url: c.url });
  }
  return out.sort((a, b) => a.rank - b.rank || a.directory.localeCompare(b.directory) || b.mismatches.length - a.mismatches.length);
}
