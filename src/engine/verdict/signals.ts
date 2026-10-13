import { templateOf } from '../ingest/url';
import type { CannibalPair, SiteContext, UrlData } from './types';

export type PageType = 'home' | 'legal' | 'navigational' | 'archive' | 'product' | 'article' | 'other';

const LEGAL = /\/(privacy|privacy-policy|terms|terms-of-service|terms-and-conditions|cookie|cookies|cookie-policy|legal|disclaimer|imprint|gdpr|accessibility|risk-disclosure|refund-policy|returns-policy)(\/|$)/;
const NAV = /\/(contact|contact-us|about|about-us|login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|cart|basket|checkout|search|sitemap|careers|jobs|pricing|faq|help|support)(\/|$)/;
const ARCHIVE = /\/(category|categories|tag|tags|author|authors|page)(\/|$)/;
const PRODUCT = /\/(product|products|p|item|shop|store)\//;

export function pageTypeOf(path: string): PageType {
  if (path === '/') return 'home';
  if (LEGAL.test(path)) return 'legal';
  if (NAV.test(path)) return 'navigational';
  if (ARCHIVE.test(path)) return 'archive';
  if (PRODUCT.test(path)) return 'product';
  if (/\/(blog|news|articles|insights|guides|resources|learn|posts)\//.test(path) || path.split('/').filter(Boolean).length >= 1) return 'article';
  return 'other';
}

export const isProtectedType = (t: PageType) => t === 'home' || t === 'legal' || t === 'navigational';

/** Numbers computed in code. Jev never sees these raw values, only the bands below. */
export interface Signals {
  pageType: PageType;
  template: string;
  monthlyClicks: number;
  monthlyImpressions: number;
  prevMonthlyClicks: number | null;
  clickChangePct: number | null;
  impressionChangePct: number | null;
  position: number | null;
  prevPosition: number | null;
  ctr: number | null;
  expectedCtr: number | null;
  wordCount: number | null;
  ageDays: number | null;
  sessions: number | null;
  conversions: number | null;
  referringDomains: number | null;
  inlinks: number | null;
  highVolumeQueries8to20: number;
  topQueries: { query: string; impressions: number; clicks: number; position: number }[];
  competing: { path: string; shared: number; stronger: boolean }[];
}

/** Named bands passed to Jev. Each is a short label plus a plain description. */
export interface Bands {
  monthly_clicks: string;
  click_trend: string;
  impression_trend: string;
  average_position: string;
  position_change: string;
  ctr_vs_expected: string;
  ranks_8_to_20_for_high_volume_queries: string;
  sessions: string;
  conversions: string;
  referring_domains: string;
  internal_inlinks: string;
  word_count: string;
  content_age: string;
}

export function ctrAt(curve: number[], position: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position >= 20) return curve[19] * Math.max(0.2, 20 / position);
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  const at = (p: number) => curve[Math.min(20, Math.max(1, p)) - 1];
  return lo === hi ? at(lo) : at(lo) + (at(hi) - at(lo)) * (position - lo);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function computeSignals(u: UrlData, ctx: SiteContext, pairs: CannibalPair[], clicksByPath: Map<string, number>): Signals {
  const perMonth = 30 / Math.max(1, ctx.periodDays);
  const g = u.gsc;
  const monthlyClicks = g ? g.clicks * perMonth : 0;
  const monthlyImpressions = g ? g.impressions * perMonth : 0;
  const prevMonthlyClicks = g && g.prevClicks != null ? g.prevClicks * perMonth : null;
  const pct = (cur: number, prev: number | null | undefined) => (prev != null && prev >= 10 ? (cur - prev) / prev : null);
  const position = g && g.impressions > 0 ? g.position : null;
  const sorted = [...u.queries].sort((a, b) => b.impressions - a.impressions);
  const competing = pairs
    .filter((p) => p.a === u.path || p.b === u.path)
    .map((p) => {
      const other = p.a === u.path ? p.b : p.a;
      return { path: other, shared: p.shared.length, stronger: p.primary === other && (clicksByPath.get(other) ?? 0) >= (clicksByPath.get(u.path) ?? 0) };
    })
    .sort((a, b) => Number(b.stronger) - Number(a.stronger) || b.shared - a.shared)
    .slice(0, 5);
  return {
    pageType: pageTypeOf(u.path),
    template: templateOf(u.path),
    monthlyClicks,
    monthlyImpressions,
    prevMonthlyClicks,
    clickChangePct: g ? pct(g.clicks, g.prevClicks) : null,
    impressionChangePct: g ? pct(g.impressions, g.prevImpressions) : null,
    position,
    prevPosition: g?.prevPosition ?? null,
    ctr: g && g.impressions > 0 ? g.clicks / g.impressions : null,
    expectedCtr: position ? ctrAt(ctx.ctrCurve, position) : null,
    wordCount: u.crawl?.wordCount ?? null,
    ageDays: u.crawl?.lastModified ? daysBetween(u.crawl.lastModified, ctx.today) : null,
    sessions: u.ga4 ? u.ga4.sessions : ctx.hasGa4 ? 0 : null,
    conversions: u.ga4 ? u.ga4.conversions : ctx.hasGa4 ? 0 : null,
    referringDomains: u.backlinks ? u.backlinks.referringDomains : ctx.hasBacklinks ? 0 : null,
    inlinks: u.crawl?.inlinks ?? null,
    highVolumeQueries8to20: u.queries.filter((q) => q.position >= 8 && q.position <= 20 && q.impressions >= ctx.highVolumeImpressions).length,
    topQueries: sorted.slice(0, 8).map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: q.position })),
    competing,
  };
}

