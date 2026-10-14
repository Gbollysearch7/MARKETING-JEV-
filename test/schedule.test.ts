import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rc-schedule-'));

const S = await import('../src/lib/schedule');
const { db } = await import('../src/lib/db');

const iso = (s: string) => Date.parse(s);
const at = (ms: number) => new Date(ms).toISOString();

describe('zonedToUtc (Europe/London)', () => {
  it('uses GMT in winter and BST in summer', () => {
    expect(at(S.zonedToUtc(2026, 1, 5, 6, 0))).toBe('2026-01-05T06:00:00.000Z');
    expect(at(S.zonedToUtc(2026, 7, 6, 6, 0))).toBe('2026-07-06T05:00:00.000Z');
  });
  it('moves a time that does not exist (clocks go forward) past the gap', () => {
    // 29 March 2026: 01:00 GMT becomes 02:00 BST, so 01:30 local never happens.
    expect(at(S.zonedToUtc(2026, 3, 29, 1, 30))).toBe('2026-03-29T01:30:00.000Z'); // 02:30 BST
  });
  it('takes the first of two identical times (clocks go back)', () => {
    // 25 October 2026: 01:00 to 01:59 happens twice, first in BST.
    expect(at(S.zonedToUtc(2026, 10, 25, 1, 30))).toBe('2026-10-25T00:30:00.000Z');
  });
});

describe('weekly slots', () => {
  const MON = 1;
  it('finds the previous and next Monday 06:00', () => {
    expect(at(S.previousSlot(iso('2026-01-07T12:00:00Z'), MON, 6))).toBe('2026-01-05T06:00:00.000Z');
    expect(at(S.nextSlot(iso('2026-01-07T12:00:00Z'), MON, 6))).toBe('2026-01-12T06:00:00.000Z');
  });
  it('counts the slot instant itself as due, and a minute before as last week', () => {
    expect(at(S.previousSlot(iso('2026-01-05T06:00:00Z'), MON, 6))).toBe('2026-01-05T06:00:00.000Z');
    expect(at(S.previousSlot(iso('2026-01-05T05:59:00Z'), MON, 6))).toBe('2025-12-29T06:00:00.000Z');
  });
  it('keeps 06:00 local across the spring change (the week is 167 hours)', () => {
    const before = S.previousSlot(iso('2026-03-29T12:00:00Z'), MON, 6);
    expect(at(before)).toBe('2026-03-23T06:00:00.000Z');
    const after = S.nextSlot(before, MON, 6);
    expect(at(after)).toBe('2026-03-30T05:00:00.000Z'); // 06:00 BST
    expect((after - before) / 3_600_000).toBe(167);
    expect(at(S.previousSlot(iso('2026-03-30T05:30:00Z'), MON, 6))).toBe('2026-03-30T05:00:00.000Z');
    expect(at(S.previousSlot(iso('2026-03-30T04:59:00Z'), MON, 6))).toBe('2026-03-23T06:00:00.000Z');
  });
  it('keeps 06:00 local across the autumn change (the week is 169 hours)', () => {
    const before = S.previousSlot(iso('2026-10-21T12:00:00Z'), MON, 6);
    expect(at(before)).toBe('2026-10-19T05:00:00.000Z');
    const after = S.nextSlot(iso('2026-10-24T12:00:00Z'), MON, 6);
    expect(at(after)).toBe('2026-10-26T06:00:00.000Z');
    expect((after - before) / 3_600_000).toBe(169);
  });
  it('handles a Sunday 01:00 slot on both change-over days', () => {
    expect(at(S.nextSlot(iso('2026-03-28T12:00:00Z'), 0, 1))).toBe('2026-03-29T01:00:00.000Z');
    expect(at(S.nextSlot(iso('2026-10-24T12:00:00Z'), 0, 1))).toBe('2026-10-25T00:00:00.000Z');
    // The repeated hour does not make a second slot on the same day.
    expect(at(S.nextSlot(iso('2026-10-25T00:00:00Z'), 0, 1))).toBe('2026-11-01T01:00:00.000Z');
  });
});

