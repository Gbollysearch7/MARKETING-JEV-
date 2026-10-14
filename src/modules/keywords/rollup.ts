import type { Answers } from '../../engine/jev/types';
import { isChoice } from '../../engine/jev/confidence';
import type { BuyingStage, KeywordIntent } from '../../lib/modules/contracts';
import { INTENTS, NEW_PAGE, STAGES, type Candidate } from './battery';

/** One keyword after Jev: its intent, stage and chosen home, each with the probability of the chosen option. */
export interface ScoredKeyword {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  currentPath: string | null;
  position: number | null;
  intent: KeywordIntent | null;
  intentP: number | null;
  stage: BuyingStage | null;
  stageP: number | null;
  /** A page path, 'new_page', or null when there were no candidate pages. */
  page: string | null;
  pageP: number | null;
}

/** Turn the answers into typed fields. Unknown options are dropped, never guessed. */
export function readAnswers(answers: Answers, candidates: Candidate[]) {
  const a = answers.intent;
  const s = answers.stage;
  const pg = answers.page;
  const intent = isChoice(a) && (INTENTS as string[]).includes(a.choice) ? (a.choice as KeywordIntent) : null;
  const stage = isChoice(s) && (STAGES as string[]).includes(s.choice) ? (s.choice as BuyingStage) : null;
  let page: string | null = null;
  if (isChoice(pg)) page = pg.choice === NEW_PAGE ? NEW_PAGE : candidates.find((c) => c.key === pg.choice)?.path ?? null;
  const prob = (x: typeof a) => (isChoice(x) ? Math.round((x.probabilities[x.choice] ?? x.confidence) * 1000) / 1000 : null);
  return { intent, intentP: intent ? prob(a) : null, stage, stageP: stage ? prob(s) : null, page, pageP: page ? prob(pg) : null };
}

export const ROUTER = (p: number | null) => (p == null ? 'uncertain' : p >= 0.85 ? 'auto' : p >= 0.6 ? 'review' : 'uncertain');

function majority<T extends string>(values: (T | null)[], weights: number[]): T | null {
  const count = new Map<T, { n: number; w: number }>();
  values.forEach((v, i) => { if (v) { const c = count.get(v) ?? { n: 0, w: 0 }; c.n++; c.w += weights[i]; count.set(v, c); } });
  let best: T | null = null;
  let bc = { n: -1, w: -1 };
  for (const [v, c] of count) if (c.n > bc.n || (c.n === bc.n && c.w > bc.w) || (c.n === bc.n && c.w === bc.w && best != null && v < best)) { best = v; bc = c; }
  return best;
}

export interface ClusterRollup {
  intent: KeywordIntent | null;
  stage: BuyingStage | null;
  mappedPath: string | null;
  gap: boolean;
  alsoClaimedBy: string[];
  totalVolume: number;
  /** Per competing page, the cluster keywords that chose it or currently rank on it. */
  claims: { path: string; keywords: string[] }[];
}

/**
 * Cluster outputs, all in code: dominant intent and stage by majority (junk keywords only count when the
 * whole cluster is junk), the owning page by majority of page choices (gap when the majority is new_page),
 * and other pages chosen by two or more keywords or holding current rankings (cannibalisation).
 */
export function rollup(kws: ScoredKeyword[]): ClusterRollup {
  const totalVolume = kws.reduce((s, k) => s + (k.volume ?? 0), 0);
  const useful = kws.filter((k) => k.intent !== 'junk');
  const base = useful.length ? useful : kws;
  const w = base.map((k) => (k.volume ?? 0) + 1e-6);
  const intent = majority(base.map((k) => k.intent), w);
  const stage = majority(base.map((k) => k.stage), w);
  const choice = majority(base.map((k) => k.page), w);
  const gap = choice === NEW_PAGE || (choice == null && base.length > 0 && base.every((k) => k.page == null));
  const mappedPath = choice && choice !== NEW_PAGE ? choice : null;
  const claims = new Map<string, Set<string>>();
  const chosen = new Map<string, number>();
  for (const k of base) if (k.page && k.page !== NEW_PAGE) chosen.set(k.page, (chosen.get(k.page) ?? 0) + 1);
  for (const k of base) {
    if (k.page && k.page !== NEW_PAGE && k.page !== mappedPath && (chosen.get(k.page) ?? 0) >= 2) (claims.get(k.page) ?? claims.set(k.page, new Set()).get(k.page)!).add(k.keyword);
    if (k.currentPath && k.currentPath !== mappedPath && (k.position == null || k.position <= 20)) (claims.get(k.currentPath) ?? claims.set(k.currentPath, new Set()).get(k.currentPath)!).add(k.keyword);
  }
  const list = [...claims.entries()].map(([path, set]) => ({ path, keywords: [...set] })).sort((a, b) => b.keywords.length - a.keywords.length || a.path.localeCompare(b.path));
  return { intent, stage, mappedPath, gap, alsoClaimedBy: list.map((c) => c.path), totalVolume, claims: list };
}

/** Cannibalised: a mapped cluster that other pages also claim, or a gap cluster split across two or more pages. */
export const isCannibalised = (r: Pick<ClusterRollup, 'gap' | 'alsoClaimedBy'>) => r.alsoClaimedBy.length >= (r.gap ? 2 : 1);

/**
 * Stable identity across runs. Each new group takes the id of the previous cluster that held at least half of
 * its previously seen keywords (several groups may land on the same id, which keeps earlier merges intact).
 * Groups with no such cluster get null and are named fresh.
 */
export function matchPrevious(groups: string[][], previous: Map<string, string>): (string | null)[] {
  return groups.map((g) => {
    const counts = new Map<string, number>();
    let seen = 0;
    for (const k of g) { const id = previous.get(k); if (id) { seen++; counts.set(id, (counts.get(id) ?? 0) + 1); } }
    let best: string | null = null;
    let n = 0;
    for (const [id, c] of counts) if (c > n || (c === n && best != null && id < best)) { best = id; n = c; }
    return best && n * 2 >= seen ? best : null;
  });
}
