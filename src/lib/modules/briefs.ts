import 'server-only';
import type { GscImport } from '@/engine/ingest/gsc';
import { pathKey } from '@/engine/ingest/url';
import { periodDays, DEFAULT_PERIOD_DAYS } from '@/engine/site';
import type { SitePage } from '@/modules/briefs/assemble';
import { mockBriefAnswer } from '@/modules/briefs/mock';
import { decideTarget, productPathsFor, type TargetContext } from '@/modules/briefs/run';
import { SAMPLE_TARGETS } from '@/modules/briefs/samples';
import { enrichKeywords, groupQueries, normKw, queryIndex, type ProposedTarget } from '@/modules/briefs/text';
import type { BriefContent, BriefStatus, Decision, TargetData, TargetKeyword, VolumeSource } from '@/modules/briefs/types';
import { CRITERIA_VERSION } from '@/modules/briefs/battery';
import { db, newId, now } from '../db';
import { mapLimit, runningJobOf, startModuleJob } from '../modjobs';
import { getProvider } from '../provider';
import { listUploads, listUrls, siteInputs, uploadData, type Job } from '../repo';
import { listClusters } from './keywords';
import type { KeywordCluster } from './contracts';

/** Module 5 server data: targets, Jev decisions, briefs and the editorial queue. */

export const JOB_TYPE = 'briefs';

let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  db().exec(`
    create table if not exists briefs_targets (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      primary_kw text not null,
      keywords text not null,
      relevance integer not null default 3,
      volume_source text not null default 'none',
      source text not null,
      cluster_id text,
      decision text,
      stale integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique (site_id, primary_kw)
    );
    create index if not exists briefs_targets_site on briefs_targets (site_id, created_at);
    create table if not exists briefs_items (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      target_id text not null unique references briefs_targets(id) on delete cascade,
      status text not null default 'proposed',
      content text not null,
      edited integer not null default 0,
      published_url text,
      published_path text,
      published_at text,
      measured_clicks_month real,
      measured_at text,
      measured_upload_id text,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists briefs_items_site on briefs_items (site_id, status);
  `);
  schemaReady = true;
}

export type TargetSource = 'manual' | 'search_console' | 'cluster' | 'sample';

export interface BriefTarget {
  id: string; site_id: string; primary: string; keywords: TargetKeyword[]; relevance: number; volumeSource: VolumeSource;
  source: TargetSource; clusterId: string | null; decision: Decision | null; stale: boolean; created_at: string; updated_at: string;
}

export interface BriefItem {
  id: string; site_id: string; target_id: string; status: BriefStatus; content: BriefContent; edited: boolean;
  published_url: string | null; published_path: string | null; published_at: string | null;
  measured_clicks_month: number | null; measured_at: string | null; created_at: string; updated_at: string;
}

type TargetRow = { id: string; site_id: string; primary_kw: string; keywords: string; relevance: number; volume_source: VolumeSource; source: TargetSource; cluster_id: string | null; decision: string | null; stale: number; created_at: string; updated_at: string };
type ItemRow = Omit<BriefItem, 'content' | 'edited'> & { content: string; edited: number };

const toTarget = (r: TargetRow): BriefTarget => ({
  id: r.id, site_id: r.site_id, primary: r.primary_kw, keywords: JSON.parse(r.keywords), relevance: r.relevance, volumeSource: r.volume_source,
  source: r.source, clusterId: r.cluster_id, decision: r.decision ? JSON.parse(r.decision) : null, stale: Boolean(r.stale), created_at: r.created_at, updated_at: r.updated_at,
});
const toItem = (r: ItemRow): BriefItem => ({ ...r, content: JSON.parse(r.content), edited: Boolean(r.edited) });

export const targetData = (t: BriefTarget): TargetData => ({ primary: t.primary, keywords: t.keywords, relevance: t.relevance, volumeSource: t.volumeSource });

// ---------- targets ----------

export function listTargets(siteId: string): BriefTarget[] {
  ensureSchema();
  return (db().prepare('select * from briefs_targets where site_id = ? order by created_at asc, rowid asc').all(siteId) as TargetRow[]).map(toTarget);
}

export function getTarget(id: string): BriefTarget | null {
  ensureSchema();
  const r = db().prepare('select * from briefs_targets where id = ?').get(id) as TargetRow | undefined;
  return r ? toTarget(r) : null;
}

/** The site's page-and-query data as a per-query index (monthly impressions, position, top page). */
function gscIndex(siteId: string) {
  const inp = siteInputs(siteId);
  const g = inp.gscQueries;
  if (!g?.pageQueries?.length) return null;
  return queryIndex(g.pageQueries, periodDays(g.period) ?? DEFAULT_PERIOD_DAYS);
}

export function hasQueryData(siteId: string): boolean {
  return Boolean(siteInputs(siteId).gscQueries?.pageQueries?.length);
}

