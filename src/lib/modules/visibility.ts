import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db, newId, now } from '@/lib/db';
import { getProvider } from '@/lib/provider';
import { listUrls, siteInputs, type Site } from '@/lib/repo';
import { mapLimit, runningJobOf, startModuleJob, type JobContext } from '@/lib/modjobs';
import { analyseAnswer, brandTerms, highlightSpans, mentionExcerpt, normDomain, parseAnswersCsv, type ImportedAnswer } from '@/modules/visibility/parse';
import { addDays, byEngine, lostPrompts, periodAlert, periodView, rates, runDates, trend, visibilityAfter, weekly, type AnswerFacts } from '@/modules/visibility/aggregate';
import { CRITERIA_VERSION, lossQuestions, lossState, sentimentQuestions, sentimentState, type PageStatus } from '@/modules/visibility/battery';
import { fixFor, readLoss, readSentiment, routerFor } from '@/modules/visibility/rules';
import { mockVisibilityAnswer } from '@/modules/visibility/mock';
import { coverageFor, suggestPrompts, type Suggestion } from '@/modules/visibility/prompts';
import { LIVE_ENGINES, RUNNERS, RUNS_PER_PROMPT, runEngine, type LiveEngine } from '@/modules/visibility/runners';
import { AUTO_ANALYSE_LIMIT, shouldAutoAnalyse } from '@/modules/visibility/types';
import type { BrandConfig, CitedUrl, Engine, LossReason, LossStatus, Owner, Position, Router, Sentiment, SourceType, Span } from '@/modules/visibility/types';

/** Module 4 data and jobs. Tables are prefixed visibility_ and created on first use. */

let ready = false;
function ensureSchema() {
  if (ready) return;
  db().exec(`
    create table if not exists visibility_settings (
      site_id text primary key references sites(id) on delete cascade,
      brand_name text not null, aliases text not null default '[]', domain text not null,
      competitors text not null default '[]', updated_at text not null
    );
    create table if not exists visibility_prompts (
      id text primary key, site_id text not null references sites(id) on delete cascade,
      text text not null collate nocase, grp text, created_at text not null,
      unique (site_id, text)
    );
    create table if not exists visibility_answers (
      id text primary key, site_id text not null references sites(id) on delete cascade,
      prompt_id text not null, engine text not null, run_date text not null, run_index integer not null,
      answer text not null, provided_urls text not null default '[]', source text not null, model text,
      mentioned integer not null default 0, position text not null default 'absent', first_index integer,
      brand_cited integer not null default 0, competitors text not null default '[]', cited text not null default '[]',
      sentiment text, sentiment_conf real, created_at text not null
    );
    create index if not exists visibility_answers_site_date on visibility_answers (site_id, run_date);
    create index if not exists visibility_answers_prompt on visibility_answers (site_id, prompt_id);
    create table if not exists visibility_losses (
      id text primary key, site_id text not null references sites(id) on delete cascade,
      prompt_id text not null, run_date text not null, engines text not null, winner text,
      reason text, probabilities text, confidence real, router text, fix text, owner text,
      evidence text, evidence_hash text, model text,
      status text not null default 'open', done_at text, created_at text not null, updated_at text not null,
      unique (site_id, prompt_id)
    );
  `);
  ready = true;
}

const J = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

// ---------- settings ----------

export interface Settings extends BrandConfig { saved: boolean }

export function getSettings(site: Site): Settings {
  ensureSchema();
  const r = db().prepare('select * from visibility_settings where site_id = ?').get(site.id) as { brand_name: string; aliases: string; domain: string; competitors: string } | undefined;
  if (!r) return { name: site.name, aliases: [], domain: normDomain(site.domain), competitors: [], saved: false };
  return { name: r.brand_name, aliases: J(r.aliases, []), domain: r.domain, competitors: J(r.competitors, []), saved: true };
}

export function saveSettings(site: Site, cfg: BrandConfig) {
  ensureSchema();
  const before = getSettings(site);
  db().prepare(`insert into visibility_settings (site_id, brand_name, aliases, domain, competitors, updated_at) values (?, ?, ?, ?, ?, ?)
    on conflict(site_id) do update set brand_name = excluded.brand_name, aliases = excluded.aliases, domain = excluded.domain, competitors = excluded.competitors, updated_at = excluded.updated_at`)
    .run(site.id, cfg.name, JSON.stringify(cfg.aliases), normDomain(cfg.domain), JSON.stringify(cfg.competitors.slice(0, 5)), now());
  const brandChanged = JSON.stringify(brandTerms(before)) !== JSON.stringify(brandTerms(cfg));
  // Sentiment was judged toward the old brand name, so it is cleared when the brand changes.
  if (brandChanged) db().prepare('update visibility_answers set sentiment = null, sentiment_conf = null where site_id = ?').run(site.id);
  reparseAll(site);
}

