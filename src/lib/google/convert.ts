/**
 * Turn Search Console and GA4 API rows into exactly the shapes the CSV importers produce
 * (GscImport for the pages and page-and-query slots, Ga4Import for GA4), so siteInputs() and every
 * score downstream work unchanged. Joining rules mirror src/engine/ingest/gsc.ts and ga4.ts.
 */
import type { Ga4Import, Ga4Page } from '../../engine/ingest/ga4';
import type { GscImport, GscPage, GscPageQuery, Period } from '../../engine/ingest/gsc';
import { pathKey } from '../../engine/ingest/url';
import type { Ga4Row, GscRow } from './api';

/** Two URLs can collapse to one path (http/https, trailing slash). Sum them; weight position by impressions. Same as the CSV importer. */
function mergePages(a: GscPage, b: GscPage): GscPage {
  const imp = a.impressions + b.impressions;
  const pos = imp ? (a.position * a.impressions + b.position * b.impressions) / imp : a.position;
  return {
    path: a.path,
    clicks: a.clicks + b.clicks,
    impressions: imp,
    ctr: imp ? (a.clicks + b.clicks) / imp : 0,
    position: pos,
    prevClicks: a.prevClicks == null ? b.prevClicks : a.prevClicks + (b.prevClicks ?? 0),
    prevImpressions: a.prevImpressions == null ? b.prevImpressions : a.prevImpressions + (b.prevImpressions ?? 0),
    prevPosition: a.prevPosition ?? b.prevPosition,
  };
}

/**
 * Pages with the previous period, like a Search Console export with Compare on. `current` and `previous`
 * are rows with dimensions ['page']. Pages seen only in the previous period are kept with zero current traffic.
 */
export function gscPagesImport(current: GscRow[], previous: GscRow[], period: Period, notes: string[] = []): GscImport {
  const prevBy = new Map<string, GscRow>();
  for (const r of previous) prevBy.set(r.keys[0], r);
  const urls = [...new Set([...current.map((r) => r.keys[0]), ...previous.map((r) => r.keys[0])])];
  const curBy = new Map(current.map((r) => [r.keys[0], r]));
  const merged = new Map<string, GscPage>();
  for (const url of urls) {
    const path = pathKey(url);
    if (!path) continue;
    const c = curBy.get(url);
    const p = prevBy.get(url);
    const page: GscPage = {
      path,
      clicks: c?.clicks ?? 0,
      impressions: c?.impressions ?? 0,
      ctr: c?.ctr ?? 0,
      position: c?.position ?? 0,
      prevClicks: p?.clicks ?? 0,
      prevImpressions: p?.impressions ?? 0,
      prevPosition: p?.position || null,
    };
    const existing = merged.get(path);
    merged.set(path, existing ? mergePages(existing, page) : page);
  }
  const pages = [...merged.values()];
  for (const pg of pages) if (!pg.ctr && pg.impressions) pg.ctr = pg.clicks / pg.impressions;
  return { period, hasPrevious: true, pages, pageQueries: [], notes };
}

/** Page and query rows (dimensions ['page', 'query']), aggregated and with page totals derived as the CSV importer does. */
export function gscQueriesImport(rows: GscRow[], period: Period, notes: string[] = []): GscImport {
  const agg = new Map<string, { path: string; query: string; clicks: number; impressions: number; posImp: number }>();
  for (const r of rows) {
    const path = pathKey(r.keys[0]);
    const query = (r.keys[1] ?? '').trim().toLowerCase();
    if (!path || !query) continue;
    const key = `${path}\u0000${query}`;
    const cur = agg.get(key) ?? { path, query, clicks: 0, impressions: 0, posImp: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    cur.posImp += r.position * r.impressions;
    agg.set(key, cur);
  }
  const pageQueries: GscPageQuery[] = [...agg.values()].map((a) => ({
    path: a.path, query: a.query, clicks: a.clicks, impressions: a.impressions, position: a.impressions ? a.posImp / a.impressions : 0,
  }));
  const pages = new Map<string, GscPage>();
  for (const q of pageQueries) {
    const p = pages.get(q.path) ?? { path: q.path, clicks: 0, impressions: 0, ctr: 0, position: 0, prevClicks: null, prevImpressions: null, prevPosition: null };
    p.position = (p.position * p.impressions + q.position * q.impressions) / Math.max(1, p.impressions + q.impressions);
    p.clicks += q.clicks;
    p.impressions += q.impressions;
    pages.set(q.path, p);
  }
  for (const p of pages.values()) p.ctr = p.impressions ? p.clicks / p.impressions : 0;
  return { period, hasPrevious: false, pages: [...pages.values()], pageQueries, notes: ['Page and query data loaded. Cannibalisation detection is available.', ...notes] };
}

/** GA4 runReport rows by landingPage. Metric order comes from the response's metricHeaders. */
export function ga4Import(rows: Ga4Row[], metrics: string[], period: Period, notes: string[] = []): Ga4Import {
  const idx = (name: string) => metrics.indexOf(name);
  const [iS, iE, iK, iR] = [idx('sessions'), idx('engagedSessions'), idx('keyEvents'), idx('totalRevenue')];
  const val = (r: Ga4Row, i: number) => {
    if (i < 0) return 0;
    const n = Number(r.metricValues[i]?.value);
    return Number.isFinite(n) ? n : 0;
  };
  const pages = new Map<string, Ga4Page>();
  for (const r of rows) {
    const raw = r.dimensionValues[0]?.value ?? '';
    if (!raw.startsWith('/') && !/^https?:/i.test(raw)) continue; // skips "(not set)"
    const path = pathKey(raw);
    if (!path) continue;
    const p = pages.get(path) ?? { path, sessions: 0, engagedSessions: 0, conversions: 0, revenue: 0 };
    p.sessions += val(r, iS);
    p.engagedSessions += val(r, iE);
    p.conversions += val(r, iK);
    p.revenue += val(r, iR);
    pages.set(path, p);
  }
  const out = [...pages.values()];
  const n = [...notes];
  if (iK < 0) n.push('No Key events column. Conversions are treated as unknown, so pages are protected from pruning only by other rules.');
  return { period, pages: out, notes: n };
}
