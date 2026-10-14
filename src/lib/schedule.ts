import 'server-only';
// Relative imports only: tests load this file without the "@/" alias.
import { db, newId, now as nowIso } from './db';
import { accountStatus } from './plans';

/**
 * Weekly automatic re-scoring (PRD section 5: verdicts "refreshed weekly"; milestone A6).
 *
 * A tick runs every 15 minutes in the Node.js server process (started from src/instrumentation.ts).
 * Each tick finds sites whose weekly slot has passed and starts a Module 1 scoring job for them,
 * recording every start or skip in schedule_runs. Due times are wall-clock times in Europe/London.
 */

export const SCHEDULE_TZ = 'Europe/London';
export const TICK_MS = 15 * 60_000;
/** A site is never re-scored by the scheduler twice inside this gap. */
export const MIN_GAP_MS = 6 * 86_400_000;
export const DEFAULT_SCHEDULE = { mode: 'weekly' as const, dow: 1, hour: 6 };
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export type ScheduleMode = 'off' | 'weekly';
export interface ScheduleSetting { mode: ScheduleMode; dow: number; hour: number; isDefault: boolean }

// ---------- pure time maths (DST-safe) ----------

interface WallClock { y: number; m: number; d: number; h: number; mi: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function wallClock(ms: number, tz: string): WallClock {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) };
}

/** Offset of the zone from UTC at an instant, in ms (Europe/London: 0 in winter, +1h in summer). */
function offsetAt(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - Math.floor(ms / 60_000) * 60_000;
}

/**
 * The UTC instant of a wall-clock time in a zone. When the clocks go back and the time happens twice,
 * the first occurrence wins. When the clocks go forward and the time does not exist, it moves forward
 * by the gap (01:30 on the spring-forward Sunday in London becomes 02:30 BST).
 */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz = SCHEDULE_TZ): number {
  const local = Date.UTC(y, m - 1, d, h, mi);
  const offsets = [...new Set([offsetAt(local - 86_400_000, tz), offsetAt(local, tz), offsetAt(local + 86_400_000, tz)])];
  const valid = offsets
    .map((o) => local - o)
    .filter((t) => { const w = wallClock(t, tz); return w.y === y && w.m === m && w.d === d && w.h === h && w.mi === mi; })
    .sort((a, b) => a - b);
  if (valid.length) return valid[0];
  // In the gap: use the offset in force before the change, which lands just after it.
  return local - offsetAt(local - 86_400_000, tz);
}

/** Calendar date k days from a local date, as y/m/d plus its weekday (0 = Sunday). */
function addDays(y: number, m: number, d: number, k: number) {
  const t = new Date(Date.UTC(y, m - 1, d + k));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
}

/** The most recent weekly slot (day of week, hour, in the zone) at or before `nowMs`. */
export function previousSlot(nowMs: number, dow: number, hour: number, tz = SCHEDULE_TZ): number {
  const w = wallClock(nowMs, tz);
  for (let k = 0; k <= 8; k++) {
    const day = addDays(w.y, w.m, w.d, -k);
    if (day.dow !== dow) continue;
    const t = zonedToUtc(day.y, day.m, day.d, hour, 0, tz);
    if (t <= nowMs) return t;
  }
  throw new Error('No previous slot found');
}

/** The next weekly slot strictly after `nowMs`. */
export function nextSlot(nowMs: number, dow: number, hour: number, tz = SCHEDULE_TZ): number {
  const w = wallClock(nowMs, tz);
  for (let k = 0; k <= 8; k++) {
    const day = addDays(w.y, w.m, w.d, k);
    if (day.dow !== dow) continue;
    const t = zonedToUtc(day.y, day.m, day.d, hour, 0, tz);
    if (t > nowMs) return t;
  }
  throw new Error('No next slot found');
}

// ---------- pure due decision ----------

