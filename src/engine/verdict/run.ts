import { createHash } from 'node:crypto';
import type { DecisionProvider } from '../jev/client';
import { confidenceOf, isChoice, isNoul } from '../jev/confidence';
import type { Answers } from '../jev/types';
import { buildQuestions, buildState, CRITERIA_VERSION, type Candidate } from './battery';
import { similarPages, tokens } from './candidates';
import { findCannibalPairs, percentile } from './context';
import { settleEvidence } from './evidence';
import { impactRange } from './impact';
import { applyRules } from './rules';
import { computeSignals, toBands, type Bands, type Signals } from './signals';
import { IRREVERSIBLE, type CannibalPair, type ImpactRange, type Router, type SiteContext, type UrlData, type Verdict } from './types';

export interface VerdictRecord {
  path: string;
  template: string;
  skipped: string | null;
  verdict: Verdict | null;
  /** Probability of the chosen verdict, the number the router and calibration use. */
  probability: number;
  probabilities: Partial<Record<Verdict, number>>;
  router: Router | null;
  needsApproval: boolean;
  lockedBy: string | null;
  target: string | null;
  targetProbability: number | null;
  reasons: string[];
  rulesApplied: string[];
  settle: string[];
  impact: ImpactRange;
  monthlyClicks: number;
  monthlyImpressions: number;
  position: number | null;
  bands: Bands | null;
  state: unknown;
  answers: Answers | null;
  model: string;
  latencyMs: number;
  inputTokens: number;
}

export interface DecisionLogEntry {
  path: string;
  questionKey: string;
  answer: unknown;
  confidence: number;
  model: string;
  latencyMs: number;
  stateHash: string;
  criteriaVersion: string;
}

export interface RunOptions {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  onDecisions?: (entries: DecisionLogEntry[]) => void;
}

export interface RunResult { verdicts: VerdictRecord[]; pairs: CannibalPair[]; inputTokens: number }

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

/** Routes on the probability as shown (two decimals), so a displayed 0.85 is always Auto. */
function routerFor(raw: number, ctx: SiteContext): Router {
  const p = Math.round(raw * 100) / 100;
  return p >= ctx.thresholds.auto ? 'auto' : p >= ctx.thresholds.review ? 'review' : 'uncertain';
}

