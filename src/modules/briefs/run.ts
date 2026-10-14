import type { DecideInput, DecideResult } from '../../engine/jev/client';
import { assembleBrief, type SitePage, type SourceFacts } from './assemble';
import { headTerm, stem } from './text';
import { anglesFor, buildState, detailQuestions, detailState, goQuestions } from './battery';
import { changeFor, pickOf, reasonsFor, routeOf } from './rules';
import type { BriefContent, Decision, Edge, Format, Go, Intent, Length, SiteFacts, TargetData } from './types';

export interface TargetContext {
  titles: Map<string, string | null>;
  site: SiteFacts;
  pages: SitePage[];
  ga4: Map<string, { sessions: number; conversions: number }>;
  today: string;
}

export type Decide = (input: DecideInput) => Promise<DecideResult>;

/**
 * Decide one target: call 1 asks go, intent and format; when the answer is not skip, call 2 asks angle,
 * length and edge with the first answers in the state. Then the brief is assembled in code.
 */
export async function decideTarget(t: TargetData, ctx: TargetContext, decide: Decide): Promise<{ decision: Decision; brief: BriefContent | null }> {
  const built = buildState(t, ctx.titles, ctx.site);
  const r1 = await decide({ state: built.state, questions: goQuestions(Boolean(built.coverage.path)) });
  const go = pickOf<Go>(r1.answers.go);
  if (!go) throw new Error(`No go answer for "${t.primary}"`);
  const intent = pickOf<Intent>(r1.answers.intent);
  const format = pickOf<Format>(r1.answers.format);
  const angles = anglesFor(t);
  const decision: Decision = {
    go, intent, format, angle: null, length: null, edge: null,
    router: routeOf(go.p),
    reasons: reasonsFor(t, built.coverage, built.bands),
    change: changeFor(go.choice, t, built.coverage, built.bands),
    angles, bands: built.bands, model: r1.model, decidedAt: new Date().toISOString(),
  };
  if (go.choice === 'skip' || !format) return { decision, brief: null };

  const r2 = await decide({ state: detailState(built.state, go.choice, intent?.choice ?? 'unknown', format.choice), questions: detailQuestions(angles) });
  decision.angle = pickOf(r2.answers.angle);
  decision.length = pickOf<Length>(r2.answers.length);
  decision.edge = pickOf<Edge>(r2.answers.edge);
  const sourceFacts: SourceFacts = {
    site: ctx.site,
    coverage: built.coverage,
    ga4: built.coverage.path ? ctx.ga4.get(built.coverage.path) ?? null : null,
    productPaths: productPathsFor(t, ctx.pages),
  };
  const brief = assembleBrief({
    target: t, go: go.choice, format: format.choice, angle: decision.angle?.choice ?? 'complete_overview', angles,
    length: decision.length?.choice ?? '1000_1500', edge: decision.edge?.choice ?? 'deeper_coverage', intent: intent?.choice ?? null,
    coverage: built.coverage, pages: ctx.pages, sourceFacts, year: Number(ctx.today.slice(0, 4)),
  });
  return { decision, brief };
}

const PRODUCT = /^\/(products?|shop|category|categories|collections?)\b/;

/** Product or category pages on the target's topic: their path contains the head term (singular or plural). */
export function productPathsFor(t: TargetData, pages: SitePage[]): string[] {
  const head = headTerm(t.primary);
  if (!head) return [];
  const words = head.split(' ').map(stem);
  return pages.filter((p) => PRODUCT.test(p.path) && words.every((w) => p.path.includes(w))).map((p) => p.path).slice(0, 10);
}