/** Insert targets, enriching each keyword with Search Console positions. Duplicates (same primary keyword) are skipped. */
export function addTargets(siteId: string, list: (ProposedTarget & { relevance?: number; clusterId?: string })[], source: TargetSource, volumeSource: VolumeSource): { added: number; skipped: number } {
  ensureSchema();
  const index = gscIndex(siteId);
  const ins = db().prepare(`insert or ignore into briefs_targets (id, site_id, primary_kw, keywords, relevance, volume_source, source, cluster_id, decision, stale, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?)`);
  let added = 0;
  db().transaction(() => {
    for (const p of list) {
      const userVolumes = p.keywords.some((k) => k.volume != null);
      let vs: VolumeSource = userVolumes ? volumeSource : 'none';
      let kws = p.keywords;
      if (index) {
        kws = enrichKeywords(kws, index, !userVolumes);
        if (!userVolumes && kws.some((k) => k.volume != null)) vs = 'search_console';
      }
      const t = now();
      const res = ins.run(newId(), siteId, normKw(p.primary), JSON.stringify(kws), Math.min(5, Math.max(1, p.relevance ?? 3)), vs, source, p.clusterId ?? null, t, t);
      added += res.changes;
    }
  })();
  return { added, skipped: list.length - added };
}

export function setRelevance(id: string, relevance: number) {
  ensureSchema();
  db().prepare('update briefs_targets set relevance = ?, stale = 1, updated_at = ? where id = ?').run(Math.min(5, Math.max(1, Math.round(relevance))), now(), id);
}

export function deleteTarget(id: string) {
  ensureSchema();
  db().transaction(() => {
    db().prepare('delete from briefs_items where target_id = ?').run(id);
    db().prepare('delete from briefs_targets where id = ?').run(id);
  })();
}

/** Group the latest page-and-query data into targets by head term, skipping heads already targeted. */
export function targetsFromSearchConsole(siteId: string): { added: number; skipped: number } {
  const index = gscIndex(siteId);
  if (!index) return { added: 0, skipped: 0 };
  const existing = new Set(listTargets(siteId).map((t) => t.primary));
  const groups = groupQueries(index, 25).filter((g) => !existing.has(g.primary));
  return addTargets(siteId, groups.map((g) => ({ ...g, keywords: g.keywords.map((k) => ({ keyword: k.keyword, volume: null, position: null, path: null })) })), 'search_console', 'search_console');
}

/** Module 2 clusters, gap clusters first, then by total volume. */
export function clustersForImport(siteId: string): KeywordCluster[] {
  return [...listClusters(siteId)].sort((a, b) => Number(b.gap) - Number(a.gap) || b.totalVolume - a.totalVolume);
}

export function importClusters(siteId: string): { added: number; skipped: number } {
  const clusters = clustersForImport(siteId).filter((c) => c.keywords.length);
  return addTargets(siteId, clusters.map((c) => {
    const kws = [...c.keywords].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    return {
      primary: kws[0].keyword,
      clusterId: c.id,
      keywords: kws.slice(0, 30).map((k) => ({ keyword: normKw(k.keyword), volume: k.volume, position: k.position, path: k.currentPath })),
    };
  }), 'cluster', 'cluster');
}

export function loadSampleTargets(siteId: string) {
  return addTargets(siteId, SAMPLE_TARGETS.map((s) => ({ primary: s.primary, keywords: s.keywords, relevance: s.relevance })), 'sample', 'sample');
}

// ---------- decisions ----------

function siteContext(siteId: string): TargetContext {
  const inp = siteInputs(siteId);
  const { rows } = listUrls(siteId, { limit: 20000, offset: 0, sort: 'clicks' });
  const pages: SitePage[] = rows.map((r) => ({ path: r.path, title: r.title, clicks: r.clicks, template: r.template }));
  const titles = new Map(rows.map((r) => [r.path, r.title] as const));
  const ga4 = new Map((inp.ga4?.pages ?? []).map((p) => [pathKey(p.path) ?? p.path, { sessions: p.sessions, conversions: p.conversions }] as const));
  const hasSc = Boolean(inp.gsc || inp.gscQueries);
  return {
    titles, pages, ga4, today: now().slice(0, 10),
    site: { sellsInTopic: false, hasSearchConsole: hasSc, hasGa4: Boolean(inp.ga4), hasCrawl: Boolean(inp.crawl) },
  };
}

export function runningBriefJob(siteId: string): Job | null {
  return runningJobOf(siteId, JOB_TYPE);
}

/** Decide targets in the background: the given ids, or every target that is new or changed since its last decision. */
export function startDecideJob(siteId: string, ids?: string[]): Job | null {
  const all = listTargets(siteId);
  const todo = ids?.length ? all.filter((t) => ids.includes(t.id)) : all.filter((t) => t.stale || !t.decision);
  if (!todo.length) return null;
  const provider = getProvider(mockBriefAnswer);
  return startModuleJob(siteId, JOB_TYPE, provider, async (ctx) => {
    const sc = siteContext(siteId);
    const index = gscIndex(siteId);
    let briefs = 0;
    let skipped = 0;
    await mapLimit(todo, 8, async (t) => {
      // Refresh positions from the latest Search Console data before deciding.
      const keywords = index ? enrichKeywords(t.keywords, index, t.volumeSource === 'search_console') : t.keywords;
      const data: TargetData = { ...targetData(t), keywords };
      const site = { ...sc.site, sellsInTopic: productPathsFor(data, sc.pages).length > 0 };
      const { decision, brief } = await decideTarget(data, { ...sc, site }, (input) => ctx.decide(t.primary, CRITERIA_VERSION, input));
      saveDecision(t, keywords, decision, brief);
      if (brief) briefs++; else skipped++;
    }, (d) => ctx.progress(d, todo.length, `Decided ${d} of ${todo.length} targets`));
    return `${briefs} brief${briefs === 1 ? '' : 's'} proposed, ${skipped} skipped`;
  }, { targets: todo.length });
}

