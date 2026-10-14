import { choiceFromWeights, hash01, normalise } from '../../engine/jev/client';
import { scoreConfidence } from '../../engine/jev/confidence';
import type { Answer, ChoiceQuestion, Question, ScoreQuestion, State } from '../../engine/jev/types';

/**
 * Plausible offline answers for the Local SEO battery, read from the same state Jev sees.
 * Only used without a TYPESAFE_API_KEY (and in tests). It is keyword matching, not a model, and its
 * confidences are not calibrated; every screen says when mock decisions are in use.
 */

const SPAM = /https?:\/\/|www\.|\bseo services\b|\bcheck out my\b|\bfollowers\b|\bcrypto\b|\bdiscount code\b|\bvisit my\b|\bpromo\b|\bclick here\b|\bcasino\b|\bwrong (shop|place|business)\b/i;
const ABUSE = /\bidiots?\b|\bscum\b|\bmorons?\b|\bpathetic losers\b|\bf\*+k|\bcrooks\b/i;
const ESCALATE = /\brefund\b|\bfaulty\b|\bbroke\b|\bbroken\b|\bunsafe\b|\brude\b|\bmanager\b|\bcomplain|\bsolicitor\b|\blegal\b|\bdamaged\b|\bripped\b|\bleak|\bnever again\b|\bignored\b|\bcharged twice\b/i;
const SPECIFIC = /\?|\b(tom|sarah|james|emma|mike|ali|priya|dave|jo|rachel)\b|\bboots?\b|\bjacket\b|\btent\b|\brucksack\b|\bfitting\b|\bcrampons?\b/i;

const THEME_RE: [string, RegExp][] = [
  ['wait_time', /\bwait|queue|slow|ages\b|took forever/i],
  ['cleanliness', /\bclean|dirty|messy|tidy|untidy|smell/i],
  ['booking', /\bbook|appointment|reserv|click and collect|collect|order|rental|hire\b/i],
  ['price', /\bprice|expensive|cheap|value|£|cost|overpriced|deal\b/i],
  ['staff', /\bstaff|team|assistant|\b(tom|sarah|james|emma|mike|ali|priya|dave|jo|rachel)\b|knowledgeable|friendly|rude|helpful lad|helpful lady/i],
  ['product', /\bboots?|jacket|tent|rucksack|kit|gear|range|stock|quality|fleece|waterproof|socks|poles\b/i],
  ['service', /\bservice|advice|help|experience|visit|shop\b/i],
];

type ReviewState = { review: { stars: string; text: string } };
type PostState = { posting: { last_post: string }; calendar: { season: string }; recent_reviews: { themes: string[] } };
type QaState = { question: { text: string }; profile: { hours: string; phone: string; website: string; description: string; additional_categories: string[]; primary_category: string } };

const choose = (q: Question, scores: Record<string, number>, seed: string) => {
  const options = Object.keys((q as ChoiceQuestion).criteria);
  return choiceFromWeights(options, options.map((o) => Math.exp(1.4 * (scores[o] ?? 0) + 0.5 * hash01(seed + o))));
};

