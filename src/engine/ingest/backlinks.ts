import { strFromU8 } from 'fflate';
import { findCol, numOr0, parseTable } from './csv';
import { pathKey } from './url';

export interface BacklinkPage { path: string; referringDomains: number; backlinks: number }

const URL_ALIASES = ['url', 'target url', 'page url', 'page', 'address'];

/** Ahrefs "Best by links" or Semrush "Indexed pages" export. One row per URL on the site. */
export function importBacklinks(bytes: Uint8Array): { pages: BacklinkPage[]; notes: string[] } {
  // Ahrefs exports are UTF-16 tab separated; fflate decodes UTF-8, so detect and decode UTF-16 first.
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? new TextDecoder('utf-16le').decode(bytes) : strFromU8(bytes);
  const { headers, rows } = parseTable(text, URL_ALIASES);
  const urlCol = findCol(headers, URL_ALIASES)!;
  const rdCol = findCol(headers, ['referring domains', 'ref domains', 'domains', 'rd']);
  const blCol = findCol(headers, ['backlinks', 'external links', 'links']);
  if (!rdCol) throw new Error('Could not find a Referring domains column.');
  const pages = new Map<string, BacklinkPage>();
  for (const r of rows) {
    const path = pathKey(r[urlCol]);
    if (!path) continue;
    const p = pages.get(path) ?? { path, referringDomains: 0, backlinks: 0 };
    p.referringDomains = Math.max(p.referringDomains, numOr0(r[rdCol]));
    p.backlinks = Math.max(p.backlinks, blCol ? numOr0(r[blCol]) : 0);
    pages.set(path, p);
  }
  return { pages: [...pages.values()], notes: [] };
}
