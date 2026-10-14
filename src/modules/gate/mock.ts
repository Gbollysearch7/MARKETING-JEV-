import { choiceFromWeights, hash01, normalise } from '../../engine/jev/client';
import { scoreConfidence } from '../../engine/jev/confidence';
import type { Answer, ChoiceQuestion, Question, ScoreQuestion, State } from '../../engine/jev/types';

type S = {
  page: { url_path: string; title?: string; target_query?: string; body_excerpt?: string };
  checks: Record<string, string>;
};

const has = (v: string | undefined, prefix: string) => (v ?? '').startsWith(prefix);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number) => Math.min(0.97, Math.max(0.03, x));

/**
 * Plausible offline answers for the gate battery, driven by the same bands and text Jev sees.
 * Only for running without a key. It is not a model and its confidences are not calibrated.
 */
export function mockGateAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as unknown as S;
  if (!s?.checks || !s.page) return undefined;
  const c = s.checks;
  const body = s.page.body_excerpt ?? '';
  const jitter = (hash01(`${s.page.url_path}|${key}`) - 0.5) * 0.1;
  const thin = has(c.unique_words, 'almost_none') ? 2 : has(c.unique_words, 'few') ? 1 : 0;
  const tmpl = has(c.template_share, 'almost_all') ? 2 : has(c.template_share, 'mostly_template') ? 1 : 0;
  const dup = has(c.near_duplicate, 'near_duplicate') || has(c.near_duplicate, 'duplicate') ? 2 : has(c.near_duplicate, 'overlapping') ? 1 : 0;
  const risky = /guarantee|risk[- ]free|100% safe|never get lost|cure|completely safe/i.test(body);
  const filler = /something for everyone|look no further|whether you(?:'|’)re|is a (?:great|popular|wonderful) (?:place|choice)|in today(?:'|’)s/i.test(body);
  const claims = /\b\d+%|\bstudies show|\bproven\b|\bnumber one\b|\bmost popular\b|\bvoted\b/i.test(body);
  const queryWords = (s.page.target_query ?? s.page.title ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const covers = queryWords.length ? queryWords.filter((w) => body.toLowerCase().includes(w)).length / queryWords.length : 0.5;

  if (key === 'verdict' && q.type === 'choice') {
    const noDemand = has(c.search_demand, 'not_seen_yet');
    const score: Record<string, number> = {
      index: 2.2 - thin * 1.1 - tmpl * 0.5 - dup * 0.9 - (risky ? 1.2 : 0) - (noDemand ? 0.6 : 0) + covers * 0.6,
      improve: 1.4 + (thin === 1 ? 0.8 : 0) + (tmpl === 1 ? 0.4 : 0) + (dup === 1 ? 0.5 : 0) + (risky ? 1 : 0) + (filler || claims ? 0.4 : 0) - (dup === 2 ? 0.9 : 0),
      kill: -0.8 + thin * 0.9 + (dup === 2 ? 2.2 : dup * 0.4) + tmpl * 0.4 + (noDemand ? 0.6 : 0),
    };
    const options = Object.keys((q as ChoiceQuestion).criteria);
    return choiceFromWeights(options, options.map((o) => Math.exp(1.6 * (score[o] ?? 0) + 0.5 * hash01(s.page.url_path + o))));
  }
  if (key === 'depth' && q.type === 'score') {
    const levels = (q as ScoreQuestion).criteria;
    const target = thin === 2 ? 0 : thin === 1 ? 0.7 : tmpl === 2 ? 1 : 1.7;
    const probs = normalise(levels.map((_l, i) => Math.exp(-2.2 * (i - target) ** 2) + 0.03));
    const probabilities: Record<string, number> = {};
    const legend: Record<string, ScoreQuestion['criteria'][number]> = {};
    levels.forEach((l, i) => { probabilities[String(i)] = probs[i]; legend[String(i)] = l; });
    return { type: 'score', score: r3(probs.reduce((sum, pr, i) => sum + pr * i, 0)), legend, probabilities, confidence: r3(scoreConfidence(probs)) };
  }
  const yes = (p: number): Answer => ({ type: 'noul', noul: r3(clamp(p + jitter)) });
  if (key === 'helpful_to_searcher') return yes(0.2 + covers * 0.35 + (2 - thin) * 0.18 - dup * 0.08);
  if (key === 'unverifiable_claim') return yes(claims ? 0.78 : 0.15);
  if (key === 'template_feel') return yes(0.15 + tmpl * 0.32 + dup * 0.1);
  if (key === 'machine_filler') return yes(filler ? 0.8 : 0.18);
  if (key === 'brand_legal_risk') return yes(risky ? 0.86 : 0.08);
  return undefined;
}
