import 'server-only';
import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GscImport } from '@/engine/ingest/gsc';
import { extractPage, readSitemap } from '@/engine/ingest/sitemap-crawl';
import { pathKey, templateOf } from '@/engine/ingest/url';
import { GATE_CRITERIA_VERSION } from '@/modules/gate/battery';
import { queryImpressionMap } from '@/modules/gate/checks';
import { mockGateAnswer } from '@/modules/gate/mock';
import { MAX_BATCH_PAGES, parseGateCsv } from '@/modules/gate/parse';
import { templateReport, type TemplateRow } from '@/modules/gate/report';
import { runGate } from '@/modules/gate/run';
import { stripHtml } from '@/modules/gate/text';
import { GATE_LABEL, type CheckBands, type CodeChecks, type Failure, type GatePageInput, type GateVerdict, type Router } from '@/modules/gate/types';
import { db, newId, now } from '@/lib/db';
import { startModuleJob } from '@/lib/modjobs';
import { getProvider } from '@/lib/provider';
import { getJob, listUploads, siteInputs, uploadData, type Job } from '@/lib/repo';

export const GATE_JOB = 'gate';
export type BatchSource = 'csv' | 'sitemap' | 'urls' | 'paste' | 'api' | 'sample';
export const SOURCE_LABEL: Record<BatchSource, string> = { csv: 'CSV', sitemap: 'Sitemap', urls: 'URL list', paste: 'Single page', api: 'API', sample: 'Sample data' };

export interface GateBatch {
  id: string; site_id: string; name: string; source: BatchSource; status: 'queued' | 'running' | 'done' | 'failed';
  job_id: string | null; page_count: number; counts: Record<GateVerdict, number>; templates: TemplateRow[];
  notes: string[]; input: { sitemap?: string; urls?: string[] }; model: string | null; avg_ms: number | null;
  error: string | null; created_at: string; finished_at: string | null;
}

export interface GatePageRow {
  id: string; batch_id: string; site_id: string; idx: number; path: string; url: string | null; title: string; h1: string; meta: string;
  body: string; query: string; template: string; verdict: GateVerdict | null; confidence: number; probabilities: Partial<Record<GateVerdict, number>>;
  router: Router | null; reasons: string[]; fixes: string[]; failures: Failure[]; rules: string[]; checks: CodeChecks | null; bands: CheckBands | null;
  answers: Record<string, unknown> | null; model: string | null; latency_ms: number; scored_at: string | null;
}

let ready = false;
function ensureSchema() {
  if (ready) return;
  db().exec(`
    create table if not exists gate_batches (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      name text not null,
      source text not null,
      status text not null default 'queued',
      job_id text,
      page_count integer not null default 0,
      counts text not null default '{}',
      templates text not null default '[]',
      notes text not null default '[]',
      input text not null default '{}',
      model text,
      avg_ms real,
      error text,
      created_at text not null,
      finished_at text
    );
    create index if not exists gate_batches_site on gate_batches(site_id, created_at);
    create table if not exists gate_pages (
      id text primary key,
      batch_id text not null references gate_batches(id) on delete cascade,
      site_id text not null references sites(id) on delete cascade,
      idx integer not null,
      path text not null,
      url text,
      title text not null default '',
      h1 text not null default '',
      meta text not null default '',
      body text not null default '',
      query text not null default '',
      template text not null default '',
      verdict text,
      confidence real not null default 0,
      probabilities text not null default '{}',
      router text,
      reasons text not null default '[]',
      fixes text not null default '[]',
      failures text not null default '[]',
      rules text not null default '[]',
      checks text,
      bands text,
      answers text,
      model text,
      latency_ms integer not null default 0,
      scored_at text
    );
    create index if not exists gate_pages_batch on gate_pages(batch_id, idx);
    create index if not exists gate_pages_site_path on gate_pages(site_id, path);
  `);
  ready = true;
}

const J = <T,>(s: string | null, fallback: T): T => (s == null ? fallback : (JSON.parse(s) as T));

function parseBatch(r: Record<string, unknown>): GateBatch {
  return {
    ...(r as unknown as GateBatch),
    counts: J(r.counts as string, { index: 0, improve: 0, kill: 0 }),
    templates: J(r.templates as string, []),
    notes: J(r.notes as string, []),
    input: J(r.input as string, {}),
  };
}

function parsePage(r: Record<string, unknown>): GatePageRow {
  return {
    ...(r as unknown as GatePageRow),
    probabilities: J(r.probabilities as string, {}),
    reasons: J(r.reasons as string, []),
    fixes: J(r.fixes as string, []),
    failures: J(r.failures as string, []),
    rules: J(r.rules as string, []),
    checks: J(r.checks as string | null, null),
    bands: J(r.bands as string | null, null),
    answers: J(r.answers as string | null, null),
  };
}

