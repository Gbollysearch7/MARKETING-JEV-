import type { Questions } from '../jev/types.js';

export const COMPLIANCE_FINANCE_VERSION = 'compliance-finance.v1';

export type Severity = 'block' | 'flag';

export interface ComplianceRule {
  family: string;
  severity: Severity;
  instructions: string;
}

/**
 * Financial promotions criteria library, first cut. Each rule is one literal yes/no question.
 * Written for UK-style financial promotion rules (clear, fair, not misleading; balanced risk
 * warnings; no guaranteed returns). Review with a compliance professional before relying on it.
 * State shape: { copy: string, channel: 'ad'|'email'|'landing_page'|'blog'|'social' }
 */
export const FINANCE_RULES: Record<string, ComplianceRule> = {
  guaranteed_outcome: {
    family: 'guaranteed returns',
    severity: 'block',
    instructions: 'Does `copy` state or imply that profits, payouts or funding are guaranteed or certain?',
  },
  risk_free_implication: {
    family: 'risk-free framing',
    severity: 'block',
    instructions: 'Does `copy` describe the product or activity as risk-free, safe, or without downside?',
  },
  past_performance_as_future: {
    family: 'past performance',
    severity: 'flag',
    instructions: 'Does `copy` present past results or past performance as an indication of what the reader will achieve?',
  },
  downplays_risk: {
    family: 'risk downplayed',
    severity: 'flag',
    instructions: 'Does `copy` describe losses as unlikely, minor or easy to recover from?',
  },
  unsubstantiated_superlative: {
    family: 'unsubstantiated claim',
    severity: 'flag',
    instructions: 'Does `copy` use a superlative such as best, number one, fastest or cheapest without evidence or a source given in `copy`?',
  },
  statistic_without_source: {
    family: 'unsubstantiated claim',
    severity: 'flag',
    instructions: 'Does `copy` cite a specific number, percentage or statistic without naming its source?',
  },
  testimonial_implies_typical: {
    family: 'testimonial',
    severity: 'flag',
    instructions: 'Does `copy` present an individual result or testimonial in a way that suggests it is typical for most people?',
  },
  fake_urgency: {
    family: 'pressure',
    severity: 'flag',
    instructions: 'Does `copy` pressure the reader with a deadline, scarcity or countdown that is not explained by a real, stated constraint?',
  },
  comparative_claim_names_competitor: {
    family: 'comparative claim',
    severity: 'flag',
    instructions: 'Does `copy` make a comparative claim that names or clearly identifies a competitor?',
  },
  encourages_unaffordable_risk: {
    family: 'vulnerable readers',
    severity: 'block',
    instructions: 'Does `copy` encourage the reader to borrow, or to use money they cannot afford to lose?',
  },
};

export function complianceFinanceQuestions(): Questions {
  const q: Questions = {};
  for (const [key, rule] of Object.entries(FINANCE_RULES)) {
    q[key] = { type: 'noul', instructions: rule.instructions };
  }
  q.risk_warning_prominence = {
    type: 'score',
    instructions: 'How prominent is the risk warning in `copy`?',
    criteria: [
      'No risk warning anywhere in the copy',
      'A risk warning exists but appears only after the main pitch, or in a footer or small print',
      'A risk warning appears near the first claim about returns or outcomes and is as prominent as that claim',
    ],
  };
  return q;
}
