/**
 * Builds samples/accuracy-expert-labels.csv: SAMPLE expert labels for the fictional Sample Outdoors
 * data (sample-outdoors.example), so the Accuracy page's benchmark view can be demonstrated.
 *
 * The "expert" here is a fixed rule of thumb applied to the sample's own metrics, written independently
 * of Rankcall's engine and never looking at its verdicts. It is not a person and the result is not a
 * real accuracy figure. Deterministic. Run: npx tsx scripts/make-accuracy-samples.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importBacklinks } from '../src/engine/ingest/backlinks';
import { importCrawlCsv } from '../src/engine/ingest/crawl-csv';
import { importGa4 } from '../src/engine/ingest/ga4';
import { importGsc } from '../src/engine/ingest/gsc';
import { buildSiteData } from '../src/engine/site';

const dir = path.join(process.cwd(), 'samples');
const bytes = (f: string) => new Uint8Array(readFileSync(path.join(dir, f)));
const { urls, ctx } = buildSiteData({
  gsc: importGsc('search-console-performance.zip', bytes('search-console-performance.zip')),
  gscQueries: importGsc('search-console-page-queries.csv', bytes('search-console-page-queries.csv')),
  ga4: importGa4(bytes('ga4-landing-pages.csv')),
  crawl: { pages: importCrawlCsv(bytes('screaming-frog-internal-html.csv')).pages },
  backlinks: { pages: importBacklinks(bytes('ahrefs-best-by-links.csv')).pages },
  today: '2026-10-14',
});

const month = (n: number) => (n * 30) / ctx.periodDays;
const PROTECTED = /^\/($|about|contact|privacy|terms|cookies|delivery|returns|faq|help|account|cart|checkout)/;
const NOTES: Record<string, string> = {
  leave: 'Doing its job; no change needed.',
  refresh: 'Traffic falling against last period; update it.',
  expand: 'Ranks on page two for real demand; add depth.',
  redirect: 'No search traffic but has links; point it at the closest page.',
  prune: 'No traffic, no links, thin; remove it.',
};

// A small deterministic hash so a few borderline pages get a second opinion, as a real reviewer would.
const h = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) / 4294967296;

const rows: string[][] = [];
for (const u of [...urls].sort((a, b) => a.path.localeCompare(b.path))) {
  const c = u.crawl;
  if (c && (c.status !== 200 || !c.indexable || (c.canonicalPath && c.canonicalPath !== u.path))) continue; // not scored by Rankcall
  const clicks = month(u.gsc?.clicks ?? 0);
  const impressions = month(u.gsc?.impressions ?? 0);
  const prev = u.gsc?.prevClicks != null ? month(u.gsc.prevClicks) : null;
  const pos = u.gsc?.position ?? null;
  const links = u.backlinks?.referringDomains ?? 0;
  const conv = u.ga4?.conversions ?? 0;
  const words = c?.wordCount ?? 0;
  let v: string;
  if (PROTECTED.test(u.path) || conv > 0) v = 'leave';
  else if (clicks < 1 && impressions < 30) v = links > 0 ? 'redirect' : words < 600 ? 'prune' : 'redirect';
  else if (prev != null && prev > 20 && clicks < prev * 0.7) v = 'refresh';
  else if (pos != null && pos >= 8 && pos <= 20 && impressions >= 300) v = 'expand';
  else v = 'leave';
  // Borderline judgement calls: about one page in eight goes the other way.
  const r = h(u.path);
  if (r < 0.06 && v === 'leave' && !PROTECTED.test(u.path) && conv === 0) v = 'refresh';
  else if (r > 0.94 && v === 'refresh') v = 'expand';
  rows.push([u.path, v, `Sample label: ${NOTES[v]}`]);
}

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const out = ['path,expert_verdict,notes', ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n';
writeFileSync(path.join(dir, 'accuracy-expert-labels.csv'), out);
const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r[1]] = (m[r[1]] ?? 0) + 1), m), {});
console.log(`Wrote ${rows.length} sample labels`, counts);
