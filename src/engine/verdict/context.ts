import type { GscPage, GscPageQuery } from '../ingest/gsc';
import type { CannibalPair, Thresholds } from './types';

/** Typical organic CTR by position, used where the site has too little data at a position. */
export const DEFAULT_CTR = [0.28, 0.16, 0.1, 0.072, 0.054, 0.042, 0.034, 0.028, 0.023, 0.02, 0.017, 0.015, 0.013, 0.012, 0.011, 0.01, 0.009, 0.008, 0.0075, 0.007];

/** The site's own CTR curve by position, from query rows when available, else page rows. Kept monotonic. */
export function ctrCurve(pages: GscPage[], queries: GscPageQuery[]): number[] {
  const rows = queries.length ? queries : pages;
  const clicks = new Array(20).fill(0);
  const imps = new Array(20).fill(0);
  for (const r of rows) {
    const p = Math.round(r.position);
    if (p < 1 || p > 20 || r.impressions <= 0) continue;
    clicks[p - 1] += r.clicks;
    imps[p - 1] += r.impressions;
  }
  const curve = DEFAULT_CTR.map((d, i) => (imps[i] >= 200 ? clicks[i] / imps[i] : d));
  for (let i = 1; i < 20; i++) curve[i] = Math.min(curve[i], curve[i - 1]);
  return curve.map((x) => Math.max(x, 0.001));
}

export function percentile(values: number[], q: number): number {
  if (!values.length) return Infinity;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/**
 * Pages sharing at least N queries where both rank in the top 20 (PRD acceptance criterion).
 * The primary is the page earning more clicks on the shared queries.
 */
export function findCannibalPairs(queries: GscPageQuery[], t: Thresholds, scored: Set<string>): CannibalPair[] {
  const byQuery = new Map<string, GscPageQuery[]>();
  for (const q of queries) {
    if (q.position > 20 || q.position <= 0 || !scored.has(q.path)) continue;
    const list = byQuery.get(q.query) ?? [];
    list.push(q);
    byQuery.set(q.query, list);
  }
  const pairShared = new Map<string, { a: string; b: string; shared: CannibalPair['shared']; clicksA: number; clicksB: number }>();
  for (const [query, list] of byQuery) {
    if (list.length < 2 || list.length > 30) continue; // very broad queries add noise, not signal
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [x, y] = list[i].path < list[j].path ? [list[i], list[j]] : [list[j], list[i]];
        const key = `${x.path}\u0000${y.path}`;
        const e = pairShared.get(key) ?? { a: x.path, b: y.path, shared: [], clicksA: 0, clicksB: 0 };
        e.shared.push({ query, impressions: x.impressions + y.impressions, posA: x.position, posB: y.position });
        e.clicksA += x.clicks;
        e.clicksB += y.clicks;
        pairShared.set(key, e);
      }
    }
  }
  const out: CannibalPair[] = [];
  for (const e of pairShared.values()) {
    if (e.shared.length < t.cannibalSharedQueries) continue;
    const avg = (k: 'posA' | 'posB') => e.shared.reduce((s, q) => s + q[k], 0) / e.shared.length;
    const primary = e.clicksA !== e.clicksB ? (e.clicksA > e.clicksB ? e.a : e.b) : avg('posA') <= avg('posB') ? e.a : e.b;
    out.push({ a: e.a, b: e.b, primary, shared: e.shared.sort((p, q) => q.impressions - p.impressions) });
  }
  return out.sort((p, q) => q.shared.length - p.shared.length);
}
