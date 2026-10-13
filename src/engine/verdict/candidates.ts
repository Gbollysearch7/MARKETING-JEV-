const STOP = new Set('a an and are as at be by for from how in is it of on or the to what why with you your vs best guide top'.split(' '));

export function tokens(...parts: (string | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const p of parts) {
    for (const t of (p ?? '').toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 2 && !STOP.has(t)) out.add(t);
  }
  return out;
}

/**
 * Topical neighbours by shared tokens (title, H1, path, top queries), via an inverted index so it
 * stays fast at tens of thousands of pages. Tokens on more than 5% of pages are ignored as noise.
 */
export function similarPages(docs: Map<string, Set<string>>, k: number): Map<string, { path: string; score: number }[]> {
  const index = new Map<string, string[]>();
  for (const [path, toks] of docs) for (const t of toks) (index.get(t) ?? index.set(t, []).get(t)!).push(path);
  const maxDf = Math.max(3, Math.floor(docs.size * 0.05));
  const out = new Map<string, { path: string; score: number }[]>();
  for (const [path, toks] of docs) {
    const overlap = new Map<string, number>();
    for (const t of toks) {
      const posting = index.get(t)!;
      if (posting.length > maxDf) continue;
      for (const other of posting) if (other !== path) overlap.set(other, (overlap.get(other) ?? 0) + 1);
    }
    const ranked = [...overlap.entries()]
      .map(([other, n]) => ({ path: other, score: n / (toks.size + docs.get(other)!.size - n) }))
      .filter((x) => x.score >= 0.12)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    out.set(path, ranked);
  }
  return out;
}
