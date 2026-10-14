import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// The app's @/ path alias is not configured for vitest; point the engine imports at their files.
vi.mock('@/engine/ingest/backlinks', () => import('../src/engine/ingest/backlinks'));
vi.mock('@/engine/ingest/crawl-csv', () => import('../src/engine/ingest/crawl-csv'));
vi.mock('@/engine/ingest/ga4', () => import('../src/engine/ingest/ga4'));
vi.mock('@/engine/ingest/gsc', () => import('../src/engine/ingest/gsc'));
vi.mock('@/engine/ingest/sitemap-crawl', () => import('../src/engine/ingest/sitemap-crawl'));
vi.mock('@/engine/ingest/url', () => import('../src/engine/ingest/url'));
vi.mock('@/engine/jev/client', () => import('../src/engine/jev/client'));
vi.mock('@/engine/site', () => import('../src/engine/site'));
vi.mock('@/engine/verdict/mock-verdict', () => import('../src/engine/verdict/mock-verdict'));
vi.mock('@/engine/verdict/run', () => import('../src/engine/verdict/run'));
vi.mock('@/engine/verdict/types', () => import('../src/engine/verdict/types'));
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rc-core-loop-'));
delete process.env.TYPESAFE_API_KEY;

const { db, newId, now } = await import('../src/lib/db');
const repo = await import('../src/lib/repo');
const { loadSamples } = await import('../src/lib/ingest');
const { startVerdictJob } = await import('../src/lib/jobs');
const { taskFromVerdict, measureOutcomes } = await import('../src/lib/tasks');
const { applyRules } = await import('../src/engine/verdict/rules');
const { accountStatus } = await import('../src/lib/plans');

function makeSite() {
  const acc = newId();
  db().prepare('insert into accounts (id, name, plan, trial_ends_at, created_at) values (?, ?, ?, ?, ?)').run(acc, 'QA', 'trial', new Date(Date.now() + 86_400_000).toISOString(), now());
  return repo.createSite(acc, 'Sample Outdoors', 'sample-outdoors.example', null);
}

async function score(siteId: string) {
  const job = startVerdictJob(siteId, 1000);
  for (let i = 0; i < 200 && repo.getJob(job.id)!.status === 'running'; i++) await new Promise((r) => setTimeout(r, 25));
  const j = repo.getJob(job.id)!;
  expect(j.status).toBe('done');
  return j;
}

const waiting = (jobId: string) => repo.listVerdicts(jobId, { status: 'proposed', actionOnly: true }, 0, 0).total;

describe('the weekly loop', () => {
  it('keeps human reviews when the next run proposes the same, and only asks about what changed', async () => {
    const site = makeSite();
    loadSamples(site.id);
    const first = await score(site.id);
    const before = waiting(first.id);
    const rows = repo.listVerdicts(first.id, { status: 'proposed', actionOnly: true }, 3, 0).rows;
    repo.setVerdictReview(rows[0].id, { status: 'approved', reviewed_by: 'user', final_target: rows[0].target });
    taskFromVerdict({ ...rows[0], status: 'approved' });
    repo.setVerdictReview(rows[1].id, { status: 'rejected', reviewed_by: 'user' });
    repo.setVerdictReview(rows[2].id, { status: 'approved', reviewed_by: 'user', final_verdict: 'leave' });
    expect(waiting(first.id)).toBe(before - 3);

    const second = await score(site.id);
    expect(second.message).toMatch(/3 earlier reviews kept/);
    expect(waiting(second.id)).toBe(before - 3);
    const kept = repo.verdictForPath(second.id, rows[1].path)!;
    expect(kept.status).toBe('rejected');
    expect(kept.reviewed_by).toBe('carried');
    // A kept review is not counted again as a new human review, and does not create a second task.
    expect((db().prepare(`select count(*) n from verdicts where site_id = ? and reviewed_by = 'user'`).get(site.id) as { n: number }).n).toBe(3);
    expect((db().prepare(`select count(*) n from tasks where site_id = ? and path = ?`).get(site.id, rows[0].path) as { n: number }).n).toBe(1);

    repo.reopenVerdict(kept.id);
    expect(repo.getVerdict(kept.id)!.status).toBe('proposed');
  });

  it('does not measure an outcome against the data the decision was scored on', async () => {
    const site = makeSite();
    loadSamples(site.id);
    const job = await score(site.id);
    const v = repo.listVerdicts(job.id, { verdict: 'expand' }, 1, 0).rows[0];
    const t = taskFromVerdict({ ...v, status: 'approved' })!;
    repo.updateTask(t.id, { status: 'done', done_at: '2026-06-01' });
    expect(measureOutcomes(site.id)).toBe(0);
  });

  it('draws the clicks trend from pages exports only when one exists', () => {
    const site = makeSite();
    loadSamples(site.id);
    const hist = repo.clicksHistory(site.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].start).toBe('2026-07-01');
  });
});

describe('rules without Search Console data', () => {
  it('never offers Prune or Redirect, and does not call missing demand zero', () => {
    const u = { path: '/a/b', gsc: null, ga4: null, crawl: { path: '/a/b', url: '', status: 200, indexable: true, title: '', h1: '', metaDescription: '', wordCount: 100, canonicalPath: null, inlinks: 2, lastModified: '2020-01-01', headings: [], excerpt: '' }, backlinks: null, queries: [] } as never;
    const s = { pageType: 'article', monthlyClicks: 0, monthlyImpressions: 0, highVolumeQueries8to20: 0, competing: [], conversions: null, ageDays: 2000 } as never;
    const t = { protectConversions: 1, protectNewerThanDays: 90, minMonthlyImpressionsForDemand: 50 } as never;
    const r = applyRules(u, s, t, true, false);
    expect(r.allowed).not.toContain('prune');
    expect(r.allowed).not.toContain('redirect');
    expect(r.allowed).toContain('refresh');
  });
});

describe('plans when card payments are off', () => {
  it('keeps the founder’s local copy active after the trial, and hosted copies on normal rules', () => {
    const expired = { plan: 'trial', trial_ends_at: '2020-01-01T00:00:00Z', subscription_status: null };
    expect(accountStatus(expired).active).toBe(false);
    const local = accountStatus(expired, Date.now(), { billingOn: false });
    expect(local.active).toBe(true);
    expect(local.urlLimit).toBeGreaterThan(1000);
  });
});
