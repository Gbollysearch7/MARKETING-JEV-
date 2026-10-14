import type { Answer } from '../../engine/jev/types';
import { SENTIMENT_LEVELS } from './battery';
import { LOSS_REASONS, type LossReason, type Owner, type Router, type Sentiment } from './types';

export const REASON_LABEL: Record<LossReason, string> = {
  no_page_covers: 'No page covers the question',
  not_cited_by_trusted_sources: 'Page exists but is not cited',
  competitor_third_party: 'Competitor has third-party coverage',
  weak_entity: 'Brand entity is weak',
  blocked_or_walled: 'Blocked to AI crawlers or walled',
};

/** Each reason maps to one fix and one owner. Text is built here from templates, never generated. */
export function fixFor(reason: LossReason, ctx: { prompt: string; winner: string | null; pagePath: string | null }): { fix: string; owner: Owner } {
  const who = ctx.winner ?? 'the brands that were named';
  switch (reason) {
    case 'no_page_covers':
      return { owner: 'content', fix: `Publish a page that answers “${ctx.prompt}” directly, with a clear recommendation and comparison table.` };
    case 'not_cited_by_trusted_sources':
      return { owner: 'pr', fix: `Get ${ctx.pagePath ?? 'the matching page'} cited by the review sites and publications the engines quote for this prompt.` };
    case 'competitor_third_party':
      return { owner: 'pr', fix: `Win third-party coverage where ${who} appears: review sites, Reddit and forum threads, and “best of” listicles.` };
    case 'weak_entity':
      return { owner: 'content', fix: 'Strengthen the brand entity: one consistent description on the About page, Organization schema with sameAs links, and matching directory profiles.' };
    case 'blocked_or_walled':
      return { owner: 'technical', fix: `Let GPTBot, ClaudeBot and PerplexityBot fetch ${ctx.pagePath ?? 'the page'} (robots.txt, firewall) and move the answer out from behind any login or paywall.` };
  }
}

export const THRESHOLDS = { auto: 0.85, review: 0.6 };

export function routerFor(confidence: number): Router {
  return confidence >= THRESHOLDS.auto ? 'auto' : confidence >= THRESHOLDS.review ? 'review' : 'uncertain';
}

/** The chosen reason and its probability (used as the confidence), or null when the answer is unusable. */
export function readLoss(a: Answer | undefined): { reason: LossReason; confidence: number; probabilities: Record<string, number> } | null {
  if (!a || a.type !== 'choice' || !(LOSS_REASONS as readonly string[]).includes(a.choice)) return null;
  return { reason: a.choice as LossReason, confidence: a.probabilities[a.choice] ?? 0, probabilities: a.probabilities };
}

/** The most likely sentiment level and its probability. */
export function readSentiment(a: Answer | undefined): { sentiment: Sentiment; confidence: number } | null {
  if (!a || a.type !== 'score') return null;
  let best = -1;
  let bestP = -1;
  for (const [k, pr] of Object.entries(a.probabilities)) if (pr > bestP) { bestP = pr; best = Number(k); }
  const sentiment = SENTIMENT_LEVELS[best];
  return sentiment ? { sentiment, confidence: bestP } : null;
}
