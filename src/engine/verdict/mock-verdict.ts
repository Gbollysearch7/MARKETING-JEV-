import { choiceFromWeights, hash01 } from '../jev/client';
import type { Answer, ChoiceQuestion, Question, State } from '../jev/types';

type S = {
  page: { url_path: string; title?: string; top_queries: string[]; excerpt?: string };
  performance: Record<string, string>;
  engagement: Record<string, string>;
  links: Record<string, string>;
  content: Record<string, string>;
  overlap: { competing_pages: { url_path: string; competitor_is_stronger: string }[] };
};

const has = (v: string | undefined, prefix: string) => (v ?? '').startsWith(prefix);

/**
 * Plausible offline answers for the verdict battery, driven by the same bands Jev sees.
 * Only for running without a key. It is not a model and its confidences are not calibrated.
 */
export function mockVerdictAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as unknown as S;
  if (!s?.performance) return undefined;
  const seed = JSON.stringify(s.page) + key;
  if (key === 'verdict' && q.type === 'choice') {
    const p = s.performance;
    const none = has(p.monthly_clicks, 'none') || has(p.monthly_clicks, 'very_low');
    const score: Record<string, number> = {
      refresh: (has(p.click_trend, 'declining_sharply') ? 3 : has(p.click_trend, 'declining') ? 2 : 0) + (has(s.content.content_age, 'over_12') ? 1.2 : 0) + (has(p.position_change, 'dropped') ? 1 : 0),
      expand: (has(p.ranks_8_to_20_for_high_volume_queries, 'yes') ? 2.5 : 0) + (has(p.average_position, '8_to_20') ? 1 : 0) + (/thin/.test(s.content.word_count) && !none ? 1.2 : 0),
      merge: s.overlap.competing_pages.some((c) => c.competitor_is_stronger === 'yes') ? 3.2 : s.overlap.competing_pages.length ? 1 : 0,
      redirect: none && !['none', 'unknown'].includes(s.links.referring_domains) ? 3 : none ? 0.8 : 0,
      prune: none && s.links.referring_domains !== '1_to_4' && !has(s.links.referring_domains, '5') && !has(s.links.referring_domains, '20') && !has(s.engagement.conversions, 'some') ? (/thin/.test(s.content.word_count) ? 2.6 : 1.4) : 0,
      leave: 1 + (has(p.click_trend, 'growing') || has(p.click_trend, 'stable') ? 1.2 : 0) + (has(p.average_position, 'top_3') ? 1.2 : 0) + (has(p.monthly_clicks, 'high') || has(p.monthly_clicks, 'medium') ? 0.8 : 0),
    };
    const options = Object.keys((q as ChoiceQuestion).criteria);
    return choiceFromWeights(options, options.map((o) => Math.exp(1.3 * (score[o] ?? 0) + 0.6 * hash01(seed + o))));
  }
  if (key === 'target' && q.type === 'choice') {
    const options = Object.keys((q as ChoiceQuestion).criteria);
    const stronger = s.overlap.competing_pages.find((c) => c.competitor_is_stronger === 'yes')?.url_path;
    const crit = (q as ChoiceQuestion).criteria;
    return choiceFromWeights(options, options.map((o, i) => {
      if (o === 'none') return 0.6;
      const desc = String(crit[o] ?? '');
      return (stronger && desc.startsWith(stronger) ? 6 : 2.2 - i * 0.3) + hash01(seed + o);
    }));
  }
  if (key === 'time_sensitive') {
    const ex = s.page.excerpt ?? '';
    return { type: 'noul', noul: /\b20[12]\d\b|£|\$|%|latest|this year|updated/i.test(ex) ? 0.78 : 0.18 };
  }
  if (key === 'title_matches_queries') {
    const title = (s.page.title ?? s.page.url_path).toLowerCase();
    const words = s.page.top_queries.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const hit = words.filter((w) => title.includes(w)).length / Math.max(1, words.length);
    return { type: 'noul', noul: Math.round((0.2 + 0.75 * Math.min(1, hit * 2)) * 1000) / 1000 };
  }
  return undefined;
}
