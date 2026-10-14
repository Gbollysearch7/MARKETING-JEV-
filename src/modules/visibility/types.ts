/** Module 4: AI Search Visibility Tracker. Shared types for the pure engine (no Next imports). */

export const ENGINES = ['chatgpt', 'claude', 'perplexity', 'gemini', 'ai_overviews', 'other'] as const;
export type Engine = (typeof ENGINES)[number];

export const ENGINE_LABEL: Record<Engine, string> = {
  chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', gemini: 'Gemini', ai_overviews: 'AI Overviews', other: 'Other',
};

export type Position = 'first' | 'early' | 'late' | 'absent';
export const POSITION_LABEL: Record<Position, string> = { first: 'First mention', early: 'Early', late: 'Late', absent: 'Not mentioned' };

export const SOURCE_TYPES = ['vendor', 'review_site', 'forum', 'news', 'directory', 'other'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_LABEL: Record<SourceType, string> = {
  vendor: 'Vendor site', review_site: 'Review site', forum: 'Reddit or forum', news: 'News', directory: 'Directory', other: 'Other',
};

export type Sentiment = 'negative' | 'neutral' | 'positive';

export const LOSS_REASONS = ['no_page_covers', 'not_cited_by_trusted_sources', 'competitor_third_party', 'weak_entity', 'blocked_or_walled'] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export type Owner = 'content' | 'pr' | 'technical';
export const OWNER_LABEL: Record<Owner, string> = { content: 'Content', pr: 'PR', technical: 'Technical' };

export type LossStatus = 'open' | 'in_progress' | 'done';
export const LOSS_STATUSES: LossStatus[] = ['open', 'in_progress', 'done'];

export interface Competitor { name: string; domain: string }

export interface BrandConfig {
  name: string;
  aliases: string[];
  domain: string;
  competitors: Competitor[];
}

export interface CitedUrl { url: string; host: string; type: SourceType }

/** Everything code works out from one captured answer. */
export interface ParsedAnswer {
  mentioned: boolean;
  /** Character index of the first brand mention, or null. */
  firstIndex: number | null;
  position: Position;
  cited: CitedUrl[];
  brandCited: boolean;
  /** Competitor names mentioned (by name or domain), in order of first appearance. */
  competitors: string[];
}

/** A highlight span in an answer, for safe rendering (text is split, never parsed as HTML). */
export interface Span { start: number; end: number; kind: 'brand' | 'competitor'; label: string }

export type Router = 'auto' | 'review' | 'uncertain';
