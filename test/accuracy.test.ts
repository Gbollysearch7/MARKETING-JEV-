import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rc-accuracy-'));

const A = await import('../src/lib/accuracy');
const { db } = await import('../src/lib/db');
type V = 'refresh' | 'expand' | 'merge' | 'redirect' | 'prune' | 'leave';

describe('statistics', () => {
  it('Wilson interval matches known values', () => {
    const w = A.wilson(8, 10);
    expect(w.p).toBe(0.8);
    expect(w.low).toBeCloseTo(0.4902, 3);
    expect(w.high).toBeCloseTo(0.9433, 3);
    expect(A.wilson(0, 0)).toEqual({ p: 0, low: 0, high: 1 });
    const all = A.wilson(30, 30);
    expect(all.high).toBe(1);
    expect(all.low).toBeCloseTo(0.8865, 3);
  });
  it("Cohen's kappa: chance-corrected agreement", () => {
    const pairs: [string, string][] = [
      ...Array(35).fill(['y', 'y']), ...Array(35).fill(['n', 'n']), ...Array(15).fill(['y', 'n']), ...Array(15).fill(['n', 'y']),
    ];
    expect(A.cohenKappa(pairs)).toBeCloseTo(0.4, 10); // po 0.7, pe 0.5
    expect(A.cohenKappa([['a', 'a'], ['b', 'b']])).toBe(1);
    expect(A.cohenKappa([['a', 'a'], ['a', 'a']])).toBe(1);
    expect(A.cohenKappa([])).toBeNull();
  });
  it('confusion matrix and precision/recall', () => {
    const pairs: [string, string][] = [['prune', 'prune'], ['prune', 'redirect'], ['leave', 'leave'], ['redirect', 'redirect']];
    expect(A.confusion(pairs, ['prune', 'redirect', 'leave'], ['prune', 'redirect', 'leave'])).toEqual([[1, 1, 0], [0, 1, 0], [0, 0, 1]]);
    const pr = A.precisionRecall(pairs, ['prune', 'redirect']);
    expect(pr[0]).toMatchObject({ verdict: 'prune', precision: 0.5, recall: 1 });
    expect(pr[1]).toMatchObject({ verdict: 'redirect', precision: 1, recall: 0.5 });
  });
  it('calibration puts probabilities in 10 buckets and weights the error', () => {
    const items = [...Array(10)].map((_, i) => ({ p: 0.95, agree: i < 9 })).concat([...Array(10)].map((_, i) => ({ p: 0.6, agree: i < 3 })));
    const c = A.calibration(items);
    expect(c.rows).toHaveLength(10);
    expect(c.rows[9]).toMatchObject({ low: 0.9, high: 1, n: 10 });
    expect(c.rows[9].observed).toBeCloseTo(0.9);
    expect(c.rows[6]).toMatchObject({ low: 0.6, n: 10 }); // 0.6 lands in 0.6–0.7, not 0.5–0.6
    expect(c.rows[6].observed).toBeCloseTo(0.3);
    expect(c.error).toBeCloseTo(0.5 * 0.05 + 0.5 * 0.3);
    expect(A.calibration([{ p: 1, agree: true }]).rows[9].n).toBe(1);
    expect(A.calibration([]).error).toBeNull();
  });
  it('bands follow the confidence router', () => {
    expect([0.85, 0.849, 0.6, 0.599].map(A.bandOf)).toEqual(['auto', 'review', 'review', 'uncertain']);
  });
});

describe('review summaries', () => {
  const item = (model: V, p: number, human: V | 'rejected', i = 0) => ({ id: `v${i}`, path: `/p${i}`, model, p, human, reason: null, reviewedAt: null });
  it('counts agreement overall, per verdict, per band and finds the commonest overrides', () => {
    const items = [
      item('refresh', 0.9, 'refresh', 1), item('refresh', 0.82, 'expand', 2), item('refresh', 0.7, 'expand', 3),
      item('prune', 0.65, 'redirect', 4), item('prune', 0.5, 'rejected', 5), item('leave', 0.95, 'leave', 6),
    ];
    const s = A.summariseReviews(items);
    expect(s).toMatchObject({ n: 6, agree: 2 });
    expect(s.high).toMatchObject({ n: 3, agree: 2 });
    expect(s.byVerdict.find((v) => v.verdict === 'refresh')).toMatchObject({ n: 3, agree: 1 });
    expect(s.byBand.map((b) => b.n)).toEqual([2, 3, 1]);
    expect(s.overrides[0]).toMatchObject({ from: 'refresh', to: 'expand', n: 2 });
    expect(s.matrix[4][6]).toBe(1); // prune -> rejected
  });
});

