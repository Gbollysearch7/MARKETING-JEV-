import 'server-only';
import { createHash } from 'node:crypto';
import type { DecideInput, DecideResult, DecisionProvider } from '@/engine/jev/client';
import { confidenceOf } from '@/engine/jev/confidence';
import { db, now } from './db';
import { createJob, updateJob, type Job } from './repo';

/**
 * Shared plumbing for every module (2 to 7): background jobs with progress, and Jev calls that are
 * always written to the decision log with the model version, question-set version and a state fingerprint.
 */

export interface JobContext {
  jobId: string;
  siteId: string;
  provider: DecisionProvider;
  /** Report progress; cheap to call often (writes are throttled). */
  progress: (done: number, total: number, message?: string) => void;
  /** One Jev call, logged answer by answer under `itemKey` (a URL, keyword, prospect id …). */
  decide: (itemKey: string, criteriaVersion: string, input: DecideInput) => Promise<DecideResult>;
  /** Running total of input tokens across this job's calls. */
  tokens: () => number;
}

/** Start a background job of `type` (e.g. 'gate', 'keywords'). Returns at once; the work runs after. */
export function startModuleJob(siteId: string, type: string, provider: DecisionProvider, work: (ctx: JobContext) => Promise<string | void>, meta: Record<string, unknown> = {}): Job {
  const job = createJob(siteId, type, meta);
  updateJob(job.id, { provider: provider.name, model: provider.model, message: 'Starting' });
  const d = db();
  const ins = d.prepare(`insert into decisions (job_id, site_id, path, question_key, answer, confidence, model, latency_ms, state_hash, criteria_version, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let tokens = 0;
  let last = 0;
  const ctx: JobContext = {
    jobId: job.id,
    siteId,
    provider,
    progress: (done, total, message) => {
      if (Date.now() - last > 250 || done >= total) {
        last = Date.now();
        updateJob(job.id, { progress: done, total, message: message ?? `${done} of ${total}` });
      }
    },
    decide: async (itemKey, criteriaVersion, input) => {
      const res = await provider.decide(input);
      tokens += res.usage?.input_tokens ?? 0;
      const hash = createHash('sha256').update(JSON.stringify(input.state)).digest('hex').slice(0, 16);
      const t = now();
      d.transaction(() => {
        for (const [k, a] of Object.entries(res.answers)) ins.run(job.id, siteId, itemKey, k, JSON.stringify(a), Math.round(confidenceOf(a) * 1000) / 1000, res.model, res.latencyMs, hash, criteriaVersion, t);
      })();
      return res;
    },
    tokens: () => tokens,
  };
  void (async () => {
    try {
      const msg = await work(ctx);
      updateJob(job.id, { status: 'done', input_tokens: tokens, message: msg || 'Done', finished_at: now() });
    } catch (err) {
      updateJob(job.id, { status: 'failed', input_tokens: tokens, error: err instanceof Error ? err.message : String(err), finished_at: now() });
    }
  })();
  return job;
}

/** Run `fn` over `items` with bounded concurrency, reporting progress. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, onDone?: (done: number) => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return out;
}

/** The latest finished job of a type for a site. */
export function latestJobOf(siteId: string, type: string): Job | null {
  const j = db().prepare(`select * from jobs where site_id = ? and type = ? and status = 'done' order by finished_at desc limit 1`).get(siteId, type) as (Job & { meta: string }) | undefined;
  return j ? { ...j, meta: JSON.parse(j.meta || '{}') } : null;
}

/** The running job of a type for a site, if any. */
export function runningJobOf(siteId: string, type: string): Job | null {
  const j = db().prepare(`select * from jobs where site_id = ? and type = ? and status = 'running' order by created_at desc limit 1`).get(siteId, type) as (Job & { meta: string }) | undefined;
  return j ? { ...j, meta: JSON.parse(j.meta || '{}') } : null;
}
