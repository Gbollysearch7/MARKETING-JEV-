import { findCol, num, parseTable } from '../../engine/ingest/csv';
import type { ImportPurpose, LinkAttr, ProspectInput, SourceKind } from './types';

export const MAX_PER_UPLOAD = 2000;

const URL_ALIASES = ['referring page url', 'source url', 'referring url', 'source page', 'page url', 'url', 'link', 'address', 'referring page', 'source'];
const DOMAIN_ALIASES = ['referring domain', 'domain', 'source domain', 'root domain'];
const TITLE_ALIASES = ['referring page title', 'source title', 'page title', 'title'];
const SNIPPET_ALIASES = ['snippet', 'context', 'surrounding text', 'text', 'description', 'left context', 'notes', 'note'];
const ANCHOR_ALIASES = ['anchor', 'anchor text'];
const DR_ALIASES = ['domain rating', 'dr', 'domain authority', 'da', 'authority score', 'page ascore', 'ascore', 'trust flow', 'tf', 'authority'];
const TRAFFIC_ALIASES = ['domain traffic', 'traffic', 'organic traffic', 'page traffic', 'monthly traffic', 'visits'];
const TYPE_ALIASES = ['link type', 'type', 'rel', 'link attribute', 'attributes'];
const NOFOLLOW_ALIASES = ['nofollow', 'no follow'];
const SPONSORED_ALIASES = ['sponsored'];
const UGC_ALIASES = ['ugc'];

const truthy = (v: string | undefined) => /^(true|yes|1|y)$/i.test((v ?? '').trim());

/** "dofollow", "nofollow", "sponsored,nofollow", "UGC" … → one attribute, strictest first. */
export function linkAttrOf(typeCell: string | undefined, flags: { nofollow?: string; sponsored?: string; ugc?: string } = {}): LinkAttr {
  const t = (typeCell ?? '').toLowerCase();
  if (truthy(flags.sponsored) || /sponsored|paid/.test(t)) return 'sponsored';
  if (truthy(flags.ugc) || /\bugc\b/.test(t)) return 'ugc';
  if (truthy(flags.nofollow) || /no ?follow/.test(t)) return 'nofollow';
  if (/do ?follow|follow/.test(t) || flags.nofollow !== undefined) return 'dofollow';
  return 'unknown';
}

/** Hostname without www, plus lowercased path without trailing slash, query or fragment. */
export function urlKeyOf(url: string): { url: string; urlKey: string; domain: string } | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
  const domain = u.hostname.toLowerCase().replace(/^www\./, '');
  let path = u.pathname.toLowerCase().replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return { url: u.toString(), urlKey: `${domain}${path === '/' ? '' : path}`, domain };
}