export interface SiteFacts {
  setting: Pick<ScheduleSetting, 'mode' | 'dow' | 'hour'>;
  /** When the site's first scoring run finished. No automatic runs before there is one. */
  firstRunAt: string | null;
  /** Start of the last run the scheduler actually started. */
  lastScheduledStartAt: string | null;
  /** Due time of the latest schedule_runs row (started or skipped), so a slot is handled once. */
  lastHandledDueAt: string | null;
  jobRunning: boolean;
  accountActive: boolean;
  hasData: boolean;
}

export type DueDecision =
  | { kind: 'idle'; why: string; dueAt: number | null }
  | { kind: 'wait'; why: string; dueAt: number }
  | { kind: 'skip'; reason: string; dueAt: number }
  | { kind: 'run'; dueAt: number };

export const SKIP_REASONS = {
  inactive: 'Account inactive: the trial has ended or the subscription is not active.',
  noData: 'No Search Console or crawl data to score.',
} as const;

/** Whether a site is due now, and what to do about it. Pure, so it is tested directly. */
export function decideDue(f: SiteFacts, nowMs: number): DueDecision {
  if (f.setting.mode === 'off') return { kind: 'idle', why: 'Automatic re-scoring is off.', dueAt: null };
  if (!f.firstRunAt) return { kind: 'idle', why: 'Starts after the first scoring run.', dueAt: null };
  const dueAt = previousSlot(nowMs, f.setting.dow, f.setting.hour);
  if (dueAt <= Date.parse(f.firstRunAt)) return { kind: 'idle', why: 'The first scoring run is newer than the last slot.', dueAt: null };
  if (f.lastHandledDueAt && Date.parse(f.lastHandledDueAt) >= dueAt) return { kind: 'idle', why: 'This week’s slot has been handled.', dueAt: null };
  if (f.lastScheduledStartAt && nowMs - Date.parse(f.lastScheduledStartAt) < MIN_GAP_MS) return { kind: 'idle', why: 'Re-scored by the schedule in the last 6 days.', dueAt: null };
  if (f.jobRunning) return { kind: 'wait', why: 'Another job is running; trying again at the next tick.', dueAt };
  if (!f.accountActive) return { kind: 'skip', reason: SKIP_REASONS.inactive, dueAt };
  if (!f.hasData) return { kind: 'skip', reason: SKIP_REASONS.noData, dueAt };
  return { kind: 'run', dueAt };
}

// ---------- single-process lock ----------

const G = globalThis as unknown as { __rcTickLock?: boolean; __rcScheduler?: { interval: ReturnType<typeof setInterval>; first: ReturnType<typeof setTimeout> } ; __rcPreScoreHooks?: PreScoreHook[] };

/** Runs `fn` unless a tick is already running in this process; overlapping calls return { ran: false }. */
export async function withTickLock<T>(fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
  if (G.__rcTickLock) return { ran: false };
  G.__rcTickLock = true;
  try {
    return { ran: true, value: await fn() };
  } finally {
    G.__rcTickLock = false;
  }
}

// ---------- pre-score hooks ----------

/**
 * INTEGRATION HOOK. Runs before every scheduled or "Run now" scoring run, for example to pull fresh
 * Search Console and GA4 data. Wire Google sync from src/instrumentation.ts once `@/lib/google/sync` exists:
 *   registerPreScoreHook(async (siteId) => { const m = await import('@/lib/google/sync'); await m.syncGoogleForSite(siteId); });
 * A failing hook is recorded on the run and scoring still goes ahead on the data already uploaded.
 */
export type PreScoreHook = (siteId: string) => Promise<void> | void;
export function registerPreScoreHook(fn: PreScoreHook) {
  G.__rcPreScoreHooks ??= [];
  if (!G.__rcPreScoreHooks.includes(fn)) G.__rcPreScoreHooks.push(fn);
}
export function clearPreScoreHooks() {
  G.__rcPreScoreHooks = [];
}

// ---------- storage ----------

