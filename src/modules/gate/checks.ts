import { findPlaceholders, jaccard, shingleList, words } from './text';
import type { CheckBands, CodeChecks, GatePageInput } from './types';

/** Shingle size for template detection and duplication. */
export const SHINGLE = 5;
/** A shingle on more than this share of a template's pages is template text. */
export const TEMPLATE_SHARE = 0.6;
/** Smallest group in which template text can be told apart from page text. */
export const MIN_TEMPLATE_GROUP = 3;
export const THIN_UNIQUE_WORDS = 100;
export const DUPLICATE_KILL = 0.9;

export interface ExistingPage { path: string; text: string }

export interface CheckOptions {
  /** Excerpts of pages already on the site (latest crawl), compared for duplication. */
  existing?: ExistingPage[];
  /** Search Console impressions per normalised query, or null when the site has no query data. */
  queryImpressions?: Map<string, number> | null;
}

const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'near', 'with', 'by', 'from', 'is', 'are', 'my', 'me', 'best', 'top', 'uk', 'how', 'what', 'where', 'do', 'i', 'it', 'or', 'vs']);
export const normQuery = (q: string) => words(q).join(' ');

/** Sum impressions per normalised query from Search Console page-and-query rows. */
export function queryImpressionMap(rows: { query: string; impressions: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = normQuery(r.query);
    if (k) m.set(k, (m.get(k) ?? 0) + (r.impressions || 0));
  }
  return m;
}

/**
 * Head terms: the words the batch's target queries have in common (the pattern, e.g. "walks"),
 * or every content word when the batch is too small to see a pattern.
 */
export function headTermsFor(query: string, allQueries: string[]): string[] {
  const ws = [...new Set(words(query))].filter((w) => !STOP.has(w) && w.length > 1);
  const qs = allQueries.map((q) => new Set(words(q))).filter((s) => s.size);
  if (qs.length >= MIN_TEMPLATE_GROUP) {
    const common = ws.filter((w) => qs.filter((s) => s.has(w)).length / qs.length > TEMPLATE_SHARE);
    if (common.length) return common;
  }
  return ws;
}

function demand(query: string, head: string[], map: Map<string, number> | null | undefined): { exact: number | null; head: number | null } {
  if (!map || !query.trim()) return { exact: null, head: null };
  const exact = map.get(normQuery(query)) ?? 0;
  let headSum = 0;
  if (head.length) {
    for (const [q, imp] of map) {
      const qw = new Set(q.split(' '));
      if (head.every((h) => qw.has(h))) headSum += imp;
    }
  }
  return { exact, head: headSum };
}

interface Prepared { words: string[]; display: string[]; shingles: string[]; set: Set<string>; lead: Set<string> }

function prepare(p: GatePageInput): Prepared {
  const display = p.body.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
  const ws = display.map((w) => w.toLowerCase());
  const shingles = shingleList(ws, SHINGLE);
  // The site crawl stores ~1,200 characters per page, so compare like with like.
  const leadWords = words(p.body.slice(0, 1200));
  return { words: ws, display, shingles, set: new Set(shingles), lead: new Set(shingleList(leadWords, SHINGLE)) };
}

