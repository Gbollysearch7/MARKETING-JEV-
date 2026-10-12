import { tokenize } from '../util/text.js';

export interface Candidate {
  id: string;
  score: number;
}

/**
 * TF-IDF cosine candidate generation with no external service.
 * Swap for pgvector embeddings in production; the interface stays the same.
 */
export function topCandidates(docs: { id: string; text: string }[], k: number): Map<string, Candidate[]> {
  const tf = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  for (const d of docs) {
    const counts = new Map<string, number>();
    for (const t of tokenize(d.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    tf.set(d.id, counts);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = docs.length;
  const vectors = new Map<string, Map<string, number>>();
  const norms = new Map<string, number>();
  for (const d of docs) {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of tf.get(d.id)!) {
      const w = (1 + Math.log(c)) * Math.log(1 + n / (df.get(t) ?? 1));
      v.set(t, w);
      norm += w * w;
    }
    vectors.set(d.id, v);
    norms.set(d.id, Math.sqrt(norm) || 1);
  }
  const out = new Map<string, Candidate[]>();
  for (const a of docs) {
    const va = vectors.get(a.id)!;
    const scored: Candidate[] = [];
    for (const b of docs) {
      if (b.id === a.id) continue;
      const vb = vectors.get(b.id)!;
      let dot = 0;
      const [small, large] = va.size < vb.size ? [va, vb] : [vb, va];
      for (const [t, w] of small) {
        const w2 = large.get(t);
        if (w2) dot += w * w2;
      }
      scored.push({ id: b.id, score: dot / (norms.get(a.id)! * norms.get(b.id)!) });
    }
    scored.sort((x, y) => y.score - x.score);
    out.set(a.id, scored.slice(0, k));
  }
  return out;
}
