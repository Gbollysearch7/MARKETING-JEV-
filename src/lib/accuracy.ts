import 'server-only';
// Relative imports only: tests load this file without the "@/" alias.
import { findCol, parseTable } from '../engine/ingest/csv';
import { CRITERIA_VERSION } from '../engine/verdict/battery';
import { VERDICTS, type Verdict } from '../engine/verdict/types';
import { db, newId, now } from './db';

/**
 * Accuracy: does Jev agree with people? (milestone A6 "Prove the loop")
 * 1. From reviews: every human review in the inbox against the model's verdict and stated probability.
 * 2. Expert benchmark: a blind labelling sheet, filled in by an SEO, imported and compared.
 * 3. Outcome evidence: what the outcomes ledger says happened after approved changes.
 */

/** A2 exit: an SEO reviewer agrees with at least 75% of verdicts at 0.8 or above. */
export const AGREEMENT_TARGET = 0.75;
export const AGREEMENT_TARGET_MIN_P = 0.8;
/** A6 exit: calibration error at or below 0.10 (10 buckets). */
export const CALIBRATION_TARGET = 0.1;
/** Below this many items the numbers are shown but flagged as too few to rely on. */
export const MIN_SAMPLE = 30;

export type Human = Verdict | 'rejected';
export const HUMAN_COLUMNS: Human[] = [...VERDICTS, 'rejected'];
export type Band = 'auto' | 'review' | 'uncertain';
export const BANDS: { key: Band; label: string; range: string }[] = [
  { key: 'auto', label: 'Auto', range: '0.85 or above' },
  { key: 'review', label: 'Needs review', range: '0.60 to 0.84' },
  { key: 'uncertain', label: 'Uncertain', range: 'below 0.60' },
];
export const bandOf = (p: number): Band => (p >= 0.85 ? 'auto' : p >= 0.6 ? 'review' : 'uncertain');

// ---------- statistics ----------

