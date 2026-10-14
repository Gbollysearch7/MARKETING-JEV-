import { choiceFromWeights, hash01 } from '../../engine/jev/client';
import type { Answer, ChoiceQuestion, Question, State } from '../../engine/jev/types';
import { words } from './features';

type S = {
  site: { name: string; top_page_titles: string[]; topic_words: string[] };
  prospect: { url: string; domain: string; page_title?: string; snippet?: string; found_via: string };
  signals: { authority: string; traffic: string; link_attribute: string; spam_topics_found: string[] | 'none'; footprints: string[] | 'none'; page_mentions_site_name: string; already_links_to_site: string };
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const starts = (v: string, p: string) => v.startsWith(p);

/**
 * Plausible offline answers for the links battery, driven by the same text and bands Jev sees.
 * Only for running without a key. It is not a model and its confidences are not calibrated.
 */
export function mockLinksAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as unknown as S;
  if (!s?.prospect || !s.signals) return undefined;
  const seed = s.prospect.url + key;
  const text = `${s.prospect.url} ${s.prospect.page_title ?? ''} ${s.prospect.snippet ?? ''}`.toLowerCase();
  const spam = Array.isArray(s.signals.spam_topics_found) ? s.signals.spam_topics_found.length : 0;
  const fps = Array.isArray(s.signals.footprints) ? s.signals.footprints.join(' ') : '';
  const paid = /prices|paid|sell links|backlink packages|link exchanges/.test(fps);
  const domainOdd = /hyphens|digits/.test(fps);
  const topic = new Set([...s.site.topic_words, ...words(s.site.top_page_titles.join(' '))].map((w) => w.slice(0, 4)));
  const pw = words(`${s.prospect.page_title ?? ''} ${s.prospect.snippet ?? ''} ${s.prospect.url.replace(/[/.-]/g, ' ')}`);
  const overlap = new Set(pw.map((w) => w.slice(0, 4)).filter((w) => topic.has(w))).size;
  // With almost no topic words (no page titles uploaded yet) the mock cannot judge topic, so it leans neutral-positive.
  const relevance = spam ? 0.08 : topic.size < 5 ? 0.62 : Math.min(0.95, 0.42 + 0.15 * overlap);

  if (key === 'relevant') return { type: 'noul', noul: r3(relevance + 0.04 * hash01(seed)) };
  if (key === 'sells_links') return { type: 'noul', noul: r3(paid ? 0.88 : spam ? 0.6 : 0.06 + 0.1 * hash01(seed)) };
  if (key === 'pbn_footprint') return { type: 'noul', noul: r3(domainOdd && (spam || paid) ? 0.82 : domainOdd ? 0.45 : 0.05 + 0.1 * hash01(seed)) };
  if (key === 'spam_content') return { type: 'noul', noul: r3(spam ? 0.9 : 0.04 + 0.08 * hash01(seed)) };

  if (key === 'quality' && q.type === 'score') {
    const a = s.signals.authority;
    const hi = starts(a, 'high') ? 2 : starts(a, 'medium') ? 1.2 : starts(a, 'low') ? 0.4 : 0;
    const t = starts(s.signals.traffic, 'high') ? 1 : starts(s.signals.traffic, 'medium') ? 0.6 : 0;
    const bad = spam || paid ? 2.5 : 0;
    const w = [Math.exp(1 + bad - hi), Math.exp(1.2 + 0.3 * hash01(seed)), Math.exp(hi + t - bad)];
    const tot = w.reduce((x, y) => x + y, 0);
    const probs = w.map((x) => r3(x / tot));
    const score = r3(probs[1] + 2 * probs[2]);
    let m = 0;
    probs.forEach((p, i) => { if (p > probs[m]) m = i; });
    const crit = q.criteria;
    return {
      type: 'score', score,
      legend: Object.fromEntries(crit.map((c, i) => [String(i), c])),
      probabilities: Object.fromEntries(probs.map((p, i) => [String(i), p])),
      confidence: r3(probs[m]),
    };
  }
  if (q.type !== 'choice') return undefined;
  const options = Object.keys((q as ChoiceQuestion).criteria);
  const pick = (weights: Record<string, number>) => choiceFromWeights(options, options.map((o) => Math.exp((weights[o] ?? 0) + 0.4 * hash01(seed + o))));
  if (key === 'site_type') {
    return pick({
      link_farm: spam || paid ? 3.5 : domainOdd ? 1.5 : 0,
      resource_page: /resources?|links|recommended|useful sites|reading list/.test(text) ? 2.6 : 0,
      guest_post: /write[- ]?for[- ]?us|guest post|contribut/.test(text) ? 2.6 : 0,
      directory: /directory|listings?|find a|near me|business list/.test(text) ? 2.8 : 0,
      forum: /forum|thread|community|board|\/t\//.test(text) ? 2.6 : 0,
      news: /news|press|announces|report/.test(text) ? 2 : 0,
      editorial: 1.4,
    });
  }
  if (key === 'prospect_type') {
    return pick({
      unlinked_mention: s.signals.page_mentions_site_name === 'yes' ? 3.2 : 0,
      resource_page: /resources?|links|recommended|reading list/.test(text) ? 2.4 : 0,
      guest_post: /write[- ]?for[- ]?us|guest post|contribut/.test(text) ? 2.4 : 0,
      directory: /directory|listings?/.test(text) ? 2.4 : 0,
      broken_link: /broken|404|no longer/.test(text) ? 2 : 0,
      competitor_linked: /competitor/i.test(s.prospect.found_via) ? 1.8 : 0,
      editorial: 1.2,
    });
  }
  if (key === 'angle') {
    return pick({
      ask_for_link: s.signals.page_mentions_site_name === 'yes' ? 3.4 : 0,
      resource_suggestion: /resources?|links|recommended|guide|list/.test(text) ? 2 : 0.6,
      data_study: /study|survey|data|statistics|report/.test(text) ? 2 : 0.3,
      expert_quote: /expert|tips|advice|interview/.test(text) ? 1.8 : 0.4,
      correction: /outdated|2019|2020|old/.test(text) ? 1.2 : 0,
      partnership: /giveaway|review|collab|partner/.test(text) ? 1.8 : 0.2,
    });
  }
  return undefined;
}
