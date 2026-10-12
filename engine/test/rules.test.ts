import { describe, expect, it } from 'vitest';
import type { Answers } from '../src/jev/types.js';
import { clickTrend, ctrBand, positionBand } from '../src/rules/buckets.js';
import { decideCompliance } from '../src/rules/compliance.js';
import { decidePublishGate } from '../src/rules/publish-gate.js';
import { decideVerdict, type PageMetrics } from '../src/rules/verdict.js';

const choice = (choice: string, confidence = 0.9): Answers[string] => ({ type: 'choice', choice, probabilities: { [choice]: 0.9, other: 0.1 }, confidence });
const score = (s: number, confidence = 0.9): Answers[string] => ({ type: 'score', score: s, legend: {}, probabilities: {}, confidence });
const noul = (p: number): Answers[string] => ({ type: 'noul', noul: p });

const healthy: PageMetrics = { clicks12m: 1200, impressions12m: 20000, clickTrend12m: 'flat', referringDomains: 3 };
const base: Answers = {
  page_intent: choice('informational'),
  query_intent: choice('informational'),
  depth: score(1.8),
  contains_time_sensitive_claims: noul(0.2),
  overlap_s0: noul(0.1),
};

describe('buckets keep the arithmetic in code', () => {
  it('click trend', () => {
    expect(clickTrend([100, 100, 100, 90, 80, 70, 60, 50, 40, 30, 30, 30])).toBe('declining_sharply');
    expect(clickTrend([10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 14, 14])).toBe('growing');
    expect(clickTrend([1, 2])).toBe('unknown');
  });
  it('position and ctr bands', () => {
    expect(positionBand(2)).toBe('top_three');
    expect(positionBand(14)).toBe('page_two');
    expect(ctrBand(0.01, 4)).toBe('below_expected_for_position');
    expect(ctrBand(0.45, 1)).toBe('above_expected_for_position');
  });
});

describe('decideVerdict', () => {
  it('leaves a healthy page alone', () => {
    expect(decideVerdict(base, healthy, [{ key: 's0', url: '/s0', clicks12m: 10 }]).verdict).toBe('leave');
  });
  it('merges into a confident target when a stronger sibling overlaps', () => {
    const a: Answers = { ...base, overlap_s0: noul(0.92), best_consolidation_target: choice('s0', 0.85) };
    const v = decideVerdict(a, { ...healthy, clicks12m: 100 }, [{ key: 's0', url: '/s0', clicks12m: 900 }]);
    expect(v.verdict).toBe('merge');
    expect(v.mergeInto).toBe('s0');
    expect(v.needsReview).toBe(false);
  });
  it('merge without a confident target needs review', () => {
    const a: Answers = { ...base, overlap_s0: noul(0.92), best_consolidation_target: choice('none', 0.3) };
    const v = decideVerdict(a, { ...healthy, clicks12m: 100 }, [{ key: 's0', url: '/s0', clicks12m: 900 }]);
    expect(v.verdict).toBe('merge');
    expect(v.needsReview).toBe(true);
  });
  it('prune or redirect is always reviewed', () => {
    const v = decideVerdict(base, { clicks12m: 0, impressions12m: 10, clickTrend12m: 'flat', referringDomains: 0 }, []);
    expect(v.verdict).toBe('prune_or_redirect');
    expect(v.needsReview).toBe(true);
  });
  it('rewrites for intent when page and query intent disagree with confidence', () => {
    const a: Answers = { ...base, page_intent: choice('commercial_investigation', 0.8) };
    expect(decideVerdict(a, healthy, []).verdict).toBe('rewrite_for_intent');
  });
  it('ignores an intent mismatch the model is not sure about', () => {
    const a: Answers = { ...base, page_intent: choice('commercial_investigation', 0.2) };
    expect(decideVerdict(a, healthy, []).verdict).toBe('leave');
  });
  it('expands thin pages with impressions', () => {
    expect(decideVerdict({ ...base, depth: score(0.4) }, healthy, []).verdict).toBe('expand');
  });
  it('refreshes sharply declining pages with time-sensitive claims', () => {
    const a: Answers = { ...base, contains_time_sensitive_claims: noul(0.9) };
    expect(decideVerdict(a, { ...healthy, clickTrend12m: 'declining_sharply' }, []).verdict).toBe('refresh');
  });
});

