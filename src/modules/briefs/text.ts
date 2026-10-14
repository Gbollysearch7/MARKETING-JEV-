import type { TargetKeyword } from './types';

/** Keyword handling for the brief desk: tokens, modifiers, question detection, head terms, grouping and parsing. */

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'my', 'your', 'i', 'do', 'does', 'can', 'it', 'at', 'by', 'from', 'vs', 'versus']);

export const normKw = (s: string) => s.toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();

export function tokens(s: string): string[] {
  return normKw(s).split(/[^a-z0-9£]+/).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);
}

/** A light plural fold so "poles" matches "pole" and "boots" matches "boot". */
export function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

const QUESTION_START = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will|could)\b/;
export const isQuestion = (kw: string) => QUESTION_START.test(normKw(kw));

/** Modifier categories, each with the phrases that signal it. Order matters for head-term stripping (longest first). */
export const MODIFIERS: { key: string; label: string; re: RegExp }[] = [
  { key: 'choose', label: 'choosing', re: /\bhow to (choose|pick|buy)\b|\bbuying guide\b|\bwhat to look for\b/ },
  { key: 'howto', label: 'how-to', re: /\bhow (to|do)\b|\bsteps?\b|\bset ?up\b|\btutorial\b/ },
  { key: 'whatis', label: 'definition', re: /\bwhat (is|are)\b|\bmeaning\b|\bexplained\b/ },
  { key: 'beginner', label: 'beginners', re: /\b(for )?beginners?\b|\bfirst[- ]time(rs?)?\b|\bnovices?\b|\bstarter\b|\blearn\b/ },
  { key: 'uk', label: 'UK', re: /\buk\b|\bbritain\b|\bbritish\b|\bengland\b|\bscotland\b|\bwales\b|\blake district\b|\bsnowdonia\b/ },
  { key: 'near', label: 'near me', re: /\bnear me\b|\bnearby\b/ },
  { key: 'vs', label: 'comparison', re: /\bvs\.?\b|\bversus\b|\bcompare(d)?\b|\bcomparison\b|\balternatives?\b|\bdifference between\b/ },
  { key: 'best', label: 'best-of', re: /\bbest\b|\btop( \d+)?\b|\brated\b/ },
  { key: 'review', label: 'reviews', re: /\breviews?\b|\btested\b/ },
  { key: 'price', label: 'price', re: /\bcheap(est)?\b|\bbudget\b|\baffordable\b|\bunder £?\d+\b|\bprice\b|\bcost\b|\bsale\b|\bdeals?\b|\bdiscount\b|\bvalue\b/ },
  { key: 'buy', label: 'buying', re: /\bbuy\b|\bshop\b|\bfor sale\b|\bonline\b/ },
  { key: 'checklist', label: 'checklist', re: /\bchecklist\b|\bkit list\b|\bpacking list\b|\bwhat to (wear|pack|bring|take)\b|\bessentials\b/ },
  { key: 'tool', label: 'tool', re: /\bcalculator\b|\bsize chart\b|\bsizing\b|\bplanner\b|\bconverter\b|\bfinder\b/ },
  { key: 'template', label: 'template', re: /\btemplate\b|\bprintable\b|\bpdf\b/ },
  { key: 'family', label: 'families', re: /\bkids?\b|\bchildren\b|\bfamil(y|ies)\b/ },
  { key: 'women', label: 'women', re: /\bwomen'?s?\b|\bladies\b/ },
  { key: 'guide', label: 'guide', re: /\bguides?\b|\btips\b|\badvice\b/ },
  { key: 'year', label: 'year', re: /\b20[2-3]\d\b/ },
];

export function modifiersOf(kw: string): string[] {
  const k = normKw(kw);
  return MODIFIERS.filter((m) => m.re.test(k)).map((m) => m.key);
}

/** Every modifier present across a set of keywords. */
export function modifierSet(kws: string[]): Set<string> {
  const s = new Set<string>();
  for (const k of kws) for (const m of modifiersOf(k)) s.add(m);
  if (kws.some(isQuestion)) s.add('question');
  return s;
}

/** The head term: the keyword with modifiers, question words and stopwords removed ("best walking poles uk" -> "walking poles"). */
/** Verbs a question asks about doing to the topic ("how to store a harness"); stripped from question keywords only. */
const QUESTION_VERBS = /^(store|storing|clean|cleaning|wash|washing|fix|repair|reproof|reproofing|dry|drying|pack|packing|fit|fitting|measure|maintain|sharpen|pitch|tie|adjust|wear|last|worth|size|break|lace|care|look|after|take|carry|set|up|put|wax|patch|keep|warm|work|works|it|they|them|you|really|actually|best|legal|allowed|safe|dangerous|hard|difficult|easy|free|necessary)$/;

export function headTerm(kw: string): string {
  let k = normKw(kw);
  const question = isQuestion(k);
  for (const m of MODIFIERS) k = k.replace(new RegExp(m.re.source, 'g'), ' ');
  k = k.replace(QUESTION_START, ' ');
  const words = k.split(/[^a-z0-9£-]+/).filter((w) => w && !STOP.has(w) && !/^(choose|use|get|make|pick|need|much|many|long|good|go)$/.test(w) && !(question && QUESTION_VERBS.test(w)));
  return words.join(' ').trim();
}

const UTILITY = /^(about|contact|cookie|cookies|cookie-policy|privacy|privacy-policy|terms|basket|cart|checkout|login|account|search|home|blog|news)$/;

export interface QueryRow { query: string; path: string; impressions: number; clicks: number; position: number }

/** Per-query totals across pages: monthly impressions, impression-weighted position, and the page with most impressions. */
export function queryIndex(rows: QueryRow[], periodDays: number): Map<string, TargetKeyword & { impressions: number; clicks: number }> {
  const agg = new Map<string, { imp: number; clicks: number; posImp: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const q = normKw(r.query);
    if (!q) continue;
    const a = agg.get(q) ?? { imp: 0, clicks: 0, posImp: 0, pages: new Map<string, number>() };
    a.imp += r.impressions;
    a.clicks += r.clicks;
    a.posImp += r.position * Math.max(1, r.impressions);
    a.pages.set(r.path, (a.pages.get(r.path) ?? 0) + r.impressions);
    agg.set(q, a);
  }
  const scale = 30 / Math.max(1, periodDays);
  const out = new Map<string, TargetKeyword & { impressions: number; clicks: number }>();
  for (const [q, a] of agg) {
    const weight = [...a.pages.values()].reduce((s, v) => s + Math.max(1, v), 0);
    const top = [...a.pages.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    out.set(q, { keyword: q, volume: Math.round(a.imp * scale), position: Math.round((a.posImp / Math.max(1, weight)) * 10) / 10, path: top, impressions: Math.round(a.imp * scale), clicks: Math.round(a.clicks * scale) });
  }
  return out;
}

/** Fill position and ranking page (and volume where missing) from Search Console. */
export function enrichKeywords(kws: TargetKeyword[], index: Map<string, TargetKeyword>, fillVolume: boolean): TargetKeyword[] {
  return kws.map((k) => {
    const hit = index.get(normKw(k.keyword));
    if (!hit) return { ...k, position: null, path: null };
    return { keyword: k.keyword, volume: k.volume ?? (fillVolume ? hit.volume : null), position: hit.position, path: hit.path };
  });
}

export interface ProposedTarget { primary: string; keywords: TargetKeyword[] }

/**
 * Group Search Console queries into targets by shared head term. The primary keyword is the query with most impressions.
 * Utility heads (about, contact, cookie policy …) are dropped. Largest groups by impressions first.
 */
export function groupQueries(index: Map<string, TargetKeyword>, limit = 25): ProposedTarget[] {
  const groups = new Map<string, TargetKeyword[]>();
  for (const k of index.values()) {
    const h = headTerm(k.keyword);
    if (!h || UTILITY.test(h) || h.length < 3) continue;
    const g = groups.get(h) ?? [];
    g.push(k);
    groups.set(h, g);
  }
  return [...groups.values()]
    .map((g) => g.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)))
    .sort((a, b) => b.reduce((s, k) => s + (k.volume ?? 0), 0) - a.reduce((s, k) => s + (k.volume ?? 0), 0))
    .slice(0, limit)
    .map((g) => ({ primary: g[0].keyword, keywords: g.slice(0, 20) }));
}

