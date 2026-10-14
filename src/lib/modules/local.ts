import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db, newId, now } from '@/lib/db';
import { getProvider } from '@/lib/provider';
import { latestJobOf, runningJobOf, startModuleJob } from '@/lib/modjobs';
import type { Job } from '@/lib/repo';
import { mockLocalAnswer } from '@/modules/local/mock';
import { parseUpload } from '@/modules/local/parse';
import { analyseLocation, isoWeek, runLocal, type LocationAnalysis } from '@/modules/local/run';
import { attentionPriority, routerOf, type AttentionKind, type PostDecision, type QaDecision, type ReviewDecision } from '@/modules/local/rules';
import { daysBetween, healthBand } from '@/modules/local/health';
import { NAP_FIELD_LABEL } from '@/modules/local/nap';
import { DEFAULT_SETTINGS, KIND_LABEL, type LocalCitation, type LocalLocation, type LocalQuestion, type LocalReview, type LocalSettings, type Theme, type UploadKind } from '@/modules/local/types';

/** Module 7 data: uploads, analysis, the weekly Jev run, and the review / question / post workflow. */

export const JOB_TYPE = 'local';
export const today = () => new Date().toISOString().slice(0, 10);

let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  db().exec(`
    create table if not exists local_uploads (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      kind text not null, mode text not null, filename text not null, row_count integer not null,
      warnings text not null default '[]', source text not null default 'upload',
      snapshot text, created_at text not null
    );
    create index if not exists local_uploads_site on local_uploads(site_id, kind, created_at);
    create table if not exists local_locations (
      site_id text not null references sites(id) on delete cascade,
      loc_id text not null, data text not null, updated_at text not null,
      primary key (site_id, loc_id)
    );
    create table if not exists local_reviews (
      site_id text not null references sites(id) on delete cascade,
      review_key text not null, loc_id text not null, data text not null, created_at text not null,
      primary key (site_id, review_key)
    );
    create table if not exists local_questions (
      site_id text not null references sites(id) on delete cascade,
      q_key text not null, loc_id text not null, data text not null, created_at text not null,
      primary key (site_id, q_key)
    );
    create table if not exists local_citations (
      id integer primary key autoincrement,
      site_id text not null references sites(id) on delete cascade,
      loc_id text not null, data text not null
    );
    create index if not exists local_citations_site on local_citations(site_id, loc_id);
    create table if not exists local_decisions (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      kind text not null, item_key text not null, loc_id text not null, job_id text,
      choice text not null, jev_choice text not null, confidence real not null, router text not null,
      data text not null, draft text not null default '', final_text text not null default '',
      status text not null, model text, created_at text not null, updated_at text not null,
      unique (site_id, kind, item_key)
    );
    create index if not exists local_decisions_loc on local_decisions(site_id, loc_id);
    create table if not exists local_log (
      id integer primary key autoincrement,
      site_id text not null references sites(id) on delete cascade,
      loc_id text not null, kind text not null, item_key text, action text not null, detail text not null default '',
      created_at text not null
    );
    create index if not exists local_log_site on local_log(site_id, created_at);
    create table if not exists local_settings (
      site_id text primary key references sites(id) on delete cascade,
      data text not null
    );
  `);
  schemaReady = true;
}

// ---------- settings ----------

export function getSettings(siteId: string): LocalSettings {
  ensureSchema();
  const r = db().prepare('select data from local_settings where site_id = ?').get(siteId) as { data: string } | undefined;
  return { ...DEFAULT_SETTINGS, ...(r ? JSON.parse(r.data) : {}) };
}

/** Save the approval rules and re-apply them to replies that nobody has acted on yet. */
export function saveSettings(siteId: string, s: LocalSettings): number {
  ensureSchema();
  const d = db();
  d.prepare('insert into local_settings (site_id, data) values (?, ?) on conflict(site_id) do update set data = excluded.data').run(siteId, JSON.stringify(s));
  const rows = d.prepare(`select id, data, status, router, choice from local_decisions where site_id = ? and kind = 'review' and status in ('proposed', 'approved')`).all(siteId) as { id: string; data: string; status: string; router: string; choice: string }[];
  let changed = 0;
  const upd = d.prepare('update local_decisions set status = ?, data = ?, updated_at = ? where id = ?');
  for (const r of rows) {
    const data = JSON.parse(r.data) as StoredReviewData;
    const autoStar = (data.rating === 5 && s.autoApproveFiveStar) || (data.rating === 4 && s.autoApproveFourStar);
    const should = r.choice === 'reply_template' && r.router === 'auto' && autoStar && !data.edited ? 'approved' : 'proposed';
    if (should !== r.status) {
      data.approval = should === 'approved' ? `Auto-approved: templated reply to a ${data.rating}-star review, Jev confident (site approval rule).` : 'Waiting for your approval.';
      upd.run(should, JSON.stringify(data), now(), r.id);
      changed++;
    }
  }
  return changed;
}

