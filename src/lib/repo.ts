import 'server-only';
import type { BacklinkPage } from '@/engine/ingest/backlinks';
import type { CrawlPage } from '@/engine/ingest/crawl-csv';
import type { Ga4Import } from '@/engine/ingest/ga4';
import type { GscImport } from '@/engine/ingest/gsc';
import { hostOf, templateOf } from '@/engine/ingest/url';
import { buildSiteData, type SiteInputs } from '@/engine/site';
import type { CannibalPair, Router, Verdict } from '@/engine/verdict/types';
import { db, newId, now } from './db';

export type UploadKind = 'gsc_pages' | 'gsc_queries' | 'ga4' | 'crawl' | 'backlinks';
export const UPLOAD_KINDS: UploadKind[] = ['gsc_pages', 'gsc_queries', 'ga4', 'crawl', 'backlinks'];

export interface Site { id: string; name: string; domain: string; sitemap_url: string | null; created_at: string }
export interface Upload {
  id: string; site_id: string; kind: UploadKind; source: string; filename: string;
  period_start: string | null; period_end: string | null; row_count: number; notes: string[]; created_at: string;
}
export interface Job {
  id: string; site_id: string; type: 'verdicts' | 'crawl'; status: 'running' | 'done' | 'failed';
  progress: number; total: number; message: string | null; error: string | null; provider: string | null; model: string | null;
  input_tokens: number; meta: Record<string, unknown>; created_at: string; finished_at: string | null;
}
export interface VerdictRow {
  id: string; job_id: string; site_id: string; path: string; template: string; skipped: string | null;
  verdict: Verdict | null; probability: number; probabilities: Partial<Record<Verdict, number>>; router: Router | null;
  needs_approval: boolean; locked_by: string | null; target: string | null; target_probability: number | null;
  reasons: string[]; rules: string[]; settle: string[]; impact_low: number; impact_high: number;
  monthly_clicks: number; monthly_impressions: number; position: number | null;
  bands: Record<string, string> | null; state: unknown; answers: Record<string, unknown> | null; model: string;
  status: 'proposed' | 'approved' | 'rejected'; final_verdict: Verdict | null; final_target: string | null;
  reviewed_by: string | null; reviewed_at: string | null;
}
export interface Task {
  id: string; site_id: string; verdict_id: string | null; path: string; verdict: Verdict; target: string | null;
  owner: string | null; due_date: string | null; status: 'todo' | 'in_progress' | 'done' | 'cancelled'; brief: Brief;
  forecast_low: number; forecast_high: number; baseline_clicks_month: number; baseline_target_clicks_month: number | null;
  baseline_site_clicks_month: number | null; created_at: string; done_at: string | null;
}
export interface Brief {
  summary: string;
  queries: { query: string; impressions: number; position: number }[];
  checklist: string[];
  redirect: { from: string; to: string | null; code: 301 | 410 } | null;
  notes: string[];
}
export interface Outcome { id: number; task_id: string; window_days: number; upload_id: string; after_clicks_month: number; delta: number; label: 'worked' | 'neutral' | 'backfired'; measured_at: string }

const J = <T,>(s: string | null): T => (s == null ? (null as T) : (JSON.parse(s) as T));

// ---------- sites ----------

export function listSites(): (Site & { url_count: number; last_run: string | null })[] {
  return db().prepare(`
    select s.*, (select count(*) from site_urls u where u.site_id = s.id) as url_count,
      (select max(finished_at) from jobs j where j.site_id = s.id and j.type = 'verdicts' and j.status = 'done') as last_run
    from sites s order by s.created_at desc`).all() as never;
}

export function getSite(id: string): Site | null {
  return (db().prepare('select * from sites where id = ?').get(id) as Site | undefined) ?? null;
}

export function createSite(name: string, domainOrUrl: string, sitemapUrl: string | null): Site {
  const site: Site = { id: newId(), name, domain: hostOf(domainOrUrl) ?? domainOrUrl, sitemap_url: sitemapUrl, created_at: now() };
  db().prepare('insert into sites (id, name, domain, sitemap_url, created_at) values (@id, @name, @domain, @sitemap_url, @created_at)').run(site);
  return site;
}

export function deleteSite(id: string) {
  db().prepare('delete from sites where id = ?').run(id);
}

// ---------- uploads ----------

type UploadData = GscImport | Ga4Import | { pages: CrawlPage[] } | { pages: BacklinkPage[] };