describe('decidePublishGate', () => {
  const good: Answers = {
    depth: score(1.8), delivers_title_promise: noul(0.9), useful_to_searcher: noul(0.9), unverifiable_claim: noul(0.1),
    template_feel: noul(0.1), reads_as_machine_filler: noul(0.1), guaranteed_outcome_claim: noul(0.05), duplicates_s0: noul(0.1),
  };
  const checks = { wordCount: 600, placeholderFound: false, bannedTermsFound: [] as string[] };
  it('indexes a clean page', () => {
    expect(decidePublishGate(good, checks).disposition).toBe('index');
  });
  it('kills on code checks before asking the model anything', () => {
    expect(decidePublishGate(good, { ...checks, placeholderFound: true }).disposition).toBe('kill');
    expect(decidePublishGate(good, { ...checks, bannedTermsFound: ['agena'] }).disposition).toBe('kill');
    expect(decidePublishGate(good, { ...checks, duplicateRatio: 0.95 }).disposition).toBe('kill');
  });
  it('kills a templated duplicate', () => {
    expect(decidePublishGate({ ...good, duplicates_s0: noul(0.9), template_feel: noul(0.8) }, checks).disposition).toBe('kill');
  });
  it('kills thin and useless', () => {
    expect(decidePublishGate({ ...good, depth: score(0.2), useful_to_searcher: noul(0.1) }, checks).disposition).toBe('kill');
  });
  it('improves on an unverifiable claim', () => {
    const d = decidePublishGate({ ...good, unverifiable_claim: noul(0.85) }, checks);
    expect(d.disposition).toBe('improve');
    expect(d.reasons[0]).toMatch(/unverifiable/);
  });
  it('flags borderline answers for review', () => {
    expect(decidePublishGate({ ...good, useful_to_searcher: noul(0.5) }, checks).needsReview).toBe(true);
  });
});

describe('decideCompliance', () => {
  const clean: Answers = Object.fromEntries([
    'guaranteed_outcome', 'risk_free_implication', 'past_performance_as_future', 'downplays_risk', 'unsubstantiated_superlative',
    'statistic_without_source', 'testimonial_implies_typical', 'fake_urgency', 'comparative_claim_names_competitor', 'encourages_unaffordable_risk',
  ].map((k) => [k, noul(0.05)]));
  it('passes clean copy with a prominent risk warning', () => {
    expect(decideCompliance({ ...clean, risk_warning_prominence: score(2, 0.9) }).status).toBe('pass');
  });
  it('blocks guaranteed outcomes', () => {
    const d = decideCompliance({ ...clean, guaranteed_outcome: noul(0.95), risk_warning_prominence: score(2, 0.9) });
    expect(d.status).toBe('block');
    expect(d.flags[0].rule).toBe('guaranteed_outcome');
  });
  it('blocks a missing risk warning when required, and not when not', () => {
    expect(decideCompliance({ ...clean, risk_warning_prominence: score(0.2, 0.9) }).status).toBe('block');
    expect(decideCompliance({ ...clean, risk_warning_prominence: score(0.2, 0.9) }, { requireRiskWarning: false, blockThreshold: 0.8, flagThreshold: 0.6, reviewBand: [0.4, 0.6] }).status).toBe('pass');
  });
  it('flags a flag-severity rule even at high probability', () => {
    const d = decideCompliance({ ...clean, fake_urgency: noul(0.95), risk_warning_prominence: score(2, 0.9) });
    expect(d.status).toBe('flag');
  });
});
