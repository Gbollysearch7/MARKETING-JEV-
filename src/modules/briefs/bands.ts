import type { Coverage, TargetData } from './types';

/** Named bands. Jev never sees a raw number; every band carries its range in words. */

export function volumeBand(n: number | null): string {
  if (n == null) return 'unknown';
  if (n <= 0) return 'none';
  if (n < 50) return 'very_low (under 50 a month)';
  if (n < 500) return 'low (50 to 499 a month)';
  if (n < 2000) return 'medium (500 to 1,999 a month)';
  if (n < 10000) return 'high (2,000 to 9,999 a month)';
  return 'very_high (10,000 or more a month)';
}

export function positionBand(p: number | null): string {
  if (p == null) return 'not_ranking';
  if (p <= 3) return 'top_3';
  if (p <= 10) return '4_to_10';
  if (p <= 20) return '11_to_20';
  if (p <= 50) return '21_to_50';
  return 'beyond_50';
}

export function relevanceBand(r: number): string {
  const n = Math.min(5, Math.max(1, Math.round(r)));
  return ['very_low (1 of 5, off-topic for the business)', 'low (2 of 5)', 'medium (3 of 5)', 'high (4 of 5)', 'very_high (5 of 5, core to what the business sells)'][n - 1];
}

export function countBand(n: number): string {
  if (n <= 1) return 'one';
  if (n <= 4) return '2_to_4';
  if (n <= 10) return '5_to_10';
  return 'more_than_10';
}

/** Total demand: summed volumes of the target's keywords, or null when none is known. */
export function totalVolume(t: TargetData): number | null {
  const known = t.keywords.filter((k) => k.volume != null);
  return known.length ? known.reduce((s, k) => s + (k.volume ?? 0), 0) : null;
}

export const VOLUME_SOURCE_LABEL: Record<TargetData['volumeSource'], string> = {
  search_console: 'search_console_impressions (a floor on demand: only searches where the site already appears)',
  user: 'keyword_tool (entered by the user)',
  cluster: 'keyword_tool (from keyword clusters)',
  sample: 'keyword_tool (sample figures)',
  none: 'unknown',
};

/**
 * The page that already covers the target: the page with most keyword matches ranking in the top 20,
 * tie-broken by best position. Other ranking pages are counted.
 */
export function coverageOf(t: TargetData, titles: Map<string, string | null>): Coverage {
  const byPath = new Map<string, { n: number; best: number }>();
  for (const k of t.keywords) {
    if (!k.path || k.position == null || k.position > 20) continue;
    const a = byPath.get(k.path) ?? { n: 0, best: 999 };
    a.n++;
    a.best = Math.min(a.best, k.position);
    byPath.set(k.path, a);
  }
  const ranked = [...byPath.entries()].sort((a, b) => b[1].n - a[1].n || a[1].best - b[1].best);
  if (!ranked.length) return { path: null, title: null, position: null, otherPages: 0 };
  const [path, a] = ranked[0];
  return { path, title: titles.get(path) ?? null, position: a.best, otherPages: ranked.length - 1 };
}
