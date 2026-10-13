import type { ChoiceQuestion, NoulQuestion, Questions } from '../jev/types';
import type { Bands, Signals } from './signals';
import type { UrlData, Verdict } from './types';

export const CRITERIA_VERSION = 'content-verdict.v1';

export const VERDICT_CRITERIA: Record<Verdict, string> = {
  refresh: 'Keep the URL and update the content. Fits when impressions hold but clicks or position are decaying, the content is over 12 months old, or it contains claims that go out of date.',
  expand: 'Keep the URL and add depth. Fits when the page ranks around positions 8 to 20 for queries with real search volume and the content is thin for the topic.',
  merge: 'Combine this page into a stronger sibling. Fits when another page on the site competes for the same queries (see `overlap`) and this page is clearly the weaker one.',
  redirect: 'Send a 301 redirect to the best matching page. Fits when the page gets no meaningful traffic but has referring domains or historic equity, and a close topical match exists.',
  prune: 'Remove the page and return 410. Fits when the page has no traffic, no referring domains and no conversions, is not a legal or navigational page, and is thin or duplicate.',
  leave: 'No action. Fits when the page performs to its potential, was recently updated, or is a protected page type.',
};

export interface Candidate { key: string; path: string; title: string }

/** The filtered state for one URL. Only titles, a short excerpt, top queries and named bands. */
export function buildState(u: UrlData, s: Signals, bands: Bands, competingTitles: Map<string, string>) {
  return {
    page: {
      url_path: u.path,
      page_type: s.pageType,
      title: u.crawl?.title || undefined,
      h1: u.crawl?.h1 || undefined,
      meta_description: u.crawl?.metaDescription || undefined,
      top_queries: s.topQueries.map((q) => q.query),
      headings: u.crawl?.headings?.length ? u.crawl.headings.slice(0, 8) : undefined,
      excerpt: u.crawl?.excerpt ? u.crawl.excerpt.slice(0, 600) : undefined,
    },
    performance: {
      monthly_clicks: bands.monthly_clicks,
      click_trend: bands.click_trend,
      impression_trend: bands.impression_trend,
      average_position: bands.average_position,
      position_change: bands.position_change,
      ctr_vs_expected: bands.ctr_vs_expected,
      ranks_8_to_20_for_high_volume_queries: bands.ranks_8_to_20_for_high_volume_queries,
    },
    engagement: { sessions: bands.sessions, conversions: bands.conversions },
    links: { referring_domains: bands.referring_domains, internal_inlinks: bands.internal_inlinks },
    content: { word_count: bands.word_count, content_age: bands.content_age },
    overlap: {
      competing_pages: s.competing.map((c) => ({
        url_path: c.path,
        title: competingTitles.get(c.path) || undefined,
        shared_top_20_queries: c.shared >= 10 ? '10_or_more' : c.shared >= 6 ? '6_to_9' : '3_to_5',
        competitor_is_stronger: c.stronger ? 'yes' : 'no',
      })),
    },
  };
}

export function buildQuestions(allowed: Verdict[], candidates: Candidate[], hasQueries: boolean, hasExcerpt: boolean): Questions {
  const criteria: Record<string, string> = {};
  for (const v of allowed) criteria[v] = VERDICT_CRITERIA[v];
  const verdict: ChoiceQuestion = {
    type: 'choice',
    instructions: 'Which single action should the SEO team take on `page`, given `performance`, `engagement`, `links`, `content` and `overlap`? The bands are already calculated; treat "unknown" as missing data, not as zero.',
    criteria,
  };
  const qs: Questions = { verdict };
  if (candidates.length) {
    const tc: Record<string, string | null> = { none: 'None of the candidates covers the same topic closely enough.' };
    for (const c of candidates) tc[c.key] = `${c.path}${c.title ? ` (${c.title})` : ''}`;
    qs.target = {
      type: 'choice',
      instructions: 'If `page` were merged into or redirected to another page on the same site, which candidate is the closest topical match for a reader who wanted `page`?',
      criteria: tc,
    } satisfies ChoiceQuestion;
  }
  if (hasQueries) {
    qs.title_matches_queries = {
      type: 'noul',
      instructions: 'Does `page.title` promise what the searches in `page.top_queries` are looking for?',
    } satisfies NoulQuestion;
  }
  if (hasExcerpt) {
    qs.time_sensitive = {
      type: 'noul',
      instructions: 'Does `page.excerpt` contain claims that go out of date, such as a specific year, prices, statistics, or words like "latest" or "this year"?',
    } satisfies NoulQuestion;
  }
  return qs;
}
