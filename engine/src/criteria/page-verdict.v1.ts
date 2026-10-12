import type { Questions } from '../jev/types.js';

export const PAGE_VERDICT_VERSION = 'page-verdict.v1';

export const PAGE_INTENT_OPTIONS = {
  informational: 'Explains a concept or answers a question; no purchase step on the page',
  commercial_investigation: 'Compares options or helps the reader choose between providers',
  transactional: 'Leads directly to signing up, buying, or starting a trial or evaluation',
  navigational: 'Exists mainly so a reader can reach a specific brand or page',
};

export const QUERY_INTENT_OPTIONS = {
  informational: 'The searcher wants an explanation or definition',
  commercial_investigation: 'The searcher is comparing options before choosing',
  transactional: 'The searcher wants to sign up or buy now',
  navigational: 'The searcher is looking for a specific brand or page',
};

export interface SiblingRef {
  key: string;
  title: string;
}

/**
 * Per-URL verdict battery. State shape:
 * { page: {url,title,h1,meta_description,headings,intro,author_shown,last_updated_text},
 *   search: {top_queries, ctr_band, position_band, click_trend_12m, impressions_band},
 *   sibling_pages: [{key,url,title}] }
 * Every number is already a bucket computed in code.
 */
export function pageVerdictQuestions(siblings: SiblingRef[]): Questions {
  const q: Questions = {
    page_intent: {
      type: 'choice',
      instructions: 'Which search intent does `page` primarily serve, judging from `page.title`, `page.h1`, `page.headings` and `page.intro`?',
      criteria: PAGE_INTENT_OPTIONS,
    },
    query_intent: {
      type: 'choice',
      instructions: 'Which search intent do the queries in `search.top_queries` primarily express?',
      criteria: QUERY_INTENT_OPTIONS,
    },
    title_matches_queries: {
      type: 'noul',
      instructions: 'Does `page.title` directly promise an answer to `search.top_queries[0]`?',
    },
    intro_answers_directly: {
      type: 'noul',
      instructions: 'Does `page.intro` give a direct answer to `search.top_queries[0]` within its first two sentences, before any background?',
    },
    depth: {
      type: 'score',
      instructions: 'How thoroughly do `page.headings` and `page.intro` cover what a reader asking `search.top_queries[0]` would want to know?',
      criteria: [
        'Thin: restates the question or gives a one-line definition with no specifics',
        'Partial: covers the basics but misses obvious sub-questions such as costs, rules or risks',
        'Thorough: covers the basics and the obvious sub-questions with concrete specifics',
      ],
    },
    shows_first_hand_experience: {
      type: 'noul',
      instructions: 'Does `page.intro` contain evidence of first-hand experience, such as specific results, described screenshots, or named personal examples, rather than general explanation only?',
    },
    contains_time_sensitive_claims: {
      type: 'noul',
      instructions: 'Does `page.intro` or any item in `page.headings` make a claim about prices, rules, rankings or a specific year that is likely to become outdated within a year?',
    },
    misleading_outcome_claim: {
      type: 'noul',
      instructions: 'Does `page.intro` state or imply that the reader is guaranteed, or very likely, to achieve a financial or personal outcome?',
    },
  };

  siblings.forEach((s, i) => {
    q[`overlap_${s.key}`] = {
      type: 'noul',
      instructions: `Would \`sibling_pages[${i}]\` satisfy the same \`search.top_queries\` as \`page\`, judging by its title?`,
    };
  });

  if (siblings.length) {
    const criteria: Record<string, string> = {};
    for (const s of siblings) criteria[s.key] = s.title;
    criteria.none = 'No sibling is a suitable home; the page should stay separate';
    q.best_consolidation_target = {
      type: 'choice',
      instructions: 'If `page` were merged into one of `sibling_pages`, which sibling is the best home for its content?',
      criteria,
    };
  }
  return q;
}
