import type { BacklinkPage } from '../ingest/backlinks';
import type { CrawlPage } from '../ingest/crawl-csv';
import type { Ga4Page } from '../ingest/ga4';
import type { GscPage, GscPageQuery } from '../ingest/gsc';

export const VERDICTS = ['refresh', 'expand', 'merge', 'redirect', 'prune', 'leave'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Prune and Redirect always need explicit approval (PRD section 5, first 90 days of an account). */
export const IRREVERSIBLE: Verdict[] = ['prune', 'redirect'];

export type Router = 'auto' | 'review' | 'uncertain';

/** Everything known about one URL after joining the uploads. */
export interface UrlData {
  path: string;
  gsc: GscPage | null;
  ga4: Ga4Page | null;
  crawl: CrawlPage | null;
  backlinks: BacklinkPage | null;
  queries: GscPageQuery[];
}

export interface SiteContext {
  /** Length of the Search Console period in days, used to express clicks per month. */
  periodDays: number;
  hasGsc: boolean;
  hasPrevious: boolean;
  hasQueries: boolean;
  hasGa4: boolean;
  hasCrawl: boolean;
  hasBacklinks: boolean;
  /** CTR by integer position 1..20, from this site's own data where there is enough of it. */
  ctrCurve: number[];
  /** 75th percentile of query impressions, used to call a query "high volume". */
  highVolumeImpressions: number;
  today: string; // YYYY-MM-DD
  thresholds: Thresholds;
}

export interface Thresholds {
  auto: number;
  review: number;
  /** Conversions in the period at or above which a page is never pruned or redirected. */
  protectConversions: number;
  protectNewerThanDays: number;
  cannibalSharedQueries: number;
  /** Below this many impressions a month with no clicks, a page has no search demand to refresh or expand into. */
  minMonthlyImpressionsForDemand: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  auto: 0.85,
  review: 0.6,
  protectConversions: 1,
  protectNewerThanDays: 30,
  cannibalSharedQueries: 3,
  minMonthlyImpressionsForDemand: 30,
};

export interface CannibalPair {
  a: string;
  b: string;
  primary: string;
  shared: { query: string; impressions: number; posA: number; posB: number }[];
}

export interface ImpactRange { low: number; high: number }
