import type { Band, Features, LinkAttr, ProspectInput } from './types';

/** Domain rating (0–100) → band. Missing is "unknown", never zero. */
export function authorityBand(dr: number | null): Band {
  if (dr == null || !Number.isFinite(dr)) return 'unknown';
  if (dr < 10) return 'none';
  if (dr < 30) return 'low';
  if (dr < 60) return 'medium';
  return 'high';
}

/** Monthly organic visits to the referring domain → band. */
export function trafficBand(traffic: number | null): Band {
  if (traffic == null || !Number.isFinite(traffic)) return 'unknown';
  if (traffic < 1) return 'none';
  if (traffic < 1000) return 'low';
  if (traffic < 20000) return 'medium';
  return 'high';
}

export const AUTHORITY_TEXT: Record<Band, string> = {
  unknown: 'unknown (no domain rating in the export)',
  none: 'none (domain rating under 10)',
  low: 'low (domain rating 10 to 29)',
  medium: 'medium (domain rating 30 to 59)',
  high: 'high (domain rating 60 or more)',
};
export const TRAFFIC_TEXT: Record<Band, string> = {
  unknown: 'unknown (no traffic figure in the export)',
  none: 'none (no organic visits)',
  low: 'low (under 1,000 organic visits a month)',
  medium: 'medium (1,000 to 20,000 organic visits a month)',
  high: 'high (over 20,000 organic visits a month)',
};
export const LINK_ATTR_TEXT: Record<LinkAttr, string> = {
  dofollow: 'followed link',
  nofollow: 'nofollow link',
  sponsored: 'marked rel="sponsored" (a disclosed sponsorship, which is allowed and is not by itself link selling)',
  ugc: 'marked rel="ugc" (a comment or forum post)',
  unknown: 'not stated in the export',
};

const SPAM_TERMS: [RegExp, string][] = [
  [/casino|poker|roulette|slots?\b|betting|bet365|sportsbook|gambl/i, 'gambling'],
  [/payday|loans?\b|cash ?advance|credit ?repair|debt relief/i, 'loans'],
  [/essays?\b|term ?papers?|dissertation|homework help|write my paper/i, 'essay writing'],
  [/viagra|cialis|pharma|pharmacy|pills?\b|kamagra|steroids?/i, 'pharma'],
  [/porn|xxx|escort|adult ?dating/i, 'adult'],
  [/replica|fake (watches|bags)/i, 'replicas'],
  [/crypto ?signals?|forex ?signals?|binary options/i, 'trading schemes'],
];

const PAID_FOOTPRINTS: [RegExp, string][] = [
  [/write[- ]?for[- ]?us|guest[- ]?post(s|ing)?\b|submit (a )?guest|contribute/i, 'write_for_us_page'],
  [/sponsored post|paid post|buy (a )?(guest )?post|price list|\$\s?\d+|£\s?\d+|per (post|link)|link insertion|do-?follow links? for sale/i, 'paid_placement_terms'],
  [/(free|top|best) \d{2,} (directories|backlinks)|seo links|link (exchange|building service)|backlink packages?/i, 'link_selling_terms'],
];

/** Lowercase words of 3+ letters, minus filler words. */
const STOP = new Set('the and for with your you our are from this that how what why best top guide guides into over more about can all new not its out get use using vs per who when where which their them has have had was were will just'.split(' '));
export function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w));
}

/** Code-computed features. They feed Jev as named bands and are never a verdict on their own. */
export function featuresOf(p: ProspectInput, brand: { name: string; domain: string }, alreadyLinking: boolean): Features {
  const hay = `${p.domain} ${p.url} ${p.title} ${p.anchor}`;
  const spamTerms = [...new Set(SPAM_TERMS.filter(([re]) => re.test(hay)).map(([, l]) => l))];
  const footprints: string[] = [];
  const label = p.domain.split('.')[0] ?? '';
  if ((label.match(/-/g) ?? []).length >= 3) footprints.push('many_hyphens_in_domain');
  if ((label.match(/\d/g) ?? []).length >= 4) footprints.push('many_digits_in_domain');
  const pageText = `${p.url} ${p.title} ${p.snippet}`;
  for (const [re, l] of PAID_FOOTPRINTS) if (re.test(pageText)) footprints.push(l);
  if (footprints.includes('write_for_us_page') && (footprints.includes('paid_placement_terms') || spamTerms.length)) footprints.push('paid_write_for_us');
  const brandName = brand.name.trim().toLowerCase();
  const text = `${p.title} ${p.snippet}`.toLowerCase();
  const mentionsBrand = (brandName.length >= 3 && text.includes(brandName)) || (brand.domain.length > 3 && text.includes(brand.domain.toLowerCase()));
  return {
    authority: authorityBand(p.dr),
    traffic: trafficBand(p.traffic),
    linkAttr: p.linkAttr,
    spamTerms,
    footprints,
    mentionsBrand,
    alreadyLinking,
  };
}

/** A short summary of what the site is about, from its best page titles: the titles plus the most frequent words. */
export function siteTopics(titles: string[], siteName: string): { titles: string[]; words: string[] } {
  const clean = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 12);
  const counts = new Map<string, number>();
  for (const t of [...clean, siteName]) for (const w of new Set(words(t))) counts.set(w, (counts.get(w) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([w]) => w);
  return { titles: clean, words: top };
}