// ---------- uploads ----------

const jsonRows = <T,>(sql: string, ...args: unknown[]): T[] => (db().prepare(sql).all(...args) as { data: string }[]).map((r) => JSON.parse(r.data) as T);

export function readLocations(siteId: string): LocalLocation[] {
  ensureSchema();
  return jsonRows<LocalLocation>('select data from local_locations where site_id = ?', siteId).sort((a, b) => a.name.localeCompare(b.name));
}
export const readReviews = (siteId: string) => { ensureSchema(); return jsonRows<LocalReview>('select data from local_reviews where site_id = ?', siteId); };
export const readQuestions = (siteId: string) => { ensureSchema(); return jsonRows<LocalQuestion>('select data from local_questions where site_id = ?', siteId); };
export const readCitations = (siteId: string) => { ensureSchema(); return jsonRows<LocalCitation>('select data from local_citations where site_id = ? order by id', siteId); };

const shiftDate = (d: string | null, days: number) => (d && days ? new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10) : d);

export interface IngestResult { rows: number; warnings: string[]; uploadId: string }

/** Parse and store one export. "replace" swaps out every row of that type; "append" adds and updates by key. */
export function ingestLocal(siteId: string, kind: UploadKind, mode: 'replace' | 'append', text: string, filename: string, opts: { source?: string; shiftDays?: number; createdAt?: string } = {}): IngestResult {
  ensureSchema();
  const d = db();
  const parsed = parseUpload(kind, text);
  const shift = opts.shiftDays ?? 0;
  const t = opts.createdAt ?? now();
  const uploadId = newId();
  let snapshot: Record<string, { rating: number | null; reviews: number | null; name: string }> | null = null;
  d.transaction(() => {
    if (parsed.kind === 'locations') {
      if (mode === 'replace') d.prepare('delete from local_locations where site_id = ?').run(siteId);
      const ins = d.prepare('insert into local_locations (site_id, loc_id, data, updated_at) values (?, ?, ?, ?) on conflict(site_id, loc_id) do update set data = excluded.data, updated_at = excluded.updated_at');
      snapshot = {};
      for (const l of parsed.result.rows) {
        const row = { ...l, lastPostDate: shiftDate(l.lastPostDate, shift) };
        ins.run(siteId, l.locId, JSON.stringify(row), t);
        snapshot[l.locId] = { rating: l.rating, reviews: l.reviewCount, name: l.name };
      }
    } else if (parsed.kind === 'reviews') {
      if (mode === 'replace') d.prepare('delete from local_reviews where site_id = ?').run(siteId);
      const ins = d.prepare('insert into local_reviews (site_id, review_key, loc_id, data, created_at) values (?, ?, ?, ?, ?) on conflict(site_id, review_key) do update set data = excluded.data');
      for (const r of parsed.result.rows) ins.run(siteId, r.key, r.locId, JSON.stringify({ ...r, date: shiftDate(r.date, shift) }), t);
    } else if (parsed.kind === 'questions') {
      if (mode === 'replace') d.prepare('delete from local_questions where site_id = ?').run(siteId);
      const ins = d.prepare('insert into local_questions (site_id, q_key, loc_id, data, created_at) values (?, ?, ?, ?, ?) on conflict(site_id, q_key) do update set data = excluded.data');
      for (const q of parsed.result.rows) ins.run(siteId, q.key, q.locId, JSON.stringify({ ...q, date: shiftDate(q.date, shift) }), t);
    } else {
      if (mode === 'replace') d.prepare('delete from local_citations where site_id = ?').run(siteId);
      else {
        // Appending a directory export for a location replaces that location and directory's rows.
        const del = d.prepare('delete from local_citations where site_id = ? and loc_id = ? and lower(json_extract(data, \'$.directory\')) = lower(?)');
        const seen = new Set<string>();
        for (const c of parsed.result.rows) { const k = `${c.locId}|${c.directory}`; if (!seen.has(k)) { seen.add(k); del.run(siteId, c.locId, c.directory); } }
      }
      const ins = d.prepare('insert into local_citations (site_id, loc_id, data) values (?, ?, ?)');
      for (const c of parsed.result.rows) ins.run(siteId, c.locId, JSON.stringify(c));
    }
    d.prepare('insert into local_uploads (id, site_id, kind, mode, filename, row_count, warnings, source, snapshot, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uploadId, siteId, kind, mode, filename.slice(0, 200), parsed.result.rows.length, JSON.stringify(parsed.result.warnings.slice(0, 50)), opts.source ?? 'upload', snapshot ? JSON.stringify(snapshot) : null, t);
  })();
  return { rows: parsed.result.rows.length, warnings: parsed.result.warnings, uploadId };
}

/** Remove every Local SEO row for the site (uploads, decisions and the action log). */
export function clearLocal(siteId: string) {
  ensureSchema();
  const d = db();
  d.transaction(() => {
    for (const t of ['local_uploads', 'local_locations', 'local_reviews', 'local_questions', 'local_citations', 'local_decisions', 'local_log']) d.prepare(`delete from ${t} where site_id = ?`).run(siteId);
  })();
}

const SAMPLE_ANCHOR = '2026-10-13';

/** The fictional Sample Outdoors shops. Dates are shifted so the sample always looks current. */
export function loadLocalSamples(siteId: string) {
  clearLocal(siteId);
  const shiftDays = daysBetween(SAMPLE_ANCHOR, today());
  const f = (n: string) => readFileSync(path.join(process.cwd(), 'samples', n), 'utf8');
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  ingestLocal(siteId, 'locations', 'replace', f('local-locations-previous.csv'), 'local-locations-previous.csv', { source: 'sample', shiftDays, createdAt: monthAgo });
  ingestLocal(siteId, 'locations', 'replace', f('local-locations.csv'), 'local-locations.csv', { source: 'sample', shiftDays });
  ingestLocal(siteId, 'reviews', 'replace', f('local-reviews.csv'), 'local-reviews.csv', { source: 'sample', shiftDays });
  ingestLocal(siteId, 'questions', 'replace', f('local-questions.csv'), 'local-questions.csv', { source: 'sample', shiftDays });
  ingestLocal(siteId, 'citations', 'replace', f('local-citations.csv'), 'local-citations.csv', { source: 'sample', shiftDays });
}

export interface UploadRow { id: string; kind: UploadKind; mode: string; filename: string; row_count: number; warnings: string[]; source: string; created_at: string; snapshot: Record<string, { rating: number | null; reviews: number | null; name: string }> | null }

export function listUploads(siteId: string, limit = 30): UploadRow[] {
  ensureSchema();
  return (db().prepare('select * from local_uploads where site_id = ? order by created_at desc limit ?').all(siteId, limit) as (Omit<UploadRow, 'warnings' | 'snapshot'> & { warnings: string; snapshot: string | null })[])
    .map((u) => ({ ...u, warnings: JSON.parse(u.warnings), snapshot: u.snapshot ? JSON.parse(u.snapshot) : null }));
}

// ---------- the weekly run ----------

export const runningLocalJob = (siteId: string) => runningJobOf(siteId, JOB_TYPE);
export const latestLocalJob = (siteId: string) => latestJobOf(siteId, JOB_TYPE);

export type StoredReviewData = Omit<ReviewDecision, 'draft'> & { rating: number; edited?: boolean };

/** Jev decisions the next weekly run would make: undecided open reviews and questions, plus one post plan per shop. */
export function pendingDecisionCount(siteId: string): number {
  ensureSchema();
  const locs = new Set(readLocations(siteId).map((l) => l.locId));
  if (!locs.size) return 0;
  const decided = new Set((db().prepare('select kind, item_key from local_decisions where site_id = ?').all(siteId) as { kind: string; item_key: string }[]).map((x) => `${x.kind}:${x.item_key}`));
  const reviews = readReviews(siteId).filter((r) => !r.replied && locs.has(r.locId) && !decided.has(`review:${r.key}`)).length;
  const questions = readQuestions(siteId).filter((q) => !q.answered && locs.has(q.locId) && !decided.has(`question:${q.key}`)).length;
  return reviews + questions + locs.size;
}

export function startLocalJob(siteId: string, redo = false): Job {
  ensureSchema();
  const provider = getProvider(mockLocalAnswer);
  return startModuleJob(siteId, JOB_TYPE, provider, async (ctx) => {
    const d = db();
    const day = today();
    const locations = readLocations(siteId);
    if (!locations.length) throw new Error('Upload a locations file first.');
    const decided = d.prepare(`select kind, item_key, status, data from local_decisions where site_id = ?`).all(siteId) as { kind: string; item_key: string; status: string; data: string }[];
    const keep = (k: string) => decided.filter((x) => x.kind === k && (!redo || !['proposed', 'approved'].includes(x.status))).map((x) => x.item_key);
    const knownThemes = new Map<string, Theme>(decided.filter((x) => x.kind === 'review').map((x) => [x.item_key, (JSON.parse(x.data) as StoredReviewData).theme]));
    const out = await runLocal({
      locations, reviews: readReviews(siteId), questions: readQuestions(siteId), settings: getSettings(siteId), today: day,
      skipReviews: new Set(keep('review')), skipQuestions: new Set(keep('question')), knownThemes,
    }, ctx.decide, { concurrency: provider.name === 'typesafe' ? 8 : 16, onProgress: ctx.progress });

    const t = now();
    const up = d.prepare(`insert into local_decisions (id, site_id, kind, item_key, loc_id, job_id, choice, jev_choice, confidence, router, data, draft, final_text, status, model, created_at, updated_at)
      values (@id, @site_id, @kind, @item_key, @loc_id, @job_id, @choice, @jev_choice, @confidence, @router, @data, @draft, @draft, @status, @model, @t, @t)
      on conflict(site_id, kind, item_key) do update set job_id = excluded.job_id, choice = excluded.choice, jev_choice = excluded.jev_choice, confidence = excluded.confidence,
        router = excluded.router, data = excluded.data, draft = excluded.draft, final_text = excluded.final_text, status = excluded.status, model = excluded.model, updated_at = excluded.updated_at
      where local_decisions.status in ('proposed', 'approved')`);
    const logIns = d.prepare('insert into local_log (site_id, loc_id, kind, item_key, action, detail, created_at) values (?, ?, ?, ?, ?, ?, ?)');
    let auto = 0;
    d.transaction(() => {
      for (const { review, decision } of out.reviews) {
        const { draft, ...rest } = decision;
        up.run({ id: newId(), site_id: siteId, kind: 'review', item_key: review.key, loc_id: review.locId, job_id: ctx.jobId, choice: decision.action, jev_choice: decision.jevAction, confidence: decision.confidence, router: decision.router, data: JSON.stringify({ ...rest, rating: review.rating }), draft, status: decision.status, model: ctx.provider.model, t });
        if (decision.status === 'approved') { auto++; logIns.run(siteId, review.locId, 'review', review.key, 'Auto-approved reply', `${review.rating}-star review from ${review.author}`, t); }
      }
      for (const { question, decision } of out.questions) {
        const { draft, ...rest } = decision;
        up.run({ id: newId(), site_id: siteId, kind: 'question', item_key: question.key, loc_id: question.locId, job_id: ctx.jobId, choice: decision.action, jev_choice: decision.jevAction, confidence: decision.confidence, router: decision.router, data: JSON.stringify(rest), draft, status: 'proposed', model: ctx.provider.model, t });
      }
      for (const { locId, week, decision } of out.posts) {
        const { draft, ...rest } = decision;
        up.run({ id: newId(), site_id: siteId, kind: 'post', item_key: `${locId}:${week}`, loc_id: locId, job_id: ctx.jobId, choice: decision.post, jev_choice: decision.jevPost, confidence: decision.confidence, router: decision.router, data: JSON.stringify(rest), draft, status: 'proposed', model: ctx.provider.model, t });
      }
    })();
    if (out.failures.length && !out.reviews.length && !out.posts.length) throw new Error(out.failures[0]);
    const parts = [`${out.reviews.length} review${out.reviews.length === 1 ? '' : 's'}`, `${out.questions.length} question${out.questions.length === 1 ? '' : 's'}`, `${out.posts.length} post plan${out.posts.length === 1 ? '' : 's'}`];
    return `Decided ${parts.join(', ')}${auto ? `, ${auto} repl${auto === 1 ? 'y' : 'ies'} auto-approved` : ''}${out.failures.length ? `. ${out.failures.length} failed` : ''}.`;
  }, { redo });
}

// ---------- decisions and the workflow ----------

export type DecisionStatus = 'proposed' | 'approved' | 'escalated' | 'removal_requested' | 'posted' | 'dismissed' | 'spam';
export const OPEN_STATUSES: DecisionStatus[] = ['proposed', 'approved', 'escalated'];

export interface DecisionRow<D> {
  id: string; kind: 'review' | 'question' | 'post'; item_key: string; loc_id: string; choice: string; jev_choice: string;
  confidence: number; router: 'auto' | 'review' | 'uncertain'; data: D; draft: string; final_text: string; status: DecisionStatus; model: string | null; created_at: string; updated_at: string;
}

function readDecisions<D>(siteId: string, kind: 'review' | 'question' | 'post', locId?: string): DecisionRow<D>[] {
  ensureSchema();
  const rows = (locId
    ? db().prepare('select * from local_decisions where site_id = ? and kind = ? and loc_id = ?').all(siteId, kind, locId)
    : db().prepare('select * from local_decisions where site_id = ? and kind = ?').all(siteId, kind)) as (Omit<DecisionRow<D>, 'data'> & { data: string })[];
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data) as D }));
}

