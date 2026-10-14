import type { Answers } from '../../engine/jev/types';

export type GateVerdict = 'index' | 'improve' | 'kill';
export const GATE_VERDICTS: GateVerdict[] = ['index', 'improve', 'kill'];
export const GATE_LABEL: Record<GateVerdict, string> = { index: 'Index', improve: 'Improve', kill: 'Kill' };
export const GATE_MEANING: Record<GateVerdict, string> = {
  index: 'Publish and allow indexing',
  improve: 'Hold or publish noindex until fixed',
  kill: 'Do not publish',
};
/** Semantic tokens: good, caution, bad. */
export const GATE_TONE: Record<GateVerdict, 'ok' | 'warn' | 'bad'> = { index: 'ok', improve: 'warn', kill: 'bad' };

export type Router = 'auto' | 'review' | 'uncertain';

/** One page as sent to the gate, after parsing. `body` is plain text (HTML already stripped). */
export interface GatePageInput {
  path: string;
  url: string | null;
  title: string;
  h1: string;
  meta: string;
  body: string;
  query: string;
  template: string;
}

/** Everything the gate computes in code before (or instead of) asking Jev. */
export interface CodeChecks {
  wordCount: number;
  uniqueWords: number;
  /** Share of the page's words that sit inside template text (0..1). */
  templateShare: number;
  /** Max shingle Jaccard against another page in the batch or an existing site page (0..1). */
  duplicateRatio: number;
  duplicateOf: string | null;
  duplicateSource: 'batch' | 'site' | null;
  /** Other pages in this batch sharing over 90% of phrasing with this one (absent on rows scored before it existed). */
  duplicateGroup?: number;
  placeholders: string[];
  duplicateTitleWith: number;
  duplicateH1With: number;
  missingTitle: boolean;
  missingH1: boolean;
  /** Impressions for the exact target query, null when unknown. */
  queryImpressions: number | null;
  /** Impressions across queries containing the head terms, null when unknown. */
  headImpressions: number | null;
  headTerms: string[];
  /** Text outside the template, for Jev and the detail panel. */
  uniqueExcerpt: string;
}

export interface CheckBands {
  unique_words: string;
  template_share: string;
  near_duplicate: string;
  search_demand: string;
  title_unique_in_batch: string;
  h1_unique_in_batch: string;
}

export type Failure =
  | 'placeholder' | 'duplicate' | 'near_duplicate' | 'thin' | 'missing_title' | 'duplicate_title'
  | 'shallow' | 'not_helpful' | 'unverifiable' | 'template_feel' | 'filler' | 'risk' | 'no_demand';

export const FAILURE_LABEL: Record<Failure, string> = {
  placeholder: 'Placeholder text',
  duplicate: 'Duplicate of another page',
  near_duplicate: 'Near-duplicate of a sibling',
  thin: 'Thin outside the template',
  missing_title: 'Missing title or H1',
  duplicate_title: 'Duplicate title or H1',
  shallow: 'Does not cover the title promise',
  not_helpful: 'Would not satisfy the searcher',
  unverifiable: 'Unsourced factual claims',
  template_feel: 'Reads as a filled-in template',
  filler: 'Machine filler',
  risk: 'Brand or legal risk',
  no_demand: 'No search demand found',
};

export interface GateResult {
  verdict: GateVerdict;
  /** Probability of the chosen option; 1 when a hard rule decided. */
  confidence: number;
  probabilities: Partial<Record<GateVerdict, number>>;
  router: Router;
  /** The three strongest reasons, as plain sentences. */
  reasons: string[];
  /** Specific fixes, for Improve (and listed for Kill when a fix exists). */
  fixes: string[];
  failures: Failure[];
  rulesApplied: string[];
  /** 'rules' when a hard rule decided without a model call. */
  model: string;
  latencyMs: number;
  answers: Answers | null;
  state: unknown;
}

export interface GateThresholds { auto: number; review: number }
export const DEFAULT_GATE_THRESHOLDS: GateThresholds = { auto: 0.85, review: 0.6 };