const trend = (pct: number | null, known: boolean) => {
  if (!known) return 'unknown (no previous period uploaded)';
  if (pct == null) return 'too_little_data (under 10 in the previous period)';
  if (pct > 0.15) return 'growing (up more than 15% on the previous period)';
  if (pct >= -0.15) return 'stable (within 15% of the previous period)';
  if (pct >= -0.4) return 'declining (down 15% to 40% on the previous period)';
  return 'declining_sharply (down more than 40% on the previous period)';
};

export function toBands(s: Signals, ctx: SiteContext): Bands {
  const c = s.monthlyClicks;
  const pos = s.position;
  return {
    monthly_clicks: !ctx.hasGsc ? 'unknown' : c < 1 ? 'none' : c < 10 ? 'very_low (under 10 a month)' : c < 100 ? 'low (10 to 100 a month)' : c < 1000 ? 'medium (100 to 1,000 a month)' : 'high (over 1,000 a month)',
    click_trend: trend(s.clickChangePct, ctx.hasPrevious),
    impression_trend: trend(s.impressionChangePct, ctx.hasPrevious),
    average_position: pos == null ? 'not_ranking' : pos <= 3 ? 'top_3' : pos <= 7 ? '4_to_7' : pos <= 20 ? '8_to_20' : pos <= 50 ? '21_to_50' : 'beyond_50',
    position_change:
      pos == null || s.prevPosition == null ? 'unknown' : s.prevPosition - pos > 2 ? 'improved (up more than 2 places)' : pos - s.prevPosition > 2 ? 'dropped (down more than 2 places)' : 'stable',
    ctr_vs_expected:
      s.ctr == null || !s.expectedCtr ? 'unknown' : s.ctr < 0.6 * s.expectedCtr ? 'below_expected for its position' : s.ctr > 1.4 * s.expectedCtr ? 'above_expected for its position' : 'in_line with its position',
    ranks_8_to_20_for_high_volume_queries: !ctx.hasQueries ? 'unknown' : s.highVolumeQueries8to20 > 0 ? `yes (${s.highVolumeQueries8to20 >= 5 ? '5 or more' : '1 to 4'} queries)` : 'no',
    sessions: s.sessions == null ? 'unknown' : s.sessions * (30 / ctx.periodDays) < 1 ? 'none' : s.sessions * (30 / ctx.periodDays) < 100 ? 'low' : s.sessions * (30 / ctx.periodDays) < 1000 ? 'medium' : 'high',
    conversions: s.conversions == null ? 'unknown' : s.conversions < 1 ? 'none' : s.conversions < 10 ? 'some (1 to 9)' : 'many (10 or more)',
    referring_domains: s.referringDomains == null ? 'unknown' : s.referringDomains === 0 ? 'none' : s.referringDomains < 5 ? '1_to_4' : s.referringDomains < 20 ? '5_to_19' : '20_or_more',
    internal_inlinks: s.inlinks == null ? 'unknown' : s.inlinks === 0 ? 'orphan (no internal links in)' : s.inlinks <= 3 ? 'few (1 to 3)' : s.inlinks <= 20 ? 'some (4 to 20)' : 'many (over 20)',
    word_count: s.wordCount == null ? 'unknown' : s.wordCount < 300 ? 'very_thin (under 300 words)' : s.wordCount < 700 ? 'thin (300 to 700 words)' : s.wordCount < 1500 ? 'moderate (700 to 1,500 words)' : s.wordCount < 3000 ? 'long (1,500 to 3,000 words)' : 'very_long (over 3,000 words)',
    content_age: s.ageDays == null ? 'unknown' : s.ageDays < 30 ? 'under_30_days' : s.ageDays < 180 ? '1_to_6_months' : s.ageDays < 365 ? '6_to_12_months' : 'over_12_months',
  };
}
