import 'server-only';
import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import Papa from 'papaparse';
import type { Answers } from '@/engine/jev/types';
import { db, newId, now } from '@/lib/db';
import { getProvider } from '@/lib/provider';
import { listUrls, type Site } from '@/lib/repo';
import { mapLimit, runningJobOf, startModuleJob } from '@/lib/modjobs';
import type { Job } from '@/lib/repo';
import { buildQuestions, buildState, type SiteContext } from '@/modules/links/battery';
import { disavowFile } from '@/modules/links/disavow';
import { featuresOf, siteTopics } from '@/modules/links/features';
import { mockLinksAnswer } from '@/modules/links/mock';
import { parseProspects, SOURCE_KIND_LABEL } from '@/modules/links/parse';
import { likelihoodOf, PRIOR_WEIGHT, PRIOR_WIN_RATE, type TypeStats } from '@/modules/links/rules';
import { finish } from '@/modules/links/score';
import { findLinksTo } from '@/modules/links/verify';
import {
  LINKS_CRITERIA_VERSION, SITE_TYPES, STATUSES,
  type Angle, type Features, type ImportPurpose, type Level, type LinkAttr, type LinkVerdict, type OutreachStatus, type ProspectInput, type ProspectType, type SiteType, type SourceKind, type ToxicKey,
} from '@/modules/links/types';

export const JOB_TYPE = 'links';

// ---------- schema ----------

let ready = false;
function ensureSchema() {
  if (ready) return;
  db().exec(`
    create table if not exists links_prospects (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      url text not null, url_key text not null, domain text not null,
      title text not null default '', snippet text not null default '', anchor text not null default '',
      dr real, traffic real, link_attr text not null default 'unknown',
      source text not null, source_kind text not null, purpose text not null default 'prospects',
      already_linking integer not null default 0,
      created_at text not null,
      features text, answers text,
      verdict text, confidence real, router text, site_type text, prospect_type text, angle text, quality text, relevance real,
      toxic text, likelihood text, priority integer, reasons text,
      criteria_version text, model text, scored_at text, job_id text,
      owner text, status text not null default 'new', status_at text, contacted_at text, replied_at text, closed_at text,
      verify_status text, verify_at text, verify_detail text,
      unique (site_id, url_key)
    );
    create index if not exists links_prospects_site_verdict on links_prospects (site_id, verdict, priority);
    create index if not exists links_prospects_site_domain on links_prospects (site_id, domain);
    create table if not exists links_own_domains (
      site_id text not null references sites(id) on delete cascade,
      domain text not null, source text not null, created_at text not null,
      primary key (site_id, domain)
    );
    create table if not exists links_events (
      id integer primary key autoincrement,
      site_id text not null references sites(id) on delete cascade,
      prospect_id text not null references links_prospects(id) on delete cascade,
      kind text not null, value text, by_name text, at text not null
    );
    create index if not exists links_events_prospect on links_events (prospect_id, id);
    create table if not exists links_imports (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      source text not null, source_kind text not null, purpose text not null, filename text,
      added integer not null, duplicates integer not null, already_linking integer not null, notes text not null default '[]',
      created_at text not null
    );
  `);
  ready = true;
}

// ---------- rows ----------

interface Raw {
  id: string; site_id: string; url: string; url_key: string; domain: string; title: string; snippet: string; anchor: string;
  dr: number | null; traffic: number | null; link_attr: LinkAttr; source: string; source_kind: SourceKind; purpose: ImportPurpose;
  already_linking: number; created_at: string; features: string | null; answers: string | null;
  verdict: LinkVerdict | null; confidence: number | null; router: string | null; site_type: SiteType | null; prospect_type: ProspectType | null;
  angle: Angle | null; quality: Level | null; relevance: number | null; toxic: string | null; likelihood: Level | null; priority: number | null;
  reasons: string | null; criteria_version: string | null; model: string | null; scored_at: string | null; job_id: string | null;
  owner: string | null; status: OutreachStatus; status_at: string | null; contacted_at: string | null; replied_at: string | null; closed_at: string | null;
  verify_status: 'found' | 'not_found' | 'error' | null; verify_at: string | null; verify_detail: string | null;
}

