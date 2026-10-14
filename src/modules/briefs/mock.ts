import { choiceFromWeights, hash01 } from '../../engine/jev/client';
import type { Answer, ChoiceQuestion, Question, State } from '../../engine/jev/types';

type S = {
  target: { primary_keyword: string; related_keywords: string[]; question_keywords: string[]; modifiers_found: string[] };
  demand: { monthly_volume: string };
  coverage: { site_has_page_in_top_20: string; existing_page?: { best_position: string; title?: string } };
  business: { relevance: string };
  site: { sells_products_in_topic: string; has_first_party_data: string };
  decided?: { action: string; intent: string; format: string };
};

const lead = (v: string | undefined) => (v ?? '').split(' ')[0];

/**
 * Plausible offline answers for the brief battery, driven by the same bands Jev sees.
 * Only for running without a key. It is not a model and its confidences are not calibrated.
 */
export function mockBriefAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as unknown as S;
  if (!s?.target || q.type !== 'choice') return undefined;
  const options = Object.keys((q as ChoiceQuestion).criteria);
  const seed = s.target.primary_keyword + key;
  const mods = new Set(s.target.modifiers_found);
  const pick = (score: Record<string, number>) => choiceFromWeights(options, options.map((o) => Math.exp(1.4 * (score[o] ?? 0) + 0.5 * hash01(seed + o))));
  const vol = lead(s.demand.monthly_volume);
  const rel = lead(s.business.relevance);
  const pos = s.coverage.existing_page?.best_position;
  const decided = s.decided;

  if (key === 'go') {
    const lowRel = rel === 'very_low' || rel === 'low';
    const lowVol = vol === 'none' || vol === 'very_low';
    return pick({
      create: (lowRel ? -1 : 1.5) + (lowVol ? -1 : 1) + (s.coverage.site_has_page_in_top_20 === 'no' ? 1.2 : -0.5),
      expand_existing: s.coverage.existing_page ? (pos === 'top_3' ? 0.6 : 2.4) + (lowRel ? -1 : 0) : -5,
      skip: (lowRel ? 2.6 : 0) + (lowVol ? 1.6 : 0) + (pos === 'top_3' ? 1.4 : 0),
    });
  }
  if (key === 'intent') {
    return pick({
      informational: (mods.has('how-to') || mods.has('definition') || mods.has('beginners') ? 2.5 : 0.8) + (s.target.question_keywords.length ? 1 : 0),
      commercial: mods.has('best-of') || mods.has('reviews') || mods.has('comparison') || mods.has('choosing') ? 2.6 : 0.4,
      transactional: mods.has('price') || mods.has('buying') ? 2.8 : 0.2,
      local: mods.has('near me') ? 2.5 : mods.has('UK') ? 0.6 : 0,
      navigational: 0,
    });
  }
  if (key === 'format') {
    return pick({
      guide: mods.has('how-to') || mods.has('beginners') || mods.has('definition') || mods.has('choosing') ? 2.6 : 1,
      comparison: /\bvs\b|versus|compare/.test(s.target.primary_keyword) ? 3 : mods.has('comparison') ? 0.6 : 0,
      listicle: mods.has('best-of') || mods.has('reviews') ? 2.7 : 0.2,
      tool_page: mods.has('tool') ? 3 : 0,
      product_or_category: (mods.has('price') || mods.has('buying')) && s.site.sells_products_in_topic === 'yes' ? 2.9 : 0,
      faq: s.target.question_keywords.length >= 3 && vol === 'low' ? 1.8 : 0.2,
      video_first: mods.has('how-to') ? 0.8 : 0,
      template: mods.has('checklist') || mods.has('template') ? 2.6 : 0,
    });
  }
  if (key === 'angle') {
    const score: Record<string, number> = { complete_overview: 0.8 };
    if (mods.has('beginners')) score.for_beginners = 3;
    if (mods.has('UK')) score.uk_specific = 2.4;
    if (mods.has('price')) score.budget = 3;
    if (mods.has('best-of') || mods.has('reviews')) score.expert_tested = 2.5;
    if (mods.has('comparison')) score.vs_market_leader = 2.6;
    if (mods.has('choosing')) { score.buyers_guide = 2.4; score.with_checklist = 2; }
    if (mods.has('how-to')) score.step_by_step = 2.2;
    return pick(score);
  }
  if (key === 'length') {
    const f = decided?.format ?? 'guide';
    const qn = s.target.question_keywords.length + s.target.related_keywords.length;
    return pick({
      '600_900': f === 'product_or_category' || f === 'faq' || f === 'tool_page' ? 3 : qn < 3 ? 1.5 : 0,
      '1000_1500': f === 'comparison' || f === 'template' || f === 'video_first' ? 2.5 : qn < 6 ? 1.5 : 0.5,
      '1800_2500': f === 'guide' || f === 'listicle' ? 2.4 : 0.5,
      '3000_plus': (f === 'guide' && qn >= 10) || vol === 'very_high' ? 2.6 : 0,
    });
  }
  if (key === 'edge') {
    return pick({
      first_hand_testing: s.site.sells_products_in_topic === 'yes' ? 2.2 + (mods.has('best-of') || mods.has('reviews') ? 1 : 0) : 0.3,
      original_data: s.site.has_first_party_data === 'yes' ? 1.2 : 0,
      clearer_comparison: mods.has('comparison') || decided?.format === 'comparison' ? 3 : mods.has('best-of') ? 1.2 : 0,
      more_current: mods.has('year') || mods.has('price') ? 1.8 : 0.4,
      local_relevance: mods.has('UK') || mods.has('near me') ? 2.4 : 0,
      deeper_coverage: s.target.question_keywords.length >= 2 || mods.has('beginners') ? 2.2 : 0.8,
    });
  }
  return undefined;
}
