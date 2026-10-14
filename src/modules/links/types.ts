/** Module 6: Link and Digital PR Opportunity Filter. Shared types for the pure engine. */

export const LINKS_CRITERIA_VERSION = 'links.v1';

export type LinkAttr = 'dofollow' | 'nofollow' | 'sponsored' | 'ugc' | 'unknown';
export type SourceKind = 'ahrefs' | 'semrush' | 'generic';
/** Whether rows are prospects to pitch, or domains that already link to the site. */
export type ImportPurpose = 'prospects' | 'own_profile';

export const SITE_TYPES = ['editorial', 'resource_page', 'guest_post', 'directory', 'forum', 'news', 'link_farm'] as const;
export type SiteType = (typeof SITE_TYPES)[number];
export const PROSPECT_TYPES = ['editorial', 'resource_page', 'guest_post', 'directory', 'unlinked_mention', 'broken_link', 'competitor_linked'] as const;
export type ProspectType = (typeof PROSPECT_TYPES)[number];
export const ANGLES = ['data_study', 'expert_quote', 'resource_suggestion', 'correction', 'partnership', 'ask_for_link'] as const;
export type Angle = (typeof ANGLES)[number];
export const TOXIC_KEYS = ['sells_links', 'pbn_footprint', 'spam_content'] as const;
export type ToxicKey = (typeof TOXIC_KEYS)[number];

export type LinkVerdict = 'pursue' | 'skip' | 'toxic';
export type Band = 'unknown' | 'none' | 'low' | 'medium' | 'high';
export type Level = 'low' | 'medium' | 'high';
export const STATUSES = ['new', 'contacted', 'replied', 'won', 'lost'] as const;
export type OutreachStatus = (typeof STATUSES)[number];

/** One normalised row from an export: one prospect page. */
export interface ProspectInput {
  url: string;
  /** host + lowercased path, the dedupe key. */
  urlKey: string;
  domain: string;
  title: string;
  snippet: string;
  anchor: string;
  dr: number | null;
  traffic: number | null;
  linkAttr: LinkAttr;
}

export interface Features {
  authority: Band;
  traffic: Band;
  linkAttr: LinkAttr;
  /** Spam terms found in the title, URL or domain (casino, loan, essay, pharma …). */
  spamTerms: string[];
  /** Footprints such as many hyphens, many digits, paid "write for us" pages. */
  footprints: string[];
  mentionsBrand: boolean;
  alreadyLinking: boolean;
}

export const SITE_TYPE_LABEL: Record<SiteType, string> = {
  editorial: 'Editorial', resource_page: 'Resource page', guest_post: 'Guest post', directory: 'Directory', forum: 'Forum', news: 'News', link_farm: 'Link farm',
};
export const PROSPECT_TYPE_LABEL: Record<ProspectType, string> = {
  editorial: 'Editorial', resource_page: 'Resource page', guest_post: 'Guest post', directory: 'Directory', unlinked_mention: 'Unlinked mention', broken_link: 'Broken link', competitor_linked: 'Competitor-linked',
};
export const ANGLE_LABEL: Record<Angle, string> = {
  data_study: 'Data study', expert_quote: 'Expert quote', resource_suggestion: 'Resource suggestion', correction: 'Correction', partnership: 'Partnership', ask_for_link: 'Ask for the link',
};
export const VERDICT_LABEL: Record<LinkVerdict, string> = { pursue: 'Pursue', skip: 'Skip', toxic: 'Toxic' };
export const STATUS_LABEL: Record<OutreachStatus, string> = { new: 'New', contacted: 'Contacted', replied: 'Replied', won: 'Won', lost: 'Lost' };
export const TOXIC_LABEL: Record<ToxicKey, string> = { sells_links: 'sells links', pbn_footprint: 'shows a private blog network footprint', spam_content: 'carries spam content' };
