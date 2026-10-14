/**
 * Cross-module contracts. Module 2 (keyword clusters) produces clusters; Module 5 (brief desk) consumes them.
 * Keep these shapes stable: both modules compile against them.
 */
export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'local' | 'junk';
export type BuyingStage = 'awareness' | 'consideration' | 'decision' | 'retention';

export interface ClusterKeyword {
  keyword: string;
  volume: number | null;
  intent: KeywordIntent | null;
  stage: BuyingStage | null;
  /** Current ranking page path from Search Console, when known. */
  currentPath: string | null;
  position: number | null;
}

export interface KeywordCluster {
  id: string;
  name: string;
  keywords: ClusterKeyword[];
  totalVolume: number;
  /** Most common intent among its keywords. */
  intent: KeywordIntent | null;
  stage: BuyingStage | null;
  /** The page that should own this cluster, or null when a new page is needed. */
  mappedPath: string | null;
  /** True when the cluster has no suitable existing page. */
  gap: boolean;
  /** Other pages that also claim this cluster (cannibalisation). */
  alsoClaimedBy: string[];
}

/**
 * Jobs running in this server process. A job row still marked "running" that is not in this set was cut off by a
 * restart (jobs run in memory), so the module marks it failed instead of blocking new runs forever.
 */
const LIVE_KEY = '__rankcallContentJobs';
const g = globalThis as unknown as Record<string, Set<string> | undefined>;
export const liveJobs: Set<string> = (g[LIVE_KEY] ??= new Set<string>());
export const INTERRUPTED = 'Interrupted by a server restart. Run it again.';