export function getDecision(id: string): (DecisionRow<Record<string, unknown>> & { site_id: string }) | null {
  ensureSchema();
  const r = db().prepare('select * from local_decisions where id = ?').get(id) as (Omit<DecisionRow<Record<string, unknown>>, 'data'> & { data: string; site_id: string }) | undefined;
  return r ? { ...r, data: JSON.parse(r.data) } : null;
}

export function logAction(siteId: string, locId: string, kind: string, itemKey: string | null, action: string, detail = '') {
  ensureSchema();
  db().prepare('insert into local_log (site_id, loc_id, kind, item_key, action, detail, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(siteId, locId, kind, itemKey, action, detail.slice(0, 500), now());
}

export interface LogRow { id: number; loc_id: string; kind: string; item_key: string | null; action: string; detail: string; created_at: string }
export function readLog(siteId: string, locId?: string, limit = 40): LogRow[] {
  ensureSchema();
  return (locId
    ? db().prepare('select * from local_log where site_id = ? and loc_id = ? order by id desc limit ?').all(siteId, locId, limit)
    : db().prepare('select * from local_log where site_id = ? order by id desc limit ?').all(siteId, limit)) as LogRow[];
}

/** Actions people logged since a date (auto-approvals excluded), for the weekly progress line. */
export function actionsSince(siteId: string, since: string): number {
  ensureSchema();
  return (db().prepare("select count(*) n from local_log where site_id = ? and created_at >= ? and action != 'Auto-approved reply'").get(siteId, since) as { n: number }).n;
}

/** Update a decision's status and text. Marking something as posted also updates the stored row, so health reflects it. */
export function setDecisionStatus(id: string, status: DecisionStatus, text: string | null, extra: { overrideOf?: string } = {}) {
  ensureSchema();
  const d = db();
  const row = getDecision(id);
  if (!row) throw new Error('Decision not found');
  const t = now();
  const edited = text != null && text.trim() !== row.draft.trim();
  const data = { ...row.data, ...(edited ? { edited: true } : {}), ...(extra.overrideOf ? { override: extra.overrideOf } : {}) };
  d.transaction(() => {
    d.prepare('update local_decisions set status = ?, final_text = coalesce(?, final_text), data = ?, updated_at = ? where id = ?').run(status, text, JSON.stringify(data), t, id);
    if (status === 'posted' && row.kind === 'review') {
      const r = d.prepare('select data from local_reviews where site_id = ? and review_key = ?').get(row.site_id, row.item_key) as { data: string } | undefined;
      if (r) d.prepare('update local_reviews set data = ? where site_id = ? and review_key = ?').run(JSON.stringify({ ...JSON.parse(r.data), replied: true, replyText: text ?? row.final_text }), row.site_id, row.item_key);
    }
    if ((status === 'posted' || status === 'spam') && row.kind === 'question') {
      const q = d.prepare('select data from local_questions where site_id = ? and q_key = ?').get(row.site_id, row.item_key) as { data: string } | undefined;
      if (q && status === 'posted') d.prepare('update local_questions set data = ? where site_id = ? and q_key = ?').run(JSON.stringify({ ...JSON.parse(q.data), answered: true }), row.site_id, row.item_key);
    }
    if (status === 'posted' && row.kind === 'post') {
      const l = d.prepare('select data from local_locations where site_id = ? and loc_id = ?').get(row.site_id, row.loc_id) as { data: string } | undefined;
      if (l) d.prepare('update local_locations set data = ? where site_id = ? and loc_id = ?').run(JSON.stringify({ ...JSON.parse(l.data), lastPostDate: today() }), row.site_id, row.loc_id);
    }
  })();
  return row;
}

// ---------- view models ----------

export interface ReviewItem { review: LocalReview; decision: DecisionRow<StoredReviewData> | null }
export interface QuestionItem { question: LocalQuestion; decision: DecisionRow<Omit<QaDecision, 'draft'>> | null }
export type PostRow = DecisionRow<Omit<PostDecision, 'draft'>>;

export interface AttentionItem { kind: AttentionKind; locId: string; locName: string; title: string; detail: string; priority: number; anchor: string; tone: 'bad' | 'warn' | 'leave' }

export interface LocationView extends LocationAnalysis {
  reviews: ReviewItem[];
  questions: QuestionItem[];
  post: PostRow | null;
  attention: AttentionItem[];
}

function buildView(a: LocationAnalysis, reviews: LocalReview[], questions: LocalQuestion[], rd: Map<string, DecisionRow<StoredReviewData>>, qd: Map<string, DecisionRow<Omit<QaDecision, 'draft'>>>, posts: Map<string, PostRow>, day: string): LocationView {
  const loc = a.loc;
  const reviewItems = reviews.map((r) => ({ review: r, decision: rd.get(r.key) ?? null }))
    .sort((x, y) => (y.review.date ?? '').localeCompare(x.review.date ?? ''));
  const questionItems = questions.map((q) => ({ question: q, decision: qd.get(q.key) ?? null }));
  const post = posts.get(`${loc.locId}:${isoWeek(day)}`) ?? null;
  const att: AttentionItem[] = [];
  const health = a.health.score;
  const push = (i: Omit<AttentionItem, 'locId' | 'locName'>) => att.push({ ...i, locId: loc.locId, locName: loc.name });
  for (const { review: r, decision: dd } of reviewItems) {
    const open = !r.replied && (!dd || OPEN_STATUSES.includes(dd.status));
    if (!open) continue;
    const age = r.date ? daysBetween(r.date, day) : null;
    const escalated = dd?.status === 'escalated';
    const what = !dd ? 'Decide on' : dd.choice === 'flag_for_removal' ? 'Request removal of' : escalated ? 'Manager to follow up' : dd.status === 'approved' ? 'Post the approved reply to' : dd.choice === 'escalate_to_manager' ? 'Escalate' : 'Reply to';
    push({ kind: 'review', title: `${what} ${escalated ? `on ${r.rating}-star review` : `${r.rating}-star review`} from ${r.author}`, detail: r.text ? `“${r.text.slice(0, 90)}${r.text.length > 90 ? '…' : ''}”` : 'Star rating only', priority: attentionPriority({ kind: 'review', health, stars: r.rating, ageDays: age, escalated }), anchor: `review-${r.key}`, tone: r.rating <= 2 ? 'bad' : r.rating === 3 ? 'warn' : 'leave' });
  }
  for (const { question: q, decision: dd } of questionItems) {
    if (q.answered || (dd && !OPEN_STATUSES.includes(dd.status))) continue;
    push({ kind: 'question', title: dd?.choice === 'spam' ? 'Mark a spam question' : 'Answer a customer question', detail: `“${q.question.slice(0, 90)}”`, priority: attentionPriority({ kind: 'question', health, ageDays: q.date ? daysBetween(q.date, day) : null }), anchor: `question-${q.key}`, tone: 'warn' });
  }
  if (post ? post.status === 'proposed' && post.choice !== 'none_this_week' : (a.daysSincePost == null || a.daysSincePost >= 7)) {
    push({ kind: 'post', title: post ? `Publish this week's ${post.choice === 'offer' ? 'offer' : post.choice === 'event' ? 'event' : 'update'} post` : 'Plan a profile post', detail: a.daysSincePost == null ? 'No post on record' : `Last post ${a.daysSincePost} days ago`, priority: attentionPriority({ kind: 'post', health }), anchor: 'post', tone: 'leave' });
  }
  for (const c of a.health.checks.filter((c) => c.area === 'profile' && c.lost > 0)) {
    push({ kind: 'profile', title: `Fix the profile: ${c.label.toLowerCase()}`, detail: c.detail, priority: attentionPriority({ kind: 'profile', health, points: c.lost }), anchor: 'profile', tone: c.lost >= 10 ? 'bad' : 'warn' });
  }
  for (const c of a.issues) {
    const fields = c.mismatches.map((m) => NAP_FIELD_LABEL[m.field].toLowerCase());
    push({ kind: 'citation', title: `${c.directory}: ${fields.length ? `${fields.join(', ')} ${fields.length === 1 ? 'differs' : 'differ'}` : 'possible duplicate listing'}`, detail: c.tier === 1 ? 'Major directory, fix first' : c.tier === 2 ? 'Important directory' : 'Minor directory', priority: attentionPriority({ kind: 'citation', health, tier: c.tier }), anchor: 'citations', tone: c.tier === 1 ? 'bad' : c.tier === 2 ? 'warn' : 'leave' });
  }
  att.sort((x, y) => y.priority - x.priority);
  return { ...a, reviews: reviewItems, questions: questionItems, post, attention: att };
}

function group<T extends { locId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const a = m.get(r.locId); if (a) a.push(r); else m.set(r.locId, [r]); }
  return m;
}