describe('CSV', () => {
  it('escapes cells and defuses spreadsheet formulas', () => {
    expect(A.csvCell('a,b')).toBe('"a,b"');
    expect(A.csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(A.csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(A.csvCell(-3)).toBe('-3');
    expect(A.csvCell(null)).toBe('');
  });
  it('reads verdicts in any case and rejects unknown ones', () => {
    expect(A.parseVerdictLabel('  ReFresh ')).toBe('refresh');
    expect(A.parseVerdictLabel('PRUNE.')).toBe('prune');
    expect(A.parseVerdictLabel('')).toBeNull();
    expect(A.parseVerdictLabel('keep')).toBe('invalid');
  });
  const sheetRow = (p: string) => ({ path: p, url: `https://x.example${p}`, title: `Title, ${p}`, template: '/guides', clicks_month: 10, impressions_month: 100, avg_position: 7.25, clicks_change_pct: -40, sessions: 5, conversions: 0, word_count: 900, last_modified: '2024-01-01', referring_domains: 2, inlinks: 4 });
  it('the blind sheet has no model fields', () => {
    const csv = A.buildSheetCsv('sheet1', [sheetRow('/a')]);
    const header = csv.split('\n')[0];
    expect(header).toBe(A.SHEET_COLUMNS.join(','));
    expect(header).not.toMatch(/model|probab|confiden|router|reason|target|impact|band/i);
    expect(header.match(/verdict/g)).toEqual(['verdict']); // only expert_verdict
  });
  it('round-trips: export, fill in, import', () => {
    const csv = A.buildSheetCsv('sheet1', ['/a', '/b', '/c', '/d'].map(sheetRow));
    const lines = csv.trim().split('\n');
    const filled = [lines[0], ...lines.slice(1).map((l, i) => l.replace(/,,$/, [',REFRESH,old stats', ', expand ,', ',,', ',leave,"fine, leave it"'][i]))].join('\n');
    const parsed = A.parseSheetCsv(filled);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sheetId).toBe('sheet1');
    expect(parsed.blank).toBe(1);
    expect(parsed.rows).toEqual([
      { path: '/a', expert: 'refresh', notes: 'old stats' },
      { path: '/b', expert: 'expand', notes: null },
      { path: '/d', expert: 'leave', notes: 'fine, leave it' },
    ]);
  });
  it('reports bad verdicts and duplicate rows', () => {
    const p = A.parseSheetCsv('path,expert_verdict\n/a,keep\n/b,prune\n/b,prune\n');
    expect(p.errors).toHaveLength(2);
    expect(p.errors[0]).toMatch(/"keep" is not a verdict/);
    expect(p.errors[1]).toMatch(/appears twice/);
  });
});

describe('stratified sample', () => {
  const items = [
    ...[...Array(80)].map((_, i) => ({ path: `/l${i}`, verdict: 'leave' })),
    ...[...Array(15)].map((_, i) => ({ path: `/r${i}`, verdict: 'refresh' })),
    ...[...Array(3)].map((_, i) => ({ path: `/p${i}`, verdict: 'prune' })),
    ...[...Array(2)].map((_, i) => ({ path: `/x${i}`, verdict: 'redirect' })),
  ];
  it('gives every verdict a share, keeps rare ones, and is reproducible from its seed', () => {
    const s = A.stratifiedSample(items, 40, 42);
    expect(s).toHaveLength(40);
    const count = (v: string) => s.filter((x) => x.verdict === v).length;
    expect(count('prune')).toBe(3);
    expect(count('redirect')).toBe(2);
    expect(count('refresh')).toBeGreaterThanOrEqual(6);
    expect(new Set(s.map((x) => x.path)).size).toBe(40);
    expect(A.stratifiedSample(items, 40, 42)).toEqual(s);
    expect(A.stratifiedSample(items, 40, 43)).not.toEqual(s);
  });
  it('does not group the sheet by verdict', () => {
    const s = A.stratifiedSample(items, 40, 7).map((x) => x.verdict);
    const sorted = [...s].sort();
    expect(s).not.toEqual(sorted);
  });
  it('returns everything when there are fewer items than asked for', () => {
    expect(A.stratifiedSample(items.slice(0, 5), 100, 1)).toHaveLength(5);
  });
});

describe('benchmark against the database', () => {
  const d = db();
  d.prepare(`insert into accounts (id, name, plan, trial_ends_at, created_at) values ('a1', 'A', 'trial', '2099-01-01', '2026-01-01')`).run();
  d.prepare(`insert into sites (id, name, domain, created_at, account_id) values ('s1', 'Sample', 'sample-outdoors.example', '2026-01-01', 'a1')`).run();
  d.prepare(`insert into jobs (id, site_id, type, status, provider, model, created_at, finished_at) values ('j1', 's1', 'verdicts', 'done', 'mock', 'jev-x', '2026-01-02', '2026-01-02')`).run();
  const verdicts: [string, V, number][] = [];
  const all: V[] = ['refresh', 'expand', 'merge', 'redirect', 'prune', 'leave'];
  for (let i = 0; i < 60; i++) verdicts.push([`/page-${i}`, all[i % 6], 0.5 + (i % 5) / 10]);
  const ins = d.prepare(`insert into verdicts (id, job_id, site_id, path, template, verdict, probability, probabilities, router, needs_approval, reasons, rules, settle, impact_low, impact_high, monthly_clicks, monthly_impressions, model, status, reviewed_by, final_verdict)
    values (?, 'j1', 's1', ?, '/', ?, ?, '{}', 'review', 0, '[]', '[]', '[]', 0, 0, 10, 100, 'jev-x', ?, ?, ?)`);
  verdicts.forEach(([p, v, prob], i) => {
    const reviewed = i < 12;
    ins.run(`v${i}`, p, v, prob, reviewed ? (i === 11 ? 'rejected' : 'approved') : 'proposed', reviewed ? 'user' : null, reviewed && i % 4 === 0 ? 'leave' : null);
  });

  it('reads human reviews from the inbox', () => {
    const items = A.reviewItems('s1');
    expect(items).toHaveLength(12);
    expect(items.find((x) => x.id === 'v11')?.human).toBe('rejected');
    expect(items.find((x) => x.id === 'v4')).toMatchObject({ model: 'prune', human: 'leave' });
    expect(items.find((x) => x.id === 'v1')).toMatchObject({ model: 'expand', human: 'expand' });
  });

  it('makes a blind sheet tied to the run, and imports it as a benchmark', () => {
    const sheet = A.createSheet('s1', 30, 'sample-outdoors.example', 99);
    expect(sheet.jobId).toBe('j1');
    const lines = sheet.csv.trim().split('\n');
    expect(lines).toHaveLength(31);
    expect(sheet.csv).not.toMatch(/0\.[5-9]\b.*0\.[5-9]\b/); // no probabilities
    for (const v of all) expect(lines[0]).not.toContain(`,${v},`);
    // Expert agrees on every other row.
    const filled = [lines[0], ...lines.slice(1).map((l, i) => {
      const p = l.split(',')[1];
      const model = verdicts.find((x) => x[0] === p)![1];
      return l.replace(/,,$/, `,${i % 2 === 0 ? model.toUpperCase() : model === 'leave' ? 'refresh' : 'leave'},`);
    })].join('\n');
    const res = A.importBenchmark('s1', filled, 'labels.csv');
    expect(res).toMatchObject({ ok: true, labelled: 30, unmatched: 0 });
    const runs = A.listBenchmarks('s1');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ job_id: 'j1', sheet_id: sheet.id, model: 'jev-x', criteria_version: 'content-verdict.v1', source: 'import' });
    expect(runs[0].agreement).toBe(0.5);
    const s = A.summariseBenchmark(A.benchmarkRows(runs[0].id));
    expect(s.disagreements).toHaveLength(15);
    expect(s.disagreements[0].verdict_id).toMatch(/^v\d+$/);
    const out = A.exportCsv('s1', 'benchmark', runs[0].id)!;
    expect(out.split('\n')[0]).toBe('path,model_verdict,model_probability,expert_verdict,agree,notes');
    expect(A.exportCsv('s1', 'benchmark', 'nope')).toBeNull();
  });

  it('refuses files with bad verdicts or no matching paths', () => {
    expect(A.importBenchmark('s1', 'path,expert_verdict\n/page-1,keep\n', 'x.csv')).toMatchObject({ ok: false });
    expect(A.importBenchmark('s1', 'path,expert_verdict\n/nowhere,leave\n', 'x.csv')).toMatchObject({ ok: false });
    expect(A.importBenchmark('s1', 'path,expert_verdict\n/page-1,\n', 'x.csv')).toMatchObject({ ok: false });
  });

  it('exports every review view as CSV', () => {
    for (const k of ['reviews', 'summary', 'calibration', 'confusion', 'overrides', 'outcomes'] as const) {
      const csv = A.exportCsv('s1', k);
      expect(csv && csv.split('\n').length).toBeGreaterThan(1);
    }
    expect(A.exportCsv('s1', 'calibration')!.trim().split('\n')).toHaveLength(12);
  });
});