export function mockLocalAnswer(key: string, q: Question, state: State): Answer | undefined {
  const s = state as Record<string, unknown>;
  if (s.review) {
    const r = (s as unknown as ReviewState).review;
    const stars = parseInt(r.stars, 10) || 3;
    const text = r.text;
    const noText = text.startsWith('(no text');
    const spam = SPAM.test(text) || ABUSE.test(text);
    if (key === 'action' && q.type === 'choice') {
      return choose(q, {
        reply_template: (noText ? 3 : 1) + (stars >= 4 && !SPECIFIC.test(text) ? 2.2 : 0) + (text.length < 140 ? 0.8 : 0) - (spam ? 4 : 0),
        reply_custom: (SPECIFIC.test(text) ? 1.8 : 0) + (text.length >= 140 ? 1 : 0) + (stars === 3 ? 1.2 : 0) - (spam ? 4 : 0),
        escalate_to_manager: (ESCALATE.test(text) ? 2.4 : 0) + (stars <= 2 ? 1.4 : 0) - (spam ? 2 : 0),
        flag_for_removal: spam ? 4.5 : 0,
      }, text + key);
    }
    if (key === 'theme' && q.type === 'choice') {
      const scores: Record<string, number> = { other: noText || spam ? 3 : 0.4 };
      THEME_RE.forEach(([t, re], i) => { if (!noText && !spam && re.test(text)) scores[t] = 3 - i * 0.15; });
      return choose(q, scores, text + key);
    }
    if (key === 'sentiment' && q.type === 'score') {
      const target = Math.max(0, Math.min(4, stars - 1 + (ESCALATE.test(text) && stars <= 3 ? -0.5 : 0)));
      const raw = [0, 1, 2, 3, 4].map((i) => Math.exp(-1.6 * (i - target) ** 2) + 0.02);
      const probs = normalise(raw);
      const probabilities: Record<string, number> = {};
      const legend: Record<string, ScoreQuestion['criteria'][number]> = {};
      (q as ScoreQuestion).criteria.forEach((l, i) => { probabilities[String(i)] = probs[i]; legend[String(i)] = l; });
      return { type: 'score', score: Math.round(probs.reduce((a, pr, i) => a + pr * i, 0) * 1000) / 1000, legend, probabilities, confidence: Math.round(scoreConfidence(probs) * 1000) / 1000 };
    }
    if (key === 'breaks_rules') return { type: 'noul', noul: spam ? 0.93 : 0.06 + 0.06 * hash01(text) };
    return undefined;
  }
  if (s.posting && key === 'post' && q.type === 'choice') {
    const p = s as unknown as PostState;
    const thisWeek = p.posting.last_post.startsWith('this_week');
    const season = p.calendar.season.toLowerCase();
    return choose(q, {
      none_this_week: thisWeek ? 3.2 : 0,
      event: /half term|holidays|spring|summer/.test(season) ? 2.2 : 0.4,
      offer: /sales|christmas|black friday/.test(season) || p.recent_reviews.themes.includes('price') ? 2.4 : 0.3,
      update: 1.8 + (p.recent_reviews.themes.some((t) => t === 'product' || t === 'staff') ? 0.6 : 0),
    }, JSON.stringify(p.posting) + season);
  }
  if (s.question && s.profile) {
    const p = s as unknown as QaState;
    const t = p.question.text.toLowerCase();
    const spam = SPAM.test(t) || ABUSE.test(t);
    const hours = /\bopen|close|hours|sunday|bank holiday|what time|christmas\b/.test(t) && p.profile.hours !== 'not set';
    const phone = /\bphone|call|number\b/.test(t) && p.profile.phone !== 'not set';
    const web = /\bonline|website|order\b/.test(t) && p.profile.website !== 'not set';
    const where = /\bwhere|address|find you|located\b/.test(t);
    const words = t.split(/\W+/).filter((w) => w.length > 4);
    const cats = [p.profile.primary_category, ...p.profile.additional_categories].join(' ').toLowerCase();
    const inCats = words.some((w) => cats.includes(w.replace(/s$/, '')));
    const inDesc = words.some((w) => p.profile.description.toLowerCase().includes(w.replace(/s$/, '')));
    const source = hours ? 'hours' : phone ? 'phone' : web ? 'website' : where ? 'address' : inCats ? 'categories' : inDesc ? 'description' : 'none';
    if (key === 'qa_action' && q.type === 'choice') {
      return choose(q, { spam: spam ? 4.5 : 0, answer_from_profile: !spam && source !== 'none' ? 2.6 : 0, escalate: !spam && source === 'none' ? 2.6 : 0.6 }, t + key);
    }
    if (key === 'answer_source' && q.type === 'choice') return choose(q, { [source]: 3 }, t + key);
  }
  return undefined;
}