function saveDecision(t: BriefTarget, keywords: TargetKeyword[], decision: Decision, brief: BriefContent | null) {
  const d = db();
  const ts = now();
  d.transaction(() => {
    d.prepare('update briefs_targets set keywords = ?, decision = ?, stale = 0, updated_at = ? where id = ?').run(JSON.stringify(keywords), JSON.stringify(decision), ts, t.id);
    const existing = d.prepare('select id, status, edited from briefs_items where target_id = ?').get(t.id) as { id: string; status: BriefStatus; edited: number } | undefined;
    const replaceable = existing && existing.status === 'proposed' && !existing.edited;
    if (!brief) {
      if (replaceable) d.prepare('delete from briefs_items where id = ?').run(existing.id);
      return;
    }
    if (!existing) d.prepare(`insert into briefs_items (id, site_id, target_id, status, content, edited, created_at, updated_at) values (?, ?, ?, 'proposed', ?, 0, ?, ?)`).run(newId(), t.site_id, t.id, JSON.stringify(brief), ts, ts);
    else if (replaceable) d.prepare('update briefs_items set content = ?, updated_at = ? where id = ?').run(JSON.stringify(brief), ts, existing.id);
  })();
}

// ---------- briefs and the editorial queue ----------

export function listBriefs(siteId: string): BriefItem[] {
  ensureSchema();
  return (db().prepare('select * from briefs_items where site_id = ? order by updated_at desc').all(siteId) as ItemRow[]).map(toItem);
}

export function getBrief(id: string): BriefItem | null {
  ensureSchema();
  const r = db().prepare('select * from briefs_items where id = ?').get(id) as ItemRow | undefined;
  return r ? toItem(r) : null;
}

export function updateBriefContent(id: string, patch: Partial<BriefContent>) {
  const b = getBrief(id);
  if (!b) return;
  db().prepare('update briefs_items set content = ?, edited = 1, updated_at = ? where id = ?').run(JSON.stringify({ ...b.content, ...patch }), now(), id);
}

export function moveBrief(id: string, status: BriefStatus) {
  ensureSchema();
  const clear = status !== 'published' && status !== 'measured';
  db().prepare(`update briefs_items set status = ?, updated_at = ?${clear ? ', published_url = null, published_path = null, published_at = null, measured_clicks_month = null, measured_at = null, measured_upload_id = null' : ''} where id = ?`).run(status, now(), id);
}

export function publishBrief(id: string, url: string) {
  ensureSchema();
  const path = pathKey(url);
  db().prepare(`update briefs_items set status = 'published', published_url = ?, published_path = ?, published_at = ?, measured_clicks_month = null, measured_at = null, measured_upload_id = null, updated_at = ? where id = ?`)
    .run(url, path, now(), now(), id);
}

/** Clicks a month for one path in one Search Console upload, or null when the URL is not in it. */
function clicksMonthIn(uploadId: string, path: string): number | null {
  const g = uploadData<GscImport>(uploadId);
  const days = periodDays(g.period) ?? DEFAULT_PERIOD_DAYS;
  const page = g.pages?.find((p) => p.path === path);
  if (page) return Math.round((page.clicks * 30) / days);
  const rows = (g.pageQueries ?? []).filter((r) => r.path === path);
  if (!rows.length) return null;
  return Math.round((rows.reduce((s, r) => s + r.clicks, 0) * 30) / days);
}

/**
 * Measured status is set in code: a published brief becomes measured when a Search Console upload added after
 * its publish date contains its URL. The latest such upload wins.
 */
export function syncMeasured(siteId: string): number {
  const pending = listBriefs(siteId).filter((b) => (b.status === 'published' || b.status === 'measured') && b.published_path && b.published_at);
  if (!pending.length) return 0;
  const ups = listUploads(siteId).filter((u) => u.kind === 'gsc_pages' || u.kind === 'gsc_queries').sort((a, b) => b.created_at.localeCompare(a.created_at));
  let changed = 0;
  for (const b of pending) {
    for (const u of ups.filter((x) => x.created_at > b.published_at!)) {
      if (u.id === (db().prepare('select measured_upload_id m from briefs_items where id = ?').get(b.id) as { m: string | null }).m) break;
      const c = clicksMonthIn(u.id, b.published_path!);
      if (c == null) continue;
      db().prepare(`update briefs_items set status = 'measured', measured_clicks_month = ?, measured_at = ?, measured_upload_id = ?, updated_at = ? where id = ?`).run(c, now(), u.id, now(), b.id);
      changed++;
      break;
    }
  }
  return changed;
}