let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  db().exec(`
    create table if not exists schedule_settings (
      site_id text primary key references sites(id) on delete cascade,
      mode text not null,                -- off | weekly
      dow integer not null,              -- 0 Sunday .. 6 Saturday, Europe/London
      hour integer not null,             -- 0..23, Europe/London
      updated_at text not null
    );
    create table if not exists schedule_runs (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      trigger text not null,             -- schedule | manual
      due_at text not null,
      started_at text,
      job_id text,
      outcome text not null,             -- started | skipped | failed
      reason text,
      error text,
      created_at text not null
    );
    create index if not exists schedule_runs_site on schedule_runs(site_id, created_at);
  `);
  schemaReady = true;
}

export function getSchedule(siteId: string): ScheduleSetting {
  ensureSchema();
  const r = db().prepare('select mode, dow, hour from schedule_settings where site_id = ?').get(siteId) as { mode: ScheduleMode; dow: number; hour: number } | undefined;
  return r ? { ...r, isDefault: false } : { ...DEFAULT_SCHEDULE, isDefault: true };
}

export function scheduleInputError(input: { mode: string; dow: number; hour: number }): string | null {
  if (input.mode !== 'off' && input.mode !== 'weekly') return 'Choose off or weekly.';
  if (!Number.isInteger(input.dow) || input.dow < 0 || input.dow > 6) return 'Choose a day of the week.';
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) return 'Choose an hour between 00:00 and 23:00.';
  return null;
}

export function saveSchedule(siteId: string, input: { mode: ScheduleMode; dow: number; hour: number }) {
  ensureSchema();
  const err = scheduleInputError(input);
  if (err) throw new Error(err);
  db().prepare(`insert into schedule_settings (site_id, mode, dow, hour, updated_at) values (?, ?, ?, ?, ?)
    on conflict(site_id) do update set mode = excluded.mode, dow = excluded.dow, hour = excluded.hour, updated_at = excluded.updated_at`)
    .run(siteId, input.mode, input.dow, input.hour, nowIso());
}

export interface ScheduleRun {
  id: string; site_id: string; trigger: 'schedule' | 'manual'; due_at: string; started_at: string | null; job_id: string | null;
  outcome: 'started' | 'skipped' | 'failed'; reason: string | null; error: string | null; created_at: string;
  job_status: string | null; job_message: string | null; job_error: string | null; job_finished_at: string | null;
}

export function listScheduleRuns(siteId: string, limit = 12): ScheduleRun[] {
  ensureSchema();
  return db().prepare(`select r.*, j.status job_status, j.message job_message, j.error job_error, j.finished_at job_finished_at
    from schedule_runs r left join jobs j on j.id = r.job_id where r.site_id = ? order by r.created_at desc limit ?`).all(siteId, limit) as ScheduleRun[];
}