export interface Portfolio {
  locations: LocationView[];
  attention: AttentionItem[];
  orphanReviews: number;
  counts: { reviews: number; questions: number; citations: number };
}

export function portfolio(siteId: string): Portfolio {
  ensureSchema();
  const day = today();
  const locs = readLocations(siteId);
  const reviews = readReviews(siteId);
  const questions = readQuestions(siteId);
  const citations = readCitations(siteId);
  const rg = group(reviews), qg = group(questions), cg = group(citations);
  const rd = new Map(readDecisions<StoredReviewData>(siteId, 'review').map((x) => [x.item_key, x]));
  const qd = new Map(readDecisions<Omit<QaDecision, 'draft'>>(siteId, 'question').map((x) => [x.item_key, x]));
  const pd = new Map(readDecisions<Omit<PostDecision, 'draft'>>(siteId, 'post').map((x) => [x.item_key, x]));
  const views = locs.map((l) => buildView(analyseLocation(l, rg.get(l.locId) ?? [], qg.get(l.locId) ?? [], cg.get(l.locId) ?? [], day), rg.get(l.locId) ?? [], qg.get(l.locId) ?? [], rd, qd, pd, day));
  const known = new Set(locs.map((l) => l.locId));
  return {
    locations: views,
    attention: views.flatMap((v) => v.attention).sort((a, b) => b.priority - a.priority),
    orphanReviews: reviews.filter((r) => !known.has(r.locId)).length,
    counts: { reviews: reviews.length, questions: questions.length, citations: citations.length },
  };
}

export function locationView(siteId: string, locId: string): LocationView | null {
  const p = portfolio(siteId);
  return p.locations.find((l) => l.loc.locId === locId) ?? null;
}

// ---------- rating and review volume over time ----------

export interface Snapshot { at: string; source: string; byLoc: Record<string, { rating: number | null; reviews: number | null; name: string }> }

export function snapshots(siteId: string): Snapshot[] {
  ensureSchema();
  return (db().prepare(`select created_at, source, snapshot from local_uploads where site_id = ? and kind = 'locations' and snapshot is not null order by created_at asc`).all(siteId) as { created_at: string; source: string; snapshot: string }[])
    .map((r) => ({ at: r.created_at, source: r.source, byLoc: JSON.parse(r.snapshot) }));
}

export function summarise(s: Snapshot) {
  const vals = Object.values(s.byLoc);
  const rated = vals.filter((v) => v.rating != null);
  return {
    avgRating: rated.length ? rated.reduce((a, v) => a + (v.rating ?? 0), 0) / rated.length : null,
    reviews: vals.reduce((a, v) => a + (v.reviews ?? 0), 0),
    locations: vals.length,
  };
}

export { healthBand, routerOf, KIND_LABEL };
