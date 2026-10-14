import type { ChoiceQuestion, NoulQuestion, Questions, ScoreQuestion } from '../../engine/jev/types';
import { truncate } from './text';
import type { CheckBands, GatePageInput, GateVerdict } from './types';

export const GATE_CRITERIA_VERSION = 'gate.v1';

export const VERDICT_CRITERIA: Record<GateVerdict, string> = {
  index: 'Publish and allow indexing. Fits when `page.body_excerpt` gives a person searching for `page.target_query` (or `page.title` when there is no query) specific, useful information they would not get from a sibling page, `checks.unique_words` is some or substantial, and `checks.near_duplicate` is distinct or overlapping.',
  improve: 'Hold the page, or publish it noindex, until it is fixed. Fits when the page has a real searcher to serve but is thin, partly duplicated, generic, makes unsourced or risky claims, or has a title or H1 problem, and each of these can be fixed by editing the page. Does not fit a page whose `checks.near_duplicate` is near_duplicate and whose `page.text_unique_to_this_page` is generic: editing would not give it a reason to exist.',
  kill: 'Do not publish. Fits when the page adds nothing a searcher could not get from another page: `checks.near_duplicate` is near_duplicate or duplicate, or `checks.unique_words` is almost_none, or the content is so generic that no searcher would be better served by it. A `checks.search_demand` of not_seen_yet is not a reason to kill on its own.',
};

export const DEPTH_LEVELS = [
  'Thin: restates the title or gives generic statements with no detail specific to this page',
  'Partial: covers the basics but misses obvious sub-questions a reader of the title would have',
  'Thorough: covers the basics and the obvious sub-questions with concrete detail specific to this page',
];

/** The filtered state Jev sees: page text (truncated) and named bands. No raw counts or ratios. */
export function buildState(p: GatePageInput, bands: CheckBands, uniqueExcerpt: string) {
  return {
    page: {
      url_path: p.path,
      template: p.template,
      title: p.title || undefined,
      h1: p.h1 || undefined,
      meta_description: p.meta || undefined,
      target_query: p.query || undefined,
      body_excerpt: truncate(p.body, 2200) || undefined,
      text_unique_to_this_page: uniqueExcerpt ? truncate(uniqueExcerpt, 600) : undefined,
    },
    checks: bands,
  };
}

export function buildQuestions(allowed: GateVerdict[], hasQuery: boolean): Questions {
  const criteria: Record<string, string> = {};
  for (const v of allowed) criteria[v] = VERDICT_CRITERIA[v];
  const searcher = hasQuery ? '`page.target_query`' : '`page.title`';
  return {
    verdict: {
      type: 'choice',
      instructions: 'Should `page` be published and indexed, improved first, or not published at all, given `page` and the code checks in `checks`? The bands in `checks` are already calculated; treat "unknown" as missing data, not as a problem.',
      criteria,
    } satisfies ChoiceQuestion,
    depth: {
      type: 'score',
      instructions: 'How thoroughly does `page.body_excerpt` cover what `page.title` promises?',
      criteria: DEPTH_LEVELS,
    } satisfies ScoreQuestion,
    helpful_to_searcher: {
      type: 'noul',
      instructions: `Would a person who searched for ${searcher} find what they were looking for in \`page.body_excerpt\`?`,
    } satisfies NoulQuestion,
    unverifiable_claim: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` cite a statistic, survey result, study or ranking (such as "voted the best" or "90% of visitors") without naming its source? Plain descriptive details such as distances, opening days or directions do not count.',
    } satisfies NoulQuestion,
    template_feel: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` read as a template with a few names or numbers filled in, so that most sentences would be unchanged on a page about a different place or item?',
    } satisfies NoulQuestion,
    machine_filler: {
      type: 'noul',
      instructions: 'Is most of `page.text_unique_to_this_page` generic filler that would fit any page of this kind, such as saying a place is great, popular or has something for everyone, rather than specific information?',
    } satisfies NoulQuestion,
    brand_legal_risk: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` promise a guaranteed outcome, or make a health, safety, financial or legal claim that could expose the brand to complaints or regulators?',
    } satisfies NoulQuestion,
  };
}