/** Wilson score interval for a proportion (95% by default). Honest at small n, unlike p ± 1.96·se. */
export function wilson(k: number, n: number, z = 1.96): { p: number; low: number; high: number } {
  if (n <= 0) return { p: 0, low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** Cohen's kappa for two raters over the same items: agreement corrected for chance. */
export function cohenKappa<T extends string>(pairs: [T, T][]): number | null {
  const n = pairs.length;
  if (!n) return null;
  const a = new Map<T, number>();
  const b = new Map<T, number>();
  let agree = 0;
  for (const [x, y] of pairs) {
    if (x === y) agree++;
    a.set(x, (a.get(x) ?? 0) + 1);
    b.set(y, (b.get(y) ?? 0) + 1);
  }
  const po = agree / n;
  let pe = 0;
  for (const [k, ca] of a) pe += (ca / n) * ((b.get(k) ?? 0) / n);
  if (pe === 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

/** Rows are the model's verdict, columns the human's. */
export function confusion<R extends string, C extends string>(pairs: [R, C][], rows: readonly R[], cols: readonly C[]): number[][] {
  const m = rows.map(() => cols.map(() => 0));
  for (const [r, c] of pairs) {
    const i = rows.indexOf(r);
    const j = cols.indexOf(c);
    if (i >= 0 && j >= 0) m[i][j]++;
  }
  return m;
}

/** Per verdict: precision (when the model said it, the human agreed) and recall (when the human said it, the model did too). */
export function precisionRecall(pairs: [string, string][], cats: readonly string[]) {
  return cats.map((c) => {
    const predicted = pairs.filter(([m]) => m === c).length;
    const actual = pairs.filter(([, h]) => h === c).length;
    const hit = pairs.filter(([m, h]) => m === c && h === c).length;
    return { verdict: c, predicted, actual, hit, precision: predicted ? hit / predicted : null, recall: actual ? hit / actual : null };
  });
}

export interface CalibrationRow { low: number; high: number; n: number; meanP: number | null; observed: number | null; gap: number | null }

/**
 * Stated probability against observed agreement in equal-width buckets (PRD section 12: 10 buckets).
 * Calibration error is the expected calibration error: the gap in each bucket weighted by its share of items.
 */
export function calibration(items: { p: number; agree: boolean }[], buckets = 10): { rows: CalibrationRow[]; error: number | null; n: number } {
  const rows: CalibrationRow[] = [];
  const width = 1 / buckets;
  const groups: { p: number; agree: boolean }[][] = Array.from({ length: buckets }, () => []);
  for (const it of items) {
    const p = Math.min(1, Math.max(0, it.p));
    groups[Math.min(buckets - 1, Math.floor(p / width + 1e-9))].push(it);
  }
  let err = 0;
  groups.forEach((g, i) => {
    const low = Math.round(i * width * 100) / 100;
    const high = Math.round((i + 1) * width * 100) / 100;
    if (!g.length) { rows.push({ low, high, n: 0, meanP: null, observed: null, gap: null }); return; }
    const meanP = g.reduce((s, x) => s + x.p, 0) / g.length;
    const observed = g.filter((x) => x.agree).length / g.length;
    err += (g.length / Math.max(1, items.length)) * Math.abs(meanP - observed);
    rows.push({ low, high, n: g.length, meanP, observed, gap: observed - meanP });
  });
  return { rows, error: items.length ? err : null, n: items.length };
}

// ---------- CSV ----------

/** One CSV cell. Text that a spreadsheet would run as a formula is prefixed with an apostrophe. */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/** A verdict typed by a person: any case, surrounding spaces or punctuation, label or key. */
export function parseVerdictLabel(raw: string): Verdict | null | 'invalid' {
  const s = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return null;
  return (VERDICTS as readonly string[]).includes(s) ? (s as Verdict) : 'invalid';
}

/** Small seeded PRNG (mulberry32) so a sheet's sample can be reproduced from its seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stratified random sample by model verdict: each verdict gets its share of n in proportion to how
 * often it occurs, but never fewer than 5 (or all it has, or an equal share when n is small), so rare verdicts like Prune are still tested.
 * The result is shuffled so the sheet's order reveals nothing about the model's verdicts.
 */
export function stratifiedSample<T extends { path: string; verdict: string }>(items: T[], n: number, seed: number): T[] {
  const r = rng(seed);
  const shuffle = <U,>(xs: U[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (items.length <= n) return shuffle(items);
  const strata = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.path.localeCompare(b.path))) strata.set(it.verdict, [...(strata.get(it.verdict) ?? []), it]);
  const keys = [...strata.keys()].sort();
  const floorMin = Math.max(1, Math.min(5, Math.floor(n / keys.length)));
  const quota = new Map(keys.map((k) => [k, Math.min(strata.get(k)!.length, Math.max(floorMin, Math.floor((n * strata.get(k)!.length) / items.length)))]));
  let total = [...quota.values()].reduce((s, x) => s + x, 0);
  // Trim from the largest strata or top up the ones with spare items until the quotas add to n.
  while (total > n) { const k = keys.filter((x) => quota.get(x)! > floorMin).sort((a, b) => quota.get(b)! - quota.get(a)!)[0]; if (!k) break; quota.set(k, quota.get(k)! - 1); total--; }
  while (total < n) { const k = keys.filter((x) => quota.get(x)! < strata.get(x)!.length).sort((a, b) => strata.get(b)!.length - quota.get(b)! - (strata.get(a)!.length - quota.get(a)!))[0]; if (!k) break; quota.set(k, quota.get(k)! + 1); total++; }
  const picked: T[] = [];
  for (const k of keys) picked.push(...shuffle(strata.get(k)!).slice(0, quota.get(k)!));
  return shuffle(picked);
}

/** Columns of the blind labelling sheet. Nothing the model decided is in it. */
export const SHEET_COLUMNS = ['sheet_id', 'path', 'url', 'title', 'template', 'clicks_month', 'impressions_month', 'avg_position', 'clicks_change_pct', 'sessions', 'conversions', 'word_count', 'last_modified', 'referring_domains', 'inlinks', 'expert_verdict', 'notes'] as const;

export interface SheetRow {
  path: string; url: string; title: string | null; template: string; clicks_month: number; impressions_month: number; avg_position: number | null;
  clicks_change_pct: number | null; sessions: number | null; conversions: number | null; word_count: number | null; last_modified: string | null;
  referring_domains: number | null; inlinks: number | null;
}

export function buildSheetCsv(sheetId: string, rows: SheetRow[]): string {
  const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
  return toCsv([
    [...SHEET_COLUMNS],
    ...rows.map((r) => [sheetId, r.path, r.url, r.title, r.template, Math.round(r.clicks_month), Math.round(r.impressions_month), r1(r.avg_position), r1(r.clicks_change_pct), r.sessions, r.conversions, r.word_count, r.last_modified, r.referring_domains, r.inlinks, '', '']),
  ]);
}

export interface ParsedSheet { sheetId: string | null; rows: { path: string; expert: Verdict; notes: string | null }[]; blank: number; errors: string[] }

/** Read a filled-in sheet. Rows without a verdict are ignored; unknown verdicts are listed as errors. */
export function parseSheetCsv(text: string): ParsedSheet {
  const { headers, rows } = parseTable(text, ['expert_verdict', 'path']);
  const pathCol = findCol(headers, ['path', 'url path']);
  const urlCol = findCol(headers, ['url', 'address']);
  const expCol = findCol(headers, ['expert_verdict', 'expert verdict', 'verdict', 'label']);
  const notesCol = findCol(headers, ['notes', 'note', 'comment']);
  const sheetCol = findCol(headers, ['sheet_id']);
  const errors: string[] = [];
  if (!expCol) errors.push('No expert_verdict column found.');
  if (!pathCol && !urlCol) errors.push('No path or url column found.');
  if (errors.length) return { sheetId: null, rows: [], blank: 0, errors };
  const out: ParsedSheet['rows'] = [];
  const seen = new Set<string>();
  let blank = 0;
  let sheetId: string | null = null;
  rows.forEach((row, i) => {
    let path = pathCol ? row[pathCol] : '';
    if (!path && urlCol && row[urlCol]) { try { path = new URL(row[urlCol]).pathname; } catch { path = ''; } }
    const v = parseVerdictLabel(row[expCol!] ?? '');
    if (sheetCol && row[sheetCol] && !sheetId) sheetId = row[sheetCol];
    if (!path) { if (v) errors.push(`Row ${i + 2}: no path.`); else blank++; return; }
    if (v === null) { blank++; return; }
    if (v === 'invalid') { errors.push(`Row ${i + 2} (${path}): "${row[expCol!]}" is not a verdict. Use one of ${VERDICTS.join(', ')}.`); return; }
    if (seen.has(path)) { errors.push(`Row ${i + 2}: ${path} appears twice.`); return; }
    seen.add(path);
    out.push({ path, expert: v, notes: (notesCol && row[notesCol]) || null });
  });
  return { sheetId, rows: out, blank, errors };
}

// ---------- summaries ----------

export interface ReviewItem { id: string; path: string; model: Verdict; p: number; human: Human; reason: string | null; reviewedAt: string | null }

export function summariseReviews(items: ReviewItem[]) {
  const agree = (x: ReviewItem) => x.human === x.model;
  const n = items.length;
  const k = items.filter(agree).length;
  const high = items.filter((x) => x.p >= AGREEMENT_TARGET_MIN_P);
  const byVerdict = VERDICTS.map((v) => { const g = items.filter((x) => x.model === v); const a = g.filter(agree).length; return { verdict: v, n: g.length, agree: a, ...wilson(a, g.length) }; });
  const byBand = BANDS.map((b) => { const g = items.filter((x) => bandOf(x.p) === b.key); const a = g.filter(agree).length; return { ...b, n: g.length, agree: a, ...wilson(a, g.length) }; });
  const overrides = new Map<string, { from: Verdict; to: Human; n: number; examples: ReviewItem[] }>();
  for (const x of items) {
    if (agree(x)) continue;
    const key = `${x.model}>${x.human}`;
    const o = overrides.get(key) ?? { from: x.model, to: x.human, n: 0, examples: [] };
    o.n++;
    if (o.examples.length < 3) o.examples.push(x);
    overrides.set(key, o);
  }
  return {
    n, agree: k, overall: wilson(k, n),
    high: { n: high.length, agree: high.filter(agree).length, ...wilson(high.filter(agree).length, high.length) },
    byVerdict, byBand,
    calibration: calibration(items.map((x) => ({ p: x.p, agree: agree(x) }))),
    matrix: confusion(items.map((x) => [x.model, x.human] as [Verdict, Human]), VERDICTS, HUMAN_COLUMNS),
    overrides: [...overrides.values()].sort((a, b) => b.n - a.n),
  };
}

export interface BenchmarkRow { path: string; verdict_id: string | null; model: Verdict; p: number; expert: Verdict; notes: string | null }

export function summariseBenchmark(rows: BenchmarkRow[]) {
  const pairs = rows.map((r) => [r.model, r.expert] as [Verdict, Verdict]);
  const k = rows.filter((r) => r.model === r.expert).length;
  const high = rows.filter((r) => r.p >= AGREEMENT_TARGET_MIN_P);
  const highK = high.filter((r) => r.model === r.expert).length;
  return {
    n: rows.length, agree: k, overall: wilson(k, rows.length),
    high: { n: high.length, agree: highK, ...wilson(highK, high.length) },
    kappa: cohenKappa(pairs),
    matrix: confusion(pairs, VERDICTS, VERDICTS),
    perVerdict: precisionRecall(pairs, VERDICTS),
    calibration: calibration(rows.map((r) => ({ p: r.p, agree: r.model === r.expert }))),
    disagreements: rows.filter((r) => r.model !== r.expert),
  };
}

// ---------- storage ----------

let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  db().exec(`
    create table if not exists accuracy_sheets (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      job_id text not null references jobs(id) on delete cascade,
      seed integer not null,
      size integer not null,
      paths text not null,               -- JSON array, in sheet order
      created_at text not null
    );
    create table if not exists accuracy_benchmarks (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      job_id text not null references jobs(id) on delete cascade,
      sheet_id text,
      source text not null,              -- import | sample
      filename text not null,
      provider text,
      model text not null,
      criteria_version text not null,
      labelled integer not null,
      unmatched integer not null,
      created_at text not null
    );
    create table if not exists accuracy_benchmark_rows (
      benchmark_id text not null references accuracy_benchmarks(id) on delete cascade,
      path text not null,
      verdict_id text,
      model_verdict text not null,
      model_probability real not null,
      expert_verdict text not null,
      notes text,
      primary key (benchmark_id, path)
    );
  `);
  schemaReady = true;
}

/** Every verdict a person reviewed in the inbox (not auto-approvals), with what they decided. */
export function reviewItems(siteId: string): ReviewItem[] {
  const rows = db().prepare(`
    select v.id, v.path, v.verdict, v.probability, v.status, v.final_verdict, v.reviewed_at,
      (select l.reason from labels l where l.verdict_id = v.id order by l.id desc limit 1) reason
    from verdicts v
    where v.site_id = ? and v.reviewed_by = 'user' and v.verdict is not null and v.skipped is null and v.status in ('approved', 'rejected')
    order by v.reviewed_at desc`).all(siteId) as { id: string; path: string; verdict: Verdict; probability: number; status: string; final_verdict: Verdict | null; reviewed_at: string | null; reason: string | null }[];
  return rows.map((r) => ({
    id: r.id, path: r.path, model: r.verdict, p: r.probability,
    human: r.status === 'rejected' ? 'rejected' : (r.final_verdict ?? r.verdict),
    reason: r.reason, reviewedAt: r.reviewed_at,
  }));
}

/** Count of auto-approved verdicts, which no person looked at and so are not in the review numbers. */
export function autoApprovedCount(siteId: string): number {
  return (db().prepare(`select count(*) n from verdicts where site_id = ? and reviewed_by = 'auto'`).get(siteId) as { n: number }).n;
}

/** From the outcomes ledger: per verdict, completed tasks that worked, did not (neutral or backfired), or are too early to tell. */
export function outcomeEvidence(siteId: string) {
  const rows = db().prepare(`
    select t.id, t.verdict, t.path, t.done_at,
      (select o.label from outcomes o where o.task_id = t.id order by o.window_days desc limit 1) label,
      (select o.window_days from outcomes o where o.task_id = t.id order by o.window_days desc limit 1) window_days
    from tasks t where t.site_id = ? and t.status = 'done'`).all(siteId) as { id: string; verdict: Verdict; path: string; done_at: string | null; label: string | null; window_days: number | null }[];
  const per = VERDICTS.map((v) => {
    const g = rows.filter((r) => r.verdict === v);
    return { verdict: v, done: g.length, worked: g.filter((r) => r.label === 'worked').length, neutral: g.filter((r) => r.label === 'neutral').length, backfired: g.filter((r) => r.label === 'backfired').length, early: g.filter((r) => !r.label).length };
  });
  const total = per.reduce((s, x) => ({ done: s.done + x.done, worked: s.worked + x.worked, neutral: s.neutral + x.neutral, backfired: s.backfired + x.backfired, early: s.early + x.early }), { done: 0, worked: 0, neutral: 0, backfired: 0, early: 0 });
  return { per, total };
}

interface JobLite { id: string; provider: string | null; model: string | null; finished_at: string | null }

export function latestScoredJob(siteId: string): JobLite | null {
  return (db().prepare(`select id, provider, model, finished_at from jobs where site_id = ? and type = 'verdicts' and status = 'done' order by finished_at desc limit 1`).get(siteId) as JobLite | undefined) ?? null;
}

function jobFor(siteId: string, jobId: string): JobLite | null {
  return (db().prepare(`select id, provider, model, finished_at from jobs where id = ? and site_id = ? and type = 'verdicts' and status = 'done'`).get(jobId, siteId) as JobLite | undefined) ?? null;
}

function criteriaFor(jobId: string): string {
  const r = db().prepare('select criteria_version v from decisions where job_id = ? limit 1').get(jobId) as { v: string } | undefined;
  return r?.v ?? CRITERIA_VERSION;
}

export const modelLabel = (j: { provider: string | null; model: string | null }) => (j.provider === 'mock' ? 'Offline mock' : j.model ?? 'unknown');

/** Make a blind labelling sheet for the latest scoring run and remember which URLs it holds. */
export function createSheet(siteId: string, size: number, domain: string, seed = Math.floor(Math.random() * 2 ** 31)): { id: string; csv: string; jobId: string } {
  ensureSchema();
  const job = latestScoredJob(siteId);
  if (!job) throw new Error('Score the site first.');
  const n = Math.min(1000, Math.max(10, Math.floor(size) || 100));
  const candidates = db().prepare(`select path, verdict from verdicts where job_id = ? and skipped is null and verdict is not null`).all(job.id) as { path: string; verdict: string }[];
  const picked = stratifiedSample(candidates, n, seed);
  const byPath = new Map((db().prepare(`
    select v.path, v.template, v.monthly_clicks, v.monthly_impressions, v.position, u.title, u.prev_clicks, u.clicks, u.sessions, u.conversions, u.word_count, u.last_modified, u.referring_domains, u.inlinks
    from verdicts v left join site_urls u on u.site_id = v.site_id and u.path = v.path where v.job_id = ?`).all(job.id) as Record<string, unknown>[]).map((r) => [r.path as string, r]));
  const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const rows: SheetRow[] = picked.map(({ path }) => {
    const r = byPath.get(path) ?? {};
    const clicks = r.clicks as number | null; const prev = r.prev_clicks as number | null;
    return {
      path, url: `https://${host}${path}`, title: (r.title as string) ?? null, template: (r.template as string) ?? '',
      clicks_month: (r.monthly_clicks as number) ?? 0, impressions_month: (r.monthly_impressions as number) ?? 0, avg_position: (r.position as number) ?? null,
      clicks_change_pct: clicks != null && prev ? ((clicks - prev) / prev) * 100 : null,
      sessions: (r.sessions as number) ?? null, conversions: (r.conversions as number) ?? null, word_count: (r.word_count as number) ?? null,
      last_modified: (r.last_modified as string) ?? null, referring_domains: (r.referring_domains as number) ?? null, inlinks: (r.inlinks as number) ?? null,
    };
  });
  const id = newId();
  db().prepare('insert into accuracy_sheets (id, site_id, job_id, seed, size, paths, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, siteId, job.id, seed, rows.length, JSON.stringify(rows.map((r) => r.path)), now());
  return { id, csv: buildSheetCsv(id, rows), jobId: job.id };
}

/**
 * Store a filled-in sheet as a benchmark run. It is compared with the scoring run the sheet was made
 * from (by its sheet_id), or the latest run when the sheet has none.
 */
export function importBenchmark(siteId: string, text: string, filename: string, source: 'import' | 'sample' = 'import'): { ok: true; id: string; labelled: number; unmatched: number } | { ok: false; errors: string[] } {
  ensureSchema();
  let parsed: ParsedSheet;
  try { parsed = parseSheetCsv(text); } catch (e) { return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }; }
  if (parsed.errors.length) return { ok: false, errors: parsed.errors.slice(0, 12) };
  if (!parsed.rows.length) return { ok: false, errors: ['No rows have an expert_verdict filled in.'] };
  let job: JobLite | null = null;
  let sheetId: string | null = null;
  if (parsed.sheetId) {
    const sheet = db().prepare('select id, job_id from accuracy_sheets where id = ? and site_id = ?').get(parsed.sheetId, siteId) as { id: string; job_id: string } | undefined;
    if (sheet) { job = jobFor(siteId, sheet.job_id); sheetId = sheet.id; }
  }
  job ??= latestScoredJob(siteId);
  if (!job) return { ok: false, errors: ['Score the site first.'] };
  const verdicts = new Map((db().prepare('select id, path, verdict, probability from verdicts where job_id = ? and skipped is null and verdict is not null').all(job.id) as { id: string; path: string; verdict: Verdict; probability: number }[]).map((v) => [v.path, v]));
  const matched = parsed.rows.filter((r) => verdicts.has(r.path));
  if (!matched.length) return { ok: false, errors: ['None of the paths in this file were scored in this run. Export a fresh sheet and label that.'] };
  const id = newId();
  const d = db();
  d.transaction(() => {
    d.prepare(`insert into accuracy_benchmarks (id, site_id, job_id, sheet_id, source, filename, provider, model, criteria_version, labelled, unmatched, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, siteId, job!.id, sheetId, source, filename.slice(0, 200), job!.provider, job!.model ?? 'unknown', criteriaFor(job!.id), matched.length, parsed.rows.length - matched.length, now());
    const ins = d.prepare('insert into accuracy_benchmark_rows (benchmark_id, path, verdict_id, model_verdict, model_probability, expert_verdict, notes) values (?, ?, ?, ?, ?, ?, ?)');
    for (const r of matched) { const v = verdicts.get(r.path)!; ins.run(id, r.path, v.id, v.verdict, v.probability, r.expert, r.notes ? r.notes.slice(0, 1000) : null); }
  })();
  return { ok: true, id, labelled: matched.length, unmatched: parsed.rows.length - matched.length };
}

export interface BenchmarkRun { id: string; site_id: string; job_id: string; sheet_id: string | null; source: 'import' | 'sample'; filename: string; provider: string | null; model: string; criteria_version: string; labelled: number; unmatched: number; created_at: string; job_finished_at: string | null }

export function listBenchmarks(siteId: string): (BenchmarkRun & { agreement: number; kappa: number | null })[] {
  ensureSchema();
  const runs = db().prepare(`select b.*, j.finished_at job_finished_at from accuracy_benchmarks b left join jobs j on j.id = b.job_id where b.site_id = ? order by b.created_at desc`).all(siteId) as BenchmarkRun[];
  return runs.map((r) => { const s = summariseBenchmark(benchmarkRows(r.id)); return { ...r, agreement: s.overall.p, kappa: s.kappa }; });
}

export function getBenchmark(siteId: string, id: string): BenchmarkRun | null {
  ensureSchema();
  return (db().prepare(`select b.*, j.finished_at job_finished_at from accuracy_benchmarks b left join jobs j on j.id = b.job_id where b.id = ? and b.site_id = ?`).get(id, siteId) as BenchmarkRun | undefined) ?? null;
}

export function benchmarkRows(benchmarkId: string): BenchmarkRow[] {
  ensureSchema();
  return (db().prepare('select path, verdict_id, model_verdict, model_probability, expert_verdict, notes from accuracy_benchmark_rows where benchmark_id = ? order by path').all(benchmarkId) as { path: string; verdict_id: string | null; model_verdict: Verdict; model_probability: number; expert_verdict: Verdict; notes: string | null }[])
    .map((r) => ({ path: r.path, verdict_id: r.verdict_id, model: r.model_verdict, p: r.model_probability, expert: r.expert_verdict, notes: r.notes }));
}

export function deleteBenchmark(siteId: string, id: string) {
  ensureSchema();
  db().prepare('delete from accuracy_benchmarks where id = ? and site_id = ?').run(id, siteId);
}

// ---------- CSV exports ----------

const pct = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10);
const r3 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);

export const EXPORT_KINDS = ['reviews', 'summary', 'calibration', 'confusion', 'overrides', 'outcomes', 'benchmark'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function exportCsv(siteId: string, kind: ExportKind, runId?: string | null): string | null {
  if (kind === 'benchmark') {
    if (!runId || !getBenchmark(siteId, runId)) return null;
    return toCsv([['path', 'model_verdict', 'model_probability', 'expert_verdict', 'agree', 'notes'], ...benchmarkRows(runId).map((r) => [r.path, r.model, r3(r.p), r.expert, r.model === r.expert ? 'yes' : 'no', r.notes])]);
  }
  if (kind === 'outcomes') {
    const o = outcomeEvidence(siteId);
    return toCsv([['verdict', 'completed', 'worked', 'neutral', 'backfired', 'too_early'], ...o.per.map((x) => [x.verdict, x.done, x.worked, x.neutral, x.backfired, x.early]), ['all', o.total.done, o.total.worked, o.total.neutral, o.total.backfired, o.total.early]]);
  }
  const items = reviewItems(siteId);
  const s = summariseReviews(items);
  switch (kind) {
    case 'reviews':
      return toCsv([['path', 'model_verdict', 'model_probability', 'band', 'human_verdict', 'agree', 'reason', 'reviewed_at'], ...items.map((x) => [x.path, x.model, r3(x.p), bandOf(x.p), x.human, x.human === x.model ? 'yes' : 'no', x.reason, x.reviewedAt])]);
    case 'summary':
      return toCsv([
        ['group', 'reviews', 'agreed', 'agreement_pct', 'ci95_low_pct', 'ci95_high_pct'],
        ['all', s.n, s.agree, pct(s.overall.p), pct(s.overall.low), pct(s.overall.high)],
        [`probability >= ${AGREEMENT_TARGET_MIN_P}`, s.high.n, s.high.agree, pct(s.high.p), pct(s.high.low), pct(s.high.high)],
        ...s.byBand.map((b) => [`band:${b.key}`, b.n, b.agree, pct(b.p), pct(b.low), pct(b.high)]),
        ...s.byVerdict.map((v) => [`verdict:${v.verdict}`, v.n, v.agree, pct(v.p), pct(v.low), pct(v.high)]),
      ]);
    case 'calibration':
      return toCsv([['bucket_low', 'bucket_high', 'reviews', 'mean_stated_probability', 'observed_agreement', 'gap'], ...s.calibration.rows.map((r) => [r.low, r.high, r.n, r3(r.meanP), r3(r.observed), r3(r.gap)]), ['calibration_error', '', s.calibration.n, '', '', r3(s.calibration.error)]]);
    case 'confusion':
      return toCsv([['model \\ human', ...HUMAN_COLUMNS], ...VERDICTS.map((v, i) => [v, ...s.matrix[i]])]);
    case 'overrides':
      return toCsv([['model_verdict', 'human_verdict', 'count', 'example_paths'], ...s.overrides.map((o) => [o.from, o.to, o.n, o.examples.map((e) => e.path).join(' ')])]);
  }
}
