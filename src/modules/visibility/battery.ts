import type { ChoiceQuestion, Questions, ScoreQuestion } from '../../engine/jev/types';
import type { LostPrompt } from './aggregate';
import type { Coverage } from './prompts';
import { ENGINE_LABEL, SOURCE_LABEL, SOURCE_TYPES, type LossReason } from './types';

export const CRITERIA_VERSION = 'visibility.v1';

// ---------- sentiment (one per answer that mentions the brand) ----------

export const SENTIMENT_LEVELS = ['negative', 'neutral', 'positive'] as const;

export function sentimentState(brand: string, prompt: string, excerpt: string) {
  return { brand, prompt, answer_excerpt: excerpt };
}

export function sentimentQuestions(): Questions {
  return {
    sentiment: {
      type: 'score',
      instructions: 'How does `answer_excerpt` describe `brand`, as a reader asking `prompt` would take it?',
      criteria: [
        'Negative: warns against `brand`, reports problems, or ranks it below the alternatives.',
        'Neutral: lists or names `brand` without recommending it or criticising it.',
        'Positive: recommends `brand` or praises its products, service or value.',
      ],
    } satisfies ScoreQuestion,
  };
}

// ---------- loss reason (one per lost prompt) ----------

export const REASON_CRITERIA: Record<LossReason, string> = {
  no_page_covers: 'No page covers the question: `own_site.page_for_prompt` is "none", so the engines have nothing of ours to use for `prompt`.',
  not_cited_by_trusted_sources: 'A page exists but the engines do not pick it: `own_site.page_for_prompt` is "close" or "partial", `losing_answers.our_domain_cited` is "never", and `losing_answers.third_party_sources_cited` is "none" or "one", so the gap is our own page not being chosen.',
  competitor_third_party: 'Competitors win on third-party coverage: `losing_answers.third_party_sources_cited` is "several" (review sites, Reddit or forum threads, listicles) and the competitors in `losing_answers.competitors_named` are named in those answers, while we are not.',
  weak_entity: 'The brand entity is weak: `brand.visibility_across_all_prompts` is low, so the engines do not recognise or trust the brand even where we have pages and coverage.',
  blocked_or_walled: 'The content is blocked to AI crawlers or behind a wall: we have a matching page but `own_site.page_status` shows it is not indexable, not reachable, or gated.',
};

const countBand = (n: number) => (n === 0 ? 'none' : n === 1 ? 'one' : n <= 4 ? 'some (2 to 4)' : 'many (5 or more)');
const shareBand = (n: number, of: number) => (n === 0 ? 'none of them' : n === of ? 'every one' : n / of >= 0.5 ? 'most of them' : 'a few of them');

export function visibilityBand(v: number | null): string {
  if (v == null) return 'unknown';
  if (v < 0.2) return 'rarely mentioned (under 20% of prompts)';
  if (v < 0.5) return 'sometimes mentioned (20% to 50% of prompts)';
  return 'often mentioned (over 50% of prompts)';
}

export type PageStatus = 'indexable' | 'not_indexable' | 'unknown';

/** The filtered state for one lost prompt. Bands and names only, no raw counts for Jev to do arithmetic on. */
export function lossState(input: {
  brand: string;
  domain: string;
  lost: LostPrompt;
  coverage: Coverage;
  pageStatus: PageStatus;
  overallVisibility: number | null;
  /** False when the site has no crawl or Search Console pages, so page coverage cannot be judged. */
  pagesKnown?: boolean;
}) {
  const { lost, coverage } = input;
  const known = input.pagesKnown !== false;
  const cited: Record<string, string> = {};
  for (const t of SOURCE_TYPES) cited[SOURCE_LABEL[t].toLowerCase()] = countBand(lost.sourceTypeCounts[t] ?? 0);
  const thirdParty = (lost.sourceTypeCounts.review_site ?? 0) + (lost.sourceTypeCounts.forum ?? 0);
  return {
    prompt: lost.prompt,
    brand: { name: input.brand, domain: input.domain, visibility_across_all_prompts: visibilityBand(input.overallVisibility) },
    lost_on_engines: lost.lostOn.map((e) => ENGINE_LABEL[e]),
    won_on_engines: lost.wonOn.map((e) => ENGINE_LABEL[e]),
    losing_answers: {
      competitors_named: lost.competitorCounts.slice(0, 5).map((c) => ({ name: c.name, named_in: shareBand(c.answers, lost.losingAnswers) })),
      cited_source_types: cited,
      third_party_sources_cited: thirdParty === 0 ? 'none' : thirdParty === 1 ? 'one' : 'several',
      our_domain_cited: lost.brandCitedInLosing === 0 ? 'never' : 'sometimes',
    },
    own_site: {
      page_for_prompt: known ? coverage.match : 'unknown (no crawl or Search Console pages uploaded for this site)',
      page_title: coverage.title ?? undefined,
      page_path: coverage.path ?? undefined,
      page_status: !known ? 'unknown' : coverage.match === 'none' ? 'no matching page' : input.pageStatus === 'indexable' ? 'indexable' : input.pageStatus === 'not_indexable' ? 'not indexable or returns an error' : 'unknown',
    },
  };
}

export function lossQuestions(): Questions {
  return {
    loss_reason: {
      type: 'choice',
      instructions: 'What is the most likely reason the AI engines in `lost_on_engines` answered `prompt` without naming `brand.name`?',
      criteria: { ...REASON_CRITERIA },
    } satisfies ChoiceQuestion,
  };
}