describe('decideDue', () => {
  const now = iso('2026-01-07T12:00:00Z'); // Wednesday; last Monday slot 5 Jan 06:00
  const base: Parameters<typeof S.decideDue>[0] = {
    setting: { mode: 'weekly', dow: 1, hour: 6 }, firstRunAt: '2025-12-01T10:00:00Z', lastScheduledStartAt: '2025-12-29T06:05:00Z',
    lastHandledDueAt: '2025-12-29T06:00:00Z', jobRunning: false, accountActive: true, hasData: true,
  };
  it('runs when the slot has passed and nothing has handled it', () => {
    expect(S.decideDue(base, now)).toEqual({ kind: 'run', dueAt: iso('2026-01-05T06:00:00Z') });
  });
  it('is idle when off, before the first run, or when the first run is newer than the slot', () => {
    expect(S.decideDue({ ...base, setting: { ...base.setting, mode: 'off' } }, now).kind).toBe('idle');
    expect(S.decideDue({ ...base, firstRunAt: null }, now).kind).toBe('idle');
    expect(S.decideDue({ ...base, firstRunAt: '2026-01-06T09:00:00Z' }, now).kind).toBe('idle');
  });
  it('handles each slot once and keeps a 6-day gap', () => {
    expect(S.decideDue({ ...base, lastHandledDueAt: '2026-01-05T06:00:00Z' }, now).kind).toBe('idle');
    expect(S.decideDue({ ...base, lastScheduledStartAt: '2026-01-02T06:00:00Z' }, now).kind).toBe('idle');
  });
  it('waits for a running job, and skips inactive accounts and sites without data with a reason', () => {
    expect(S.decideDue({ ...base, jobRunning: true }, now).kind).toBe('wait');
    expect(S.decideDue({ ...base, accountActive: false }, now)).toMatchObject({ kind: 'skip', reason: S.SKIP_REASONS.inactive });
    expect(S.decideDue({ ...base, hasData: false }, now)).toMatchObject({ kind: 'skip', reason: S.SKIP_REASONS.noData });
  });
});

