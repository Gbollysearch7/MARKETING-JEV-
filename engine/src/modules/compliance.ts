import { COMPLIANCE_FINANCE_VERSION, complianceFinanceQuestions } from '../criteria/compliance-finance.v1.js';
import type { DecisionClient } from '../jev/client.js';
import { explode, type DecisionSink } from '../log/decision-log.js';
import { decideCompliance, type ComplianceConfig, type ComplianceDecision } from '../rules/compliance.js';
import { sha256 } from '../util/hash.js';
import { mapPool } from '../util/pool.js';

export type Channel = 'ad' | 'email' | 'landing_page' | 'blog' | 'social';

export interface CopyPiece {
  id: string;
  channel: Channel;
  text: string;
}

export interface ComplianceRow extends ComplianceDecision {
  id: string;
  channel: Channel;
  inputTokens: number;
}

export interface ComplianceOptions {
  config?: ComplianceConfig;
  concurrency?: number;
  workspaceId?: string;
  sink?: DecisionSink;
}

/** One call per piece, every rule in parallel. Fast enough to run on each keystroke pause in an editor. */
export async function runCompliance(pieces: CopyPiece[], client: DecisionClient, opts: ComplianceOptions = {}): Promise<ComplianceRow[]> {
  const questions = complianceFinanceQuestions();
  return mapPool(pieces, opts.concurrency ?? 8, async (piece): Promise<ComplianceRow> => {
    const state = { copy: piece.text, channel: piece.channel };
    const res = await client.decide({ state, questions });
    if (opts.sink) {
      await opts.sink.write(explode(res, {
        workspaceId: opts.workspaceId ?? 'local',
        entityType: 'copy',
        entityId: piece.id,
        criteriaVersion: COMPLIANCE_FINANCE_VERSION,
        stateHash: sha256(JSON.stringify(state)),
      }));
    }
    return { id: piece.id, channel: piece.channel, inputTokens: res.usage.input_tokens, ...decideCompliance(res.answers, opts.config) };
  });
}