/** "keyword (1,200)" or "keyword, 1200" or "keyword\t1200" -> keyword plus optional volume. */
export function parseKeywordToken(raw: string): TargetKeyword | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(.*?)(?:\s*[(,\t]\s*([\d,. ]+)\s*\)?)?$/);
  const kw = normKw((m?.[1] ?? s).replace(/[()]/g, ''));
  if (!kw || kw.length > 120) return null;
  const v = m?.[2] ? Number(m[2].replace(/[ ,]/g, '')) : NaN;
  return { keyword: kw, volume: Number.isFinite(v) ? Math.round(v) : null, position: null, path: null };
}

/**
 * Parse pasted targets: one target per line, keywords separated by ";" or "|".
 * The first keyword is the primary. A volume can follow a keyword in brackets: "via ferrata uk (320)".
 */
export function parseTargets(text: string): ProposedTarget[] {
  const out: ProposedTarget[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const kws = line.split(/[;|]/).map(parseKeywordToken).filter((k): k is TargetKeyword => Boolean(k));
    if (!kws.length || seen.has(kws[0].keyword)) continue;
    seen.add(kws[0].keyword);
    const uniq = kws.filter((k, i) => kws.findIndex((x) => x.keyword === k.keyword) === i);
    out.push({ primary: uniq[0].keyword, keywords: uniq.slice(0, 30) });
  }
  return out;
}

const GENERIC = new Set(['best', 'guide', 'how', 'choose', 'review', 'cheap', 'uk', 'product', 'blog', 'top', 'new', 'sale', 'beginner', 'what', 'need', 'use', 'buy', 'shop', 'page', 'www', 'html', 'php']);

/** Topic tokens only: generic SEO modifiers are ignored so "best tent" and "best walking poles" do not match on "best". */
export const topicTokens = (s: string) => tokens(s).filter((t) => !GENERIC.has(t));

/** Token overlap between two texts, 0..1 (Jaccard on stemmed topic tokens). */
export function similarity(a: string, b: string): number {
  const x = new Set(topicTokens(a));
  const y = new Set(topicTokens(b));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

/** Sentence case for headings and titles, keeping "UK" and "I" upper case. */
export const proper = (s: string) => s.replace(/\buk\b/g, 'UK').replace(/\bi\b/g, 'I').replace(/\bgps\b/g, 'GPS');
export const sentence = (s: string) => {
  const t = proper(s);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};
