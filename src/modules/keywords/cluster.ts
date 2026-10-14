/**
 * Topic clustering in code (no embeddings): IDF-weighted token overlap on a sparse nearest-neighbour graph,
 * then average-linkage agglomerative grouping above a threshold. Singletons are allowed.
 */

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'is', 'are', 'it', 'my', 'your', 'with', 'at', 'by', 'do', 'does', 'i', 'can', 'be', 'from', 'as']);

/** Modifier words that never make two keywords the same topic on their own. */
export const MODIFIERS = new Set([
  'best', 'top', 'cheap', 'cheapest', 'buy', 'uk', 'review', 'reviews', 'vs', 'versus', 'for', 'near', 'me', 'how', 'what', 'why', 'when', 'where', 'which',
  'guide', 'tips', 'sale', 'deal', 'deals', 'discount', 'price', 'prices', 'online', 'shop', 'store', 'new', 'good', 'women', 'womens', 'men', 'mens', 'kids',
  'beginner', 'beginners', 'choose', 'choosing', 'lightweight', 'budget', 'compare', 'comparison', '2026', '2025', 'should', 'need', 'get', 'use', 'using',
]);

/** Light stemming so "boots"/"boot" and "tents"/"tent" share a token. */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w)) continue;
    const s = stem(w);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export interface Idf { (t: string): number }

/** Inverse document frequency over a list of token sets. Modifiers are down-weighted further. */
export function buildIdf(docs: string[][]): Idf {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length || 1;
  return (t: string) => {
    const base = Math.log(1 + n / (df.get(t) ?? 1));
    return MODIFIERS.has(t) ? base * 0.25 : base;
  };
}

/** Weighted Jaccard of two token sets. Zero unless they share at least one head (non-modifier) term. */
export function similarity(a: string[], b: string[], idf: Idf): number {
  let shared = 0;
  let union = 0;
  let head = false;
  for (const t of a) {
    const w = idf(t);
    union += w;
    if (b.includes(t)) { shared += w; if (!MODIFIERS.has(t)) head = true; }
  }
  for (const t of b) if (!a.includes(t)) union += idf(t);
  return head && union > 0 ? shared / union : 0;
}

export interface ClusterItem { keyword: string; volume: number | null; intent?: string | null }

export interface ClusterOptions {
  /** Minimum average-linkage similarity to merge two groups. */
  threshold?: number;
  /** Neighbours kept per keyword in the sparse graph. */
  neighbours?: number;
  /** Groups never grow beyond this many keywords. */
  maxSize?: number;
}

/** Intents that may share a cluster: comparing and buying the same product is one topic; learning how is another. */
function intentFactor(a?: string | null, b?: string | null): number {
  if (!a || !b || a === b) return 1;
  const buy = new Set(['commercial', 'transactional']);
  if (buy.has(a) && buy.has(b)) return 0.7;
  return 0.5;
}

/** Group keywords into topic clusters. Returns arrays of indexes into `items`. */
export function clusterKeywords(items: ClusterItem[], opts: ClusterOptions = {}): number[][] {
  const threshold = opts.threshold ?? 0.34;
  const k = opts.neighbours ?? 15;
  const maxSize = opts.maxSize ?? 80;
  const toks = items.map((i) => tokens(i.keyword));
  const idf = buildIdf(toks);
  const sim = (i: number, j: number) => similarity(toks[i], toks[j], idf) * intentFactor(items[i].intent, items[j].intent);

  // Sparse k-nearest-neighbour graph through an inverted index on head terms.
  const index = new Map<string, number[]>();
  toks.forEach((ts, i) => { for (const t of ts) if (!MODIFIERS.has(t)) (index.get(t) ?? index.set(t, []).get(t)!).push(i); });
  const edges: { i: number; j: number; s: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const seen = new Set<number>();
    const cand: { j: number; s: number }[] = [];
    for (const t of toks[i]) {
      const list = index.get(t);
      if (!list) continue;
      for (const j of list) {
        if (j <= i || seen.has(j)) continue;
        seen.add(j);
        const s = sim(i, j);
        if (s >= threshold * 0.8) cand.push({ j, s });
      }
    }
    cand.sort((a, b) => b.s - a.s);
    for (const c of cand.slice(0, k)) edges.push({ i, j: c.j, s: c.s });
  }
  edges.sort((a, b) => b.s - a.s || a.i - b.i || a.j - b.j);

  // Average-linkage agglomeration, strongest edges first.
  const groupOf = items.map((_, i) => i);
  const members = new Map<number, number[]>(items.map((_, i) => [i, [i]]));
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])));
  for (const e of edges) {
    const a = find(e.i);
    const b = find(e.j);
    if (a === b) continue;
    const A = members.get(a)!;
    const B = members.get(b)!;
    if (A.length + B.length > maxSize) continue;
    let total = 0;
    for (const x of A) for (const y of B) total += sim(x, y);
    if (total / (A.length * B.length) < threshold) continue;
    const [keep, drop] = A.length >= B.length ? [a, b] : [b, a];
    groupOf[drop] = keep;
    members.set(keep, [...members.get(keep)!, ...members.get(drop)!]);
    members.delete(drop);
  }
  return [...members.values()].map((m) => m.sort((x, y) => x - y));
}

/** The cluster's auto name: its highest-volume keyword (ties: the shortest, then alphabetical). */
export function clusterName(keywords: { keyword: string; volume: number | null }[]): string {
  const best = [...keywords].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.length - b.keyword.length || a.keyword.localeCompare(b.keyword))[0];
  return best?.keyword ?? 'Untitled cluster';
}