// ---------- prompts ----------

export interface PromptRow { id: string; text: string; grp: string | null; created_at: string; answers: number }

export function listPrompts(siteId: string): PromptRow[] {
  ensureSchema();
  return db().prepare(`select p.*, (select count(*) from visibility_answers a where a.prompt_id = p.id) answers
    from visibility_prompts p where p.site_id = ? order by coalesce(p.grp, 'zzz'), p.text`).all(siteId) as PromptRow[];
}

export function getPrompt(id: string): (PromptRow & { site_id: string }) | null {
  ensureSchema();
  return (db().prepare('select p.*, 0 answers from visibility_prompts p where id = ?').get(id) as (PromptRow & { site_id: string }) | undefined) ?? null;
}

const cleanPrompt = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 500);

/** Insert prompts that do not exist yet (case-insensitive). Returns the id for every text. */
export function upsertPrompts(siteId: string, items: { text: string; grp?: string | null }[]): Map<string, string> {
  ensureSchema();
  const d = db();
  const find = d.prepare('select id from visibility_prompts where site_id = ? and text = ?');
  const ins = d.prepare('insert into visibility_prompts (id, site_id, text, grp, created_at) values (?, ?, ?, ?, ?)');
  const out = new Map<string, string>();
  d.transaction(() => {
    for (const it of items) {
      const text = cleanPrompt(it.text);
      if (!text) continue;
      const hit = find.get(siteId, text) as { id: string } | undefined;
      if (hit) { out.set(text.toLowerCase(), hit.id); continue; }
      const id = newId();
      ins.run(id, siteId, text, it.grp?.trim() || null, now());
      out.set(text.toLowerCase(), id);
    }
  })();
  return out;
}

export function updatePrompt(id: string, text: string, grp: string | null): string | null {
  ensureSchema();
  const t = cleanPrompt(text);
  if (!t) return 'Enter the prompt text.';
  try {
    db().prepare('update visibility_prompts set text = ?, grp = ? where id = ?').run(t, grp?.trim() || null, id);
  } catch {
    return 'That prompt already exists.';
  }
  return null;
}

export function deletePrompt(id: string) {
  ensureSchema();
  const d = db();
  d.transaction(() => {
    d.prepare('delete from visibility_answers where prompt_id = ?').run(id);
    d.prepare('delete from visibility_losses where prompt_id = ?').run(id);
    d.prepare('delete from visibility_prompts where id = ?').run(id);
  })();
}

export function promptSuggestions(site: Site): Suggestion[] {
  const s = getSettings(site);
  const inputs = siteInputs(site.id);
  const qmap = new Map<string, number>();
  for (const q of inputs.gscQueries?.pageQueries ?? []) qmap.set(q.query, (qmap.get(q.query) ?? 0) + q.impressions);
  const titles = (inputs.crawl?.pages ?? []).map((p) => p.title).filter((t): t is string => Boolean(t));
  if (!titles.length) for (const r of listUrls(site.id, { limit: 2000, offset: 0, sort: 'clicks' }).rows) if (r.title) titles.push(r.title);
  return suggestPrompts({
    brand: s.name,
    competitors: s.competitors.map((c) => c.name),
    queries: [...qmap.entries()].map(([query, impressions]) => ({ query, impressions })),
    titles,
    existing: listPrompts(site.id).map((p) => p.text),
  });
}

// ---------- answers ----------

interface AnswerDb {
  id: string; site_id: string; prompt_id: string; engine: Engine; run_date: string; run_index: number; answer: string;
  provided_urls: string; source: string; model: string | null; mentioned: number; position: Position; first_index: number | null;
  brand_cited: number; competitors: string; cited: string; sentiment: Sentiment | null; sentiment_conf: number | null; created_at: string;
}

export interface AnswerRow {
  id: string; promptId: string; prompt: string; engine: Engine; runDate: string; runIndex: number; answer: string; source: string; model: string | null;
  mentioned: boolean; position: Position; brandCited: boolean; competitors: string[]; cited: CitedUrl[]; sentiment: Sentiment | null; sentimentConf: number | null;
}

