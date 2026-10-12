import { describe, expect, it } from 'vitest';
import { choiceConfidence, noulConfidence, scoreConfidence } from '../src/jev/confidence.js';

describe('confidence formulas match the TypeSafe docs', () => {
  it('choice: (0.9, 0.06, 0.04) -> 0.85', () => {
    expect(choiceConfidence([0.9, 0.06, 0.04])).toBeCloseTo(0.85, 2);
  });
  it('choice: even split -> 0, certainty -> 1', () => {
    expect(choiceConfidence([1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(0, 6);
    expect(choiceConfidence([1, 0, 0])).toBeCloseTo(1, 6);
  });
  it('score: (0, 0.57, 0.43) -> 0.35', () => {
    expect(scoreConfidence([0, 0.57, 0.43])).toBeCloseTo(0.355, 2);
  });
  it('score: neighbours split -> 0.25, ends split -> 0', () => {
    expect(scoreConfidence([0, 0.5, 0.5])).toBeCloseTo(0.25, 6);
    expect(scoreConfidence([0.5, 0, 0.5])).toBeCloseTo(0, 6);
  });
  it('noul: |2p - 1|', () => {
    expect(noulConfidence(0.5)).toBe(0);
    expect(noulConfidence(0.999)).toBeCloseTo(0.998, 3);
  });
});