export function saveUpload(siteId: string, kind: UploadKind, source: string, filename: string, data: UploadData, period: { start: string; end: string } | null, rowCount: number, notes: string[]): Upload {
  const u = { id: newId(), site_id: siteId, kind, source, filename, period_start: period?.start ?? null, period_end: period?.end ?? null, row_count: rowCount, notes: JSON.stringify(notes), data: JSON.stringify(data), created_at: now() };
  db().prepare(`insert into uploads (id, site_id, kind, source, filename, period_start, period_end, row_count, notes, data, created_at)
    values (@id, @site_id, @kind, @source, @filename, @period_start, @period_end, @row_count, @notes, @data, @created_at)`).run(u);
  rebuildSiteUrls(siteId);
  return { ...u, notes } as Upload;
}

export function listUploads(siteId: string): Upload[] {
  return (db().prepare('select id, site_id, kind, source, filename, period_start, period_end, row_count, notes, created_at from uploads where site_id = ? order by created_at desc').all(siteId) as (Upload & { notes: string })[])
    .map((u) => ({ ...u, notes: J<string[]>(u.notes as unknown as string) }));
}

export function deleteUpload(siteId: string, uploadId: string) {
  db().prepare('delete from uploads where id = ? and site_id = ?').run(uploadId, siteId);
  rebuildSiteUrls(siteId);
}

export function latestUploads(siteId: string): Partial<Record<UploadKind, Upload>> {
  const out: Partial<Record<UploadKind, Upload>> = {};
  for (const u of listUploads(siteId)) if (!out[u.kind]) out[u.kind] = u;
  return out;
}

export function uploadData<T>(uploadId: string): T {
  const row = db().prepare('select data from uploads where id = ?').get(uploadId) as { data: string } | undefined;
  if (!row) throw new Error('Upload not found');
  return JSON.parse(row.data) as T;
}

/** The latest upload of each kind, parsed, ready for the engine. */
export function siteInputs(siteId: string): SiteInputs & { uploadIds: Partial<Record<UploadKind, string>> } {
  const latest = latestUploads(siteId);
  const load = <T,>(k: UploadKind) => (latest[k] ? uploadData<T>(latest[k]!.id) : null);
  return {
    gsc: load<GscImport>('gsc_pages'),
    gscQueries: load<GscImport>('gsc_queries'),
    ga4: load<Ga4Import>('ga4'),
    crawl: load<{ pages: CrawlPage[] }>('crawl'),
    backlinks: load<{ pages: BacklinkPage[] }>('backlinks'),
    today: now().slice(0, 10),
    uploadIds: Object.fromEntries(Object.entries(latest).map(([k, u]) => [k, u!.id])),
  };
}

