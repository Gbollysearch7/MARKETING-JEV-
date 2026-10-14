import 'server-only';
import { db, newId, now } from '@/lib/db';
import { getProvider } from '@/lib/provider';
import { latestJobOf, mapLimit, runningJobOf, startModuleJob } from '@/lib/modjobs';
import { getSite, listUrls, siteInputs, type Job } from '@/lib/repo';
import { clusterKeywords, clusterName } from '@/modules/keywords/cluster';
import { buildQuestions, buildState, candidatePages, CRITERIA_VERSION, indexPages, titleOf } from '@/modules/keywords/battery';
import { fromSearchConsole, type KeywordInput, type KeywordRow } from '@/modules/keywords/input';
import { mockKeywordAnswer } from '@/modules/keywords/mock';
import { isCannibalised, matchPrevious, readAnswers, rollup, ROUTER, type ClusterRollup, type ScoredKeyword } from '@/modules/keywords/rollup';
import type { BuyingStage, KeywordCluster, KeywordIntent } from './contracts';

export const JOB_TYPE = 'keywords';
const JUNK_NAME = 'Junk and off-topic';

let ready = false;
function ensureSchema() {
  if (ready) return;
  db().exec(`
    create table if not exists keywords_inputs (
      id text primary key, site_id text not null references sites(id) on delete cascade,
      source text not null, filename text, volume_source text not null, rows text not null, notes text not null, created_at text not null);
    create index if not exists keywords_inputs_site on keywords_inputs(site_id, created_at);
    create table if not exists keywords_clusters (
      id text primary key, site_id text not null references sites(id) on delete cascade,
      name text not null, renamed integer not null default 0, kind text not null default 'topic', merged_into text, created_at text not null);
    create index if not exists keywords_clusters_site on keywords_clusters(site_id);
    create table if not exists keywords_items (
      job_id text not null, site_id text not null references sites(id) on delete cascade, keyword text not null,
      volume real, cpc real, current_path text, position real,
      intent text, intent_p real, stage text, stage_p real, page text, page_p real, candidates text,
      cluster_id text not null, primary key (job_id, keyword));
    create index if not exists keywords_items_cluster on keywords_items(job_id, cluster_id);
    create index if not exists keywords_items_site on keywords_items(site_id);
    create table if not exists keywords_overrides (
      site_id text not null references sites(id) on delete cascade, keyword text not null, cluster_id text not null, created_at text not null,
      primary key (site_id, keyword));
  `);
  ready = true;
}

// ---------- inputs ----------

export interface InputRow { id: string; site_id: string; source: string; filename: string | null; volume_source: 'searches' | 'impressions'; count: number; notes: string[]; created_at: string }