// ---------- batches ----------

export function createBatch(siteId: string, name: string, source: BatchSource, pages: GatePageInput[], notes: string[] = [], input: GateBatch['input'] = {}): GateBatch {
  ensureSchema();
  const id = newId();
  const d = db();
  d.transaction(() => {
    d.prepare(`insert into gate_batches (id, site_id, name, source, page_count, notes, input, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, siteId, name.slice(0, 120), source, pages.length, JSON.stringify(notes), JSON.stringify(input), now());
    insertPages(id, siteId, pages, 0);
  })();
  return getBatch(id)!;
}

function insertPages(batchId: string, siteId: string, pages: GatePageInput[], start: number) {
  const ins = db().prepare(`insert into gate_pages (id, batch_id, site_id, idx, path, url, title, h1, meta, body, query, template) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  pages.forEach((p, i) => ins.run(newId(), batchId, siteId, start + i, p.path, p.url, p.title, p.h1, p.meta, p.body, p.query, p.template));
}

export function getBatch(id: string): GateBatch | null {
  ensureSchema();
  const r = db().prepare('select * from gate_batches where id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? parseBatch(r) : null;
}

export function listBatches(siteId: string, limit = 50): GateBatch[] {
  ensureSchema();
  return (db().prepare('select * from gate_batches where site_id = ? order by created_at desc limit ?').all(siteId, limit) as Record<string, unknown>[]).map(parseBatch);
}

export function deleteBatch(id: string) {
  ensureSchema();
  db().prepare('delete from gate_batches where id = ?').run(id);
}

export function batchJob(b: GateBatch): Job | null {
  return b.job_id ? getJob(b.job_id) : null;
}

function updateBatch(id: string, patch: Partial<Record<'status' | 'job_id' | 'page_count' | 'counts' | 'templates' | 'notes' | 'model' | 'avg_ms' | 'error' | 'finished_at', unknown>>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const vals = keys.map((k) => {
    const v = (patch as Record<string, unknown>)[k];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  db().prepare(`update gate_batches set ${keys.map((k) => `${k} = ?`).join(', ')} where id = ?`).run(...vals, id);
}

// ---------- pages ----------

export interface PageFilter { verdict?: string; template?: string; q?: string; flag?: string }

export function listGatePages(batchId: string, f: PageFilter = {}, flagged?: Set<string>): GatePageRow[] {
  ensureSchema();
  const where = ['batch_id = ?'];
  const args: unknown[] = [batchId];
  if (f.verdict && ['index', 'improve', 'kill'].includes(f.verdict)) { where.push('verdict = ?'); args.push(f.verdict); }
  if (f.verdict === 'pending') where.push('verdict is null');
  if (f.template) { where.push('template = ?'); args.push(f.template); }
  if (f.q) { where.push('(path like ? or title like ?)'); args.push(`%${f.q}%`, `%${f.q}%`); }
  const rows = (db().prepare(`select * from gate_pages where ${where.join(' and ')} order by case verdict when 'kill' then 0 when 'improve' then 1 when 'index' then 2 else 3 end, confidence desc, idx`).all(...args) as Record<string, unknown>[]).map(parsePage);
  return f.flag === 'no_impressions' && flagged ? rows.filter((r) => flagged.has(r.path)) : rows;
}

export function getGatePage(id: string): GatePageRow | null {
  ensureSchema();
  const r = db().prepare('select * from gate_pages where id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? parsePage(r) : null;
}

export function batchTemplates(batchId: string): string[] {
  ensureSchema();
  return (db().prepare('select distinct template from gate_pages where batch_id = ? order by template').all(batchId) as { template: string }[]).map((r) => r.template);
}

function pageInputs(batchId: string): (GatePageInput & { id: string })[] {
  return (db().prepare('select id, path, url, title, h1, meta, body, query, template from gate_pages where batch_id = ? order by idx').all(batchId) as (GatePageInput & { id: string })[]);
}

function summarise(batchId: string) {
  const rows = db().prepare('select template, verdict, failures from gate_pages where batch_id = ?').all(batchId) as { template: string; verdict: GateVerdict | null; failures: string }[];
  const counts: Record<GateVerdict, number> = { index: 0, improve: 0, kill: 0 };
  for (const r of rows) if (r.verdict) counts[r.verdict]++;
  return { counts, templates: templateReport(rows.map((r) => ({ template: r.template, verdict: r.verdict, failures: J<Failure[]>(r.failures, []) }))) };
}

// ---------- fetching ----------

const UA = 'SEODecisionBot/0.1 (+site owner requested quality check)';

/** Full main-content text (extractPage keeps only a 1,200-character excerpt). */
function mainText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, aside, form').remove();
  const main = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  return main.text().replace(/\s+/g, ' ').trim();
}

async function fetchPage(url: string, topQuery: Map<string, string>): Promise<GatePageInput | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!(res.headers.get('content-type') ?? '').includes('html')) return null;
  const html = await res.text();
  const e = extractPage(res.url || url, res.status, html);
  const p = pathKey(url) ?? e.path;
  return { path: p, url, title: e.title, h1: e.h1, meta: e.metaDescription, body: stripHtml(mainText(html)), query: topQuery.get(p) ?? '', template: templateOf(p) };
}

// ---------- scoring ----------

function siteSignals(siteId: string) {
  const inp = siteInputs(siteId);
  const rows = inp.gscQueries?.pageQueries ?? inp.gsc?.pageQueries ?? [];
  const best = new Map<string, { q: string; imp: number }>();
  for (const r of rows) if (!best.has(r.path) || best.get(r.path)!.imp < r.impressions) best.set(r.path, { q: r.query, imp: r.impressions });
  return {
    existing: (inp.crawl?.pages ?? []).filter((p) => p.excerpt).map((p) => ({ path: p.path, text: p.excerpt })),
    queryImpressions: rows.length ? queryImpressionMap(rows) : null,
    topQuery: new Map([...best].map(([p, v]) => [p, v.q])),
  };
}

/**
 * Start the gate job for a batch: fetch pages first when the batch came from a sitemap or URL list,
 * then code checks across the batch, then one logged Jev call per page that no hard rule decided.
 * Resolves `finished` when the job ends, so the API can answer synchronously.
 */
export function startGateJob(siteId: string, batchId: string): { job: Job; finished: Promise<void> } {
  ensureSchema();
  const batch = getBatch(batchId);
  if (!batch) throw new Error('Batch not found');
  const provider = getProvider(mockGateAnswer);
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  const job = startModuleJob(siteId, GATE_JOB, provider, async (ctx) => {
    try {
      updateBatch(batchId, { status: 'running' });
      const sig = siteSignals(siteId);
      const notes = [...batch.notes];

      const havePages = (db().prepare('select count(*) n from gate_pages where batch_id = ?').get(batchId) as { n: number }).n > 0;
      if ((batch.source === 'sitemap' || batch.source === 'urls') && !havePages) {
        let urls = batch.input.urls ?? [];
        if (batch.source === 'sitemap' && batch.input.sitemap) {
          ctx.progress(0, 1, 'Reading the sitemap');
          urls = (await readSitemap(batch.input.sitemap, MAX_BATCH_PAGES)).map((e) => e.url);
          if (!urls.length) throw new Error('The sitemap has no URLs.');
        }
        urls = urls.slice(0, MAX_BATCH_PAGES);
        let failed = 0;
        const fetched: GatePageInput[] = [];
        const seen = new Set<string>();
        let i = 0;
        let done = 0;
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (i < urls.length) {
            const u = urls[i++];
            try {
              const p = await fetchPage(u, sig.topQuery);
              if (p && !seen.has(p.path)) { seen.add(p.path); fetched.push(p); } else if (!p) failed++;
            } catch { failed++; }
            ctx.progress(++done, urls.length, `Fetched ${done} of ${urls.length} pages`);
          }
        }));
        if (failed) notes.push(`${failed} of ${urls.length} URLs could not be fetched or were not HTML.`);
        if (!fetched.length) throw new Error('None of the URLs could be fetched.');
        fetched.sort((a, b) => a.path.localeCompare(b.path));
        db().transaction(() => insertPages(batchId, siteId, fetched, 0))();
        updateBatch(batchId, { page_count: fetched.length, notes });
      }

      const pages = pageInputs(batchId);
      const upd = db().prepare(`update gate_pages set verdict = ?, confidence = ?, probabilities = ?, router = ?, reasons = ?, fixes = ?, failures = ?, rules = ?, checks = ?, bands = ?, answers = ?, model = ?, latency_ms = ?, scored_at = ? where id = ?`);
      let modelName: string | null = null;
      const scoreStart = Date.now();
      ctx.progress(0, pages.length, `Checking ${pages.length} pages`);
      await runGate(pages, (key, input) => ctx.decide(key, GATE_CRITERIA_VERSION, input), {
        hasGsc: Boolean(sig.queryImpressions),
        checks: { existing: sig.existing, queryImpressions: sig.queryImpressions },
        concurrency: 8,
        onResult: (i, r, c) => {
          if (r.model !== 'rules') modelName = r.model;
          upd.run(r.verdict, r.confidence, JSON.stringify(r.probabilities), r.router, JSON.stringify(r.reasons), JSON.stringify(r.fixes), JSON.stringify(r.failures), JSON.stringify(r.rulesApplied), JSON.stringify(c), JSON.stringify(r.bands), r.answers ? JSON.stringify(r.answers) : null, r.model, r.latencyMs, now(), pages[i].id);
        },
        onProgress: (d, t) => ctx.progress(d, t, `Scored ${d} of ${t} pages`),
      });
      const s = summarise(batchId);
      const paused = s.templates.filter((t) => t.pause).length;
      updateBatch(batchId, {
        status: 'done', counts: s.counts, templates: s.templates, model: modelName ?? (provider.name === 'mock' ? 'mock' : 'rules'),
        avg_ms: pages.length ? Math.round((Date.now() - scoreStart) / pages.length) : null, finished_at: now(),
      });
      return `Scored ${pages.length} pages: ${s.counts.index} Index, ${s.counts.improve} Improve, ${s.counts.kill} Kill${paused ? `; pause ${paused} template${paused === 1 ? '' : 's'}` : ''}`;
    } catch (err) {
      updateBatch(batchId, { status: 'failed', error: err instanceof Error ? err.message : String(err), finished_at: now() });
      throw err;
    } finally {
      resolve();
    }
  }, { batchId });
  updateBatch(batchId, { job_id: job.id, status: 'running' });
  return { job, finished };
}

// ---------- intake helpers ----------

export function batchFromCsv(siteId: string, name: string, text: string, source: BatchSource = 'csv'): GateBatch {
  const { pages, notes } = parseGateCsv(text);
  return createBatch(siteId, name, source, pages, notes);
}

export function sampleCsv(): string {
  return readFileSync(path.join(process.cwd(), 'samples', 'gate-walks.csv'), 'utf8');
}

// ---------- post-publish feedback ----------

/**
 * Pages marked Index that appear in a Search Console upload made after the batch with zero impressions,
 * or are missing from a later pages export whose period starts after the batch (code only).
 */
export function indexedWithoutImpressions(siteId: string, batch: GateBatch): Set<string> {
  ensureSchema();
  const out = new Set<string>();
  const ups = listUploads(siteId).filter((u) => (u.kind === 'gsc_pages' || u.kind === 'gsc_queries') && u.created_at > batch.created_at);
  if (!ups.length) return out;
  const indexed = (db().prepare(`select path from gate_pages where batch_id = ? and verdict = 'index'`).all(batch.id) as { path: string }[]).map((r) => r.path);
  if (!indexed.length) return out;
  for (const u of ups) {
    const g = uploadData<GscImport>(u.id);
    const imp = new Map<string, number>();
    for (const p of g.pages) imp.set(p.path, (imp.get(p.path) ?? 0) + p.impressions);
    const afterBatch = u.period_start != null && u.period_start >= batch.created_at.slice(0, 10);
    for (const p of indexed) {
      const v = imp.get(p);
      if (v === 0 || (v === undefined && u.kind === 'gsc_pages' && afterBatch && u.row_count < 1000)) out.add(p);
    }
  }
  return out;
}

// ---------- export ----------

const esc = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // no formula injection when opened in a spreadsheet
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function batchCsv(batch: GateBatch, flagged: Set<string>): string {
  const rows = listGatePages(batch.id);
  const head = ['url', 'path', 'template', 'target_query', 'verdict', 'confidence', 'router', 'reason_1', 'reason_2', 'reason_3', 'fixes', 'unique_words', 'word_count', 'duplicate_ratio', 'duplicate_of', 'placeholders', 'indexed_without_impressions', 'model'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      r.url ?? '', r.path, r.template, r.query, r.verdict ? GATE_LABEL[r.verdict] : 'Pending', r.confidence.toFixed(2), r.router ?? '',
      r.reasons[0] ?? '', r.reasons[1] ?? '', r.reasons[2] ?? '', r.fixes.join(' | '),
      r.checks?.uniqueWords ?? '', r.checks?.wordCount ?? '', r.checks?.duplicateRatio ?? '', r.checks?.duplicateOf ?? '', r.checks?.placeholders.join(' | ') ?? '',
      flagged.has(r.path) ? 'yes' : '', r.model ?? '',
    ].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

export function pageJson(r: GatePageRow, flagged?: Set<string>) {
  return {
    path: r.path, url: r.url, template: r.template, target_query: r.query || null,
    verdict: r.verdict, confidence: r.confidence, router: r.router, probabilities: r.probabilities,
    reasons: r.reasons, fixes: r.fixes, failures: r.failures, rules_applied: r.rules,
    checks: r.checks ? { word_count: r.checks.wordCount, unique_words: r.checks.uniqueWords, template_share: r.checks.templateShare < 0 ? null : Math.round(r.checks.templateShare * 1000) / 1000, duplicate_ratio: r.checks.duplicateRatio, duplicate_of: r.checks.duplicateOf, placeholders: r.checks.placeholders, duplicate_title: r.checks.duplicateTitleWith > 0, missing_title: r.checks.missingTitle, missing_h1: r.checks.missingH1 } : null,
    indexed_without_impressions: flagged ? flagged.has(r.path) : undefined,
    model: r.model,
  };
}