describe('tick lock', () => {
  it('never lets two ticks overlap', async () => {
    let release!: () => void;
    const first = S.withTickLock(() => new Promise<string>((r) => { release = () => r('done'); }));
    const second = await S.withTickLock(async () => 'should not run');
    expect(second).toEqual({ ran: false });
    release();
    expect(await first).toEqual({ ran: true, value: 'done' });
    expect(await S.withTickLock(async () => 1)).toEqual({ ran: true, value: 1 });
  });
  it('releases the lock when the work throws', async () => {
    await expect(S.withTickLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect((await S.withTickLock(async () => 2)).ran).toBe(true);
  });
});

describe('tick against the database', () => {
  const d = db();
  const NOW = iso('2026-01-07T12:00:00Z');
  let n = 0;
  function makeSite(opts: { active?: boolean; plan?: string; data?: boolean; scored?: string | null; running?: boolean } = {}) {
    const id = `s${++n}`;
    const acc = `a${n}`;
    const trialEnds = opts.active === false ? '2026-01-01T00:00:00Z' : '2026-02-01T00:00:00Z';
    d.prepare('insert into accounts (id, name, plan, trial_ends_at, subscription_status, created_at) values (?, ?, ?, ?, ?, ?)').run(acc, 'Acc', opts.plan ?? 'trial', trialEnds, opts.plan && opts.plan !== 'trial' ? 'active' : null, '2025-11-01T00:00:00Z');
    d.prepare('insert into sites (id, name, domain, created_at, account_id) values (?, ?, ?, ?, ?)').run(id, 'Site', 'example.com', `2025-11-01T00:00:0${n % 10}Z`, acc);
    if (opts.data !== false) d.prepare(`insert into uploads (id, site_id, kind, source, filename, row_count, data, created_at) values (?, ?, 'crawl', 'file', 'c.csv', 1, '{"pages":[]}', ?)`).run(`u${n}`, id, '2025-11-01T00:00:00Z');
    if (opts.scored !== null) d.prepare(`insert into jobs (id, site_id, type, status, created_at, finished_at) values (?, ?, 'verdicts', 'done', ?, ?)`).run(`j${n}`, id, opts.scored ?? '2025-12-01T10:00:00Z', opts.scored ?? '2025-12-01T10:00:00Z');
    if (opts.running) d.prepare(`insert into jobs (id, site_id, type, status, created_at) values (?, ?, 'crawl', 'running', ?)`).run(`r${n}`, id, '2026-01-07T11:00:00Z');
    return id;
  }
  beforeEach(() => {
    d.exec('delete from sites; delete from accounts;');
    S.clearPreScoreHooks();
  });

  it('starts due sites with the plan URL limit and records skips with reasons', async () => {
    const due = makeSite();
    const paid = makeSite({ plan: 'growth' });
    const inactive = makeSite({ active: false });
    const noData = makeSite({ data: false });
    const never = makeSite({ scored: null });
    const busy = makeSite({ running: true });
    const calls: [string, number][] = [];
    const res = await S.tick({ now: () => NOW, startJob: (siteId, limit) => { calls.push([siteId, limit]); return `job-${siteId}`; } });
    expect(calls).toEqual([[due, 1000], [paid, 50000]]);
    const byId = new Map(res!.map((r) => [r.siteId, r]));
    expect(byId.get(inactive)).toMatchObject({ decision: 'skip', detail: S.SKIP_REASONS.inactive });
    expect(byId.get(noData)).toMatchObject({ decision: 'skip', detail: S.SKIP_REASONS.noData });
    expect(byId.get(never)?.decision).toBe('idle');
    expect(byId.get(busy)?.decision).toBe('wait');

    const runs = S.listScheduleRuns(due);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: 'schedule', outcome: 'started', job_id: `job-${due}`, due_at: '2026-01-05T06:00:00.000Z' });
    expect(S.listScheduleRuns(inactive)[0]).toMatchObject({ outcome: 'skipped', reason: S.SKIP_REASONS.inactive });
    expect(S.listScheduleRuns(busy)).toHaveLength(0);

    // A second tick in the same week does nothing new.
    calls.length = 0;
    await S.tick({ now: () => NOW + 15 * 60_000, startJob: (siteId) => { calls.push([siteId, 0]); return 'x'; } });
    expect(calls).toEqual([]);
    expect(S.listScheduleRuns(inactive)).toHaveLength(1);
  });

  it('honours the off setting and a custom day and hour', async () => {
    const off = makeSite();
    const tue = makeSite({ scored: '2026-01-01T00:00:00Z' }); // after last Wednesday's slot
    S.saveSchedule(off, { mode: 'off', dow: 1, hour: 6 });
    S.saveSchedule(tue, { mode: 'weekly', dow: 3, hour: 13 }); // Wednesday 13:00, not yet at NOW
    const calls: string[] = [];
    await S.tick({ now: () => NOW, startJob: (s) => { calls.push(s); return 'j'; } });
    expect(calls).toEqual([]);
    await S.tick({ now: () => NOW + 3_600_000, startJob: (s) => { calls.push(s); return 'j'; } });
    expect(calls).toEqual([tue]);
    expect(() => S.saveSchedule(off, { mode: 'weekly', dow: 9, hour: 6 })).toThrow();
  });

  it('runs pre-score hooks first and still scores when one fails', async () => {
    const site = makeSite();
    const order: string[] = [];
    S.registerPreScoreHook(async (id) => { order.push(`sync ${id}`); throw new Error('Google said no'); });
    await S.tick({ now: () => NOW, startJob: (id) => { order.push(`score ${id}`); return 'j1'; } });
    expect(order).toEqual([`sync ${site}`, `score ${site}`]);
    expect(S.listScheduleRuns(site)[0]).toMatchObject({ outcome: 'started', error: expect.stringContaining('Google said no') });
  });

  it('records a failed start', async () => {
    const site = makeSite();
    await S.tick({ now: () => NOW, startJob: () => { throw new Error('Upload Search Console data or a crawl first.'); } });
    expect(S.listScheduleRuns(site)[0]).toMatchObject({ outcome: 'failed', error: expect.stringContaining('crawl first') });
  });

  it('returns null when a tick is already running', async () => {
    makeSite();
    let release!: () => void;
    const slow = S.tick({ now: () => NOW, startJob: () => new Promise<string>((r) => { release = () => r('j'); }) });
    await new Promise((r) => setTimeout(r, 10));
    expect(await S.tick({ now: () => NOW })).toBeNull();
    release();
    expect(await slow).not.toBeNull();
  });

  it('Run now applies the same checks and records a manual run', async () => {
    const ok = makeSite();
    const inactive = makeSite({ active: false });
    expect(await S.runScheduledNow(inactive, { startJob: () => 'j' })).toEqual({ ok: false, error: S.SKIP_REASONS.inactive });
    expect(await S.runScheduledNow(ok, { now: () => NOW, startJob: () => 'job-now' })).toEqual({ ok: true, jobId: 'job-now' });
    expect(S.listScheduleRuns(ok)[0]).toMatchObject({ trigger: 'manual', outcome: 'started' });
  });

  it('summarises the next run', () => {
    const site = makeSite({ scored: '2026-01-06T09:00:00Z' });
    const s = S.scheduleSummary(site, NOW);
    expect(s.setting.isDefault).toBe(true);
    expect(s.next).toBe('2026-01-12T06:00:00.000Z');
    expect(S.scheduleSummary(makeSite({ scored: null }), NOW)).toMatchObject({ next: null, note: 'Starts after the first scoring run.' });
  });
});

describe('schedulerWanted', () => {
  it('is on in production, off in development, and obeys SCHEDULER_ENABLED', async () => {
    const { schedulerWanted } = await import('../src/lib/scheduler-switch');
    const base = {};
    expect(schedulerWanted({ ...base, NODE_ENV: 'production' })).toBe(true);
    expect(schedulerWanted({ ...base, NODE_ENV: 'development' })).toBe(false);
    expect(schedulerWanted({ ...base, NODE_ENV: 'development', SCHEDULER_ENABLED: 'true' })).toBe(true);
    expect(schedulerWanted({ ...base, NODE_ENV: 'production', SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(schedulerWanted({ ...base, NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).toBe(false);
  });
});