function reasonsFor(v: Verdict, s: Signals, b: Bands, a: Answers | null, target: string | null, targetP: number | null): string[] {
  const out: string[] = [];
  const noul = (k: string) => (a && isNoul(a[k]) ? a[k].noul : null);
  const ts = noul('time_sensitive');
  const tm = noul('title_matches_queries');
  switch (v) {
    case 'refresh':
      if (s.clickChangePct != null && s.clickChangePct < -0.15) out.push(`Clicks down ${pct(s.clickChangePct)} on the previous period`);
      if (b.position_change.startsWith('dropped') && s.prevPosition && s.position) out.push(`Position fell from ${s.prevPosition.toFixed(1)} to ${s.position.toFixed(1)}`);
      if (b.content_age === 'over_12_months') out.push('Content last updated over 12 months ago');
      if (ts != null && ts >= 0.6) out.push(`Contains claims that go out of date (${r3(ts)})`);
      break;
    case 'expand':
      if (s.highVolumeQueries8to20) out.push(`Ranks 8 to 20 for ${s.highVolumeQueries8to20} high-volume ${s.highVolumeQueries8to20 === 1 ? 'query' : 'queries'}`);
      if (s.position) out.push(`Average position ${s.position.toFixed(1)}`);
      if (b.word_count.includes('thin')) out.push(`Thin content (${s.wordCount} words)`);
      break;
    case 'merge': {
      const c = s.competing[0];
      if (c) out.push(`Shares ${c.shared} top-20 queries with ${c.path}${c.stronger ? ', which earns more clicks' : ''}`);
      if (target) out.push(`Best home: ${target}${targetP != null ? ` (${r3(targetP)})` : ''}`);
      break;
    }
    case 'redirect':
      out.push(s.monthlyClicks < 1 ? 'No clicks in the period' : `Only ${Math.round(s.monthlyClicks)} clicks a month`);
      if (s.referringDomains) out.push(`${s.referringDomains} referring ${s.referringDomains === 1 ? 'domain' : 'domains'} worth keeping`);
      if (target) out.push(`Closest match: ${target}${targetP != null ? ` (${r3(targetP)})` : ''}`);
      break;
    case 'prune':
      out.push(s.monthlyClicks < 1 ? 'No clicks in the period' : `Only ${Math.round(s.monthlyClicks)} clicks a month`);
      if (s.referringDomains === 0) out.push('No referring domains');
      if (s.conversions === 0) out.push('No conversions');
      if (b.word_count.includes('thin')) out.push(`Thin content (${s.wordCount} words)`);
      break;
    case 'leave':
      if (s.clickChangePct != null && s.clickChangePct >= -0.15) out.push(s.clickChangePct > 0.15 ? `Clicks up ${pct(s.clickChangePct)}` : 'Clicks stable');
      if (b.ctr_vs_expected.startsWith('in_line') || b.ctr_vs_expected.startsWith('above')) out.push(`CTR ${b.ctr_vs_expected.split(' ')[0].replace('_', ' ')} for its position`);
      if (s.position && s.position <= 3) out.push(`Ranks in the top 3 (${s.position.toFixed(1)})`);
      if (b.content_age === 'under_30_days' || b.content_age === '1_to_6_months') out.push('Recently updated');
      break;
  }
  if (tm != null && tm < 0.35 && v !== 'prune' && v !== 'redirect') out.push(`Title does not match its top queries (${r3(tm)})`);
  if (!out.length) out.push('Signals are mixed; see the probabilities');
  return out.slice(0, 4);
}

