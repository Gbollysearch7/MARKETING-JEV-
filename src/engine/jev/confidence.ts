import type { Answer, Answers, ChoiceAnswer, NoulAnswer, ScoreAnswer } from './types';

/** Noul has no confidence field; distance from 0.5 puts it on the same 0..1 scale as Choice. */
export const noulConfidence = (p: number): number => Math.abs(2 * p - 1);

/** Choice: (p_max - 1/n) / (1 - 1/n). Even split is 0, certainty is 1. */
export function choiceConfidence(probs: number[]): number {
  const n = probs.length;
  if (n < 2) return 1;
  return (Math.max(...probs) - 1 / n) / (1 - 1 / n);
}

/** Score: 1 - (probability-weighted distance from the modal level) / (same distance for an even spread). */
export function scoreConfidence(probsOrdered: number[]): number {
  const n = probsOrdered.length;
  if (n < 2) return 1;
  let m = 0;
  for (let i = 1; i < n; i++) if (probsOrdered[i] > probsOrdered[m]) m = i;
  const spread = probsOrdered.reduce((s, p, i) => s + p * Math.abs(i - m), 0);
  const mid = (n - 1) / 2;
  const even = probsOrdered.reduce((s, _p, i) => s + Math.abs(i - mid), 0) / n;
  return Math.max(0, 1 - spread / even);
}

export function orderedScoreProbs(a: ScoreAnswer): number[] {
  return Object.keys(a.probabilities)
    .map(Number)
    .sort((x, y) => x - y)
    .map((i) => a.probabilities[String(i)]);
}

export function confidenceOf(a: Answer): number {
  return a.type === 'noul' ? noulConfidence(a.noul) : a.confidence;
}

export function isNoul(a: Answer | undefined): a is NoulAnswer { return a?.type === 'noul'; }
export function isChoice(a: Answer | undefined): a is ChoiceAnswer { return a?.type === 'choice'; }
export function isScore(a: Answer | undefined): a is ScoreAnswer { return a?.type === 'score'; }

/** Probability of yes for a noul, or 0.5 (unknown) when the answer is missing or of another type. */
export function p(answers: Answers, key: string): number {
  const a = answers[key];
  return isNoul(a) ? a.noul : 0.5;
}

/** Whether the answer is confident at or above the threshold. Missing answers are never sure. */
export function sure(answers: Answers, key: string, threshold = 0.6): boolean {
  const a = answers[key];
  return a ? confidenceOf(a) >= threshold : false;
}
