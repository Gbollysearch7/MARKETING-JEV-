import 'server-only';
import { db } from './db';
import type { GscImport } from '@/engine/ingest/gsc';
import { periodDays, type SiteInputs } from '@/engine/site';
import type { Verdict } from '@/engine/verdict/types';
import { gscUploadsWithPeriod, insertTask, listTasks, openTaskForPath, outcomesForTask, saveOutcome, siteInputs, uploadData, type Brief, type Task, type VerdictRow } from './repo';

const SERP_NOTE = 'Competitor pages to beat need SERP data, which arrives with the Brief Desk (Module 5).';

function monthlyClicksFrom(g: GscImport | null, days: number, path: string): number {
  const p = g?.pages.find((x) => x.path === path);
  return p ? p.clicks * (30 / days) : 0;
}

/** A writer-ready brief built in code from the data, per verdict type (PRD section 5, work queue). */
export function buildBrief(v: VerdictRow, verdict: Verdict, target: string | null, inputs: SiteInputs = siteInputs(v.site_id)): Brief {
  const qs = (inputs.gscQueries?.pageQueries ?? []).filter((q) => q.path === v.path).sort((a, b) => b.impressions - a.impressions);
  const top = qs.slice(0, 10).map((q) => ({ query: q.query, impressions: q.impressions, position: Math.round(q.position * 10) / 10 }));
  const crawl = inputs.crawl?.pages.find((p) => p.path === v.path);
  const notes: string[] = [];
  if (!qs.length) notes.push('Upload page and query data to list the queries this page should target.');
  switch (verdict) {
    case 'refresh':
      return {
        summary: `Update ${v.path} so it wins back the clicks it has lost.`,
        queries: top,
        checklist: [
          'Check every date, price, statistic and product reference, and update or remove anything out of date.',
          'Re-read the top queries below and make sure the opening answers the main one directly.',
          'Update the title and meta description if they no longer match the top queries.',
          'Change the visible "last updated" date only after a substantive edit.',
        ],
        redirect: null,
        notes: [...notes, SERP_NOTE],
      };
    case 'expand': {
      const opportunity = qs.filter((q) => q.position >= 8 && q.position <= 20).slice(0, 10).map((q) => ({ query: q.query, impressions: q.impressions, position: Math.round(q.position * 10) / 10 }));
      return {
        summary: `Add depth to ${v.path} so it moves from page two into the top results.`,
        queries: opportunity.length ? opportunity : top,
        checklist: [
          'Add a section that answers each query listed below, in the searcher\'s words.',
          crawl?.wordCount ? `The page has ${crawl.wordCount} words; expand where the queries need it, not to hit a word count.` : 'Expand where the queries need it, not to hit a word count.',
          crawl?.inlinks != null && crawl.inlinks < 4 ? `Only ${crawl.inlinks} internal links point here; add links from related pages.` : 'Add internal links from related pages.',
        ],
        redirect: null,
        notes: [...notes, SERP_NOTE],
      };
    }
    case 'merge':
      return {
        summary: `Merge ${v.path} into ${target ?? 'a stronger page (choose the target)'}, then redirect.`,
        queries: top,
        checklist: [
          `Move anything useful from ${v.path} that ${target ?? 'the target'} does not already cover.`,
          'Make sure the target page answers the queries listed below.',
          'Add the 301 redirect, then update internal links to point at the target.',
        ],
        redirect: { from: v.path, to: target, code: 301 },
        notes,
      };
    case 'redirect':
      return {
        summary: `301 redirect ${v.path} to ${target ?? 'the closest matching page (choose the target)'}.`,
        queries: top,
        checklist: ['Add the 301 redirect below.', 'Update internal links that point at the old URL.', 'Remove the old URL from the XML sitemap.'],
        redirect: { from: v.path, to: target, code: 301 },
        notes,
      };
    case 'prune':
      return {
        summary: `Remove ${v.path} and return 410 Gone.`,
        queries: top,
        checklist: [
          'Confirm the page has no legal, support or campaign use before removing it.',
          'Return 410 for the URL using the rule below.',
          crawl?.inlinks ? `Remove the ${crawl.inlinks} internal links that point here.` : 'Remove any internal links that point here.',
          'Remove the URL from the XML sitemap.',
        ],
        redirect: { from: v.path, to: null, code: 410 },
        notes,
      };
    case 'leave':
      return { summary: 'No action.', queries: [], checklist: [], redirect: null, notes };
  }
}

