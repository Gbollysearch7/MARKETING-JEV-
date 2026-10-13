import type { Bands } from './signals';
import type { SiteContext, Verdict } from './types';

const PAIR_HINTS: Record<string, string> = {
  'expand|refresh': 'Compare the page with the top-ranking pages for its queries: is the gap freshness or depth?',
  'merge|refresh': 'Check whether the competing page satisfies the same searcher; if it does, merge, if not, refresh and differentiate.',
  'expand|merge': 'Check whether the competing page already covers the missing depth; if it does, merge into it.',
  'prune|redirect': 'Backlink data decides this: referring domains or historic traffic favour Redirect, none favours Prune.',
  'leave|refresh': 'A longer Search Console comparison (6 to 12 months) would show whether the decline is real or seasonal.',
  'expand|leave': 'Check impressions for queries at positions 8 to 20; if they are material, Expand.',
  'leave|merge': 'Query-level data would show whether the two URLs split clicks on the same searches.',
  'leave|prune': 'Conversion and backlink data would show whether the page carries value that traffic does not.',
  'leave|redirect': 'Backlink data would show whether the page has equity worth passing on.',
};

/** For uncertain verdicts: what evidence would settle the call (PRD section 5, confidence handling). */
export function settleEvidence(top: Verdict[], bands: Bands, ctx: SiteContext): string[] {
  const out: string[] = [];
  const key = [...top].sort().join('|');
  if (PAIR_HINTS[key]) out.push(PAIR_HINTS[key]);
  if (!ctx.hasPrevious) out.push('Upload a Search Console export with Compare turned on, so the click trend is known.');
  if (!ctx.hasQueries) out.push('Upload page and query data, so overlap with other pages is known.');
  if (bands.conversions === 'unknown') out.push('Upload GA4 landing page data, so conversions are known.');
  if (bands.referring_domains === 'unknown' && top.some((v) => v === 'prune' || v === 'redirect')) out.push('Upload a backlinks export, so referring domains are known.');
  if (bands.content_age === 'unknown') out.push('Upload a crawl with last-modified dates, so content age is known.');
  if (!out.length) out.push('Manual review of the page against its top queries.');
  return out.slice(0, 3);
}
