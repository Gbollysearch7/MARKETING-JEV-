/** Module 5 (Content Brief and Editorial Decision Desk): shared types. Pure, no Next imports. */

export const GO_OPTIONS = ['create', 'expand_existing', 'skip'] as const;
export type Go = (typeof GO_OPTIONS)[number];

export const INTENTS = ['informational', 'commercial', 'transactional', 'local', 'navigational'] as const;
export type Intent = (typeof INTENTS)[number];

export const FORMATS = ['guide', 'comparison', 'listicle', 'tool_page', 'product_or_category', 'faq', 'video_first', 'template'] as const;
export type Format = (typeof FORMATS)[number];

export const LENGTHS = ['600_900', '1000_1500', '1800_2500', '3000_plus'] as const;
export type Length = (typeof LENGTHS)[number];

export const EDGES = ['first_hand_testing', 'original_data', 'clearer_comparison', 'more_current', 'local_relevance', 'deeper_coverage'] as const;
export type Edge = (typeof EDGES)[number];

export const STATUSES = ['proposed', 'approved', 'writing', 'published', 'measured'] as const;
export type BriefStatus = (typeof STATUSES)[number];

export type VolumeSource = 'search_console' | 'user' | 'cluster' | 'sample' | 'none';
export type Router = 'auto' | 'review' | 'uncertain';

export interface TargetKeyword {
  keyword: string;
  /** Monthly searches (user, cluster or sample), or monthly Search Console impressions when `volumeSource` is search_console. */
  volume: number | null;
  /** Average position from the latest Search Console page-and-query data. */
  position: number | null;
  /** The site page that earns most impressions for this keyword. */
  path: string | null;
}

/** A target as the engine sees it. */
export interface TargetData {
  primary: string;
  keywords: TargetKeyword[];
  relevance: number;
  volumeSource: VolumeSource;
}

/** Existing coverage on the site, computed in code from Search Console and the URL table. */
export interface Coverage {
  path: string | null;
  title: string | null;
  position: number | null;
  /** Other site pages (not `path`) ranking in the top 20 for any of the target's keywords. */
  otherPages: number;
}

/** Facts about the site that the edge and source suggestions draw on. */
export interface SiteFacts {
  sellsInTopic: boolean;
  hasSearchConsole: boolean;
  hasGa4: boolean;
  hasCrawl: boolean;
}

export interface Pick<T extends string = string> { choice: T; p: number; probs: Record<string, number> }

export interface Decision {
  go: Pick<Go>;
  intent: Pick<Intent> | null;
  format: Pick<Format> | null;
  angle: Pick | null;
  length: Pick<Length> | null;
  edge: Pick<Edge> | null;
  router: Router;
  /** Built in code from the bands Jev saw. */
  reasons: string[];
  /** For skip and expand_existing: what would change the call. Built in code. */
  change: string[];
  angles: AngleOption[];
  bands: Record<string, string>;
  model: string;
  decidedAt: string;
}

export interface AngleOption { key: string; label: string; criteria: string }

export interface OutlineSection { h2: string; answers: string[]; note: string }
export interface LinkSuggestion { path: string; title: string | null; why: string }

export interface BriefContent {
  titleOptions: string[];
  title: string;
  queries: TargetKeyword[];
  format: Format;
  angle: string;
  angleLabel: string;
  length: Length;
  edge: Edge;
  edgeLine: string;
  outline: OutlineSection[];
  linksTo: LinkSuggestion[];
  linksFrom: LinkSuggestion[];
  sources: string[];
}
