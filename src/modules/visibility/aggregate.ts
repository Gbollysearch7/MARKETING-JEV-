import type { Engine, SourceType } from './types';

/** The parsed facts about one stored answer that aggregation needs. */
export interface AnswerFacts {
  promptId: string;
  prompt: string;
  engine: Engine;
  runDate: string;
  mentioned: boolean;
  brandCited: boolean;
  competitors: string[];
  sourceTypes: SourceType[];
}

export interface Rates {
  /** Share of prompt x engine pairs mentioning the brand, each pair averaged over its runs. 0..1, null with no answers. */
  visibility: number | null;
  citation: number | null;
  /** Brand mentions / all brand + competitor mentions. */
  shareOfVoice: number | null;
  answers: number;
  prompts: number;
  /** Per entity: answers mentioning it and its share of voice. Brand first. */
  voices: { name: string; isBrand: boolean; mentions: number; share: number }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Average a yes/no fact over the runs of each prompt x engine x date, then across those groups. */
export function groupRate(answers: AnswerFacts[], pick: (a: AnswerFacts) => boolean): number | null {
  const groups = new Map<string, { yes: number; n: number }>();
  for (const a of answers) {
    const k = `${a.promptId}|${a.engine}|${a.runDate}`;
    const g = groups.get(k) ?? { yes: 0, n: 0 };
    g.n++;
    if (pick(a)) g.yes++;
    groups.set(k, g);
  }
  return mean([...groups.values()].map((g) => g.yes / g.n));
}

export function rates(answers: AnswerFacts[], brand: string, competitors: string[]): Rates {
  const brandMentions = answers.filter((a) => a.mentioned).length;
  const comp = competitors.map((c) => ({ name: c, mentions: answers.filter((a) => a.competitors.includes(c)).length }));
  const total = brandMentions + comp.reduce((s, c) => s + c.mentions, 0);
  const voices = [{ name: brand, isBrand: true, mentions: brandMentions }, ...comp.map((c) => ({ ...c, isBrand: false }))]
    .map((v) => ({ ...v, share: total ? v.mentions / total : 0 }));
  return {
    visibility: groupRate(answers, (a) => a.mentioned),
    citation: groupRate(answers, (a) => a.brandCited),
    shareOfVoice: total ? brandMentions / total : null,
    answers: answers.length,
    prompts: new Set(answers.map((a) => a.promptId)).size,
    voices,
  };
}

export function runDates(answers: AnswerFacts[]): string[] {
  return [...new Set(answers.map((a) => a.runDate))].sort();
}

export interface TrendPoint { date: string; visibility: number | null; citation: number | null; shareOfVoice: number | null; answers: number; byEngine: Partial<Record<Engine, number | null>> }

export function trend(answers: AnswerFacts[], brand: string, competitors: string[]): TrendPoint[] {
  return runDates(answers).map((date) => {
    const day = answers.filter((a) => a.runDate === date);
    const r = rates(day, brand, competitors);
    const byEngine: Partial<Record<Engine, number | null>> = {};
    for (const e of new Set(day.map((a) => a.engine))) byEngine[e] = groupRate(day.filter((a) => a.engine === e), (a) => a.mentioned);
    return { date, visibility: r.visibility, citation: r.citation, shareOfVoice: r.shareOfVoice, answers: day.length, byEngine };
  });
}

export interface EngineRow { engine: Engine; latest: Rates; previousVisibility: number | null }

/** Per-engine rates at the latest run date each engine has, with the visibility at its run date before. */
export function byEngine(all: AnswerFacts[], brand: string, competitors: string[], upTo?: string | null): EngineRow[] {
  const answers = upTo ? all.filter((a) => a.runDate <= upTo) : all;
  const engines = [...new Set(answers.map((a) => a.engine))];
  return engines.map((engine) => {
    const mine = answers.filter((a) => a.engine === engine);
    const dates = runDates(mine);
    const last = dates[dates.length - 1];
    const prev = dates[dates.length - 2];
    return {
      engine,
      latest: rates(mine.filter((a) => a.runDate === last), brand, competitors),
      previousVisibility: prev ? groupRate(mine.filter((a) => a.runDate === prev), (a) => a.mentioned) : null,
    };
  }).sort((a, b) => Number(a.engine === 'other') - Number(b.engine === 'other') || (b.latest.visibility ?? -1) - (a.latest.visibility ?? -1));
}

export interface ChangeAlert { from: string; to: string; before: number; after: number; points: number }

/** Visibility moved more than `threshold` points between the two most recent run dates. */
export function changeAlert(answers: AnswerFacts[], threshold = 10): ChangeAlert | null {
  const dates = runDates(answers);
  if (dates.length < 2) return null;
  const [from, to] = dates.slice(-2);
  const before = groupRate(answers.filter((a) => a.runDate === from), (a) => a.mentioned);
  const after = groupRate(answers.filter((a) => a.runDate === to), (a) => a.mentioned);
  if (before == null || after == null) return null;
  const points = Math.round((after - before) * 1000) / 10;
  return Math.abs(points) > threshold ? { from, to, before, after, points } : null;
}

export interface LostPrompt {
  promptId: string;
  prompt: string;
  runDate: string;
  lostOn: Engine[];
  wonOn: Engine[];
  /** Most-mentioned competitor in the losing answers, or null when none of the named competitors appears. */
  winner: string | null;
  competitorCounts: { name: string; answers: number }[];
  losingAnswers: number;
  sourceTypeCounts: Partial<Record<SourceType, number>>;
  brandCitedInLosing: number;
}

/**
 * Prompts the brand loses at the latest run date: on an engine, the brand is mentioned in fewer than
 * half of that prompt's runs. One entry per prompt, listing every engine it lost on.
 */
export function lostPrompts(answers: AnswerFacts[], at?: string | null): LostPrompt[] {
  const dates = runDates(answers);
  const last = at ?? dates[dates.length - 1];
  if (!last) return [];
  const latest = answers.filter((a) => a.runDate === last);
  const byPrompt = new Map<string, AnswerFacts[]>();
  for (const a of latest) byPrompt.set(a.promptId, [...(byPrompt.get(a.promptId) ?? []), a]);
  const out: LostPrompt[] = [];
  for (const [promptId, list] of byPrompt) {
    const lostOn: Engine[] = [];
    const wonOn: Engine[] = [];
    for (const e of new Set(list.map((a) => a.engine))) {
      const runs = list.filter((a) => a.engine === e);
      (runs.filter((a) => a.mentioned).length / runs.length < 0.5 ? lostOn : wonOn).push(e);
    }
    if (!lostOn.length) continue;
    const losing = list.filter((a) => lostOn.includes(a.engine));
    const counts = new Map<string, number>();
    for (const a of losing) for (const c of a.competitors) counts.set(c, (counts.get(c) ?? 0) + 1);
    const competitorCounts = [...counts.entries()].map(([name, n]) => ({ name, answers: n })).sort((a, b) => b.answers - a.answers);
    const sourceTypeCounts: Partial<Record<SourceType, number>> = {};
    for (const a of losing) for (const t of a.sourceTypes) sourceTypeCounts[t] = (sourceTypeCounts[t] ?? 0) + 1;
    out.push({
      promptId, prompt: list[0].prompt, runDate: last, lostOn, wonOn,
      winner: competitorCounts[0]?.name ?? null, competitorCounts, losingAnswers: losing.length, sourceTypeCounts,
      brandCitedInLosing: losing.filter((a) => a.brandCited).length,
    });
  }
  return out.sort((a, b) => b.lostOn.length - a.lostOn.length || a.prompt.localeCompare(b.prompt));
}

/** Visibility of one prompt on the first run date at least `days` after `doneAt`, for the outcome loop. */
export function visibilityAfter(answers: AnswerFacts[], promptId: string, doneAt: string, days = 30): { date: string; visibility: number } | null {
  const cutoff = new Date(Date.parse(doneAt.slice(0, 10)) + days * 86_400_000).toISOString().slice(0, 10);
  const mine = answers.filter((a) => a.promptId === promptId && a.runDate >= cutoff);
  const date = runDates(mine)[0];
  if (!date) return null;
  const v = groupRate(mine.filter((a) => a.runDate === date), (a) => a.mentioned);
  return v == null ? null : { date, visibility: v };
}

// ---------- weekly periods ----------

/**
 * Answers are captured by hand over several days, so the overview reports by week (Monday start), not by
 * the exact capture date. A single answer pasted today must never become "the latest run" on its own.
 */
export function weekStart(date: string): string {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return date.slice(0, 10);
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}

export const addDays = (date: string, days: number) => new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The same facts with each run date replaced by the Monday of its week. */
export function weekly(answers: AnswerFacts[]): AnswerFacts[] {
  return answers.map((a) => ({ ...a, runDate: weekStart(a.runDate) }));
}

const pairKey = (a: AnswerFacts) => `${a.promptId}|${a.engine}`;
export function pairsIn(answers: AnswerFacts[], period: string): Set<string> {
  return new Set(answers.filter((a) => a.runDate === period).map(pairKey));
}

export interface PeriodView {
  /** Facts keyed by week. */
  facts: AnswerFacts[];
  periods: string[];
  /** The week the headline numbers describe: the latest week, unless it is still being captured. */
  reporting: string | null;
  previous: string | null;
  /** The latest week when it has under half the prompt and engine pairs of the week before. */
  inProgress: { period: string; pairs: number; expected: number } | null;
}

export function periodView(raw: AnswerFacts[]): PeriodView {
  const facts = weekly(raw);
  const periods = runDates(facts);
  let reporting = periods[periods.length - 1] ?? null;
  let previous = periods[periods.length - 2] ?? null;
  let inProgress: PeriodView['inProgress'] = null;
  if (reporting && previous) {
    const now = pairsIn(facts, reporting).size;
    const before = pairsIn(facts, previous).size;
    if (now < before * 0.5) {
      inProgress = { period: reporting, pairs: now, expected: before };
      reporting = previous;
      previous = periods[periods.length - 3] ?? null;
    }
  }
  return { facts, periods, reporting, previous, inProgress };
}

/**
 * Visibility in two periods over only the prompt and engine pairs captured in both, so adding or skipping
 * prompts never shows up as a rise or fall.
 */
export function matchedChange(facts: AnswerFacts[], from: string, to: string): { before: number; after: number; pairs: number } | null {
  const a = pairsIn(facts, from);
  const both = new Set([...pairsIn(facts, to)].filter((k) => a.has(k)));
  if (!both.size) return null;
  const sel = (p: string) => facts.filter((f) => f.runDate === p && both.has(pairKey(f)));
  const before = groupRate(sel(from), (x) => x.mentioned);
  const after = groupRate(sel(to), (x) => x.mentioned);
  return before == null || after == null ? null : { before, after, pairs: both.size };
}

export interface PeriodAlert extends ChangeAlert { pairs: number }

/** Visibility moved more than `threshold` points between two weeks, on the pairs captured in both. */
export function periodAlert(facts: AnswerFacts[], from: string | null, to: string | null, threshold = 10): PeriodAlert | null {
  if (!from || !to) return null;
  const m = matchedChange(facts, from, to);
  if (!m) return null;
  const points = Math.round((m.after - m.before) * 1000) / 10;
  return Math.abs(points) > threshold ? { from, to, before: m.before, after: m.after, points, pairs: m.pairs } : null;
}
