import { findCol, parseTable } from '../../engine/ingest/csv';
import type { BrandConfig, CitedUrl, Engine, ParsedAnswer, Position, SourceType, Span } from './types';

// ---------- names, domains and matching ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bare lowercase host: no scheme, no www., no path. "https://www.Example.com/x" -> "example.com". */
export function normDomain(input: string): string {
  let s = (input || '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#:]/)[0] ?? '';
  return s.replace(/\.$/, '');
}

/**
 * A case-insensitive matcher for a name or domain with word boundaries that also work for names
 * starting or ending in punctuation ("Cairn & Crag", "sample-outdoors.example").
 */
export function termRegex(term: string): RegExp | null {
  const t = term.trim();
  if (t.length < 2) return null;
  const body = escapeRe(t).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

/** All terms that count as a mention of the brand: name, aliases and the domain (with or without www.). */
export function brandTerms(b: Pick<BrandConfig, 'name' | 'aliases' | 'domain'>): string[] {
  const d = normDomain(b.domain);
  return uniq([b.name, ...b.aliases, d].map((s) => s.trim()).filter((s) => s.length >= 2));
}

export function competitorTerms(c: { name: string; domain: string }): string[] {
  return uniq([c.name, normDomain(c.domain)].map((s) => s.trim()).filter((s) => s.length >= 2));
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Every match of any term, as spans. */
function matches(text: string, terms: string[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const t of terms) {
    const re = termRegex(t);
    if (!re) continue;
    for (const m of text.matchAll(re)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------- cited URLs and source types ----------

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]}]+/gi;

/** URLs written in the answer text plus any provided list (space, comma, semicolon, pipe or newline separated). */
export function extractUrls(text: string, provided: string[] = []): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(URL_RE)) found.push(m[0]);
  for (const p of provided) {
    for (const part of p.split(/[\s,;|]+/)) {
      const s = part.trim();
      if (!s) continue;
      if (/^https?:\/\//i.test(s)) found.push(s);
      else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) found.push(`https://${s}`);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const u = raw.replace(/[.,;:!?]+$/, '');
    const key = u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

const hostIs = (host: string, d: string) => host === d || host.endsWith(`.${d}`);

const REVIEW_HOSTS = ['trustpilot.com', 'which.co.uk', 'outdoorgearlab.com', 'switchbacktravel.com', 'g2.com', 'capterra.com', 'tripadvisor.com', 'tripadvisor.co.uk', 'rtings.com', 'consumerreports.org', 'reviews.io', 'feefo.com', 'techradar.com', 'tomsguide.com', 'gearjunkie.com', 'outdoorsmagic.com', 'treelinereview.com', 'cleverhiker.com'];
const FORUM_HOSTS = ['reddit.com', 'redd.it', 'quora.com', 'stackexchange.com', 'stackoverflow.com', 'ukhillwalking.com', 'mumsnet.com', 'news.ycombinator.com', 'discord.com', 'facebook.com/groups'];
const NEWS_HOSTS = ['bbc.co.uk', 'bbc.com', 'theguardian.com', 'telegraph.co.uk', 'independent.co.uk', 'nytimes.com', 'reuters.com', 'apnews.com', 'cnn.com', 'forbes.com', 'businessinsider.com', 'ft.com', 'wsj.com', 'thetimes.co.uk', 'dailymail.co.uk', 'standard.co.uk', 'washingtonpost.com', 'bloomberg.com'];
const DIRECTORY_HOSTS = ['yelp.com', 'yelp.co.uk', 'yell.com', 'wikipedia.org', 'wikidata.org', 'crunchbase.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'yellowpages.com', 'bbb.org', 'companieshouse.gov.uk', 'find-and-update.company-information.service.gov.uk', 'maps.google.com', 'thomsonlocal.com', 'scoot.co.uk'];
const MARKETPLACE_HOSTS = ['amazon.com', 'amazon.co.uk', 'ebay.com', 'ebay.co.uk', 'etsy.com', 'walmart.com', 'argos.co.uk', 'johnlewis.com'];

/**
 * Source type of a cited URL by domain pattern. The brand's and competitors' own sites are vendor pages.
 * Unknown domains fall back to name hints ("review", "forum", "news", "directory", "shop"), else other.
 */
export function classifySource(url: string, brandDomain: string, competitorDomains: string[]): SourceType {
  const host = normDomain(url);
  const lower = url.toLowerCase();
  if (!host) return 'other';
  const own = [normDomain(brandDomain), ...competitorDomains.map(normDomain)].filter(Boolean);
  if (own.some((d) => hostIs(host, d))) return 'vendor';
  if (/nytimes\.com\/wirecutter/.test(lower)) return 'review_site';
  if (FORUM_HOSTS.some((d) => d.includes('/') ? lower.includes(d) : hostIs(host, d))) return 'forum';
  if (REVIEW_HOSTS.some((d) => hostIs(host, d))) return 'review_site';
  if (NEWS_HOSTS.some((d) => hostIs(host, d))) return 'news';
  if (DIRECTORY_HOSTS.some((d) => hostIs(host, d))) return 'directory';
  if (MARKETPLACE_HOSTS.some((d) => hostIs(host, d))) return 'vendor';
  if (/(^|[.-])(forums?|community|communities|discuss|boards?)([.-]|$)/.test(host)) return 'forum';
  if (/reviews?|ratings?|tested|gearlab|compare|versus/.test(host)) return 'review_site';
  if (/(^|[.-])(news|times|herald|gazette|post|journal|daily|tribune|chronicle)([.-]|$)/.test(host)) return 'news';
  if (/director(y|ies)|listings?|yellow|localguide|finder/.test(host)) return 'directory';
  if (/(^|[.-])(shop|store|outfitters?|supply|supplies|gear|direct)([.-]|$)/.test(host)) return 'vendor';
  return 'other';
}

// ---------- one answer ----------

/** Brand mention, position, citations and competitor mentions for one answer. Pure and deterministic. */
export function analyseAnswer(answer: string, providedUrls: string[], brand: BrandConfig): ParsedAnswer {
  const text = answer ?? '';
  const brandHits = matches(text, brandTerms(brand));
  const firstIndex = brandHits.length ? brandHits[0].start : null;
  const compFirst: { name: string; at: number }[] = [];
  for (const c of brand.competitors) {
    const hits = matches(text, competitorTerms(c));
    if (hits.length) compFirst.push({ name: c.name, at: hits[0].start });
  }
  compFirst.sort((a, b) => a.at - b.at);
  const position = positionOf(firstIndex, text.length, compFirst[0]?.at ?? null);
  const compDomains = brand.competitors.map((c) => c.domain).filter(Boolean);
  const cited: CitedUrl[] = extractUrls(text, providedUrls).map((url) => ({ url, host: normDomain(url), type: classifySource(url, brand.domain, compDomains) }));
  const bd = normDomain(brand.domain);
  const brandCited = Boolean(bd) && cited.some((c) => hostIs(c.host, bd));
  return { mentioned: firstIndex != null, firstIndex, position, cited, brandCited, competitors: compFirst.map((c) => c.name) };
}

/**
 * Position by character index: "first" when the brand is named before any competitor, "early" when its
 * first mention falls in the first third of the answer, otherwise "late".
 */
export function positionOf(firstIndex: number | null, length: number, firstCompetitorAt: number | null): Position {
  if (firstIndex == null) return 'absent';
  if (firstCompetitorAt == null || firstIndex < firstCompetitorAt) return 'first';
  return firstIndex < Math.max(1, length) / 3 ? 'early' : 'late';
}

/** Non-overlapping highlight spans for brand and competitor mentions, in order. */
export function highlightSpans(answer: string, brand: BrandConfig): Span[] {
  const all: Span[] = [];
  for (const m of matches(answer, brandTerms(brand))) all.push({ ...m, kind: 'brand', label: brand.name });
  for (const c of brand.competitors) for (const m of matches(answer, competitorTerms(c))) all.push({ ...m, kind: 'competitor', label: c.name });
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  let last = -1;
  for (const s of all) if (s.start >= last) { out.push(s); last = s.end; }
  return out;
}

/** Split text into plain and highlighted segments. Rendered as text nodes, so answers can never inject HTML. */
export function segment(answer: string, spans: Span[]): { text: string; span?: Span }[] {
  const out: { text: string; span?: Span }[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) out.push({ text: answer.slice(at, s.start) });
    out.push({ text: answer.slice(s.start, s.end), span: s });
    at = s.end;
  }
  if (at < answer.length) out.push({ text: answer.slice(at) });
  return out;
}

/** A window of the answer around the first brand mention, for the sentiment question. */
export function mentionExcerpt(answer: string, firstIndex: number | null, radius = 450): string {
  if (firstIndex == null) return answer.slice(0, radius * 2);
  const start = Math.max(0, firstIndex - radius);
  const end = Math.min(answer.length, firstIndex + radius);
  return `${start > 0 ? '…' : ''}${answer.slice(start, end)}${end < answer.length ? '…' : ''}`;
}

// ---------- CSV import ----------

export interface ImportedAnswer { prompt: string; engine: Engine; answer: string; citedUrls: string[]; runDate: string; runIndex: number | null }

const ENGINE_ALIASES: [RegExp, Engine][] = [
  [/^(google )?(ai[\s_-]*overviews?|aio|sge|ai[\s_-]*mode)\b/, 'ai_overviews'],
  [/^(chat\s*gpt|openai|gpt|o\d)(\b|[-\d])/, 'chatgpt'],
  [/^(claude|anthropic)\b/, 'claude'],
  [/^(perplexity|pplx|sonar)\b/, 'perplexity'],
  [/^(google )?(gemini|bard)\b/, 'gemini'],
];

export function normEngine(v: string): Engine {
  const s = (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [re, e] of ENGINE_ALIASES) if (re.test(s)) return e;
  return 'other';
}

/** YYYY-MM-DD from "2026-10-06", "2026-10-06T09:00Z", "06/10/2026" (UK order) or "6 Oct 2026". */
export function normDate(v: string): string | null {
  const s = (v || '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  const t = Date.parse(s);
  if (Number.isFinite(t)) { const d = new Date(t); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const MAX_IMPORT_ROWS = 20_000;

/**
 * Parse captured answers. Columns (any order, common aliases accepted): prompt, engine, answer,
 * cited URLs (optional), run date (optional, defaults to `today`), run (optional run number).
 */
export function parseAnswersCsv(text: string, today: string): { rows: ImportedAnswer[]; notes: string[] } {
  const { headers, rows } = parseTable(text, ['prompt', 'answer', 'answer text', 'response']);
  const cPrompt = findCol(headers, ['prompt', 'query', 'question']);
  const cEngine = findCol(headers, ['engine', 'platform', 'model', 'assistant']);
  const cAnswer = findCol(headers, ['answer text', 'answer', 'response', 'output', 'text']);
  const cCited = findCol(headers, ['cited urls', 'citations', 'cited', 'sources', 'urls', 'links']);
  const cDate = findCol(headers, ['run date', 'date', 'captured at', 'captured', 'run at']);
  const cRun = findCol(headers, ['run', 'run index', 'run number', 'attempt']);
  if (!cPrompt || !cAnswer) throw new Error('The file needs a "prompt" column and an "answer" column.');
  const notes: string[] = [];
  const out: ImportedAnswer[] = [];
  let skipped = 0;
  let badDates = 0;
  let unknownEngines = 0;
  for (const r of rows) {
    if (out.length >= MAX_IMPORT_ROWS) { notes.push(`Only the first ${MAX_IMPORT_ROWS.toLocaleString('en-GB')} rows were imported.`); break; }
    const prompt = (r[cPrompt] ?? '').trim().replace(/\s+/g, ' ');
    const answer = (r[cAnswer] ?? '').trim();
    if (!prompt || !answer) { skipped++; continue; }
    const engineRaw = cEngine ? r[cEngine] ?? '' : '';
    const engine = normEngine(engineRaw);
    if (engine === 'other' && engineRaw.trim()) unknownEngines++;
    const d = cDate ? normDate(r[cDate] ?? '') : null;
    if (cDate && (r[cDate] ?? '').trim() && !d) badDates++;
    const run = cRun ? Number.parseInt(r[cRun] ?? '', 10) : NaN;
    out.push({
      prompt: prompt.slice(0, 500),
      engine,
      answer: answer.slice(0, 40_000),
      citedUrls: cCited && r[cCited] ? [r[cCited]] : [],
      runDate: d ?? today,
      runIndex: Number.isFinite(run) && run > 0 ? run : null,
    });
  }
  if (skipped) notes.push(`${skipped} row${skipped === 1 ? '' : 's'} without a prompt or answer ${skipped === 1 ? 'was' : 'were'} skipped.`);
  if (unknownEngines) notes.push(`${unknownEngines} row${unknownEngines === 1 ? ' has' : 's have'} an engine name we did not recognise; filed under Other.`);
  if (badDates) notes.push(`${badDates} run date${badDates === 1 ? '' : 's'} could not be read; used today instead.`);
  if (!cDate) notes.push('No run date column; every answer was dated today.');
  if (!cEngine) notes.push('No engine column; every answer was filed under Other.');
  return { rows: out, notes };
}
