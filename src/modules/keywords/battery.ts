import type { ChoiceQuestion, Questions } from '../../engine/jev/types';
import type { BuyingStage, KeywordIntent } from '../../lib/modules/contracts';
import { buildIdf, isModifier, tokens } from './cluster';
import type { KeywordRow } from './input';

export const CRITERIA_VERSION = 'keywords.v1';

export const INTENTS: KeywordIntent[] = ['informational', 'commercial', 'transactional', 'navigational', 'local', 'junk'];
export const STAGES: BuyingStage[] = ['awareness', 'consideration', 'decision', 'retention'];
export const NEW_PAGE = 'new_page';
export const MAX_CANDIDATES = 8;

export const INTENT_CRITERIA: Record<KeywordIntent, string> = {
  informational: 'The searcher wants to learn or understand something (how to, what is, advice, ideas, routes, techniques) and is not yet weighing up products to buy.',
  commercial: 'Commercial investigation: the searcher is researching or comparing products or services before buying (best, top, reviews, versus, which one, for a particular use).',
  transactional: 'The searcher is ready to buy or act now: buy, price, sale, discount, deals, in stock, or a specific product or model to order.',
  navigational: 'The searcher wants a specific page or brand of this site (`site.name`, `site.domain` or its own product line), such as its home page, contact, delivery or returns page.',
  local: 'The searcher wants a physical place to visit in person: a shop, centre, instructor or venue near them or in a named town ("near me", "shop in Keswick").',
  junk: 'Not worth targeting: the keyword has a spelling mistake or typo (such as "walkign" or "rucksak"), or it names a different company or brand than `site.name` (a competitor such as another retailer or gear maker), or it is about something unrelated to what `site.top_pages` cover (such as football). Any one of these is enough.',
};

export const STAGE_CRITERIA: Record<BuyingStage, string> = {
  awareness: 'Early: the searcher is exploring a need or an activity and has not started looking at products.',
  consideration: 'Middle: the searcher knows what kind of product they need and is comparing options.',
  decision: 'Late: the searcher has chosen and is ready to buy, book or visit.',
  retention: 'After purchase: caring for, repairing, cleaning, returning or getting more out of something they already own.',
};

export const INTENT_LABEL: Record<KeywordIntent, string> = {
  informational: 'Informational', commercial: 'Commercial', transactional: 'Transactional', navigational: 'Navigational', local: 'Local', junk: 'Junk',
};
export const STAGE_LABEL: Record<BuyingStage, string> = { awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention' };

/** Named volume band computed in code; Jev never sees the raw number. */
export function volumeBand(v: number | null, source: 'searches' | 'impressions' = 'searches'): string {
  const unit = source === 'impressions' ? 'impressions' : 'searches a month';
  if (v == null) return 'unknown';
  if (v < 50) return `very_low (under 50 ${unit})`;
  if (v < 200) return `low (50 to 199 ${unit})`;
  if (v < 1000) return `medium (200 to 999 ${unit})`;
  if (v < 10000) return `high (1,000 to 9,999 ${unit})`;
  return `very_high (10,000 or more ${unit})`;
}

export function positionBand(p: number | null): string | undefined {
  if (p == null) return undefined;
  if (p <= 3) return 'top_3';
  if (p <= 10) return '4_to_10 (page one)';
  if (p <= 20) return '11_to_20 (page two)';
  return 'beyond_20';
}

export interface SitePage { path: string; title: string | null; clicks?: number | null }
export interface Candidate { key: string; path: string; title: string }

const UTILITY = /^\/(privacy|terms|cookie|basket|cart|checkout|search|login|account|sitemap|wp-)/;

/** A readable title for a page that has none: its last path segment. */
export const titleOf = (p: SitePage) => p.title?.trim() || (p.path === '/' ? 'Home page' : p.path.split('/').filter(Boolean).pop()!.replace(/[-_]+/g, ' '));

export interface CandidateIndex { pages: SitePage[]; toks: string[][]; idf: (t: string) => number }

export function indexPages(pages: SitePage[]): CandidateIndex {
  const usable = pages.filter((p) => !UTILITY.test(p.path));
  const toks = usable.map((p) => tokens(`${p.path.replace(/[/_-]+/g, ' ')} ${titleOf(p)}`));
  return { pages: usable, toks, idf: buildIdf(toks) };
}

/** Up to 8 candidate homes for a keyword by token similarity, plus its current ranking page when known. */
export function candidatePages(keyword: string, currentPath: string | null, ix: CandidateIndex): Candidate[] {
  const kt = tokens(keyword);
  const scored: { i: number; s: number }[] = [];
  ix.toks.forEach((pt, i) => {
    let s = 0;
    let head = false;
    for (const t of kt) if (pt.includes(t)) { s += ix.idf(t); if (!isModifier(t)) head = true; }
    if (head) scored.push({ i, s: s / Math.sqrt(pt.length || 1) });
  });
  scored.sort((a, b) => b.s - a.s || ix.pages[a.i].path.localeCompare(ix.pages[b.i].path));
  const picked = scored.slice(0, MAX_CANDIDATES).map((x) => ix.pages[x.i]);
  if (currentPath && !picked.some((p) => p.path === currentPath)) {
    const cur = ix.pages.find((p) => p.path === currentPath) ?? { path: currentPath, title: null };
    if (picked.length >= MAX_CANDIDATES) picked.pop();
    picked.push(cur);
  }
  return picked.map((p, i) => ({ key: `p${i + 1}`, path: p.path, title: titleOf(p) }));
}

export interface SiteSummary { name: string; domain: string; topTitles: string[] }

/** The filtered state for one keyword: the keyword, named bands, the site summary and the candidate pages. */
export function buildState(row: KeywordRow, site: SiteSummary, candidates: Candidate[], volumeSource: 'searches' | 'impressions') {
  const ranking = row.currentPath ? { url_path: row.currentPath, position: positionBand(row.position) ?? 'unknown' } : undefined;
  return {
    keyword: row.keyword,
    search_volume: volumeBand(row.volume, volumeSource),
    currently_ranking_page: ranking,
    site: { name: site.name, domain: site.domain, top_pages: site.topTitles.slice(0, 12) },
    candidate_pages: candidates.map((c) => ({ option: c.key, url_path: c.path, title: c.title })),
  };
}

export function buildQuestions(candidates: Candidate[]): Questions {
  const qs: Questions = {
    intent: {
      type: 'choice',
      instructions: 'What is the main search intent behind `keyword`, for a searcher typing it into Google?',
      criteria: { ...INTENT_CRITERIA },
    } satisfies ChoiceQuestion,
    stage: {
      type: 'choice',
      instructions: 'At which buying stage is someone who searches for `keyword`?',
      criteria: { ...STAGE_CRITERIA },
    } satisfies ChoiceQuestion,
  };
  if (candidates.length) {
    const crit: Record<string, string> = {};
    for (const c of candidates) crit[c.key] = `${c.path} (${c.title})`;
    crit[NEW_PAGE] = 'No existing page is a good home: none of `candidate_pages` answers what someone searching `keyword` wants.';
    qs.page = {
      type: 'choice',
      instructions: 'Which page of the site in `candidate_pages` should rank for `keyword`, as the best answer to what the searcher wants?',
      criteria: crit,
    } satisfies ChoiceQuestion;
  }
  return qs;
}