function decode(bytes: Uint8Array): string {
  // Ahrefs exports are UTF-16 LE with a BOM and tab separated.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

export interface ParsedImport {
  kind: SourceKind;
  rows: ProspectInput[];
  /** Rows skipped because they had no usable URL. */
  invalid: number;
  /** Duplicate rows of the same page inside this file. */
  duplicatesInFile: number;
  /** Rows beyond the per-upload cap. */
  overCap: number;
  notes: string[];
}

/**
 * Parse an Ahrefs "Backlinks" export, a Semrush backlinks export or a generic list into one row per page.
 * For a referring-domains export (own link profile) a bare domain is accepted as the URL.
 */
export function parseProspects(input: Uint8Array | string, purpose: ImportPurpose = 'prospects', cap = MAX_PER_UPLOAD): ParsedImport {
  const text = typeof input === 'string' ? input : decode(input);
  const { headers, rows } = parseTable(text, [...URL_ALIASES, ...DOMAIN_ALIASES]);
  const urlCol = findCol(headers, URL_ALIASES);
  const domainCol = findCol(headers, DOMAIN_ALIASES);
  if (!urlCol && !domainCol) throw new Error('Could not find a URL or domain column. Expected "Referring page URL", "Source url", "url" or "domain".');
  const norm = headers.map((h) => h.toLowerCase());
  const kind: SourceKind = norm.some((h) => h.includes('referring page url') || h === 'domain rating') ? 'ahrefs'
    : norm.some((h) => h === 'source url' || h === 'page ascore' || h === 'source title') ? 'semrush' : 'generic';
  const col = {
    title: findCol(headers, TITLE_ALIASES),
    snippet: findCol(headers, SNIPPET_ALIASES),
    anchor: findCol(headers, ANCHOR_ALIASES),
    dr: findCol(headers, DR_ALIASES),
    traffic: findCol(headers, TRAFFIC_ALIASES),
    type: findCol(headers, TYPE_ALIASES),
    nofollow: findCol(headers, NOFOLLOW_ALIASES),
    sponsored: findCol(headers, SPONSORED_ALIASES),
    ugc: findCol(headers, UGC_ALIASES),
  };
  const byKey = new Map<string, ProspectInput>();
  let invalid = 0;
  let duplicatesInFile = 0;
  let overCap = 0;
  for (const r of rows) {
    const rawUrl = (urlCol ? r[urlCol] : '') || (domainCol ? r[domainCol] : '');
    const k = urlKeyOf(rawUrl);
    if (!k) { invalid++; continue; }
    const dr = col.dr ? num(r[col.dr]) : NaN;
    const traffic = col.traffic ? num(r[col.traffic]) : NaN;
    const row: ProspectInput = {
      url: k.url,
      urlKey: purpose === 'own_profile' ? k.domain : k.urlKey,
      domain: k.domain,
      title: (col.title ? r[col.title] : '').slice(0, 300),
      snippet: (col.snippet && col.snippet !== col.title ? r[col.snippet] : '').slice(0, 600),
      anchor: (col.anchor ? r[col.anchor] : '').slice(0, 200),
      dr: Number.isFinite(dr) ? Math.max(0, Math.min(100, dr)) : null,
      traffic: Number.isFinite(traffic) ? Math.max(0, traffic) : null,
      linkAttr: linkAttrOf(col.type ? r[col.type] : undefined, {
        nofollow: col.nofollow ? r[col.nofollow] : undefined,
        sponsored: col.sponsored ? r[col.sponsored] : undefined,
        ugc: col.ugc ? r[col.ugc] : undefined,
      }),
    };
    const prev = byKey.get(row.urlKey);
    if (prev) {
      duplicatesInFile++;
      // Keep the richer row: an explicit DR, a title, a followed link.
      if ((prev.dr ?? -1) < (row.dr ?? -1)) prev.dr = row.dr;
      if ((prev.traffic ?? -1) < (row.traffic ?? -1)) prev.traffic = row.traffic;
      if (!prev.title && row.title) prev.title = row.title;
      if (!prev.snippet && row.snippet) prev.snippet = row.snippet;
      if (prev.linkAttr !== 'dofollow' && row.linkAttr === 'dofollow') prev.linkAttr = 'dofollow';
      continue;
    }
    if (byKey.size >= cap) { overCap++; continue; }
    byKey.set(row.urlKey, row);
  }
  const notes: string[] = [];
  if (invalid) notes.push(invalid === 1 ? '1 row had no usable URL and was skipped.' : `${invalid.toLocaleString('en-GB')} rows had no usable URL and were skipped.`);
  if (duplicatesInFile) notes.push(`${duplicatesInFile.toLocaleString('en-GB')} duplicate ${duplicatesInFile === 1 ? 'row' : 'rows'} for the same ${purpose === 'own_profile' ? 'domain' : 'page'} ${duplicatesInFile === 1 ? 'was' : 'were'} merged.`);
  if (overCap) notes.push(`Only the first ${cap.toLocaleString('en-GB')} ${purpose === 'own_profile' ? 'domains' : 'pages'} were imported; ${overCap} more were left out.`);
  return { kind, rows: [...byKey.values()], invalid, duplicatesInFile, overCap, notes };
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = { ahrefs: 'Ahrefs backlinks export', semrush: 'Semrush backlinks export', generic: 'Prospect list' };