export interface Prospect extends Omit<Raw, 'features' | 'answers' | 'toxic' | 'reasons' | 'verify_detail' | 'already_linking'> {
  alreadyLinking: boolean;
  features: Features | null;
  answers: Answers | null;
  toxic: Record<ToxicKey, number> | null;
  reasons: string[];
  verifyDetail: { links?: { href: string; rel: string; anchor: string }[]; error?: string; httpStatus?: number } | null;
}

const parseJson = <T,>(s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
function hydrate(r: Raw): Prospect {
  const { features, answers, toxic, reasons, verify_detail, already_linking, ...rest } = r;
  return {
    ...rest,
    alreadyLinking: already_linking === 1,
    features: parseJson<Features>(features),
    answers: parseJson<Answers>(answers),
    toxic: parseJson<Record<ToxicKey, number>>(toxic),
    reasons: parseJson<string[]>(reasons) ?? [],
    verifyDetail: parseJson(verify_detail),
  };
}

const toInput = (r: Pick<Raw, 'url' | 'url_key' | 'domain' | 'title' | 'snippet' | 'anchor' | 'dr' | 'traffic' | 'link_attr'>): ProspectInput => ({
  url: r.url, urlKey: r.url_key, domain: r.domain, title: r.title, snippet: r.snippet, anchor: r.anchor, dr: r.dr, traffic: r.traffic, linkAttr: r.link_attr,
});

// ---------- import ----------

export interface ImportResult { added: number; duplicates: number; alreadyLinking: number; kind: SourceKind; notes: string[]; purpose: ImportPurpose }

export function importProspects(siteId: string, input: Uint8Array | string, opts: { source: string; purpose: ImportPurpose; filename?: string }): ImportResult {
  ensureSchema();
  const parsed = parseProspects(input, opts.purpose);
  if (!parsed.rows.length) throw new Error('No rows with a usable URL were found in that file.');
  const d = db();
  const t = now();
  const source = opts.source.trim().slice(0, 80) || (opts.purpose === 'own_profile' ? 'Your link profile' : SOURCE_KIND_LABEL[parsed.kind]);
  let added = 0;
  let duplicates = 0;
  let linking = 0;
  d.transaction(() => {
    if (opts.purpose === 'own_profile') {
      const insDom = d.prepare('insert or ignore into links_own_domains (site_id, domain, source, created_at) values (?, ?, ?, ?)');
      for (const r of parsed.rows) insDom.run(siteId, r.domain, source, t);
      // Domains that turn out to link already are marked on every existing prospect from them.
      const mark = d.prepare('update links_prospects set already_linking = 1 where site_id = ? and domain = ? and already_linking = 0');
      for (const r of parsed.rows) mark.run(siteId, r.domain);
    }
    const own = new Set((d.prepare('select domain from links_own_domains where site_id = ?').all(siteId) as { domain: string }[]).map((x) => x.domain));
    const exists = d.prepare('select 1 from links_prospects where site_id = ? and url_key = ?');
    const ins = d.prepare(`insert into links_prospects (id, site_id, url, url_key, domain, title, snippet, anchor, dr, traffic, link_attr, source, source_kind, purpose, already_linking, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of parsed.rows) {
      if (exists.get(siteId, r.urlKey)) { duplicates++; continue; }
      const al = opts.purpose === 'own_profile' || own.has(r.domain);
      if (al) linking++;
      ins.run(newId(), siteId, r.url, r.urlKey, r.domain, r.title, r.snippet, r.anchor, r.dr, r.traffic, r.linkAttr, source, parsed.kind, opts.purpose, al ? 1 : 0, t);
      added++;
    }
    d.prepare(`insert into links_imports (id, site_id, source, source_kind, purpose, filename, added, duplicates, already_linking, notes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), siteId, source, parsed.kind, opts.purpose, opts.filename ?? null, added, duplicates, linking, JSON.stringify(parsed.notes), t);
  })();
  recompute(siteId);
  return { added, duplicates, alreadyLinking: linking, kind: parsed.kind, notes: parsed.notes, purpose: opts.purpose };
}

export function loadLinkSamples(siteId: string): ImportResult[] {
  const f = (n: string) => new Uint8Array(readFileSync(path.join(process.cwd(), 'samples', n)));
  return [
    importProspects(siteId, f('links-own-profile.csv'), { source: 'Sample: your link profile', purpose: 'own_profile', filename: 'links-own-profile.csv' }),
    importProspects(siteId, f('links-prospects.csv'), { source: 'Sample: outdoor prospect list', purpose: 'prospects', filename: 'links-prospects.csv' }),
  ];
}

export function listImports(siteId: string, limit = 8) {
  ensureSchema();
  return (db().prepare('select * from links_imports where site_id = ? order by created_at desc limit ?').all(siteId, limit) as {
    id: string; source: string; source_kind: SourceKind; purpose: ImportPurpose; filename: string | null; added: number; duplicates: number; already_linking: number; notes: string; created_at: string;
  }[]).map((r) => ({ ...r, notes: parseJson<string[]>(r.notes) ?? [] }));
}

// ---------- scoring ----------

/** What the site is about, from its top pages by clicks (Module 1 data), falling back to the site name. */
export function siteContext(site: Site): SiteContext {
  const { rows } = listUrls(site.id, { sort: 'clicks', limit: 15, offset: 0 });
  const titles = rows.map((r) => r.title ?? '').filter(Boolean);
  return { name: site.name, domain: site.domain, topics: siteTopics(titles, site.name) };
}

function foundVia(r: Pick<Raw, 'purpose' | 'source' | 'source_kind'>): string {
  if (r.purpose === 'own_profile') return 'the site\'s own backlink profile (this page already links to the site)';
  if (r.source_kind === 'ahrefs' || r.source_kind === 'semrush') return `a competitor backlink export (${r.source}): this page links to a competitor`;
  return `a prospect list (${r.source})`;
}

export function unscoredCount(siteId: string): number {
  ensureSchema();
  return (db().prepare('select count(*) n from links_prospects where site_id = ? and (scored_at is null or criteria_version is not ?)').get(siteId, LINKS_CRITERIA_VERSION) as { n: number }).n;
}

export function startLinksJob(site: Site): Job {
  ensureSchema();
  const running = runningJobOf(site.id, JOB_TYPE);
  if (running) return running;
  const provider = getProvider(mockLinksAnswer);
  return startModuleJob(site.id, JOB_TYPE, provider, async (ctx) => {
    const d = db();
    const pending = () => d.prepare('select * from links_prospects where site_id = ? and (scored_at is null or criteria_version is not ?) order by created_at').all(site.id, LINKS_CRITERIA_VERSION) as Raw[];
    let todo = pending();
    if (!todo.length) return 'Nothing new to score';
    const sc = siteContext(site);
    const questions = buildQuestions();
    const stats = typeStats(site.id);
    const save = d.prepare(`update links_prospects set features = ?, answers = ?, verdict = ?, confidence = ?, router = ?, site_type = ?, prospect_type = ?, angle = ?, quality = ?, relevance = ?,
      toxic = ?, likelihood = ?, priority = ?, reasons = ?, criteria_version = ?, model = ?, scored_at = ?, job_id = ? where id = ?`);
    let failed = 0;
    let scored = 0;
    const tried = new Set<string>();
    // Rows imported while this job runs are picked up by a further pass, so a second upload never waits.
    for (let pass = 0; pass < 5 && todo.length; pass++) {
      todo.forEach((r) => tried.add(r.id));
      ctx.progress(0, todo.length, `Scoring ${todo.length} prospects`);
      await mapLimit(todo, 8, async (r) => {
        const input = toInput(r);
        const features = featuresOf(input, { name: site.name, domain: site.domain }, r.already_linking === 1);
        try {
          const res = await ctx.decide(r.url_key, LINKS_CRITERIA_VERSION, { state: buildState(input, features, sc, foundVia(r)), questions });
          const s = finish(features, res.answers, stats);
          const a = s.assessment;
          save.run(JSON.stringify(features), JSON.stringify(res.answers), a.verdict, a.confidence, a.router, a.siteType, a.prospectType, a.angle, a.quality, a.relevance,
            JSON.stringify(a.toxic), s.likelihood, s.priority, JSON.stringify(s.reasons), LINKS_CRITERIA_VERSION, res.model, now(), ctx.jobId, r.id);
        } catch {
          failed++;
        }
      }, (done) => ctx.progress(done, todo.length, `Scored ${done} of ${todo.length} prospects`));
      scored += todo.length;
      todo = pending().filter((r) => !tried.has(r.id));
    }
    recompute(site.id);
    const ok = scored - failed;
    if (!ok) throw new Error(`Every call failed (${failed}). Check the decision provider and try again.`);
    return `Scored ${ok} prospects${failed ? `; ${failed} failed and can be retried` : ''}`;
  }, { count: unscoredCount(site.id) });
}

// ---------- ledger and likelihood ----------

export function typeStats(siteId: string): Partial<Record<SiteType, TypeStats>> {
  ensureSchema();
  const rows = db().prepare(`select site_type,
      sum(case when contacted_at is not null or status in ('contacted','replied','won','lost') then 1 else 0 end) contacted,
      sum(case when replied_at is not null or status in ('replied','won') then 1 else 0 end) replied,
      sum(case when status = 'won' then 1 else 0 end) won,
      sum(case when status = 'lost' then 1 else 0 end) lost
    from links_prospects where site_id = ? and site_type is not null group by site_type`).all(siteId) as ({ site_type: SiteType } & TypeStats)[];
  return Object.fromEntries(rows.map((r) => [r.site_type, { contacted: r.contacted, replied: r.replied, won: r.won, lost: r.lost }]));
}

/** Recompute verdict, likelihood, priority and reasons in code from stored answers (no Jev call). Runs after every import and status change. */
export function recompute(siteId: string) {
  ensureSchema();
  const d = db();
  const stats = typeStats(siteId);
  const rows = d.prepare('select id, features, answers, already_linking from links_prospects where site_id = ? and answers is not null').all(siteId) as Pick<Raw, 'id' | 'features' | 'answers' | 'already_linking'>[];
  const upd = d.prepare('update links_prospects set features = ?, verdict = ?, confidence = ?, router = ?, likelihood = ?, priority = ?, reasons = ? where id = ?');
  d.transaction(() => {
    for (const r of rows) {
      const f = parseJson<Features>(r.features);
      const a = parseJson<Answers>(r.answers);
      if (!f || !a) continue;
      f.alreadyLinking = r.already_linking === 1;
      const s = finish(f, a, stats);
      upd.run(JSON.stringify(f), s.assessment.verdict, s.assessment.confidence, s.assessment.router, s.likelihood, s.priority, JSON.stringify(s.reasons), r.id);
    }
  })();
}

export interface CalibrationRow { siteType: SiteType; contacted: number; replied: number; won: number; lost: number; prior: number; blended: number; level: Level }

export function calibration(siteId: string): { rows: CalibrationRow[]; outcomes: number; priorWeight: number } {
  const stats = typeStats(siteId);
  const rows = SITE_TYPES.filter((t) => t !== 'link_farm').map((t) => {
    const s = stats[t] ?? { contacted: 0, replied: 0, won: 0, lost: 0 };
    const lk = likelihoodOf(t, stats);
    return { siteType: t, ...s, prior: PRIOR_WIN_RATE[t], blended: lk.rate, level: lk.level };
  });
  return { rows, outcomes: rows.reduce((n, r) => n + r.won + r.lost, 0), priorWeight: PRIOR_WEIGHT };
}

// ---------- queries ----------

export interface ProspectFilter { verdict?: string; type?: string; claim?: string; status?: string; q?: string; me?: string }

function where(siteId: string, f: ProspectFilter) {
  const w = ['site_id = ?'];
  const args: unknown[] = [siteId];
  if (f.verdict === 'unscored') w.push('verdict is null');
  else if (f.verdict && f.verdict !== 'all') { w.push('verdict = ?'); args.push(f.verdict); }
  if (f.type) { w.push('prospect_type = ?'); args.push(f.type); }
  if (f.claim === 'me' && f.me) { w.push('lower(owner) = lower(?)'); args.push(f.me); }
  else if (f.claim === 'anyone') w.push('owner is not null');
  else if (f.claim === 'unclaimed') w.push('owner is null');
  if (f.status && (STATUSES as readonly string[]).includes(f.status)) { w.push('status = ?'); args.push(f.status); }
  if (f.q) { w.push('(url like ? or title like ?)'); args.push(`%${f.q}%`, `%${f.q}%`); }
  return { sql: w.join(' and '), args };
}

export function listProspects(siteId: string, f: ProspectFilter, limit: number, offset: number): { rows: Prospect[]; total: number } {
  ensureSchema();
  const { sql, args } = where(siteId, f);
  const total = (db().prepare(`select count(*) n from links_prospects where ${sql}`).get(...args) as { n: number }).n;
  const order = f.verdict === 'toxic' ? 'confidence desc' : f.verdict === 'skip' ? 'relevance desc nulls last' : 'priority desc nulls last, relevance desc nulls last';
  const rows = db().prepare(`select * from links_prospects where ${sql} order by ${order}, created_at limit ? offset ?`).all(...args, limit, offset) as Raw[];
  return { rows: rows.map(hydrate), total };
}

export function getProspect(id: string): Prospect | null {
  ensureSchema();
  const r = db().prepare('select * from links_prospects where id = ?').get(id) as Raw | undefined;
  return r ? hydrate(r) : null;
}

export function prospectEvents(id: string) {
  ensureSchema();
  return db().prepare('select kind, value, by_name, at from links_events where prospect_id = ? order by id desc limit 20').all(id) as { kind: string; value: string | null; by_name: string | null; at: string }[];
}

export function summary(siteId: string) {
  ensureSchema();
  const r = db().prepare(`select count(*) total,
      sum(verdict = 'pursue') pursue, sum(verdict = 'skip') skip, sum(verdict = 'toxic') toxic, sum(verdict is null) unscored,
      sum(status = 'won') won, sum(status = 'won' and verify_status = 'found') verified,
      sum(status in ('contacted','replied')) active, sum(owner is not null and verdict = 'pursue' and status not in ('won','lost')) claimed
    from links_prospects where site_id = ?`).get(siteId) as Record<string, number | null>;
  const n = (k: string) => r[k] ?? 0;
  return { total: n('total'), pursue: n('pursue'), skip: n('skip'), toxic: n('toxic'), unscored: n('unscored'), won: n('won'), verified: n('verified'), active: n('active'), claimed: n('claimed') };
}

export function ownDomainCount(siteId: string): number {
  ensureSchema();
  return (db().prepare('select count(*) n from links_own_domains where site_id = ?').get(siteId) as { n: number }).n;
}

/** Toxic domains that already link to the site, for the disavow review. */
export function disavowCandidates(siteId: string) {
  ensureSchema();
  return db().prepare(`select domain, max(confidence) confidence, count(*) pages, max(dr) dr, group_concat(distinct coalesce(site_type, '')) types
    from links_prospects where site_id = ? and verdict = 'toxic' and already_linking = 1 group by domain order by confidence desc`).all(siteId) as { domain: string; confidence: number; pages: number; dr: number | null; types: string }[];
}

export function disavowText(site: Site): string {
  return disavowFile(disavowCandidates(site.id).map((d) => d.domain), site, now().slice(0, 10));
}

export function prospectsCsv(siteId: string): string {
  ensureSchema();
  const rows = (db().prepare('select * from links_prospects where site_id = ? order by priority desc nulls last, verdict').all(siteId) as Raw[]).map(hydrate);
  return Papa.unparse(rows.map((p) => ({
    url: p.url, domain: p.domain, title: p.title, source: p.source, already_linking: p.alreadyLinking ? 'yes' : 'no',
    domain_rating: p.dr ?? '', traffic: p.traffic ?? '', link_attribute: p.link_attr,
    verdict: p.verdict ?? 'unscored', confidence: p.confidence ?? '', site_type: p.site_type ?? '', prospect_type: p.prospect_type ?? '', angle: p.angle ?? '',
    quality: p.quality ?? '', relevance: p.relevance ?? '', likelihood: p.likelihood ?? '', priority: p.priority ?? '',
    owner: p.owner ?? '', status: p.status, contacted_at: p.contacted_at ?? '', replied_at: p.replied_at ?? '', closed_at: p.closed_at ?? '',
    link_verified: p.verify_status ?? '', reasons: p.reasons.join(' '), criteria_version: p.criteria_version ?? '', model: p.model ?? '',
  })));
}

export function latestLinksJob(siteId: string): Job | null {
  ensureSchema();
  const j = db().prepare('select * from jobs where site_id = ? and type = ? order by created_at desc limit 1').get(siteId, JOB_TYPE) as (Job & { meta: string }) | undefined;
  return j ? { ...j, meta: parseJson(j.meta) ?? {} } : null;
}

// ---------- workflow ----------

function event(siteId: string, prospectId: string, kind: string, value: string | null, by: string | null) {
  db().prepare('insert into links_events (site_id, prospect_id, kind, value, by_name, at) values (?, ?, ?, ?, ?, ?)').run(siteId, prospectId, kind, value, by, now());
}

export function claimProspect(p: Prospect, owner: string | null, by: string) {
  ensureSchema();
  db().prepare('update links_prospects set owner = ? where id = ?').run(owner, p.id);
  event(p.site_id, p.id, owner ? 'claim' : 'release', owner, by);
}

/** Log an outreach status with its date. Dates are kept per stage so the ledger can compute reply and win rates. */
export function setStatus(p: Prospect, status: OutreachStatus, date: string, by: string) {
  ensureSchema();
  const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : now().slice(0, 10);
  const d = db();
  const sets: string[] = ['status = ?', 'status_at = ?'];
  const args: unknown[] = [status, at];
  if (status === 'new') sets.push('contacted_at = null', 'replied_at = null', 'closed_at = null');
  if (status === 'contacted') { sets.push('contacted_at = ?', 'replied_at = null', 'closed_at = null'); args.push(at); }
  if (status === 'replied') { sets.push('contacted_at = coalesce(contacted_at, ?)', 'replied_at = ?', 'closed_at = null'); args.push(at, at); }
  if (status === 'won' || status === 'lost') { sets.push('contacted_at = coalesce(contacted_at, ?)', 'closed_at = ?'); args.push(at, at); }
  d.prepare(`update links_prospects set ${sets.join(', ')} where id = ?`).run(...args, p.id);
  event(p.site_id, p.id, 'status', status, by);
  recompute(p.site_id);
}

// ---------- verify by crawl ----------

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

async function assertPublic(u: URL) {
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https pages can be checked.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('That address is not on the public web.');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error('That address is not on the public web.');
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string; status: number }> {
  let current = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'RankcallLinkCheck/1.0 (+link verification)', Accept: 'text/html' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current);
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw Object.assign(new Error(`The page answered with HTTP ${res.status}.`), { httpStatus: res.status }); }
    const reader = res.body?.getReader();
    if (!reader) return { html: '', finalUrl: current.toString(), status: res.status };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.byteLength, size - o)), o); o += c.byteLength; if (o >= size) break; }
    return { html: new TextDecoder('utf-8', { fatal: false }).decode(buf), finalUrl: current.toString(), status: res.status };
  }
  throw new Error('Too many redirects.');
}

export async function verifyProspectLink(p: Prospect, site: Site, by: string): Promise<'found' | 'not_found' | 'error'> {
  ensureSchema();
  let status: 'found' | 'not_found' | 'error';
  let detail: Prospect['verifyDetail'];
  try {
    const page = await fetchPage(p.url);
    const check = findLinksTo(page.html, site.domain, page.finalUrl);
    status = check.found ? 'found' : 'not_found';
    detail = { links: check.links, httpStatus: page.status };
  } catch (err) {
    status = 'error';
    const e = err as Error & { httpStatus?: number; cause?: { code?: string } };
    const msg = e.name === 'TimeoutError' ? 'The page took longer than 10 seconds to answer.'
      : e.cause?.code === 'ENOTFOUND' || (e as { code?: string }).code === 'ENOTFOUND' ? 'The domain does not resolve.' : e.message;
    detail = { error: msg, httpStatus: e.httpStatus };
  }
  db().prepare('update links_prospects set verify_status = ?, verify_at = ?, verify_detail = ? where id = ?').run(status, now(), JSON.stringify(detail), p.id);
  event(p.site_id, p.id, 'verify', status, by);
  return status;
}
