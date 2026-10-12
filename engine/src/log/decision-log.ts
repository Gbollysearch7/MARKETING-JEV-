import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { confidenceOf } from '../jev/confidence.js';
import type { Answer, SystemOneResponse } from '../jev/types.js';

export interface DecisionRecord {
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  criteria_set_version: string;
  model_version: string;
  question_key: string;
  answer: Answer;
  confidence: number;
  state_hash: string;
  created_at: string;
}

export interface ExplodeContext {
  workspaceId: string;
  entityType: string;
  entityId: string;
  criteriaVersion: string;
  stateHash: string;
}

/** One record per question so the log can be queried per question and per version. */
export function explode(res: SystemOneResponse, ctx: ExplodeContext): DecisionRecord[] {
  const createdAt = new Date().toISOString();
  return Object.entries(res.answers).map(([key, answer]) => ({
    workspace_id: ctx.workspaceId,
    entity_type: ctx.entityType,
    entity_id: ctx.entityId,
    criteria_set_version: ctx.criteriaVersion,
    model_version: res.model,
    question_key: key,
    answer,
    confidence: Math.round(confidenceOf(answer) * 1000) / 1000,
    state_hash: ctx.stateHash,
    created_at: createdAt,
  }));
}

export interface DecisionSink {
  write(records: DecisionRecord[]): Promise<void>;
  close?(): Promise<void>;
}

export class MemorySink implements DecisionSink {
  readonly records: DecisionRecord[] = [];
  async write(records: DecisionRecord[]): Promise<void> {
    this.records.push(...records);
  }
}

export class JsonlSink implements DecisionSink {
  private ready: Promise<void>;
  constructor(private readonly path: string) {
    this.ready = mkdir(dirname(path), { recursive: true }).then(() => undefined);
  }
  async write(records: DecisionRecord[]): Promise<void> {
    await this.ready;
    if (!records.length) return;
    await appendFile(this.path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
}

/** Writes to the `decisions` table through PostgREST. Needs the service role key or an insert policy. */
export class SupabaseSink implements DecisionSink {
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly batchSize = 500,
  ) {}
  async write(records: DecisionRecord[]): Promise<void> {
    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      const res = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/rest/v1/decisions`, {
        method: 'POST',
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`Supabase insert failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
}

export class MultiSink implements DecisionSink {
  constructor(private readonly sinks: DecisionSink[]) {}
  async write(records: DecisionRecord[]): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.write(records)));
  }
  async close(): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.close?.()));
  }
}

/** JSONL always; Supabase too when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set. */
export function createSink(jsonlPath: string): DecisionSink {
  const sinks: DecisionSink[] = [new JsonlSink(jsonlPath)];
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) sinks.push(new SupabaseSink(url, key));
  return new MultiSink(sinks);
}
