import 'server-only';
import { crawlSitemap } from '@/engine/ingest/sitemap-crawl';
import type { DecisionLogEntry } from '@/engine/verdict/run';
import { runVerdicts } from '@/engine/verdict/run';
import { buildSiteData } from '@/engine/site';
import { db, newId, now } from './db';
import { getProvider } from './provider';
import { createJob, getVerdict, saveUpload, setVerdictReview, siteInputs, updateJob, type Job } from './repo';
import { taskFromVerdict } from './tasks';

/** Score every URL on a site. Runs in the background; the UI polls the job row. */
export function startVerdictJob(siteId: string): Job {
  const inputs = siteInputs(siteId);
  const { urls, ctx, notes } = buildSiteData(inputs);
  if (!urls.length) throw new Error('Upload Search Console data or a crawl first.');
  const provider = getProvider();
  const job = createJob(siteId, 'verdicts', { uploadIds: inputs.uploadIds, notes, urls: urls.length });
  updateJob(job.id, { total: urls.length, provider: provider.name, model: provider.model, message: `Scoring ${urls.length} URLs` });

  void (async () => {
    const d = db();
    const insDecision = d.prepare(`insert into decisions (job_id, site_id, path, question_key, answer, confidence, model, latency_ms, state_hash, criteria_version, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let lastTick = 0;
    try {
      const res = await runVerdicts(urls, ctx, provider, {
        concurrency: provider.name === 'mock' ? 16 : 8,
        onProgress: (done, total) => {
          if (Date.now() - lastTick > 250 || done === total) {
            lastTick = Date.now();
            updateJob(job.id, { progress: done, total, message: `Scored ${done} of ${total} URLs` });
          }
        },
        onDecisions: (entries: DecisionLogEntry[]) => {
          const t = now();
          d.transaction(() => { for (const e of entries) insDecision.run(job.id, siteId, e.path, e.questionKey, JSON.stringify(e.answer), e.confidence, e.model, e.latencyMs, e.stateHash, e.criteriaVersion, t); })();
        },
      });

      const ins = d.prepare(`insert into verdicts (id, job_id, site_id, path, template, skipped, verdict, probability, probabilities, router, needs_approval, locked_by, target, target_probability, reasons, rules, settle, impact_low, impact_high, monthly_clicks, monthly_impressions, position, bands, state, answers, model, status)
        values (@id, @job_id, @site_id, @path, @template, @skipped, @verdict, @probability, @probabilities, @router, @needs_approval, @locked_by, @target, @target_probability, @reasons, @rules, @settle, @impact_low, @impact_high, @monthly_clicks, @monthly_impressions, @position, @bands, @state, @answers, @model, 'proposed')`);
      const autoIds: string[] = [];
      d.transaction(() => {
        for (const v of res.verdicts) {
          const id = newId();
          ins.run({
            id, job_id: job.id, site_id: siteId, path: v.path, template: v.template, skipped: v.skipped, verdict: v.verdict, probability: v.probability,
            probabilities: JSON.stringify(v.probabilities), router: v.router, needs_approval: v.needsApproval ? 1 : 0, locked_by: v.lockedBy, target: v.target,
            target_probability: v.targetProbability, reasons: JSON.stringify(v.reasons), rules: JSON.stringify(v.rulesApplied), settle: JSON.stringify(v.settle),
            impact_low: v.impact.low, impact_high: v.impact.high, monthly_clicks: v.monthlyClicks, monthly_impressions: v.monthlyImpressions, position: v.position,
            bands: v.bands ? JSON.stringify(v.bands) : null, state: v.state ? JSON.stringify(v.state) : null, answers: v.answers ? JSON.stringify(v.answers) : null, model: v.model,
          });
          if (!v.skipped && v.router === 'auto' && !v.needsApproval) autoIds.push(id);
        }
        const insPair = d.prepare('insert into cannibal_pairs (job_id, site_id, a, b, primary_path, shared) values (?, ?, ?, ?, ?, ?)');
        for (const p of res.pairs) insPair.run(job.id, siteId, p.a, p.b, p.primary, JSON.stringify(p.shared));
      })();

      // Confidence at or above the auto threshold goes straight into the work queue (PRD section 5).
      for (const id of autoIds) {
        setVerdictReview(id, { status: 'approved', reviewed_by: 'auto' });
        const v = getVerdict(id);
        if (v) taskFromVerdict(v);
      }
      updateJob(job.id, { status: 'done', progress: urls.length, input_tokens: res.inputTokens, message: `Scored ${urls.length} URLs`, finished_at: now() });
    } catch (err) {
      updateJob(job.id, { status: 'failed', error: err instanceof Error ? err.message : String(err), finished_at: now() });
    }
  })();
  return job;
}

export function startCrawlJob(siteId: string, sitemapUrl: string, limit: number): Job {
  const job = createJob(siteId, 'crawl', { sitemapUrl, limit });
  updateJob(job.id, { message: 'Reading sitemap' });
  void (async () => {
    try {
      const res = await crawlSitemap(sitemapUrl, {
        limit,
        onProgress: (done, total) => updateJob(job.id, { progress: done, total, message: `Fetched ${done} of ${total} pages` }),
      });
      saveUpload(siteId, 'crawl', 'sitemap', sitemapUrl, { pages: res.pages }, null, res.pages.length, res.notes);
      updateJob(job.id, { status: 'done', message: res.notes[0], finished_at: now() });
    } catch (err) {
      updateJob(job.id, { status: 'failed', error: err instanceof Error ? err.message : String(err), finished_at: now() });
    }
  })();
  return job;
}