/** Materialise the joined URL table so the Data screen can filter and paginate in SQL. */
export function rebuildSiteUrls(siteId: string) {
  const { urls } = buildSiteData(siteInputs(siteId));
  const d = db();
  const ins = d.prepare(`insert into site_urls (site_id, path, template, clicks, impressions, ctr, position, prev_clicks, sessions, conversions, status, indexable, title, word_count, inlinks, last_modified, referring_domains)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  d.transaction(() => {
    d.prepare('delete from site_urls where site_id = ?').run(siteId);
    for (const u of urls) {
      ins.run(siteId, u.path, templateOf(u.path), u.gsc?.clicks ?? null, u.gsc?.impressions ?? null, u.gsc?.ctr ?? null, u.gsc?.impressions ? u.gsc.position : null,
        u.gsc?.prevClicks ?? null, u.ga4?.sessions ?? null, u.ga4?.conversions ?? null, u.crawl?.status ?? null,
        u.crawl ? (u.crawl.indexable ? 1 : 0) : null, u.crawl?.title || null, u.crawl?.wordCount ?? null, u.crawl?.inlinks ?? null,
        u.crawl?.lastModified ?? null, u.backlinks?.referringDomains ?? null);
    }
  })();
}

export interface UrlRow {
  path: string; template: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null; prev_clicks: number | null;
  sessions: number | null; conversions: number | null; status: number | null; indexable: number | null; title: string | null;
  word_count: number | null; inlinks: number | null; last_modified: string | null; referring_domains: number | null;
}

export function listUrls(siteId: string, opts: { q?: string; template?: string; sort?: string; limit: number; offset: number }): { rows: UrlRow[]; total: number } {
  const where = ['site_id = ?'];
  const args: unknown[] = [siteId];
  if (opts.q) { where.push('(path like ? or title like ?)'); args.push(`%${opts.q}%`, `%${opts.q}%`); }
  if (opts.template) { where.push('template = ?'); args.push(opts.template); }
  const sorts: Record<string, string> = { clicks: 'clicks desc nulls last', impressions: 'impressions desc nulls last', position: 'position asc nulls last', path: 'path asc', sessions: 'sessions desc nulls last' };
  const order = sorts[opts.sort ?? 'clicks'] ?? sorts.clicks;
  const total = (db().prepare(`select count(*) n from site_urls where ${where.join(' and ')}`).get(...args) as { n: number }).n;
  const rows = db().prepare(`select * from site_urls where ${where.join(' and ')} order by ${order} limit ? offset ?`).all(...args, opts.limit, opts.offset) as UrlRow[];
  return { rows, total };
}

export function templates(siteId: string): { template: string; n: number }[] {
  return db().prepare('select template, count(*) n from site_urls where site_id = ? group by template order by n desc').all(siteId) as never;
}

// ---------- jobs ----------

const parseJob = (j: Job & { meta: string }): Job => ({ ...j, meta: J(j.meta) ?? {} });

export function createJob(siteId: string, type: Job['type'], meta: Record<string, unknown> = {}): Job {
  const j = { id: newId(), site_id: siteId, type, status: 'running', progress: 0, total: 0, message: 'Starting', meta: JSON.stringify(meta), created_at: now() };
  db().prepare(`insert into jobs (id, site_id, type, status, progress, total, message, meta, created_at) values (@id, @site_id, @type, @status, @progress, @total, @message, @meta, @created_at)`).run(j);
  return getJob(j.id)!;
}

export function getJob(id: string): Job | null {
  const j = db().prepare('select * from jobs where id = ?').get(id) as (Job & { meta: string }) | undefined;
  return j ? parseJob(j) : null;
}

export function updateJob(id: string, patch: Partial<Pick<Job, 'status' | 'progress' | 'total' | 'message' | 'error' | 'provider' | 'model' | 'input_tokens' | 'finished_at'>>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db().prepare(`update jobs set ${keys.map((k) => `${k} = @${k}`).join(', ')} where id = @id`).run({ ...patch, id });
}

export function runningJob(siteId: string): Job | null {
  const j = db().prepare(`select * from jobs where site_id = ? and status = 'running' order by created_at desc limit 1`).get(siteId) as (Job & { meta: string }) | undefined;
  return j ? parseJob(j) : null;
}

export function listJobs(siteId: string, type?: Job['type'], limit = 10): Job[] {
  const rows = type
    ? db().prepare('select * from jobs where site_id = ? and type = ? order by created_at desc limit ?').all(siteId, type, limit)
    : db().prepare('select * from jobs where site_id = ? order by created_at desc limit ?').all(siteId, limit);
  return (rows as (Job & { meta: string })[]).map(parseJob);
}

export function latestVerdictJob(siteId: string): Job | null {
  const j = db().prepare(`select * from jobs where site_id = ? and type = 'verdicts' and status = 'done' order by finished_at desc limit 1`).get(siteId) as (Job & { meta: string }) | undefined;
  return j ? parseJob(j) : null;
}

// ---------- verdicts ----------

const parseVerdict = (r: Record<string, unknown>): VerdictRow => ({
  ...(r as unknown as VerdictRow),
  needs_approval: Boolean(r.needs_approval),
  probabilities: J(r.probabilities as string) ?? {},
  reasons: J(r.reasons as string) ?? [],
  rules: J(r.rules as string) ?? [],
  settle: J(r.settle as string) ?? [],
  bands: J(r.bands as string),
  state: J(r.state as string),
  answers: J(r.answers as string),
});

export interface VerdictFilter { verdict?: string; router?: string; template?: string; traffic?: string; status?: string; q?: string; actionOnly?: boolean }

export function listVerdicts(jobId: string, f: VerdictFilter, limit: number, offset: number): { rows: VerdictRow[]; total: number } {
  const where = ['job_id = ?'];
  const args: unknown[] = [jobId];
  if (f.verdict === 'skipped') where.push('skipped is not null');
  else if (f.verdict === 'irreversible') { where.push(`coalesce(final_verdict, verdict) in ('prune', 'redirect')`); where.push('skipped is null'); }
  else if (f.verdict) { where.push('coalesce(final_verdict, verdict) = ?'); args.push(f.verdict); }
  else where.push('skipped is null');
  if (f.actionOnly) where.push(`coalesce(final_verdict, verdict) != 'leave'`);
  if (f.router) { where.push('router = ?'); args.push(f.router); }
  if (f.template) { where.push('template = ?'); args.push(f.template); }
  if (f.status) { where.push('status = ?'); args.push(f.status); }
  if (f.q) { where.push('path like ?'); args.push(`%${f.q}%`); }
  const traffic: Record<string, string> = { none: 'monthly_clicks < 1', low: 'monthly_clicks >= 1 and monthly_clicks < 100', medium: 'monthly_clicks >= 100 and monthly_clicks < 1000', high: 'monthly_clicks >= 1000' };
  if (f.traffic && traffic[f.traffic]) where.push(traffic[f.traffic]);
  const w = where.join(' and ');
  const total = (db().prepare(`select count(*) n from verdicts where ${w}`).get(...args) as { n: number }).n;
  const rows = db().prepare(`select * from verdicts where ${w} order by (case status when 'proposed' then 0 else 1 end), impact_high desc, monthly_clicks desc limit ? offset ?`).all(...args, limit, offset) as Record<string, unknown>[];
  return { rows: rows.map(parseVerdict), total };
}

export function getVerdict(id: string): VerdictRow | null {
  const r = db().prepare('select * from verdicts where id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? parseVerdict(r) : null;
}

export function verdictSummary(jobId: string) {
  const byVerdict = db().prepare(`select coalesce(final_verdict, verdict) v, count(*) n, sum(impact_low) lo, sum(impact_high) hi from verdicts where job_id = ? and skipped is null group by v`).all(jobId) as { v: Verdict; n: number; lo: number; hi: number }[];
  const byRouter = db().prepare(`select router r, count(*) n from verdicts where job_id = ? and skipped is null group by router`).all(jobId) as { r: Router; n: number }[];
  const byStatus = db().prepare(`select status s, count(*) n from verdicts where job_id = ? and skipped is null and coalesce(final_verdict, verdict) != 'leave' group by status`).all(jobId) as { s: string; n: number }[];
  const skipped = (db().prepare('select count(*) n from verdicts where job_id = ? and skipped is not null').get(jobId) as { n: number }).n;
  return { byVerdict, byRouter, byStatus, skipped };
}

export function cannibalPairs(jobId: string): CannibalPair[] {
  return (db().prepare('select a, b, primary_path, shared from cannibal_pairs where job_id = ?').all(jobId) as { a: string; b: string; primary_path: string; shared: string }[])
    .map((r) => ({ a: r.a, b: r.b, primary: r.primary_path, shared: JSON.parse(r.shared) }));
}

export function verdictForPath(jobId: string, path: string): VerdictRow | null {
  const r = db().prepare('select * from verdicts where job_id = ? and path = ?').get(jobId, path) as Record<string, unknown> | undefined;
  return r ? parseVerdict(r) : null;
}

export function setVerdictReview(id: string, patch: { status: VerdictRow['status']; final_verdict?: Verdict | null; final_target?: string | null; reviewed_by: 'auto' | 'user' }) {
  db().prepare(`update verdicts set status = @status, final_verdict = @final_verdict, final_target = @final_target, reviewed_by = @reviewed_by, reviewed_at = @reviewed_at where id = @id`)
    .run({ final_verdict: null, final_target: null, ...patch, id, reviewed_at: now() });
}

export function addLabel(v: VerdictRow, human: string, reason: string | null) {
  db().prepare(`insert into labels (verdict_id, site_id, path, model_verdict, model_probability, human_verdict, reason, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(v.id, v.site_id, v.path, v.verdict, v.probability, human, reason, now());
}

export function labelsForSite(siteId: string, limit = 50) {
  return db().prepare('select * from labels where site_id = ? order by created_at desc limit ?').all(siteId, limit) as { path: string; model_verdict: string; model_probability: number; human_verdict: string; reason: string | null; created_at: string }[];
}

// ---------- decisions ----------

export function listDecisions(jobId: string, f: { path?: string; question?: string; maxConfidence?: number }, limit: number, offset: number) {
  const where = ['job_id = ?'];
  const args: unknown[] = [jobId];
  if (f.path) { where.push('path like ?'); args.push(`%${f.path}%`); }
  if (f.question) { where.push('question_key = ?'); args.push(f.question); }
  if (f.maxConfidence != null) { where.push('confidence <= ?'); args.push(f.maxConfidence); }
  const w = where.join(' and ');
  const total = (db().prepare(`select count(*) n from decisions where ${w}`).get(...args) as { n: number }).n;
  const rows = db().prepare(`select * from decisions where ${w} order by id limit ? offset ?`).all(...args, limit, offset) as { id: number; path: string; question_key: string; answer: string; confidence: number; model: string; latency_ms: number; state_hash: string; criteria_version: string; created_at: string }[];
  return { total, rows: rows.map((r) => ({ ...r, answer: JSON.parse(r.answer) as Record<string, unknown> })) };
}

export function decisionsForPath(jobId: string, path: string) {
  return listDecisions(jobId, {}, 1000, 0).rows.filter((r) => r.path === path);
}

// ---------- tasks ----------

const parseTask = (r: Record<string, unknown>): Task => ({ ...(r as unknown as Task), brief: J(r.brief as string) });

export function openTaskForPath(siteId: string, path: string): Task | null {
  const r = db().prepare(`select * from tasks where site_id = ? and path = ? and status in ('todo', 'in_progress') limit 1`).get(siteId, path) as Record<string, unknown> | undefined;
  return r ? parseTask(r) : null;
}

export function insertTask(t: Omit<Task, 'id' | 'created_at' | 'done_at' | 'status' | 'owner' | 'due_date'>): Task {
  const row = { ...t, id: newId(), status: 'todo', owner: null, due_date: null, created_at: now(), done_at: null, brief: JSON.stringify(t.brief) };
  db().prepare(`insert into tasks (id, site_id, verdict_id, path, verdict, target, owner, due_date, status, brief, forecast_low, forecast_high, baseline_clicks_month, baseline_target_clicks_month, baseline_site_clicks_month, created_at, done_at)
    values (@id, @site_id, @verdict_id, @path, @verdict, @target, @owner, @due_date, @status, @brief, @forecast_low, @forecast_high, @baseline_clicks_month, @baseline_target_clicks_month, @baseline_site_clicks_month, @created_at, @done_at)`).run(row);
  return parseTask(row as unknown as Record<string, unknown>);
}

export function listTasks(siteId: string, f: { status?: string; verdict?: string } = {}): Task[] {
  const where = ['site_id = ?'];
  const args: unknown[] = [siteId];
  if (f.status) { where.push('status = ?'); args.push(f.status); } else where.push(`status != 'cancelled'`);
  if (f.verdict) { where.push('verdict = ?'); args.push(f.verdict); }
  return (db().prepare(`select * from tasks where ${where.join(' and ')} order by (case status when 'in_progress' then 0 when 'todo' then 1 when 'done' then 2 else 3 end), forecast_high desc`).all(...args) as Record<string, unknown>[]).map(parseTask);
}

export function getTask(id: string): Task | null {
  const r = db().prepare('select * from tasks where id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? parseTask(r) : null;
}

export function updateTask(id: string, patch: Partial<Pick<Task, 'owner' | 'due_date' | 'status' | 'done_at'>>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db().prepare(`update tasks set ${keys.map((k) => `${k} = @${k}`).join(', ')} where id = @id`).run({ ...patch, id });
}

// ---------- outcomes ----------

export function outcomesForSite(siteId: string): (Outcome & { path: string; verdict: Verdict })[] {
  return db().prepare(`select o.*, t.path, t.verdict from outcomes o join tasks t on t.id = o.task_id where t.site_id = ? order by o.measured_at desc`).all(siteId) as never;
}

export function outcomesForTask(taskId: string): Outcome[] {
  return db().prepare('select * from outcomes where task_id = ? order by window_days').all(taskId) as Outcome[];
}

export function saveOutcome(o: Omit<Outcome, 'id' | 'measured_at'>) {
  db().prepare(`insert or replace into outcomes (task_id, window_days, upload_id, after_clicks_month, delta, label, measured_at) values (?, ?, ?, ?, ?, ?, ?)`)
    .run(o.task_id, o.window_days, o.upload_id, o.after_clicks_month, o.delta, o.label, now());
}

export function gscUploadsWithPeriod(siteId: string): Upload[] {
  return listUploads(siteId).filter((u) => (u.kind === 'gsc_pages' || u.kind === 'gsc_queries') && u.period_start && u.period_end);
}