/** Approved verdicts become tasks. Leave needs no task; an open task for the same URL is not duplicated. */
/** Pass `inputs` when creating many tasks at once, so the uploads are parsed once rather than per task. */
export function taskFromVerdict(v: VerdictRow, inputs?: SiteInputs): Task | null {
  const verdict = (v.final_verdict ?? v.verdict) as Verdict | null;
  if (!verdict || verdict === 'leave') return null;
  if (openTaskForPath(v.site_id, v.path)) return null;
  const target = v.final_target ?? v.target;
  inputs ??= siteInputs(v.site_id);
  const g = inputs.gsc ?? inputs.gscQueries ?? null;
  const days = periodDays(g?.period) ?? 90;
  const siteMonthly = (g?.pages ?? []).reduce((s, p) => s + p.clicks, 0) * (30 / days);
  const sameAsModel = verdict === v.verdict;
  return insertTask({
    site_id: v.site_id,
    verdict_id: v.id,
    path: v.path,
    verdict,
    target,
    brief: buildBrief(v, verdict, target, inputs),
    // A human change of verdict has no model forecast; use a neutral range so the outcome is judged on direction.
    forecast_low: sameAsModel ? v.impact_low : 0,
    forecast_high: sameAsModel ? v.impact_high : 0,
    baseline_clicks_month: v.monthly_clicks,
    baseline_target_clicks_month: target ? monthlyClicksFrom(g, days, target) : null,
    baseline_site_clicks_month: siteMonthly,
  });
}

const WINDOWS = [30, 60, 90];

function baselineUploadIds(verdictId: string | null): Set<string> {
  if (!verdictId) return new Set();
  const row = db().prepare('select j.meta from verdicts v join jobs j on j.id = v.job_id where v.id = ?').get(verdictId) as { meta: string } | undefined;
  const ids = row ? (JSON.parse(row.meta) as { uploadIds?: Record<string, string> }).uploadIds : undefined;
  return new Set(Object.values(ids ?? {}));
}

/**
 * Label completed tasks from later Search Console uploads (PRD section 5, outcome tracking).
 * A window counts once an upload's period starts on or after the done date and runs at least that many days past it.
 */
export function measureOutcomes(siteId: string): number {
  const uploads = gscUploadsWithPeriod(siteId).sort((a, b) => a.period_end!.localeCompare(b.period_end!));
  let measured = 0;
  for (const t of listTasks(siteId, { status: 'done' })) {
    if (!t.done_at) continue;
    const done = t.done_at.slice(0, 10);
    const have = new Set(outcomesForTask(t.id).map((o) => o.window_days));
    // The baseline came from the uploads the decision was scored on; measuring against those would always read zero.
    const baseline = baselineUploadIds(t.verdict_id);
    for (const w of WINDOWS) {
      if (have.has(w)) continue;
      const u = uploads.find((x) => !baseline.has(x.id) && x.period_start! >= done && (Date.parse(x.period_end!) - Date.parse(done)) / 86_400_000 >= w - 1);
      if (!u) continue;
      const g = uploadData<GscImport>(u.id);
      const days = periodDays({ start: u.period_start!, end: u.period_end! })!;
      const m = (p: string) => monthlyClicksFrom(g, days, p);
      let after: number;
      let delta: number;
      let label: 'worked' | 'neutral' | 'backfired';
      if (t.verdict === 'prune') {
        // Site-level: pruning worked if the rest of the site held its clicks.
        const siteAfter = g.pages.reduce((s, p) => s + p.clicks, 0) * (30 / days);
        const before = (t.baseline_site_clicks_month ?? 0) - t.baseline_clicks_month;
        after = siteAfter;
        delta = siteAfter - before;
        label = before > 0 && delta / before < -0.1 ? 'backfired' : delta >= 0 ? 'worked' : 'neutral';
      } else {
        const measuredPath = (t.verdict === 'merge' || t.verdict === 'redirect') && t.target ? t.target : t.path;
        const baseline = measuredPath === t.path ? t.baseline_clicks_month : (t.baseline_target_clicks_month ?? 0) + t.baseline_clicks_month;
        after = m(measuredPath);
        delta = after - baseline;
        const tolerance = Math.max(5, baseline * 0.1);
        label = delta < -tolerance ? 'backfired' : delta >= Math.max(1, t.forecast_low) && delta > 0 ? 'worked' : 'neutral';
      }
      saveOutcome({ task_id: t.id, window_days: w, upload_id: u.id, after_clicks_month: Math.round(after), delta: Math.round(delta), label });
      measured++;
    }
  }
  return measured;
}
