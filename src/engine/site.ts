import type { BacklinkPage } from './ingest/backlinks';
import type { CrawlPage } from './ingest/crawl-csv';
import type { Ga4Import } from './ingest/ga4';
import type { GscImport, GscPage, GscPageQuery, Period } from './ingest/gsc';
import { ctrCurve } from './verdict/context';
import { DEFAULT_THRESHOLDS, type SiteContext, type Thresholds, type UrlData } from './verdict/types';

export interface SiteInputs {
  /** Pages export (zip or Pages.csv), the source of page totals and the previous period. */
  gsc?: GscImport | null;
  /** Page and query export, the source of queries and cannibalisation. */
  gscQueries?: GscImport | null;
  ga4?: Ga4Import | null;
  crawl?: { pages: CrawlPage[] } | null;
  backlinks?: { pages: BacklinkPage[] } | null;
  today: string;
  thresholds?: Thresholds;
}

export const DEFAULT_PERIOD_DAYS = 90; // the Search Console website export defaults to the last 3 months

export function periodDays(p: Period | null | undefined): number | null {
  if (!p) return null;
  return Math.max(1, Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86_400_000) + 1);
}

/** Join every upload on the URL path. The URL set is the crawl plus every page Search Console reports. */
export function buildSiteData(inp: SiteInputs): { urls: UrlData[]; ctx: SiteContext; notes: string[] } {
  const notes: string[] = [];
  const gscPages: GscPage[] = inp.gsc?.pages ?? inp.gscQueries?.pages ?? [];
  const queries: GscPageQuery[] = inp.gscQueries?.pageQueries ?? inp.gsc?.pageQueries ?? [];
  const period = inp.gsc?.period ?? inp.gscQueries?.period ?? inp.ga4?.period ?? null;
  const days = periodDays(period);
  if ((inp.gsc || inp.gscQueries) && !days) notes.push(`Search Console date range unknown; assumed ${DEFAULT_PERIOD_DAYS} days.`);

  const paths = new Set<string>();
  for (const p of inp.crawl?.pages ?? []) paths.add(p.path);
  for (const p of gscPages) paths.add(p.path);
  if (!inp.crawl && !gscPages.length) for (const p of inp.ga4?.pages ?? []) paths.add(p.path);

  const gscBy = new Map(gscPages.map((p) => [p.path, p]));
  const ga4By = new Map((inp.ga4?.pages ?? []).map((p) => [p.path, p]));
  const crawlBy = new Map((inp.crawl?.pages ?? []).map((p) => [p.path, p]));
  const blBy = new Map((inp.backlinks?.pages ?? []).map((p) => [p.path, p]));
  const qBy = new Map<string, GscPageQuery[]>();
  for (const q of queries) (qBy.get(q.path) ?? qBy.set(q.path, []).get(q.path)!).push(q);

  const urls: UrlData[] = [...paths].sort().map((path) => ({
    path,
    gsc: gscBy.get(path) ?? null,
    ga4: ga4By.get(path) ?? null,
    crawl: crawlBy.get(path) ?? null,
    backlinks: blBy.get(path) ?? null,
    queries: qBy.get(path) ?? [],
  }));

  const ctx: SiteContext = {
    periodDays: days ?? DEFAULT_PERIOD_DAYS,
    hasGsc: gscPages.length > 0,
    hasPrevious: Boolean(inp.gsc?.hasPrevious),
    hasQueries: queries.length > 0,
    hasGa4: Boolean(inp.ga4?.pages.length),
    hasCrawl: Boolean(inp.crawl?.pages.length),
    hasBacklinks: Boolean(inp.backlinks?.pages.length),
    ctrCurve: ctrCurve(gscPages, queries),
    highVolumeImpressions: Infinity,
    today: inp.today,
    thresholds: inp.thresholds ?? DEFAULT_THRESHOLDS,
  };
  return { urls, ctx, notes };
}
