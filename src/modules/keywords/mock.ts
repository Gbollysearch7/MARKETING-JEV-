import { choiceFromWeights, hash01 } from '../../engine/jev/client';
import type { Answer, ChoiceQuestion, Question, State } from '../../engine/jev/types';
import { tokens } from './cluster';

type S = {
  keyword: string;
  search_volume: string;
  currently_ranking_page?: { url_path: string };
  site: { name: string; domain: string; top_pages: string[] };
  candidate_pages: { option: string; url_path: string; title: string }[];
};

const COMPETITORS = /\b(rab|berghaus|north face|patagonia|salomon|decathlon|go outdoors|cotswold|mountain warehouse|millets|arc'?teryx|osprey|msr|vango)\b/;
const MISSPELT = /\b(hikking|hikeing|tnet|tnets|waterprof|jakcet|jackit|sleping|cmaping|boos)\b/;
const OFFTOPIC = /\b(recipe|football|mortgage|iphone|lottery|crypto|netflix)\b/;
const LOCAL = /\b(near me|nearby|keswick|ambleside|london|manchester|leeds|glasgow|edinburgh|bristol|birmingham|fort william|aviemore)\b|\b(shop|store|centre|center)\b.*\b(in|near)\b/;
const BUY = /\b(buy|price|prices|sale|discount|deal|deals|cheap|cheapest|voucher|code|in stock|order|delivery)\b/;
const COMPARE = /\b(best|top|review|reviews|vs|versus|compare|comparison|which|alternatives?)\b|\bfor (women|men|beginners|kids|winter|summer)\b/;
const LEARN = /^(how|what|why|when|where|can|should|is|are|do|does)\b|\b(guide|tips|ideas|routes?|explained|meaning|checklist|beginners guide|rules|safety)\b/;
const AFTER = /\b(clean|cleaning|wash|washing|reproof|re-?waterproof|repair|fix|care|store|storing|returns?|warranty|re-?lace|dry|drying)\b/;

/** Plausible offline answers for the keyword battery. Only for running without a key; not calibrated. */
export function mockKeywordAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as unknown as S;
  if (!s || typeof s.keyword !== 'string') return undefined;
  const kw = s.keyword;
  const options = Object.keys((q as ChoiceQuestion).criteria ?? {});
  const brand = new RegExp(`\\b(${[s.site.name.toLowerCase(), s.site.domain.replace(/^www\./, '').split('.')[0].replace(/-/g, ' '), 'trailmaster'].join('|')})\\b`);
  const noise = (o: string) => 0.5 * hash01(kw + key + o);
  if (key === 'intent' && q.type === 'choice') {
    const score: Record<string, number> = {
      junk: (COMPETITORS.test(kw) || MISSPELT.test(kw) || OFFTOPIC.test(kw)) ? 4 : 0,
      local: LOCAL.test(kw) ? 3.2 : 0,
      navigational: brand.test(kw) ? 3 : 0,
      transactional: BUY.test(kw) ? 2.6 : 0.3,
      commercial: COMPARE.test(kw) ? 2.6 : 0.8,
      informational: LEARN.test(kw) || AFTER.test(kw) ? 2.8 : 0.5,
    };
    return choiceFromWeights(options, options.map((o) => Math.exp(1.4 * (score[o] ?? 0) + noise(o))));
  }
  if (key === 'stage' && q.type === 'choice') {
    const score: Record<string, number> = {
      retention: AFTER.test(kw) ? 3 : 0,
      decision: BUY.test(kw) || LOCAL.test(kw) || brand.test(kw) ? 2.4 : 0.2,
      consideration: COMPARE.test(kw) ? 2.4 : 0.9,
      awareness: LEARN.test(kw) ? 2.4 : 0.5,
    };
    return choiceFromWeights(options, options.map((o) => Math.exp(1.4 * (score[o] ?? 0) + noise(o))));
  }
  if (key === 'page' && q.type === 'choice') {
    const kt = tokens(kw).filter((t) => !['best', 'how', 'choose', 'buy', 'uk', 'review'].includes(t));
    const learn = LEARN.test(kw) || AFTER.test(kw);
    const compare = COMPARE.test(kw);
    const buy = BUY.test(kw);
    const local = LOCAL.test(kw);
    return choiceFromWeights(options, options.map((o) => {
      if (o === 'new_page') return Math.exp((local ? 3 : learn && AFTER.test(kw) ? 2.2 : 1.1) + noise(o));
      const c = s.candidate_pages.find((p) => p.option === o);
      if (!c) return 0.01;
      const pt = tokens(`${c.url_path} ${c.title}`);
      const overlap = kt.filter((t) => pt.includes(t)).length / Math.max(1, kt.length);
      const kind = c.url_path.includes('how-to-choose') ? (learn ? 1.4 : 0) : c.url_path.includes('/best-') ? (compare ? 1.4 : learn || buy ? 0 : 0.6) : c.url_path.startsWith('/products/') ? (buy ? 1.4 : 0.2) : c.url_path.includes('sale') ? (buy ? 0.8 : -0.5) : 0;
      const current = s.currently_ranking_page?.url_path === c.url_path ? 0.8 : 0;
      return Math.exp(3 * overlap + kind + current + noise(o));
    }));
  }
  return undefined;
}
