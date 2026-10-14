import type { DecideInput, DecideResult } from '../../engine/jev/client';
import { buildQuestions, buildState } from './battery';
import { computeChecks, toBands, type CheckOptions } from './checks';
import { allowedVerdicts, combine, hardRule, ruleKill } from './rules';
import { DEFAULT_GATE_THRESHOLDS, type CheckBands, type CodeChecks, type GatePageInput, type GateResult, type GateThresholds } from './types';

/** One logged Jev call. The server passes `ctx.decide` bound to the criteria version; tests pass a provider. */
export type Decide = (itemKey: string, input: DecideInput) => Promise<DecideResult>;

export interface ScoreOptions { hasGsc: boolean; thresholds?: GateThresholds }

/** Score one page whose code checks are already computed. Hard rules first; Jev only when no rule decides. */
export async function scorePage(page: GatePageInput, checks: CodeChecks, decide: Decide, opts: ScoreOptions): Promise<GateResult & { bands: CheckBands }> {
  const bands = toBands(checks, Boolean(page.query), opts.hasGsc);
  const hard = hardRule(checks);
  if (hard) return { ...ruleKill(page, checks, hard.rule, opts.hasGsc), model: 'rules', latencyMs: 0, answers: null, state: null, bands };
  const { allowed, applied } = allowedVerdicts(checks);
  const state = buildState(page, bands, checks.uniqueExcerpt);
  const res = await decide(page.path, { state, questions: buildQuestions(allowed, Boolean(page.query)) });
  const c = combine(page, checks, res.answers, applied, opts.hasGsc, opts.thresholds ?? DEFAULT_GATE_THRESHOLDS);
  return { ...c, model: res.model, latencyMs: res.latencyMs, answers: res.answers, state, bands };
}

export interface RunOptions extends ScoreOptions {
  checks?: CheckOptions;
  concurrency?: number;
  onResult?: (i: number, r: GateResult & { bands: CheckBands }, checks: CodeChecks) => void;
  onProgress?: (done: number, total: number) => void;
}

/** Score a whole batch: code checks across the batch, then each page with bounded concurrency. */
export async function runGate(pages: GatePageInput[], decide: Decide, opts: RunOptions) {
  const checks = computeChecks(pages, opts.checks);
  const results = new Array<GateResult & { bands: CheckBands }>(pages.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < pages.length) {
      const i = next++;
      results[i] = await scorePage(pages[i], checks[i], decide, opts);
      opts.onResult?.(i, results[i], checks[i]);
      opts.onProgress?.(++done, pages.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 8, pages.length || 1) }, worker));
  return { checks, results };
}
