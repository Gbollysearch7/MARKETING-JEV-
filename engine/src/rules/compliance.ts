import { isScore, p } from '../jev/confidence.js';
import type { Answers } from '../jev/types.js';
import { FINANCE_RULES, type ComplianceRule } from '../criteria/compliance-finance.v1.js';

export type ComplianceStatus = 'pass' | 'flag' | 'block';

export interface ComplianceFlag {
  rule: string;
  family: string;
  severity: ComplianceRule['severity'];
  probability: number;
  action: 'block' | 'flag' | 'review';
}

export interface ComplianceDecision {
  status: ComplianceStatus;
  flags: ComplianceFlag[];
  riskWarning: { score: number; confidence: number } | null;
}

export interface ComplianceConfig {
  /** Channels where a risk warning is mandatory, e.g. ads and landing pages for leveraged products. */
  requireRiskWarning: boolean;
  blockThreshold: number;
  flagThreshold: number;
  reviewBand: [number, number];
  rules?: Record<string, ComplianceRule>;
}

export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  requireRiskWarning: true,
  blockThreshold: 0.8,
  flagThreshold: 0.6,
  reviewBand: [0.4, 0.6],
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function decideCompliance(a: Answers, cfg: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG): ComplianceDecision {
  const rules = cfg.rules ?? FINANCE_RULES;
  const flags: ComplianceFlag[] = [];
  let status: ComplianceStatus = 'pass';

  for (const [key, rule] of Object.entries(rules)) {
    const prob = p(a, key);
    let action: ComplianceFlag['action'] | null = null;
    if (prob >= cfg.blockThreshold && rule.severity === 'block') action = 'block';
    else if (prob >= cfg.flagThreshold) action = 'flag';
    else if (prob > cfg.reviewBand[0] && prob < cfg.reviewBand[1]) action = 'review';
    if (!action) continue;
    flags.push({ rule: key, family: rule.family, severity: rule.severity, probability: r3(prob), action });
    if (action === 'block') status = 'block';
    else if (status !== 'block') status = 'flag';
  }

  const rw = a.risk_warning_prominence;
  const riskWarning = isScore(rw) ? { score: r3(rw.score), confidence: r3(rw.confidence) } : null;
  if (cfg.requireRiskWarning && riskWarning && riskWarning.score < 1 && riskWarning.confidence >= 0.5) {
    flags.push({ rule: 'risk_warning_missing', family: 'risk warning', severity: 'block', probability: r3(1 - riskWarning.score), action: 'block' });
    status = 'block';
  } else if (cfg.requireRiskWarning && riskWarning && riskWarning.score < 1.5) {
    flags.push({ rule: 'risk_warning_not_prominent', family: 'risk warning', severity: 'flag', probability: r3(1 - riskWarning.score / 2), action: 'flag' });
    if (status !== 'block') status = 'flag';
  }

  flags.sort((x, y) => y.probability - x.probability);
  return { status, flags, riskWarning };
}
