import { choiceFromWeights, hash01, normalise } from '../../engine/jev/client';
import { scoreConfidence } from '../../engine/jev/confidence';
import type { Answer, ChoiceQuestion, Question, ScoreQuestion, State } from '../../engine/jev/types';

type LossS = {
  prompt: string;
  brand: { visibility_across_all_prompts: string };
  losing_answers: { competitors_named: { name: string; named_in: string }[]; cited_source_types: Record<string, string>; third_party_sources_cited: string; our_domain_cited: string };
  own_site: { page_for_prompt: string; page_status: string };
};

const POS = /\b(recommend(ed)?|great|excellent|best|favourite|reliable|good value|well[- ]made|solid|praised|popular|top pick|stands out|impressive|helpful)\b/gi;
const NEG = /\b(avoid|poor|complain(ts|ed)?|issues?|problems?|disappointing|overpriced|slow|returns? (were|was) (hard|difficult)|mixed reviews|worse|not recommended|faulty|unreliable)\b/gi;

/**
 * Plausible offline answers for the visibility battery, driven by the same evidence Jev sees.
 * Only for running without a key; not a model and not calibrated.
 */
export function mockVisibilityAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as Record<string, unknown>;
  if (key === 'sentiment' && q.type === 'score' && typeof s.answer_excerpt === 'string') {
    const text = s.answer_excerpt;
    const pos = (text.match(POS) ?? []).length;
    const neg = (text.match(NEG) ?? []).length;
    const w = [0.15 + neg * 1.1, 0.9, 0.2 + pos * 0.7].map((x, i) => x + 0.15 * hash01(text + i));
    const probs = normalise(w);
    const levels = (q as ScoreQuestion).criteria;
    const probabilities: Record<string, number> = {};
    const legend: Record<string, ScoreQuestion['criteria'][number]> = {};
    levels.forEach((l, i) => { probabilities[String(i)] = probs[i] ?? 0; legend[String(i)] = l; });
    const score = Math.round(probs.reduce((acc, p, i) => acc + p * i, 0) * 1000) / 1000;
    return { type: 'score', score, legend, probabilities, confidence: Math.round(scoreConfidence(probs) * 1000) / 1000 };
  }
  if (key === 'loss_reason' && q.type === 'choice' && s.own_site) {
    const l = state as unknown as LossS;
    const page = l.own_site.page_for_prompt;
    const blocked = /not indexable/.test(l.own_site.page_status);
    const tp = l.losing_answers.third_party_sources_cited;
    const thirdParty = tp === 'several' ? 3 : tp === 'one' ? 0.8 : 0;
    const named = l.losing_answers.competitors_named.length;
    const weights: Record<string, number> = {
      no_page_covers: page === 'none' ? 3.2 : page === 'partial' ? 1 : 0,
      not_cited_by_trusted_sources: page !== 'none' && !blocked ? 1.6 + (thirdParty < 1.5 ? 1 : 0) : 0,
      competitor_third_party: (named ? 0.6 : 0) + thirdParty * 0.6,
      weak_entity: l.brand.visibility_across_all_prompts.startsWith('rarely') ? 2 : 0.4,
      blocked_or_walled: blocked ? 3.4 : 0,
    };
    const options = Object.keys((q as ChoiceQuestion).criteria);
    return choiceFromWeights(options, options.map((o) => Math.exp(1.2 * (weights[o] ?? 0) + 0.5 * hash01(l.prompt + o))));
  }
  return undefined;
}
