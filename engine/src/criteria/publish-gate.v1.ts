import type { Questions } from '../jev/types.js';

export const PUBLISH_GATE_VERSION = 'publish-gate.v1';

/**
 * Pre-publish battery for programmatic, AI-generated or agency drafts. State shape:
 * { page: {title,h1,meta_description,headings,intro,body_excerpt}, siblings: [{key,title,intro}] }
 * Word counts, placeholders, banned terms and shingle duplicate ratios are code checks, not questions.
 */
export function publishGateQuestions(siblingKeys: string[]): Questions {
  const q: Questions = {
    depth: {
      type: 'score',
      instructions: 'How thoroughly does `page.body_excerpt` cover what `page.title` promises?',
      criteria: [
        'Thin: restates the title or gives generic statements with no page-specific detail',
        'Partial: covers the basics but misses obvious sub-questions a reader would have',
        'Thorough: covers the basics and the obvious sub-questions with concrete, page-specific detail',
      ],
    },
    delivers_title_promise: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` deliver what `page.title` promises, rather than something narrower or different?',
    },
    useful_to_searcher: {
      type: 'noul',
      instructions: 'Would a person who searched for `page.title` leave `page.body_excerpt` with their question answered?',
    },
    unverifiable_claim: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` contain a specific factual claim, number or statistic with no source or basis given on the page?',
    },
    template_feel: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` read as a template with a few variables filled in, where most sentences would be unchanged on a page about a different subject?',
    },
    reads_as_machine_filler: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` contain generic filler sentences that add no information, such as restating that the topic is important or complex?',
    },
    guaranteed_outcome_claim: {
      type: 'noul',
      instructions: 'Does `page.body_excerpt` state or imply that the reader is guaranteed, or very likely, to achieve a financial or personal outcome?',
    },
  };
  siblingKeys.forEach((k, i) => {
    q[`duplicates_${k}`] = {
      type: 'noul',
      instructions: `Would \`siblings[${i}]\` and \`page\` leave a reader with the same information, judging by \`siblings[${i}].title\`, \`siblings[${i}].intro\` and \`page.intro\`?`,
    };
  });
  return q;
}
