import type { Questions } from '../jev/types.js';
import { truncate } from '../util/text.js';

export const PAIR_LINK_VERSION = 'pair-link.v1';

/**
 * Pairwise battery for internal linking and cannibalisation. State shape:
 * { page_a: {url,title,intro,paragraphs:{p0..pN}}, page_b: {url,title,meta_description,intro} }
 */
export function pairLinkQuestions(paragraphs: Record<string, string>, anchors: string[]): Questions {
  const q: Questions = {
    reader_benefit: {
      type: 'noul',
      instructions: 'Would a reader of `page_a` gain something useful from a link to `page_b`, judging by `page_a.paragraphs` and by `page_b.title`, `page_b.meta_description` and `page_b.intro`?',
      criteria: {
        true: '`page_b` explains, expands or supports something `page_a` mentions, so the reader would want it',
        false: '`page_b` is unrelated, or adds nothing a reader of `page_a` would want at that point',
      },
    },
    same_primary_intent: {
      type: 'noul',
      instructions: 'Do `page_a` and `page_b` target the same primary search intent, so that a searcher would be satisfied by either page?',
      criteria: {
        true: 'Both pages answer the same main question for the same kind of searcher',
        false: 'They answer different questions or serve different stages, even if the topic overlaps',
      },
    },
    b_is_prerequisite: {
      type: 'noul',
      instructions: 'Does `page_b` explain a concept that `page_a` assumes the reader already understands?',
    },
    survivor: {
      type: 'choice',
      instructions: 'If `page_a` and `page_b` compete for the same searchers, which should remain as the single canonical page?',
      criteria: {
        a: 'Keep `page_a`; fold anything unique from `page_b` into it',
        b: 'Keep `page_b`; fold anything unique from `page_a` into it',
        keep_both: 'They serve different needs and should both stay',
      },
    },
  };

  const paraKeys = Object.keys(paragraphs);
  if (paraKeys.length) {
    const criteria: Record<string, string> = {};
    for (const k of paraKeys) criteria[k] = truncate(paragraphs[k], 120);
    criteria.none = 'No paragraph is a natural place for this link';
    q.best_paragraph = {
      type: 'choice',
      instructions: 'Which paragraph in `page_a.paragraphs` is the most natural place to add a link to `page_b`?',
      criteria,
    };
  }

  if (anchors.length) {
    const criteria: Record<string, string> = {};
    anchors.forEach((a, i) => (criteria[`anchor_${i}`] = a));
    criteria.none = 'None of these phrases reads naturally as a link to `page_b`';
    q.best_anchor = {
      type: 'choice',
      instructions: 'Which phrase from `page_a` would read most naturally as the anchor text of a link to `page_b`?',
      criteria,
    };
  }
  return q;
}