export async function runVerdicts(urls: UrlData[], ctx: SiteContext, provider: DecisionProvider, opts: RunOptions = {}): Promise<RunResult> {
  // Which URLs are scoreable, so cannibalisation only pairs live pages.
  const live = new Set(urls.filter((u) => !u.crawl || (u.crawl.status < 300 && u.crawl.indexable && (!u.crawl.canonicalPath || u.crawl.canonicalPath === u.path))).map((u) => u.path));
  const allQueries = urls.flatMap((u) => u.queries);
  ctx.highVolumeImpressions = allQueries.length ? Math.max(10, percentile(allQueries.map((q) => q.impressions), 0.75)) : Infinity;
  const pairs = ctx.hasQueries ? findCannibalPairs(allQueries, ctx.thresholds, live) : [];
  const clicksByPath = new Map(urls.map((u) => [u.path, u.gsc?.clicks ?? 0]));
  const titleByPath = new Map(urls.map((u) => [u.path, u.crawl?.title || u.crawl?.h1 || '']));
  const monthly = (p: string) => (clicksByPath.get(p) ?? 0) * (30 / Math.max(1, ctx.periodDays));

  const docs = new Map<string, Set<string>>();
  for (const u of urls) if (live.has(u.path)) docs.set(u.path, tokens(u.crawl?.title, u.crawl?.h1, u.path.replace(/[/-]/g, ' '), ...u.queries.slice(0, 10).map((q) => q.query)));
  const neighbours = similarPages(docs, 6);

  let done = 0;
  let inputTokens = 0;
  const results: VerdictRecord[] = new Array(urls.length);
  let next = 0;

  const one = async (u: UrlData): Promise<VerdictRecord> => {
    const s = computeSignals(u, ctx, pairs, clicksByPath);
    const bands = toBands(s, ctx);
    const base = {
      path: u.path, template: s.template, monthlyClicks: s.monthlyClicks, monthlyImpressions: s.monthlyImpressions, position: s.position,
      bands, settle: [] as string[], target: null as string | null, targetProbability: null as number | null, lockedBy: null as string | null,
    };

    // Candidate destinations: competing pages first, then topical neighbours that earn more clicks.
    const candPaths: string[] = [];
    for (const c of s.competing) if (!candPaths.includes(c.path)) candPaths.push(c.path);
    for (const n of neighbours.get(u.path) ?? []) if (!candPaths.includes(n.path) && candPaths.length < 6) candPaths.push(n.path);
    const candidates: Candidate[] = candPaths.slice(0, 6).map((p, i) => ({ key: `c${i + 1}`, path: p, title: titleByPath.get(p) ?? '' }));

    const rules = applyRules(u, s, ctx.thresholds, candidates.length > 0);
    if (rules.skip) {
      return { ...base, skipped: rules.skip, verdict: null, probability: 0, probabilities: {}, router: null, needsApproval: false, reasons: [rules.skip], rulesApplied: [], impact: { low: 0, high: 0 }, state: null, answers: null, model: 'rules', latencyMs: 0, inputTokens: 0 };
    }
    if (rules.locked) {
      return { ...base, skipped: null, verdict: rules.locked.verdict, probability: 1, probabilities: { [rules.locked.verdict]: 1 }, router: 'auto', needsApproval: false, lockedBy: rules.locked.reason, reasons: [rules.locked.reason], rulesApplied: rules.applied, impact: { low: 0, high: 0 }, state: null, answers: null, model: 'rules', latencyMs: 0, inputTokens: 0 };
    }

    const state = buildState(u, s, bands, titleByPath, candidates);
    const questions = buildQuestions(rules.allowed, candidates, s.topQueries.length > 0, Boolean(u.crawl?.excerpt));
    const res = await provider.decide({ state, questions });
    inputTokens += res.usage?.input_tokens ?? 0;
    const stateHash = createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
    opts.onDecisions?.(Object.entries(res.answers).map(([k, a]) => ({
      path: u.path, questionKey: k, answer: a, confidence: r3(confidenceOf(a)), model: res.model, latencyMs: res.latencyMs, stateHash, criteriaVersion: CRITERIA_VERSION,
    })));

    const va = res.answers.verdict;
    if (!isChoice(va)) throw new Error(`No verdict answer for ${u.path}`);
    const verdict = va.choice as Verdict;
    const probability = r3(va.probabilities[verdict] ?? 0);
    const router = routerFor(probability, ctx);

    let target: string | null = null;
    let targetProbability: number | null = null;
    const ta = res.answers.target;
    if ((verdict === 'merge' || verdict === 'redirect') && isChoice(ta) && ta.choice !== 'none') {
      target = candidates.find((c) => c.key === ta.choice)?.path ?? null;
      targetProbability = r3(ta.probabilities[ta.choice] ?? 0);
    }
    const ranked = Object.entries(va.probabilities).sort((a, b) => b[1] - a[1]).map(([k]) => k as Verdict);
    return {
      ...base,
      skipped: null,
      verdict,
      probability,
      probabilities: va.probabilities as Partial<Record<Verdict, number>>,
      router,
      needsApproval: IRREVERSIBLE.includes(verdict) || router !== 'auto' || ((verdict === 'merge' || verdict === 'redirect') && !target),
      target,
      targetProbability,
      reasons: reasonsFor(verdict, s, bands, res.answers, target, targetProbability),
      rulesApplied: rules.applied,
      settle: router === 'uncertain' ? settleEvidence(ranked.slice(0, 2), bands, ctx) : [],
      impact: impactRange(verdict, s, ctx.ctrCurve, target ? monthly(target) : 0),
      state,
      answers: res.answers,
      model: res.model,
      latencyMs: res.latencyMs,
      inputTokens: res.usage?.input_tokens ?? 0,
    };
  };

  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      results[i] = await one(urls[i]);
      done++;
      opts.onProgress?.(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 8 }, worker));
  return { verdicts: results, pairs, inputTokens };
}