export function saveInput(siteId: string, source: 'csv' | 'paste' | 'gsc' | 'sample', filename: string | null, input: KeywordInput): InputRow {
  ensureSchema();
  const id = newId();
  db().prepare('insert into keywords_inputs (id, site_id, source, filename, volume_source, rows, notes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, siteId, source, filename, input.volumeSource, JSON.stringify(input.rows), JSON.stringify(input.notes), now());
  return getInput(id)!;
}

export function getInput(id: string): InputRow | null {
  ensureSchema();
  const r = db().prepare('select id, site_id, source, filename, volume_source, notes, created_at, json_array_length(rows) count from keywords_inputs where id = ?').get(id) as (Omit<InputRow, 'notes'> & { notes: string }) | undefined;
  return r ? { ...r, notes: JSON.parse(r.notes) } : null;
}

export function latestInput(siteId: string): InputRow | null {
  ensureSchema();
  const r = db().prepare('select id from keywords_inputs where site_id = ? order by created_at desc limit 1').get(siteId) as { id: string } | undefined;
  return r ? getInput(r.id) : null;
}

function inputRows(id: string): KeywordRow[] {
  const r = db().prepare('select rows from keywords_inputs where id = ?').get(id) as { rows: string } | undefined;
  return r ? JSON.parse(r.rows) : [];
}

/** Search Console page-and-query rows aggregated by query, or null when the site has no such upload. */
export function searchConsoleKeywords(siteId: string): KeywordInput | null {
  const q = siteInputs(siteId).gscQueries;
  if (!q?.pageQueries?.length) return null;
  return fromSearchConsole(q.pageQueries);
}

// ---------- clusters (identity that survives re-runs) ----------

interface ClusterRow { id: string; site_id: string; name: string; renamed: number; kind: 'topic' | 'junk'; merged_into: string | null; created_at: string }

function clusterRows(siteId: string): Map<string, ClusterRow> {
  const rows = db().prepare('select * from keywords_clusters where site_id = ?').all(siteId) as ClusterRow[];
  return new Map(rows.map((r) => [r.id, r]));
}

/** Follow merges to the surviving cluster. */
function resolver(rows: Map<string, ClusterRow>) {
  return (id: string): string => {
    let cur = id;
    for (let i = 0; i < 20; i++) {
      const next = rows.get(cur)?.merged_into;
      if (!next) return cur;
      cur = next;
    }
    return cur;
  };
}

function createCluster(siteId: string, name: string, kind: 'topic' | 'junk' = 'topic'): string {
  const id = newId();
  db().prepare('insert into keywords_clusters (id, site_id, name, renamed, kind, merged_into, created_at) values (?, ?, ?, 0, ?, null, ?)').run(id, siteId, name, kind, now());
  return id;
}

function junkCluster(siteId: string): string {
  const r = db().prepare(`select id from keywords_clusters where site_id = ? and kind = 'junk' and merged_into is null limit 1`).get(siteId) as { id: string } | undefined;
  return r?.id ?? createCluster(siteId, JUNK_NAME, 'junk');
}

// ---------- the run ----------

export function runningRun(siteId: string): Job | null { return runningJobOf(siteId, JOB_TYPE); }
export function latestRun(siteId: string): Job | null { return latestJobOf(siteId, JOB_TYPE); }

/** Site pages for candidate matching, highest clicks first. */
function sitePages(siteId: string) {
  return listUrls(siteId, { sort: 'clicks', limit: 50000, offset: 0 }).rows.map((r) => ({ path: r.path, title: r.title, clicks: r.clicks }));
}

/** Start the background run: one Jev call per keyword (concurrency 8), then clustering and rollups in code. */
export function startKeywordsRun(siteId: string, inputId: string): Job {
  ensureSchema();
  const input = getInput(inputId);
  const site = getSite(siteId);
  if (!input || input.site_id !== siteId || !site) throw new Error('Keyword list not found');
  const rows = inputRows(inputId);
  const provider = getProvider(mockKeywordAnswer);
  return startModuleJob(siteId, JOB_TYPE, provider, async (ctx) => {
    const pages = sitePages(siteId);
    const ix = indexPages(pages);
    const summary = { name: site.name, domain: site.domain, topTitles: ix.pages.filter((p) => p.title).slice(0, 12).map(titleOf) };
    let failed = 0;
    let firstError: unknown = null;
    ctx.progress(0, rows.length, `Scoring ${rows.length.toLocaleString('en-GB')} keywords`);
    const scored = await mapLimit(rows, 8, async (row) => {
      const cands = candidatePages(row.keyword, row.currentPath, ix);
      try {
        const res = await ctx.decide(row.keyword, CRITERIA_VERSION, { state: buildState(row, summary, cands, input.volume_source), questions: buildQuestions(cands) });
        return { ...row, ...readAnswers(res.answers, cands), candidates: cands.map((c) => c.path) };
      } catch (err) {
        failed++;
        firstError ??= err;
        return { ...row, intent: null, intentP: null, stage: null, stageP: null, page: null, pageP: null, candidates: cands.map((c) => c.path) };
      }
    }, (d) => ctx.progress(d, rows.length, `Scored ${d.toLocaleString('en-GB')} of ${rows.length.toLocaleString('en-GB')} keywords`));
    if (rows.length && failed === rows.length) throw firstError instanceof Error ? firstError : new Error('Every decision failed');

    ctx.progress(rows.length, rows.length, 'Clustering');
    const d = db();
    const assigned = d.transaction(() => assignClusters(siteId, scored))();
    const ins = d.prepare(`insert or replace into keywords_items (job_id, site_id, keyword, volume, cpc, current_path, position, intent, intent_p, stage, stage_p, page, page_p, candidates, cluster_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    d.transaction(() => {
      scored.forEach((k, i) => ins.run(ctx.jobId, siteId, k.keyword, k.volume, k.cpc, k.currentPath, k.position, k.intent, k.intentP, k.stage, k.stageP, k.page, k.pageP, JSON.stringify(k.candidates), assigned[i]));
    })();
    const n = new Set(assigned).size;
    return `Clustered ${rows.length.toLocaleString('en-GB')} keywords into ${n.toLocaleString('en-GB')} clusters${failed ? ` (${failed} could not be scored)` : ''}`;
  }, { inputId, count: rows.length });
}

/**
 * Cluster ids for each scored keyword. Junk goes to the site's junk cluster; the rest is clustered in code,
 * matched to the previous run's clusters by keyword overlap (keeping their names, including renames), and
 * finally the user's moves are applied on top.
 */
function assignClusters(siteId: string, scored: ScoredKeyword[]): string[] {
  const rows = clusterRows(siteId);
  const resolve = resolver(rows);
  const junkId = junkCluster(siteId);
  const prevJob = latestRun(siteId);
  const previous = new Map<string, string>();
  if (prevJob) {
    for (const r of db().prepare('select keyword, cluster_id from keywords_items where job_id = ?').all(prevJob.id) as { keyword: string; cluster_id: string }[]) {
      const id = resolve(r.cluster_id);
      if (rows.get(id)?.kind === 'topic') previous.set(r.keyword, id);
    }
  }
  const out: string[] = new Array(scored.length);
  const usefulIdx: number[] = [];
  scored.forEach((k, i) => (k.intent === 'junk' ? (out[i] = junkId) : usefulIdx.push(i)));
  const useful = usefulIdx.map((i) => scored[i]);
  const groups = clusterKeywords(useful);
  const matched = matchPrevious(groups.map((g) => g.map((j) => useful[j].keyword)), previous);
  groups.forEach((g, gi) => {
    const id = matched[gi] ?? createCluster(siteId, clusterName(g.map((j) => useful[j])));
    for (const j of g) out[usefulIdx[j]] = id;
  });
  const overrides = db().prepare('select keyword, cluster_id from keywords_overrides where site_id = ?').all(siteId) as { keyword: string; cluster_id: string }[];
  if (overrides.length) {
    const live = clusterRows(siteId);
    const byKw = new Map(scored.map((k, i) => [k.keyword, i]));
    for (const o of overrides) {
      const i = byKw.get(o.keyword);
      const id = resolver(live)(o.cluster_id);
      if (i != null && live.has(id)) out[i] = id;
    }
  }
  return out;
}

// ---------- reading ----------

export interface ItemView extends ScoredKeyword { clusterId: string; candidates: string[] }

export interface ClusterView extends KeywordCluster {
  kind: 'topic' | 'junk';
  renamed: boolean;
  cannibalised: boolean;
  claims: ClusterRollup['claims'];
  items: ItemView[];
  /** Keywords whose intent or page choice is below the review threshold (0.60). */
  uncertain: number;
}

interface ItemDb {
  keyword: string; volume: number | null; cpc: number | null; current_path: string | null; position: number | null;
  intent: string | null; intent_p: number | null; stage: string | null; stage_p: number | null; page: string | null; page_p: number | null; candidates: string | null; cluster_id: string;
}

const toItem = (r: ItemDb): ItemView => ({
  keyword: r.keyword, volume: r.volume, cpc: r.cpc, currentPath: r.current_path, position: r.position,
  intent: r.intent as KeywordIntent | null, intentP: r.intent_p, stage: r.stage as BuyingStage | null, stageP: r.stage_p,
  page: r.page, pageP: r.page_p, candidates: r.candidates ? JSON.parse(r.candidates) : [], clusterId: r.cluster_id,
});

/** Every cluster of the latest run with user edits applied, largest total volume first (junk last). */
export function clusterViews(siteId: string, jobId?: string): ClusterView[] {
  ensureSchema();
  const job = jobId ?? latestRun(siteId)?.id;
  if (!job) return [];
  const rows = clusterRows(siteId);
  const items = (db().prepare('select * from keywords_items where job_id = ? and site_id = ?').all(job, siteId) as ItemDb[]).map(toItem);
  const by = new Map<string, ItemView[]>();
  for (const it of items) (by.get(it.clusterId) ?? by.set(it.clusterId, []).get(it.clusterId)!).push(it);
  const out: ClusterView[] = [];
  for (const [id, kws] of by) {
    const row = rows.get(id);
    const kind = row?.kind ?? 'topic';
    const r = rollup(kws);
    kws.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
    out.push({
      id,
      name: row?.name ?? clusterName(kws),
      keywords: kws.map((k) => ({ keyword: k.keyword, volume: k.volume, intent: k.intent, stage: k.stage, currentPath: k.currentPath, position: k.position })),
      totalVolume: r.totalVolume,
      intent: kind === 'junk' ? 'junk' : r.intent,
      stage: kind === 'junk' ? null : r.stage,
      mappedPath: kind === 'junk' ? null : r.mappedPath,
      gap: kind === 'junk' ? false : r.gap,
      alsoClaimedBy: kind === 'junk' ? [] : r.alsoClaimedBy,
      kind,
      renamed: Boolean(row?.renamed),
      cannibalised: kind !== 'junk' && isCannibalised(r),
      claims: kind === 'junk' ? [] : r.claims,
      items: kws,
      uncertain: kws.filter((k) => ROUTER(k.intentP) === 'uncertain' || (k.page != null && ROUTER(k.pageP) === 'uncertain')).length,
    });
  }
  return out.sort((a, b) => (a.kind === 'junk' ? 1 : 0) - (b.kind === 'junk' ? 1 : 0) || b.totalVolume - a.totalVolume || a.name.localeCompare(b.name));
}

/**
 * Module 2 contract (consumed by Module 5, the brief desk). The site's clusters from the latest run, with user
 * edits applied, largest total volume first. The junk and off-topic cluster is left out.
 */
export function listClusters(siteId: string): KeywordCluster[] {
  return clusterViews(siteId).filter((c) => c.kind === 'topic').map((c) => ({
    id: c.id, name: c.name, keywords: c.keywords, totalVolume: c.totalVolume, intent: c.intent, stage: c.stage,
    mappedPath: c.mappedPath, gap: c.gap, alsoClaimedBy: c.alsoClaimedBy,
  }));
}

export function clusterView(siteId: string, clusterId: string): ClusterView | null {
  return clusterViews(siteId).find((c) => c.id === clusterId) ?? null;
}

// ---------- edits (persisted; they survive re-runs) ----------

export function clusterOwner(clusterId: string): string | null {
  ensureSchema();
  const r = db().prepare('select site_id from keywords_clusters where id = ?').get(clusterId) as { site_id: string } | undefined;
  return r?.site_id ?? null;
}

export function renameCluster(siteId: string, clusterId: string, name: string) {
  ensureSchema();
  db().prepare('update keywords_clusters set name = ?, renamed = 1 where id = ? and site_id = ?').run(name, clusterId, siteId);
}

/** Move one keyword to another cluster (or to a new cluster named after it) in the latest run, and remember it. */
export function moveKeyword(siteId: string, keyword: string, target: string | 'new'): string {
  ensureSchema();
  const job = latestRun(siteId);
  if (!job) throw new Error('No keyword run yet');
  const exists = db().prepare('select 1 from keywords_items where job_id = ? and keyword = ?').get(job.id, keyword);
  if (!exists) throw new Error('Keyword not found');
  const d = db();
  return d.transaction(() => {
    let id = target;
    if (target === 'new') id = createCluster(siteId, keyword);
    else if (!clusterRows(siteId).has(target)) throw new Error('Cluster not found');
    d.prepare('update keywords_items set cluster_id = ? where job_id = ? and keyword = ?').run(id, job.id, keyword);
    d.prepare('insert or replace into keywords_overrides (site_id, keyword, cluster_id, created_at) values (?, ?, ?, ?)').run(siteId, keyword, id, now());
    return id;
  })();
}

/** Merge `fromId` into `intoId`: its keywords move across, and later runs follow the merge. */
export function mergeClusters(siteId: string, fromId: string, intoId: string) {
  ensureSchema();
  if (fromId === intoId) return;
  const rows = clusterRows(siteId);
  if (!rows.has(fromId) || !rows.has(intoId)) throw new Error('Cluster not found');
  const job = latestRun(siteId);
  const d = db();
  d.transaction(() => {
    d.prepare('update keywords_clusters set merged_into = ? where id = ?').run(intoId, fromId);
    if (job) d.prepare('update keywords_items set cluster_id = ? where job_id = ? and cluster_id = ?').run(intoId, job.id, fromId);
    d.prepare('update keywords_overrides set cluster_id = ? where site_id = ? and cluster_id = ?').run(intoId, siteId, fromId);
  })();
}

// ---------- exports ----------

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;

export function clustersCsv(siteId: string): string {
  return csv([
    ['cluster', 'keywords', 'total_volume', 'intent', 'stage', 'owning_page', 'gap', 'also_claimed_by', 'cannibalised'],
    ...clusterViews(siteId).map((c) => [c.name, c.keywords.length, c.totalVolume, c.intent ?? '', c.stage ?? '', c.mappedPath ?? '', c.gap ? 'yes' : 'no', c.alsoClaimedBy.join(' | '), c.cannibalised ? 'yes' : 'no']),
  ]);
}

export function keywordsCsv(siteId: string): string {
  const rows: unknown[][] = [['keyword', 'cluster', 'volume', 'cpc', 'intent', 'intent_confidence', 'stage', 'stage_confidence', 'chosen_page', 'page_confidence', 'current_page', 'position']];
  for (const c of clusterViews(siteId)) for (const k of c.items) {
    rows.push([k.keyword, c.name, k.volume, k.cpc, k.intent, k.intentP, k.stage, k.stageP, k.page, k.pageP, k.currentPath, k.position]);
  }
  return csv(rows);
}
