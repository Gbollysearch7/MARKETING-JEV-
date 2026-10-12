import { isChoice, isScore, p, sure } from '../jev/confidence.js';
import type { Answers } from '../jev/types.js';
import type { ClickTrend } from './buckets.js';

export type Verdict = 'refresh' | 'merge' | 'redirect' | 'prune_or_redirect' | 'expand' | 'rewrite_for_intent' | 'leave';

export interface PageMetrics {
  clicks12m: number;
  impressions12m: number;
  clickTrend12m: ClickTrend;
  referringDomains: number;
}

export interface SiblingMetrics {
  key: string;
  url: string;
  clicks12m: number;
}

export interface VerdictResult {
  verdict: Verdict;
  mergeInto: string | null;
  needsReview: boolean;
  reasons: string[];
  /** Lowest confidence among the answers that drove the verdict. */
  confidence: number;
}

export interface VerdictThresholds {
  overlap: number;
  siblingStrongerBy: number;
  minImpressionsToInvest: number;
  consolidationConfidence: number;
  staleClaim: number;
}

export const DEFAULT_VERDICT_THRESHOLDS: VerdictThresholds = {
  overlap: 0.8,
  siblingStrongerBy: 1.5,
  minImpressionsToInvest: 500,
  consolidationConfidence: 0.7,
  staleClaim: 0.7,
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Verdict = rules in code over atomic answers plus numeric buckets.
 * Irreversible verdicts (merge without a confident target, prune or redirect) always need review.
 */
export function decideVerdict(
  a: Answers,
  m: PageMetrics,
  siblings: SiblingMetrics[],
  t: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS,
): VerdictResult {
  const reasons: string[] = [];
  const confidences: number[] = [];

  const pageIntent = a.page_intent;
  const queryIntent = a.query_intent;
  const intentMismatch =
    isChoice(pageIntent) && isChoice(queryIntent) &&
    pageIntent.choice !== queryIntent.choice && sure(a, 'page_intent') && sure(a, 'query_intent');
  if (intentMismatch && isChoice(pageIntent) && isChoice(queryIntent)) {
    reasons.push(`query intent ${queryIntent.choice}, page intent ${pageIntent.choice} (${r3(Math.min(pageIntent.confidence, queryIntent.confidence))})`);
    confidences.push(Math.min(pageIntent.confidence, queryIntent.confidence));
  }

  const depth = a.depth;
  const thin = isScore(depth) && depth.score < 1 && sure(a, 'depth');
  if (thin && isScore(depth)) {
    reasons.push(`depth thin (score ${r3(depth.score)}, confidence ${r3(depth.confidence)})`);
    confidences.push(depth.confidence);
  }

  const overlapping = siblings.filter((s) => p(a, `overlap_${s.key}`) > t.overlap);
  const strongerSibling = overlapping.find((s) => s.clicks12m > m.clicks12m * t.siblingStrongerBy);
  const staleClaims = p(a, 'contains_time_sensitive_claims');
  const stale = m.clickTrend12m === 'declining_sharply' && staleClaims > t.staleClaim;
  const dead = m.clicks12m === 0 && m.impressions12m < 50 && m.referringDomains === 0;

  if (strongerSibling) {
    reasons.push(`overlaps ${strongerSibling.url} (${r3(p(a, `overlap_${strongerSibling.key}`))}) which earns more clicks`);
    confidences.push(Math.abs(2 * p(a, `overlap_${strongerSibling.key}`) - 1));
    const target = a.best_consolidation_target;
    if (isChoice(target) && target.choice !== 'none' && target.confidence >= t.consolidationConfidence) {
      reasons.push(`best home ${target.choice} (${r3(target.confidence)})`);
      confidences.push(target.confidence);
      return { verdict: 'merge', mergeInto: target.choice, needsReview: false, reasons, confidence: r3(Math.min(...confidences)) };
    }
    reasons.push('no confident consolidation target');
    return { verdict: 'merge', mergeInto: null, needsReview: true, reasons, confidence: r3(Math.min(...confidences)) };
  }

  if (dead) {
    reasons.push('no clicks, under 50 impressions and no referring domains in 12 months');
    return { verdict: 'prune_or_redirect', mergeInto: null, needsReview: true, reasons, confidence: 1 };
  }

  if (intentMismatch && m.impressions12m > t.minImpressionsToInvest) {
    reasons.push(`impressions justify investment (${m.impressions12m})`);
    return { verdict: 'rewrite_for_intent', mergeInto: null, needsReview: false, reasons, confidence: r3(Math.min(...confidences)) };
  }

  if (thin && m.impressions12m > t.minImpressionsToInvest) {
    reasons.push(`impressions justify investment (${m.impressions12m})`);
    return { verdict: 'expand', mergeInto: null, needsReview: false, reasons, confidence: r3(Math.min(...confidences)) };
  }

  if (stale) {
    reasons.push(`clicks declining sharply and time-sensitive claims present (${r3(staleClaims)})`);
    return { verdict: 'refresh', mergeInto: null, needsReview: false, reasons, confidence: r3(Math.abs(2 * staleClaims - 1)) };
  }

  reasons.push('no rule fired');
  return { verdict: 'leave', mergeInto: null, needsReview: false, reasons, confidence: 1 };
}