function recordRun(r: Omit<ScheduleRun, 'id' | 'created_at' | 'job_status' | 'job_message' | 'job_error' | 'job_finished_at'>) {
  db().prepare(`insert into schedule_runs (id, site_id, trigger, due_at, started_at, job_id, outcome, reason, error, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), r.site_id, r.trigger, r.due_at, r.started_at, r.job_id, r.outcome, r.reason, r.error, nowIso());
}

interface SiteRow { id: string; plan: string | null; trial_ends_at: string | null; subscription_status: string | null }

function factsFor(site: SiteRow, nowMs: number): { facts: SiteFacts; urlLimit: number } {
  const d = db();
  const setting = getSchedule(site.id);
  const firstRunAt = (d.prepare(`select min(finished_at) t from jobs where site_id = ? and type = 'verdicts' and status = 'done'`).get(site.id) as { t: string | null }).t;
  const lastStarted = (d.prepare(`select max(started_at) t from schedule_runs where site_id = ? and trigger = 'schedule' and outcome = 'started'`).get(site.id) as { t: string | null }).t;
  const lastHandled = (d.prepare(`select max(due_at) t from schedule_runs where site_id = ? and trigger = 'schedule'`).get(site.id) as { t: string | null }).t;
  const jobRunning = Boolean(d.prepare(`select 1 from jobs where site_id = ? and status = 'running' limit 1`).get(site.id));
  const hasData = Boolean(d.prepare(`select 1 from uploads where site_id = ? and kind in ('gsc_pages', 'gsc_queries', 'crawl') limit 1`).get(site.id));
  const status = site.plan && site.trial_ends_at
    ? accountStatus({ plan: site.plan, trial_ends_at: site.trial_ends_at, subscription_status: site.subscription_status }, nowMs)
    : null;
  return {
    facts: { setting, firstRunAt, lastScheduledStartAt: lastStarted, lastHandledDueAt: lastHandled, jobRunning, accountActive: Boolean(status?.active), hasData },
    urlLimit: status?.urlLimit ?? 0,
  };
}

function siteRow(siteId: string): SiteRow | null {
  return (db().prepare(`select s.id, a.plan, a.trial_ends_at, a.subscription_status from sites s left join accounts a on a.id = s.account_id where s.id = ?`).get(siteId) as SiteRow | undefined) ?? null;
}

export interface ScheduleDeps {
  /** Starts a Module 1 scoring job and returns its id. Defaults to startVerdictJob from ./jobs. */
  startJob?: (siteId: string, urlLimit: number) => Promise<string> | string;
  now?: () => number;
}

async function defaultStartJob(siteId: string, urlLimit: number): Promise<string> {
  // Loaded lazily so this module (and its tests) do not pull in the whole engine.
  const { startVerdictJob } = await import('./jobs');
  return startVerdictJob(siteId, urlLimit).id;
}

async function runHooks(siteId: string): Promise<string | null> {
  const errors: string[] = [];
  for (const hook of G.__rcPreScoreHooks ?? []) {
    try { await hook(siteId); } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return errors.length ? `Data sync before scoring failed: ${errors.join('; ')}` : null;
}

async function startFor(siteId: string, trigger: 'schedule' | 'manual', dueAt: number, urlLimit: number, deps: ScheduleDeps) {
  const hookError = await runHooks(siteId);
  if (db().prepare(`select 1 from jobs where site_id = ? and status = 'running' limit 1`).get(siteId)) {
    recordRun({ site_id: siteId, trigger, due_at: new Date(dueAt).toISOString(), started_at: null, job_id: null, outcome: 'skipped', reason: 'Another job started while data was syncing.', error: hookError });
    return { outcome: 'failed' as const, error: 'Another job started while data was syncing.' };
  }
  try {
    const jobId = await (deps.startJob ?? defaultStartJob)(siteId, urlLimit);
    recordRun({ site_id: siteId, trigger, due_at: new Date(dueAt).toISOString(), started_at: nowIso(), job_id: jobId, outcome: 'started', reason: null, error: hookError });
    return { outcome: 'started' as const, jobId };
  } catch (e) {
    const error = [hookError, e instanceof Error ? e.message : String(e)].filter(Boolean).join(' · ');
    recordRun({ site_id: siteId, trigger, due_at: new Date(dueAt).toISOString(), started_at: null, job_id: null, outcome: 'failed', reason: null, error });
    return { outcome: 'failed' as const, error };
  }
}

export interface TickResult { siteId: string; decision: DueDecision['kind']; detail: string }

/** One scheduler pass over every site. Never overlaps itself; returns null if another tick holds the lock. */
export async function tick(deps: ScheduleDeps = {}): Promise<TickResult[] | null> {
  ensureSchema();
  const res = await withTickLock(async () => {
    const out: TickResult[] = [];
    const sites = db().prepare(`select s.id, a.plan, a.trial_ends_at, a.subscription_status from sites s left join accounts a on a.id = s.account_id order by s.created_at`).all() as SiteRow[];
    for (const site of sites) {
      const nowMs = (deps.now ?? Date.now)();
      try {
        const { facts, urlLimit } = factsFor(site, nowMs);
        const dec = decideDue(facts, nowMs);
        if (dec.kind === 'skip') {
          recordRun({ site_id: site.id, trigger: 'schedule', due_at: new Date(dec.dueAt).toISOString(), started_at: null, job_id: null, outcome: 'skipped', reason: dec.reason, error: null });
          out.push({ siteId: site.id, decision: 'skip', detail: dec.reason });
        } else if (dec.kind === 'run') {
          const r = await startFor(site.id, 'schedule', dec.dueAt, urlLimit, deps);
          out.push({ siteId: site.id, decision: 'run', detail: r.outcome === 'started' ? `job ${r.jobId}` : r.error });
        } else {
          out.push({ siteId: site.id, decision: dec.kind, detail: dec.why });
        }
      } catch (e) {
        out.push({ siteId: site.id, decision: 'idle', detail: `error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    return out;
  });
  return res.ran ? res.value : null;
}

