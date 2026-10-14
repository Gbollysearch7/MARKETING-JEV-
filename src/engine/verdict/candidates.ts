const STOP = new Set('a an and are as at be by for from how in is it of on or the to what why with you your vs best guide top blog news page'.split(' '));

export function tokens(...parts: (string | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const p of parts) {
    for (const t of (p ?? '').toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 2 && !STOP.has(t)) out.add(t);
  }
  return out;
}

/**
 * Topical neighbours by IDF-weighted token overlap (title, H1, path, top queries), via an inverted index so it
 * stays fast at tens of thousands of pages. Rare shared words ("stove") count far more than common ones
 * ("camping"), so a sale page still finds the guide on the same product. Tokens on over 20% of pages are ignored.
 */
export function similarPages(docs: Map<string, Set<string>>, k: number, minScore = 0.08): Map<string, { path: string; score: number }[]> {
  const index = new Map<string, string[]>();
  for (const [path, toks] of docs) for (const t of toks) (index.get(t) ?? index.set(t, []).get(t)!).push(path);
  const n = Math.max(1, docs.size);
  const maxDf = Math.max(3, Math.floor(n * 0.2));
  const idf = new Map<string, number>();
  for (const [t, posting] of index) idf.set(t, posting.length > maxDf ? 0 : Math.log(1 + n / posting.length));
  const norm = new Map<string, number>();
  for (const [path, toks] of docs) norm.set(path, Math.sqrt([...toks].reduce((s, t) => s + (idf.get(t) ?? 0) ** 2, 0)) || 1);

  const out = new Map<string, { path: string; score: number }[]>();
  for (const [path, toks] of docs) {
    const dot = new Map<string, number>();
    for (const t of toks) {
      const w = idf.get(t) ?? 0;
      if (!w) continue;
      for (const other of index.get(t)!) if (other !== path) dot.set(other, (dot.get(other) ?? 0) + w * w);
    }
    const ranked = [...dot.entries()]
      .map(([other, d]) => ({ path: other, score: d / (norm.get(path)! * norm.get(other)!) }))
      .filter((x) => x.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    out.set(path, ranked);
  }
  return out;
}
