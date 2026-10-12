import { isScore, p } from '../jev/confidence.js';
import type { Answers } from '../jev/types.js';

export type Disposition = 'index' | 'improve' | 'kill';

export interface CodeChecks {
  wordCount: number;
  placeholderFound: boolean;
  bannedTermsFound: string[];
  /** 0..1 share of shingles shared with the most similar sibling, computed in code. Optional. */
  duplicateRatio?: number;
}

export interface GateDecision {
  disposition: Disposition;
  needsReview: boolean;
  reasons: string[];
}

export interface GateThresholds {
  minWords: number;
  duplicateRatioKill: number;
  duplicateNoulKill: number;
  thinScore: number;
  partialScore: number;
}

export const DEFAULT_GATE_THRESHOLDS: GateThresholds = {
  minWords: 150,
  duplicateRatioKill: 0.9,
  duplicateNoulKill: 0.85,
  thinScore: 0.5,
  partialScore: 1.2,
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function decidePublishGate(a: Answers, c: CodeChecks, t: GateThresholds = DEFAULT_GATE_THRESHOLDS): GateDecision {
  const reasons: string[] = [];

  // Hard code gates first. These never reach the model's judgment.
  if (c.placeholderFound) reasons.push('placeholder or scaffold text found');
  if (c.bannedTermsFound.length) reasons.push(`banned terms: ${c.bannedTermsFound.join(', ')}`);
  if (c.duplicateRatio !== undefined && c.duplicateRatio > t.duplicateRatioKill) reasons.push(`near-duplicate of a sibling (shingle overlap ${r3(c.duplicateRatio)})`);
  if (reasons.length) return { disposition: 'kill', needsReview: false, reasons };

  const dupKeys = Object.keys(a).filter((k) => k.startsWith('duplicates_'));
  const dupMax = dupKeys.reduce((mx, k) => Math.max(mx, p(a, k)), 0);
  const dupKey = dupKeys.find((k) => p(a, k) === dupMax);
  const template = p(a, 'template_feel');
  const depth = a.depth;
  const depthScore = isScore(depth) ? depth.score : 1;
  const depthConf = isScore(depth) ? depth.confidence : 0;
  const useful = p(a, 'useful_to_searcher');

  if (dupMax > t.duplicateNoulKill && template > 0.7) {
    reasons.push(`duplicates ${dupKey?.replace('duplicates_', '')} (${r3(dupMax)}) and reads as a template (${r3(template)})`);
    return { disposition: 'kill', needsReview: false, reasons };
  }
  if (depthScore < t.thinScore && depthConf >= 0.6 && useful < 0.3) {
    reasons.push(`thin (depth ${r3(depthScore)}, confidence ${r3(depthConf)}) and not useful (${r3(useful)})`);
    return { disposition: 'kill', needsReview: false, reasons };
  }
  if (c.wordCount < t.minWords) {
    reasons.push(`only ${c.wordCount} words`);
  }
  if (depthScore < t.partialScore) reasons.push(`depth ${r3(depthScore)} (confidence ${r3(depthConf)})`);
  if (p(a, 'unverifiable_claim') > 0.7) reasons.push(`unverifiable claim (${r3(p(a, 'unverifiable_claim'))})`);
  if (p(a, 'guaranteed_outcome_claim') > 0.6) reasons.push(`guaranteed outcome claim (${r3(p(a, 'guaranteed_outcome_claim'))})`);
  if (p(a, 'delivers_title_promise') < 0.4) reasons.push(`does not deliver the title promise (${r3(p(a, 'delivers_title_promise'))})`);
  if (p(a, 'reads_as_machine_filler') > 0.7) reasons.push(`machine filler (${r3(p(a, 'reads_as_machine_filler'))})`);
  if (dupMax > 0.7) reasons.push(`overlaps ${dupKey?.replace('duplicates_', '')} (${r3(dupMax)})`);

  const borderline =
    depthConf < 0.5 ||
    ['useful_to_searcher', 'unverifiable_claim', 'template_feel', 'delivers_title_promise'].some((k) => {
      const v = p(a, k);
      return v > 0.4 && v < 0.6;
    });

  if (reasons.length) return { disposition: 'improve', needsReview: borderline, reasons };
  return { disposition: 'index', needsReview: borderline, reasons: borderline ? ['some answers near 0.5; worth a glance'] : [] };
}