/** "Run now" from site settings: same checks and plan limit as the schedule, recorded as a manual run. */
export async function runScheduledNow(siteId: string, deps: ScheduleDeps = {}): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  ensureSchema();
  const site = siteRow(siteId);
  if (!site) return { ok: false, error: 'Site not found.' };
  const res = await withTickLock(async () => {
    const nowMs = (deps.now ?? Date.now)();
    const { facts, urlLimit } = factsFor(site, nowMs);
    if (facts.jobRunning) return { ok: false as const, error: 'A job is already running for this site.' };
    if (!facts.accountActive) return { ok: false as const, error: SKIP_REASONS.inactive };
    if (!facts.hasData) return { ok: false as const, error: SKIP_REASONS.noData };
    const r = await startFor(siteId, 'manual', nowMs, urlLimit, deps);
    return r.outcome === 'started' ? { ok: true as const, jobId: r.jobId } : { ok: false as const, error: r.error };
  });
  return res.ran ? res.value : { ok: false, error: 'The scheduler is busy. Try again in a minute.' };
}

/** What the settings page shows: the setting, when the next run is, and why not if there is none. */
export function scheduleSummary(siteId: string, nowMs = Date.now()) {
  ensureSchema();
  const site = siteRow(siteId);
  const setting = getSchedule(siteId);
  const runs = listScheduleRuns(siteId, 12);
  if (!site) return { setting, next: null, note: 'Site not found.', runs };
  const { facts } = factsFor(site, nowMs);
  if (setting.mode === 'off') return { setting, next: null, note: 'Automatic re-scoring is off.', runs };
  if (!facts.firstRunAt) return { setting, next: null, note: 'Starts after the first scoring run.', runs };
  const dec = decideDue(facts, nowMs);
  let next: number;
  if (dec.kind === 'run' || dec.kind === 'wait') next = nowMs; // picked up at the next tick
  else {
    next = nextSlot(nowMs, setting.dow, setting.hour);
    // The 6-day gap can push a run past a slot; find the first slot it allows.
    if (facts.lastScheduledStartAt) while (next - Date.parse(facts.lastScheduledStartAt) < MIN_GAP_MS) next = nextSlot(next, setting.dow, setting.hour);
  }
  const note = !facts.accountActive ? 'Runs are skipped while the account is inactive.' : dec.kind === 'run' || dec.kind === 'wait' ? 'Due now; starts within 15 minutes.' : null;
  return { setting, next: new Date(next).toISOString(), note, runs };
}

// ---------- process scheduler ----------

/** Start the 15-minute tick in this process. Idempotent across hot reloads. */
export function startScheduler(log: (msg: string) => void = (m) => console.log(m)) {
  if (G.__rcScheduler) return;
  const run = () => {
    tick().then((r) => {
      const acted = (r ?? []).filter((x) => x.decision === 'run' || x.decision === 'skip');
      if (acted.length) log(`[schedule] ${acted.map((x) => `${x.siteId}: ${x.decision} (${x.detail})`).join('; ')}`);
    }).catch((e) => log(`[schedule] tick failed: ${e instanceof Error ? e.message : String(e)}`));
  };
  const first = setTimeout(run, 20_000);
  const interval = setInterval(run, TICK_MS);
  first.unref?.();
  interval.unref?.();
  G.__rcScheduler = { interval, first };
  log('[schedule] weekly re-scoring scheduler started (every 15 minutes)');
}

export function stopScheduler() {
  if (!G.__rcScheduler) return;
  clearInterval(G.__rcScheduler.interval);
  clearTimeout(G.__rcScheduler.first);
  G.__rcScheduler = undefined;
}
