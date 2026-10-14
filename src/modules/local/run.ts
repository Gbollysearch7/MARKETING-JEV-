import type { DecideInput, DecideResult } from '../../engine/jev/client';
import { buildPostQuestions, buildPostState, buildQaQuestions, buildQaState, buildReviewQuestions, buildReviewState, CRITERIA_VERSION } from './battery';
import { computeHealth, daysBetween, daysSincePost, reviewPeriods, seasonOf, averageRating, type Health, type Period } from './health';
import { citationIssues, type CitationIssue } from './nap';
import { postDecision, qaDecision, reviewDecision, type PostDecision, type QaDecision, type ReviewDecision } from './rules';
import type { LocalCitation, LocalLocation, LocalQuestion, LocalReview, LocalSettings, Theme } from './types';

export { CRITERIA_VERSION };

// ---------- code-only analysis ----------

export interface LocationAnalysis {
  loc: LocalLocation;
  health: Health;
  issues: CitationIssue[];
  periods: Period[];
  daysSincePost: number | null;
  avgRating: number | null;
  unreplied: number;
  unrepliedLow: number;
  openQuestions: number;
}

export function analyseLocation(loc: LocalLocation, reviews: LocalReview[], questions: LocalQuestion[], citations: LocalCitation[], today: string): LocationAnalysis {
  const issues = citationIssues(loc, citations);
  const health = computeHealth({ loc, reviews, questions, citationIssues: issues, today });
  const unreplied = reviews.filter((r) => !r.replied);
  return {
    loc, health, issues,
    periods: reviewPeriods(reviews, today),
    daysSincePost: daysSincePost(loc, today),
    avgRating: averageRating(reviews),
    unreplied: unreplied.length,
    unrepliedLow: unreplied.filter((r) => r.rating <= 2).length,
    openQuestions: questions.filter((q) => !q.answered).length,
  };
}

/** ISO week label such as "2026-W42", used to key the weekly post decision. */
export function isoWeek(today: string): string {
  const d = new Date(today.slice(0, 10) + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ---------- the Jev run ----------

export type Decide = (itemKey: string, criteriaVersion: string, input: DecideInput) => Promise<DecideResult>;

export interface RunInput {
  locations: LocalLocation[];
  reviews: LocalReview[];
  questions: LocalQuestion[];
  settings: LocalSettings;
  today: string;
  /** Review keys already decided and actioned by a person; they are not asked again. */
  skipReviews?: Set<string>;
  skipQuestions?: Set<string>;
  /** Themes from earlier runs, by review key, so the post decision sees the last 30 days of themes. */
  knownThemes?: Map<string, Theme>;
}

export interface RunOutput {
  reviews: { review: LocalReview; decision: ReviewDecision }[];
  questions: { question: LocalQuestion; decision: QaDecision }[];
  posts: { locId: string; week: string; decision: PostDecision }[];
  failures: string[];
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, onDone: () => void) {
  let next = 0;
  const worker = async () => { while (next < items.length) { await fn(items[next++]); onDone(); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
}

/**
 * One weekly pass: a decision for every unreplied review and unanswered question, and a post decision
 * for every location. Reviews go first so the post decision can see this week's review themes.
 */
export async function runLocal(input: RunInput, decide: Decide, opts: { concurrency?: number; onProgress?: (done: number, total: number, msg: string) => void } = {}): Promise<RunOutput> {
  const { locations, settings, today } = input;
  const byId = new Map(locations.map((l) => [l.locId, l]));
  const reviews = input.reviews.filter((r) => !r.replied && byId.has(r.locId) && !input.skipReviews?.has(r.key));
  const questions = input.questions.filter((q) => !q.answered && byId.has(q.locId) && !input.skipQuestions?.has(q.key));
  const total = reviews.length + questions.length + locations.length;
  let done = 0;
  const tick = (msg: string) => opts.onProgress?.(++done, total, msg);
  const out: RunOutput = { reviews: [], questions: [], posts: [], failures: [] };
  const conc = opts.concurrency ?? 8;
  const qReview = buildReviewQuestions();
  const qQa = buildQaQuestions();
  const qPost = buildPostQuestions();

  await mapLimit(reviews, conc, async (r) => {
    const loc = byId.get(r.locId)!;
    try {
      const res = await decide(`review:${r.key}`, CRITERIA_VERSION, { state: buildReviewState(r, loc, today), questions: qReview });
      out.reviews.push({ review: r, decision: reviewDecision(r, loc, res.answers, settings) });
    } catch (e) { out.failures.push(`Review by ${r.author}: ${e instanceof Error ? e.message : String(e)}`); }
  }, () => tick('Deciding on reviews'));

  await mapLimit(questions, conc, async (q) => {
    const loc = byId.get(q.locId)!;
    try {
      const res = await decide(`question:${q.key}`, CRITERIA_VERSION, { state: buildQaState(q, loc, today), questions: qQa });
      out.questions.push({ question: q, decision: qaDecision(q, loc, res.answers) });
    } catch (e) { out.failures.push(`Question "${q.question.slice(0, 40)}": ${e instanceof Error ? e.message : String(e)}`); }
  }, () => tick('Deciding on questions'));

  const themes = new Map(input.knownThemes ?? []);
  for (const { review, decision } of out.reviews) themes.set(review.key, decision.theme);
  const week = isoWeek(today);
  const season = seasonOf(today);
  await mapLimit(locations, conc, async (loc) => {
    const recent = input.reviews.filter((r) => r.locId === loc.locId && r.date && daysBetween(r.date, today) <= 30);
    const recentThemes = recent.map((r) => themes.get(r.key)).filter((t): t is Theme => Boolean(t) && t !== 'other');
    const dsp = daysSincePost(loc, today);
    const positive = recent.filter((r) => r.rating >= 4).map((r) => themes.get(r.key)).filter((t): t is Theme => Boolean(t));
    const top = positive.length ? [...positive.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<Theme, number>()).entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    try {
      const res = await decide(`post:${loc.locId}:${week}`, CRITERIA_VERSION, { state: buildPostState(loc, dsp, recentThemes, today, loc.rating ?? averageRating(recent)), questions: qPost });
      out.posts.push({ locId: loc.locId, week, decision: postDecision(loc, dsp, res.answers, season, top) });
    } catch (e) { out.failures.push(`Post for ${loc.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }, () => tick('Planning posts'));

  return out;
}