/** Code checks for a batch. Template text is found per template group (falling back to the whole batch). */
export function computeChecks(pages: GatePageInput[], opts: CheckOptions = {}): CodeChecks[] {
  const prep = pages.map(prepare);

  // Template text: shingles on more than 60% of the pages in the same template.
  const groups = new Map<string, number[]>();
  pages.forEach((p, i) => groups.set(p.template, [...(groups.get(p.template) ?? []), i]));
  const templateSets = new Map<string, Set<string> | null>();
  const templateFrom = (idx: number[]): Set<string> | null => {
    if (idx.length < MIN_TEMPLATE_GROUP) return null;
    const df = new Map<string, number>();
    for (const i of idx) for (const s of prep[i].set) df.set(s, (df.get(s) ?? 0) + 1);
    const min = TEMPLATE_SHARE * idx.length;
    return new Set([...df].filter(([, n]) => n > min).map(([s]) => s));
  };
  const whole = templateFrom(pages.map((_p, i) => i));
  for (const [t, idx] of groups) templateSets.set(t, idx.length >= MIN_TEMPLATE_GROUP ? templateFrom(idx) : whole);

  // Duplicate titles and H1s within the batch.
  const count = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const titles = count(pages.map((p) => norm(p.title)));
  const h1s = count(pages.map((p) => norm(p.h1)));

  const existing = (opts.existing ?? []).map((e) => ({ path: e.path, set: new Set(shingleList(words(e.text), SHINGLE)) })).filter((e) => e.set.size >= 3);
  const allQueries = pages.map((p) => p.query).filter(Boolean);

  return pages.map((p, i) => {
    const pr = prep[i];
    const tpl = templateSets.get(p.template) ?? null;
    const covered = new Uint8Array(pr.words.length);
    if (tpl && tpl.size) {
      if (pr.words.length < SHINGLE) { if (pr.shingles.length && tpl.has(pr.shingles[0])) covered.fill(1); }
      else pr.shingles.forEach((s, k) => { if (tpl.has(s)) covered.fill(1, k, k + SHINGLE); });
    }
    let coveredN = 0;
    for (const c of covered) coveredN += c;
    const runs: string[] = [];
    let cur: string[] = [];
    pr.display.forEach((w, k) => {
      if (!covered[k]) cur.push(w);
      else if (cur.length) { runs.push(cur.join(' ')); cur = []; }
    });
    if (cur.length) runs.push(cur.join(' '));

    let dup = 0;
    let dupOf: string | null = null;
    let dupSource: 'batch' | 'site' | null = null;
    prep.forEach((o, j) => {
      if (j === i) return;
      const r = jaccard(pr.set, o.set);
      if (r > dup) { dup = r; dupOf = pages[j].path; dupSource = 'batch'; }
    });
    for (const e of existing) {
      if (e.path === p.path) continue;
      const r = jaccard(pr.lead, e.set);
      if (r > dup) { dup = r; dupOf = e.path; dupSource = 'site'; }
    }

    const head = p.query ? headTermsFor(p.query, allQueries) : [];
    const d = demand(p.query, head, opts.queryImpressions);
    const total = pr.words.length;
    return {
      wordCount: total,
      uniqueWords: total - coveredN,
      templateShare: tpl ? (total ? coveredN / total : 0) : -1,
      duplicateRatio: Math.round(dup * 1000) / 1000,
      duplicateOf: dupOf,
      duplicateSource: dupSource,
      placeholders: findPlaceholders(p.title, p.h1, p.meta, p.body),
      duplicateTitleWith: p.title ? (titles.get(norm(p.title)) ?? 1) - 1 : 0,
      duplicateH1With: p.h1 ? (h1s.get(norm(p.h1)) ?? 1) - 1 : 0,
      missingTitle: !p.title.trim(),
      missingH1: !p.h1.trim(),
      queryImpressions: d.exact,
      headImpressions: d.head,
      headTerms: head,
      uniqueExcerpt: runs.join(' … ').slice(0, 900),
    };
  });
}

const impBand = (n: number) => (n >= 1000 ? 'high, 1,000 or more' : n >= 100 ? 'medium, 100 to 999' : 'low, under 100');

/** Named bands for Jev. Numbers stay in code. */
export function toBands(c: CodeChecks, hasQuery: boolean, hasGsc: boolean): CheckBands {
  const u = c.uniqueWords;
  const ts = c.templateShare;
  const d = c.duplicateRatio;
  let demandBand: string;
  if (!hasQuery) demandBand = 'unknown (no target query given)';
  else if (!hasGsc) demandBand = 'unknown (the site has no Search Console query data)';
  else if ((c.queryImpressions ?? 0) > 0) demandBand = `query_has_impressions (${impBand(c.queryImpressions!)} impressions)`;
  else if ((c.headImpressions ?? 0) > 0) demandBand = `related_queries_have_impressions (queries containing the head terms have ${impBand(c.headImpressions!)} impressions; the exact query has none)`;
  else demandBand = 'not_seen_yet (the site has had no impressions for the query or its head terms; normal for a topic the site has not covered before, so weak evidence on its own)';
  return {
    unique_words: u < 30 ? 'almost_none (under 30 words unique to this page)' : u < THIN_UNIQUE_WORDS ? 'few (30 to 99 words unique to this page)' : u < 250 ? 'some (100 to 249 words unique to this page)' : 'substantial (250 or more words unique to this page)',
    template_share: ts < 0 ? 'unknown (too few pages to detect a template)' : ts < 0.3 ? 'mostly_unique (under 30% of the text is template text)' : ts < 0.6 ? 'mixed (30% to 60% template text)' : ts < 0.85 ? 'mostly_template (60% to 85% template text)' : 'almost_all_template (over 85% template text)',
    near_duplicate: d < 0.3 ? 'distinct (under 30% of phrasing shared with any other page)' : d < 0.6 ? 'overlapping (30% to 60% of phrasing shared with another page)' : d <= DUPLICATE_KILL ? 'near_duplicate (60% to 90% of phrasing shared with another page)' : 'duplicate (over 90% of phrasing shared with another page)',
    search_demand: demandBand,
    title_unique_in_batch: c.missingTitle ? 'missing' : c.duplicateTitleWith ? 'shared_with_other_pages_in_batch' : 'unique',
    h1_unique_in_batch: c.missingH1 ? 'missing' : c.duplicateH1With ? 'shared_with_other_pages_in_batch' : 'unique',
  };
}
