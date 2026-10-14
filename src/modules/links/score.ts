import type { DecideInput, DecideResult } from '../../engine/jev/client';
import type { Answers } from '../../engine/jev/types';
import { buildQuestions, buildState, type SiteContext } from './battery';
import { featuresOf } from './features';
import { assess, likelihoodOf, priorityOf, reasonsFor, type Assessment, type TypeStats } from './rules';
import type { Features, Level, ProspectInput, SiteType } from './types';

export interface Scored {
  features: Features;
  answers: Answers;
  assessment: Assessment;
  likelihood: Level;
  priority: number | null;
  reasons: string[];
}

/** One Jev call per prospect: build state and battery, decide, combine in code. */
export async function scoreProspect(
  decide: (input: DecideInput) => Promise<DecideResult>,
  p: ProspectInput,
  site: SiteContext,
  opts: { alreadyLinking: boolean; foundVia: string; stats: Partial<Record<SiteType, TypeStats>> },
): Promise<Scored> {
  const features = featuresOf(p, { name: site.name, domain: site.domain }, opts.alreadyLinking);
  const res = await decide({ state: buildState(p, features, site, opts.foundVia), questions: buildQuestions() });
  return finish(features, res.answers, opts.stats);
}

/** Code-only part, reused when the ledger changes and likelihood must be recomputed without a new Jev call. */
export function finish(features: Features, answers: Answers, stats: Partial<Record<SiteType, TypeStats>>): Scored {
  const assessment = assess(answers, features);
  const lk = likelihoodOf(assessment.siteType, stats);
  return {
    features,
    answers,
    assessment,
    likelihood: lk.level,
    priority: priorityOf(assessment.verdict, assessment.relevance, features.authority, lk.level),
    reasons: reasonsFor(assessment, features, lk),
  };
}