const toRow = (r: AnswerDb & { prompt: string }): AnswerRow => ({
  id: r.id, promptId: r.prompt_id, prompt: r.prompt, engine: r.engine, runDate: r.run_date, runIndex: r.run_index, answer: r.answer, source: r.source, model: r.model,
  mentioned: Boolean(r.mentioned), position: r.position, brandCited: Boolean(r.brand_cited), competitors: J(r.competitors, []), cited: J(r.cited, []),
  sentiment: r.sentiment, sentimentConf: r.sentiment_conf,
});

/** Store captured answers. Exact duplicates (same prompt, engine, date and text) are skipped. */
export function importAnswers(site: Site, rows: ImportedAnswer[], source: 'upload' | 'sample' | 'live' | 'manual', model: string | null = null): { added: number; duplicates: number; prompts: number } {
  ensureSchema();
  const cfg = getSettings(site);
  const ids = upsertPrompts(site.id, rows.map((r) => ({ text: r.prompt, grp: null })));
  const d = db();
  const dup = d.prepare('select 1 from visibility_answers where site_id = ? and prompt_id = ? and engine = ? and run_date = ? and answer = ? limit 1');
  const maxRun = d.prepare('select coalesce(max(run_index), 0) n from visibility_answers where site_id = ? and prompt_id = ? and engine = ? and run_date = ?');
  const ins = d.prepare(`insert into visibility_answers (id, site_id, prompt_id, engine, run_date, run_index, answer, provided_urls, source, model, mentioned, position, first_index, brand_cited, competitors, cited, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let added = 0;
  let duplicates = 0;
  d.transaction(() => {
    for (const r of rows) {
      const pid = ids.get(cleanPrompt(r.prompt).toLowerCase());
      if (!pid) continue;
      if (dup.get(site.id, pid, r.engine, r.runDate, r.answer)) { duplicates++; continue; }
      const runIndex = r.runIndex ?? (maxRun.get(site.id, pid, r.engine, r.runDate) as { n: number }).n + 1;
      const p = analyseAnswer(r.answer, r.citedUrls, cfg);
      ins.run(newId(), site.id, pid, r.engine, r.runDate, runIndex, r.answer, JSON.stringify(r.citedUrls), source, model, p.mentioned ? 1 : 0, p.position, p.firstIndex, p.brandCited ? 1 : 0, JSON.stringify(p.competitors), JSON.stringify(p.cited), now());
      added++;
    }
  })();
  return { added, duplicates, prompts: new Set(ids.values()).size };
}

export function importAnswersCsv(site: Site, text: string, source: 'upload' | 'sample' = 'upload') {
  const parsed = parseAnswersCsv(text, now().slice(0, 10));
  const res = importAnswers(site, parsed.rows, source);
  return { ...res, notes: parsed.notes };
}

/** Re-run the code parse over every stored answer, e.g. after the brand or competitors change. */
export function reparseAll(site: Site) {
  ensureSchema();
  const cfg = getSettings(site);
  const d = db();
  const rows = d.prepare('select id, answer, provided_urls from visibility_answers where site_id = ?').all(site.id) as { id: string; answer: string; provided_urls: string }[];
  const up = d.prepare('update visibility_answers set mentioned = ?, position = ?, first_index = ?, brand_cited = ?, competitors = ?, cited = ? where id = ?');
  d.transaction(() => {
    for (const r of rows) {
      const p = analyseAnswer(r.answer, J(r.provided_urls, []), cfg);
      up.run(p.mentioned ? 1 : 0, p.position, p.firstIndex, p.brandCited ? 1 : 0, JSON.stringify(p.competitors), JSON.stringify(p.cited), r.id);
    }
  })();
}

export function clearAnswers(siteId: string) {
  ensureSchema();
  const d = db();
  d.transaction(() => {
    d.prepare('delete from visibility_answers where site_id = ?').run(siteId);
    d.prepare("delete from visibility_losses where site_id = ? and status != 'done'").run(siteId);
  })();
}

export function answerFacts(siteId: string): AnswerFacts[] {
  ensureSchema();
  const rows = db().prepare(`select a.prompt_id, p.text prompt, a.engine, a.run_date, a.mentioned, a.brand_cited, a.competitors, a.cited
    from visibility_answers a join visibility_prompts p on p.id = a.prompt_id where a.site_id = ?`).all(siteId) as { prompt_id: string; prompt: string; engine: Engine; run_date: string; mentioned: number; brand_cited: number; competitors: string; cited: string }[];
  return rows.map((r) => ({
    promptId: r.prompt_id, prompt: r.prompt, engine: r.engine, runDate: r.run_date, mentioned: Boolean(r.mentioned), brandCited: Boolean(r.brand_cited),
    competitors: J<string[]>(r.competitors, []), sourceTypes: J<CitedUrl[]>(r.cited, []).map((c) => c.type),
  }));
}

export interface AnswerFilter { engine?: string; date?: string; week?: string; mentioned?: string; prompt?: string }

export function listAnswers(siteId: string, f: AnswerFilter, limit: number, offset: number): { rows: AnswerRow[]; total: number } {
  ensureSchema();
  const where = ['a.site_id = ?'];
  const args: unknown[] = [siteId];
  if (f.engine) { where.push('a.engine = ?'); args.push(f.engine); }
  if (f.date) { where.push('a.run_date = ?'); args.push(f.date); }
  if (f.week && /^\d{4}-\d{2}-\d{2}$/.test(f.week)) { where.push('a.run_date between ? and ?'); args.push(f.week, addDays(f.week, 6)); }
  if (f.mentioned === 'yes') where.push('a.mentioned = 1');
  if (f.mentioned === 'no') where.push('a.mentioned = 0');
  if (f.prompt) { where.push('a.prompt_id = ?'); args.push(f.prompt); }
  const w = where.join(' and ');
  const total = (db().prepare(`select count(*) n from visibility_answers a where ${w}`).get(...args) as { n: number }).n;
  const rows = db().prepare(`select a.*, p.text prompt from visibility_answers a join visibility_prompts p on p.id = a.prompt_id where ${w}
    order by a.run_date desc, p.text, a.engine, a.run_index limit ? offset ?`).all(...args, limit, offset) as (AnswerDb & { prompt: string })[];
  return { rows: rows.map(toRow), total };
}

// ---------- quick capture ----------

/** Today in the UK, as YYYY-MM-DD (answers are dated by the founder's calendar, not UTC). */
export const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** For each prompt, the engines already captured in the week of `date`. */
export function capturedThisWeek(siteId: string, date: string): Map<string, Set<Engine>> {
  ensureSchema();
  const from = weekly([{ promptId: '', prompt: '', engine: 'other', runDate: date, mentioned: false, brandCited: false, competitors: [], sourceTypes: [] }])[0].runDate;
  const rows = db().prepare('select distinct prompt_id, engine from visibility_answers where site_id = ? and run_date between ? and ?').all(siteId, from, addDays(from, 6)) as { prompt_id: string; engine: Engine }[];
  const out = new Map<string, Set<Engine>>();
  for (const r of rows) { const s = out.get(r.prompt_id) ?? new Set<Engine>(); s.add(r.engine); out.set(r.prompt_id, s); }
  return out;
}

export interface CaptureInput { engine: Engine; answer: string; urls: string }

/** Store answers pasted by hand for one prompt. Returns the prompt id and what was stored. */
export function captureAnswers(site: Site, promptText: string, date: string, items: CaptureInput[]) {
  const rows: ImportedAnswer[] = items.filter((i) => i.answer.trim()).map((i) => ({
    prompt: promptText, engine: i.engine, answer: i.answer.replace(/\r\n/g, '\n').trim().slice(0, 40_000), citedUrls: i.urls.trim() ? [i.urls] : [], runDate: date, runIndex: null,
  }));
  const res = importAnswers(site, rows, 'manual');
  const promptId = upsertPrompts(site.id, [{ text: promptText }]).get(cleanPrompt(promptText).toLowerCase()) ?? null;
  return { ...res, promptId };
}

// ---------- prompt detail ----------

export interface PromptDetail {
  prompt: PromptRow & { site_id: string };
  answers: (AnswerRow & { spans: Span[] })[];
  loss: LossRow | null;
  byDate: { date: string; visibility: number | null }[];
}

export function promptDetail(site: Site, promptId: string): PromptDetail | null {
  ensureSchema();
  const prompt = getPrompt(promptId);
  if (!prompt || prompt.site_id !== site.id) return null;
  const cfg = getSettings(site);
  const rows = db().prepare(`select a.*, p.text prompt from visibility_answers a join visibility_prompts p on p.id = a.prompt_id
    where a.prompt_id = ? order by a.run_date desc, a.engine, a.run_index`).all(promptId) as (AnswerDb & { prompt: string })[];
  const answers = rows.map((r) => ({ ...toRow(r), spans: highlightSpans(r.answer, cfg) }));
  const facts = weekly(answerFacts(site.id).filter((f) => f.promptId === promptId));
  const byDate = runDates(facts).map((date) => ({ date, visibility: rates(facts.filter((f) => f.runDate === date), cfg.name, []).visibility }));
  const loss = lossRows(site).find((l) => l.promptId === promptId) ?? null;
  return { prompt: { ...prompt, answers: rows.length }, answers, loss, byDate };
}

// ---------- loss register ----------

export interface LossRow {
  id: string | null; promptId: string; prompt: string; runDate: string; engines: Engine[]; winner: string | null;
  reason: LossReason | null; confidence: number | null; router: Router | null; fix: string | null; owner: Owner | null;
  status: LossStatus; doneAt: string | null; stillLost: boolean; after: { date: string; visibility: number } | null; model: string | null;
}

interface LossDb {
  id: string; site_id: string; prompt_id: string; run_date: string; engines: string; winner: string | null; reason: LossReason | null; confidence: number | null;
  router: Router | null; fix: string | null; owner: Owner | null; status: LossStatus; done_at: string | null; evidence_hash: string | null; model: string | null;
}

/** Lost prompts at the latest run date, joined with their stored explanation, plus done fixes kept for the outcome loop. */
export function lossRows(site: Site, facts = answerFacts(site.id)): LossRow[] {
  ensureSchema();
  const stored = db().prepare('select * from visibility_losses where site_id = ?').all(site.id) as LossDb[];
  const byPrompt = new Map(stored.map((s) => [s.prompt_id, s]));
  const pv = periodView(facts);
  const live = lostPrompts(pv.facts, pv.reporting);
  const out: LossRow[] = live.map((l) => {
    const s = byPrompt.get(l.promptId);
    return {
      id: s?.id ?? null, promptId: l.promptId, prompt: l.prompt, runDate: l.runDate, engines: l.lostOn, winner: l.winner,
      reason: s?.reason ?? null, confidence: s?.confidence ?? null, router: s?.router ?? null, fix: s?.fix ?? null, owner: s?.owner ?? null,
      status: s?.status ?? 'open', doneAt: s?.done_at ?? null, stillLost: true,
      after: s?.done_at ? visibilityAfter(facts, l.promptId, s.done_at) : null, model: s?.model ?? null,
    };
  });
  const prompts = new Map(facts.map((f) => [f.promptId, f.prompt]));
  for (const s of stored) {
    if (live.some((l) => l.promptId === s.prompt_id) || s.status !== 'done') continue;
    out.push({
      id: s.id, promptId: s.prompt_id, prompt: prompts.get(s.prompt_id) ?? '(deleted prompt)', runDate: s.run_date, engines: J(s.engines, []), winner: s.winner,
      reason: s.reason, confidence: s.confidence, router: s.router, fix: s.fix, owner: s.owner, status: s.status, doneAt: s.done_at, stillLost: false,
      after: s.done_at ? visibilityAfter(facts, s.prompt_id, s.done_at) : null, model: s.model,
    });
  }
  return out;
}

export function getLoss(id: string): LossDb | null {
  ensureSchema();
  return (db().prepare('select * from visibility_losses where id = ?').get(id) as LossDb | undefined) ?? null;
}

export function setLossStatus(id: string, status: LossStatus) {
  ensureSchema();
  const cur = getLoss(id);
  if (!cur) return;
  const doneAt = status === 'done' ? cur.done_at ?? now() : null;
  db().prepare('update visibility_losses set status = ?, done_at = ?, updated_at = ? where id = ?').run(status, doneAt, now(), id);
}

// ---------- dashboard ----------

export function dashboard(site: Site) {
  const cfg = getSettings(site);
  const facts = answerFacts(site.id);
  const pv = periodView(facts);
  const latestDate = pv.reporting;
  const prevDate = pv.previous;
  const comps = cfg.competitors.map((c) => c.name);
  const inWeek = (p: string | null) => pv.facts.filter((f) => f.runDate === p);
  const latest = rates(inWeek(latestDate), cfg.name, comps);
  const previous = prevDate ? rates(inWeek(prevDate), cfg.name, comps) : null;
  const sentiment = latestDate ? db().prepare(`select sentiment, count(*) n from visibility_answers where site_id = ? and run_date between ? and ? and mentioned = 1 group by sentiment`).all(site.id, latestDate, addDays(latestDate, 6)) as { sentiment: Sentiment | null; n: number }[] : [];
  const sourceMix: Partial<Record<SourceType, number>> = {};
  for (const f of inWeek(latestDate)) for (const t of f.sourceTypes) sourceMix[t] = (sourceMix[t] ?? 0) + 1;
  const prompts = listPrompts(site.id);
  return {
    cfg, facts, dates: pv.periods, latestDate, prevDate, latest, previous, inProgress: pv.inProgress,
    trend: trend(pv.facts, cfg.name, comps),
    engines: byEngine(pv.facts, cfg.name, comps, latestDate),
    alert: periodAlert(pv.facts, prevDate, latestDate),
    losses: lossRows(site, facts),
    sentiment, sourceMix,
    promptCount: prompts.length,
    /** Without a crawl or Search Console pages, "no page covers this" cannot be told apart from "we do not know". */
    pagesKnown: listUrls(site.id, { limit: 1, offset: 0, sort: 'path' }).rows.length > 0,
    /** Tracked prompts with no answer at all yet, so the founder knows what is left to capture. */
    uncaptured: prompts.filter((p) => p.answers === 0).length,
  };
}

// ---------- jobs ----------

export const ANALYSIS_JOB = 'visibility';
export const RUN_JOB = 'visibility-run';

export function runningVisibilityJob(siteId: string) {
  return runningJobOf(siteId, ANALYSIS_JOB) ?? runningJobOf(siteId, RUN_JOB);
}

/** The Jev work waiting: mentions without sentiment (newest first) and lost prompts whose evidence changed. */
function planAnalysis(site: Site) {
  const cfg = getSettings(site);
  const d = db();
  const todo = d.prepare(`select a.id, a.answer, a.first_index, p.text prompt from visibility_answers a join visibility_prompts p on p.id = a.prompt_id
    where a.site_id = ? and a.mentioned = 1 and a.sentiment is null order by a.run_date desc, a.created_at desc`).all(site.id) as { id: string; answer: string; first_index: number | null; prompt: string }[];
  const pv = periodView(answerFacts(site.id));
  const overall = rates(pv.facts.filter((f) => f.runDate === pv.reporting), cfg.name, []).visibility;
  const lost = lostPrompts(pv.facts, pv.reporting);
  const pages = listUrls(site.id, { limit: 20000, offset: 0, sort: 'path' }).rows;
  const pageByPath = new Map(pages.map((p) => [p.path, p]));
  const brandWords = [cfg.name, ...cfg.aliases];
  const stored = new Map((d.prepare('select * from visibility_losses where site_id = ?').all(site.id) as LossDb[]).map((s) => [s.prompt_id, s]));
  const lossJobs = lost.map((l) => {
    const coverage = coverageFor(l.prompt, pages, brandWords);
    const page = coverage.path ? pageByPath.get(coverage.path) : undefined;
    const pageStatus: PageStatus = !page ? 'unknown' : page.indexable === 0 || (page.status != null && page.status >= 400) ? 'not_indexable' : page.indexable === 1 || page.status === 200 ? 'indexable' : 'unknown';
    const state = lossState({ brand: cfg.name, domain: cfg.domain, lost: l, coverage, pageStatus, overallVisibility: overall, pagesKnown: pages.length > 0 });
    const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
    return { l, coverage, state, hash };
  }).filter((j) => { const s = stored.get(j.l.promptId); return !(s && s.reason && s.evidence_hash === j.hash); });
  return { cfg, todo, lossJobs, lost, stored };
}

/** How many Jev decisions the next analysis would make. */
export function analysisWorkload(site: Site): { mentions: number; losses: number; total: number } {
  ensureSchema();
  const p = planAnalysis(site);
  return { mentions: p.todo.length, losses: p.lossJobs.length, total: p.todo.length + p.lossJobs.length };
}

/**
 * Jev pass: sentiment on mentioning answers not scored yet, and a reason for every lost prompt whose evidence
 * changed. With `limit`, lost prompts are explained first and the rest of the budget goes to the newest mentions.
 */
async function analyse(ctx: JobContext, site: Site, limit?: number): Promise<string> {
  const d = db();
  const plan = planAnalysis(site);
  const { cfg, lossJobs: allLoss, lost, stored } = plan;
  const lossJobs = limit ? allLoss.slice(0, limit) : allLoss;
  const todo = limit ? plan.todo.slice(0, Math.max(0, limit - lossJobs.length)) : plan.todo;
  const total = todo.length + lossJobs.length;
  let done = 0;
  ctx.progress(0, total, total ? `Scoring ${todo.length} mentions and ${lossJobs.length} lost prompts` : 'Nothing new to score');
  const upSent = d.prepare('update visibility_answers set sentiment = ?, sentiment_conf = ? where id = ?');
  await mapLimit(todo, 8, async (a) => {
    const res = await ctx.decide(`answer:${a.id}`, CRITERIA_VERSION, { state: sentimentState(cfg.name, a.prompt, mentionExcerpt(a.answer, a.first_index)), questions: sentimentQuestions() });
    const s = readSentiment(res.answers.sentiment);
    if (s) upSent.run(s.sentiment, Math.round(s.confidence * 1000) / 1000, a.id);
  }, () => ctx.progress(++done, total, 'Scoring sentiment'));

  const upsert = d.prepare(`insert into visibility_losses (id, site_id, prompt_id, run_date, engines, winner, reason, probabilities, confidence, router, fix, owner, evidence, evidence_hash, model, status, created_at, updated_at)
    values (@id, @site_id, @prompt_id, @run_date, @engines, @winner, @reason, @probabilities, @confidence, @router, @fix, @owner, @evidence, @evidence_hash, @model, 'open', @t, @t)
    on conflict(site_id, prompt_id) do update set run_date = excluded.run_date, engines = excluded.engines, winner = excluded.winner, reason = excluded.reason,
      probabilities = excluded.probabilities, confidence = excluded.confidence, router = excluded.router, fix = excluded.fix, owner = excluded.owner,
      evidence = excluded.evidence, evidence_hash = excluded.evidence_hash, model = excluded.model, updated_at = excluded.updated_at`);
  let explained = 0;
  await mapLimit(lossJobs, 8, async (j) => {
    const res = await ctx.decide(`prompt:${j.l.promptId}`, CRITERIA_VERSION, { state: j.state, questions: lossQuestions() });
    const r = readLoss(res.answers.loss_reason);
    if (!r) return;
    const { fix, owner } = fixFor(r.reason, { prompt: j.l.prompt, winner: j.l.winner, pagePath: j.coverage.path });
    const conf = Math.round(r.confidence * 1000) / 1000;
    upsert.run({
      id: newId(), site_id: site.id, prompt_id: j.l.promptId, run_date: j.l.runDate, engines: JSON.stringify(j.l.lostOn), winner: j.l.winner,
      reason: r.reason, probabilities: JSON.stringify(r.probabilities), confidence: conf, router: routerFor(conf), fix, owner,
      evidence: JSON.stringify(j.state), evidence_hash: j.hash, model: res.model, t: now(),
    });
    explained++;
  }, () => ctx.progress(++done, total, 'Explaining lost prompts'));

  // Prompts won back drop off the register unless their fix was marked done (kept for the outcome loop).
  const lostIds = new Set(lost.map((l) => l.promptId));
  for (const [pid, s] of stored) if (!lostIds.has(pid) && s.status !== 'done') d.prepare('delete from visibility_losses where id = ?').run(s.id);

  const left = plan.todo.length - todo.length + allLoss.length - lossJobs.length;
  return `Scored sentiment on ${todo.length} mention${todo.length === 1 ? '' : 's'} and explained ${explained} lost prompt${explained === 1 ? '' : 's'}${left ? `; ${left} left waiting` : ''}`;
}

export function startAnalysis(site: Site, opts: { limit?: number } = {}) {
  const running = runningVisibilityJob(site.id);
  if (running) return running;
  return startModuleJob(site.id, ANALYSIS_JOB, getProvider(mockVisibilityAnswer), (ctx) => analyse(ctx, site, opts.limit), opts.limit ? { limit: opts.limit } : {});
}

/**
 * Start the Jev pass after new answers arrive, but only when it is small. A big backlog (e.g. a 700-answer
 * import) waits for the founder to choose, so a live key never silently spends hundreds of decisions.
 */
export function autoAnalyse(site: Site): boolean {
  if (runningVisibilityJob(site.id)) return false;
  const w = analysisWorkload(site).total;
  if (!shouldAutoAnalyse(w)) return false;
  startAnalysis(site);
  return true;
}

// ---------- live engines ----------

export interface EngineStatus { engine: LiveEngine; connected: boolean; envKey: string; model: string; provider: string }

/** Which engines have a key. Only presence is read; keys never leave the server. */
export function engineStatus(): EngineStatus[] {
  return LIVE_ENGINES.map((e) => {
    const r = RUNNERS[e];
    return { engine: e, connected: Boolean(process.env[r.envKey]), envKey: r.envKey, model: process.env[r.modelEnv] || r.defaultModel, provider: r.provider };
  });
}

export const MAX_LIVE_PROMPTS = 100;

/** Send every prompt to every connected engine 3 times, store the answers dated today, then run the Jev pass. */
export function startLiveRun(site: Site) {
  const running = runningVisibilityJob(site.id);
  if (running) return running;
  const engines = engineStatus().filter((e) => e.connected);
  const prompts = listPrompts(site.id).slice(0, MAX_LIVE_PROMPTS);
  return startModuleJob(site.id, RUN_JOB, getProvider(mockVisibilityAnswer), async (ctx) => {
    if (!engines.length) throw new Error('No engine API key is set.');
    const today = now().slice(0, 10);
    const calls = prompts.flatMap((p) => engines.flatMap((e) => Array.from({ length: RUNS_PER_PROMPT }, (_x, i) => ({ p, e, i }))));
    const errors: string[] = [];
    let ok = 0;
    let done = 0;
    await mapLimit(calls, 4, async ({ p, e }) => {
      try {
        const res = await runEngine(e.engine, p.text, { apiKey: process.env[e.envKey] ?? '', model: e.model });
        if (!res.text.trim()) throw new Error(`${e.engine}: empty answer`);
        importAnswers(site, [{ prompt: p.text, engine: res.engine, answer: res.text, citedUrls: res.citedUrls, runDate: today, runIndex: null }], 'live', res.model);
        ok++;
      } catch (err) {
        if (errors.length < 5) errors.push(err instanceof Error ? err.message : String(err));
      }
    }, () => ctx.progress(++done, calls.length, `Asking ${engines.map((e) => RUNNERS[e.engine].provider.split(' ')[0]).join(', ')}`));
    if (!ok) throw new Error(`Every engine call failed. ${errors.join(' | ')}`.slice(0, 600));
    const summary = await analyse(ctx, site, AUTO_ANALYSE_LIMIT);
    return `Captured ${ok} of ${calls.length} answers${errors.length ? ` (${calls.length - ok} failed: ${errors[0].slice(0, 120)})` : ''}. ${summary}`;
  }, { engines: engines.map((e) => e.engine), prompts: prompts.length });
}

// ---------- sample data ----------

export const SAMPLE_CONFIG: BrandConfig = {
  name: 'Sample Outdoors',
  aliases: ['SampleOutdoors'],
  domain: 'sample-outdoors.example',
  competitors: [
    { name: 'Ridgeline Outfitters', domain: 'ridgeline-outfitters.example' },
    { name: 'Fellwalker Supply', domain: 'fellwalker-supply.example' },
    { name: 'Cairn & Crag', domain: 'cairnandcrag.example' },
    { name: 'Northpeak Gear Co', domain: 'northpeak-gear.example' },
  ],
};

const SAMPLE_GROUPS: Record<string, string> = {
  'best hiking boots for beginners': 'footwear', 'how to choose a sleeping bag for uk camping': 'camping', 'best waterproof jackets uk': 'clothing',
  'via ferrata kit list for the dolomites': 'routes', 'where to buy walking poles in the uk': 'kit', 'best down jacket for winter hillwalking': 'clothing',
  'sample outdoors vs ridgeline outfitters': 'brand', 'best wild camping gear for scotland': 'camping', 'bothy etiquette and what to bring': 'routes',
  'best head torch for trail running': 'kit',
};

/** Sample Outdoors brand setup (only when none is saved) plus 60 captured answers across 3 engines and 2 run dates. */
export function loadSampleData(site: Site) {
  if (!getSettings(site).saved) saveSettings(site, SAMPLE_CONFIG);
  const text = readFileSync(path.join(process.cwd(), 'samples', 'visibility-answers.csv'), 'utf8');
  const res = importAnswersCsv(site, text, 'sample');
  const d = db();
  const up = d.prepare('update visibility_prompts set grp = ? where site_id = ? and text = ? and grp is null');
  for (const [t, g] of Object.entries(SAMPLE_GROUPS)) up.run(g, site.id, t);
  return res;
}

// ---------- export ----------

export function lossesCsv(site: Site): string {
  const rows = lossRows(site);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['prompt', 'engines', 'winning_competitor', 'reason', 'fix', 'owner', 'confidence', 'status', 'done_at', 'visibility_30_days_after', 'measured_on'];
  const body = rows.map((r) => [r.prompt, r.engines.join(' '), r.winner, r.reason, r.fix, r.owner, r.confidence, r.status, r.doneAt?.slice(0, 10), r.after ? Math.round(r.after.visibility * 100) + '%' : '', r.after?.date].map(esc).join(','));
  return [head.join(','), ...body].join('\n') + '\n';
}
