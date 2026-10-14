import { isChoice, isNoul, isScore, orderedScoreProbs } from '../../engine/jev/confidence';
import type { Answers } from '../../engine/jev/types';
import { ANSWER_SOURCES, type AnswerSource } from './battery';
import { draftAnswer, draftPost, draftReply, hasPlaceholder } from './replies';
import {
  POST_TYPES, QA_ACTIONS, REVIEW_ACTIONS, SENTIMENT_LEVELS, THEMES,
  type LocalLocation, type LocalQuestion, type LocalReview, type LocalSettings, type PostType, type QaAction, type ReviewAction, type Router, type Sentiment, type Theme,
} from './types';

/** Turns Jev's answers into decisions, applies the hard rules and the site's approval rules. */

export const AUTO = 0.85;
export const REVIEW = 0.6;
export const routerOf = (confidence: number): Router => (confidence >= AUTO ? 'auto' : confidence >= REVIEW ? 'review' : 'uncertain');

function choiceOf<T extends string>(answers: Answers, key: string, allowed: readonly T[], fallback: T): { choice: T; p: number; probs: Record<string, number> } {
  const a = answers[key];
  if (isChoice(a) && (allowed as readonly string[]).includes(a.choice)) return { choice: a.choice as T, p: a.probabilities[a.choice] ?? a.confidence, probs: a.probabilities };
  return { choice: fallback, p: 0, probs: {} };
}

export interface ReviewDecision {
  action: ReviewAction;
  jevAction: ReviewAction;
  confidence: number;
  router: Router;
  theme: Theme;
  themeConfidence: number;
  sentiment: Sentiment;
  /** 0 (very negative) to 4 (very positive), probability-weighted. */
  sentimentScore: number;
  breaksRules: number;
  probabilities: Record<string, number>;
  rules: string[];
  draft: string;
  status: 'proposed' | 'approved';
  approval: string;
}

export function reviewDecision(review: LocalReview, loc: Pick<LocalLocation, 'name' | 'phone'>, answers: Answers, settings: LocalSettings): ReviewDecision {
  const act = choiceOf(answers, 'action', REVIEW_ACTIONS, review.rating <= 2 ? 'escalate_to_manager' : 'reply_custom');
  const th = choiceOf(answers, 'theme', THEMES, 'other');
  const s = answers.sentiment;
  let sentimentScore = review.rating - 1;
  if (isScore(s)) {
    const probs = orderedScoreProbs(s);
    sentimentScore = probs.length === 5 ? s.score : sentimentScore;
  }
  const sentiment = SENTIMENT_LEVELS[Math.max(0, Math.min(4, Math.round(sentimentScore)))];
  const breaksRules = isNoul(answers.breaks_rules) ? answers.breaks_rules.noul : 0.5;
  const rules: string[] = [];
  let action = act.choice;
  let confidence = act.p;
  let router = routerOf(confidence);

  if (action === 'flag_for_removal' && breaksRules < 0.5) {
    action = review.rating <= 2 ? 'escalate_to_manager' : 'reply_custom';
    confidence = act.probs[action] ?? 0;
    router = 'review';
    rules.push('Removal is only for spam, off-topic or abusive reviews, and Jev did not judge this one as breaking the rules, so it gets a reply instead.');
  }
  if (action === 'flag_for_removal') rules.push('Removal requests always need a person: only the platform can remove a review.');
  if (review.rating <= 2) rules.push('1 to 2-star replies are always reviewed by a person.');

  const draft = draftReply({ key: review.key, author: review.author, rating: review.rating, theme: th.choice, action, location: loc });
  let status: ReviewDecision['status'] = 'proposed';
  let approval = 'Waiting for your approval.';
  const autoStar = (review.rating === 5 && settings.autoApproveFiveStar) || (review.rating === 4 && settings.autoApproveFourStar);
  if (action === 'reply_template' && autoStar && router === 'auto' && !hasPlaceholder(draft)) {
    status = 'approved';
    approval = `Auto-approved: templated reply to a ${review.rating}-star review, Jev confident (site approval rule).`;
  } else if (action === 'reply_template' && autoStar && router !== 'auto') {
    approval = 'Not auto-approved: Jev was not confident enough (below 0.85).';
  }
  return { action, jevAction: act.choice, confidence, router, theme: th.choice, themeConfidence: th.p, sentiment, sentimentScore, breaksRules, probabilities: act.probs, rules, draft, status, approval };
}

export interface PostDecision { post: PostType; jevPost: PostType; confidence: number; router: Router; probabilities: Record<string, number>; rules: string[]; draft: string }

export function postDecision(loc: LocalLocation, daysSincePost: number | null, answers: Answers, season: string, topTheme: Theme | null): PostDecision {
  const c = choiceOf(answers, 'post', POST_TYPES, 'update');
  let post = c.choice;
  let confidence = c.p;
  const rules: string[] = [];
  if (post === 'none_this_week' && (daysSincePost == null || daysSincePost >= 7)) {
    post = 'update';
    confidence = c.probs.update ?? 0;
    rules.push('No post for 7 days or more, so a short update is suggested instead of skipping the week.');
  }
  return { post, jevPost: c.choice, confidence, router: rules.length ? 'review' : routerOf(confidence), probabilities: c.probs, rules, draft: draftPost(post, loc, season, topTheme) };
}

export interface QaDecision { action: QaAction; jevAction: QaAction; confidence: number; router: Router; source: AnswerSource; probabilities: Record<string, number>; rules: string[]; draft: string }

export function qaDecision(_q: LocalQuestion, loc: LocalLocation, answers: Answers): QaDecision {
  const c = choiceOf(answers, 'qa_action', QA_ACTIONS, 'escalate');
  const src = choiceOf(answers, 'answer_source', ANSWER_SOURCES, 'none');
  let action = c.choice;
  let confidence = c.p;
  const rules: string[] = [];
  if (action === 'answer_from_profile' && src.choice === 'none') {
    action = 'escalate';
    confidence = c.probs.escalate ?? 0;
    rules.push('Jev found no profile field that answers it, so it goes to the shop team.');
  }
  const draft = action === 'spam' ? '' : draftAnswer(action === 'answer_from_profile' ? src.choice : 'none', loc);
  return { action, jevAction: c.choice, confidence, router: rules.length ? 'review' : routerOf(confidence), source: src.choice, probabilities: c.probs, rules, draft };
}

// ---------- weekly attention list ----------

export type AttentionKind = 'review' | 'question' | 'post' | 'profile' | 'citation';
export interface AttentionInput { kind: AttentionKind; health: number; stars?: number; ageDays?: number | null; tier?: 1 | 2 | 3; escalated?: boolean; points?: number }

/**
 * Priority for the weekly attention list. Urgency of the item first, then how unhealthy the location
 * is, then how long it has waited. Higher is more urgent. Fully deterministic, so it can be explained.
 */
export function attentionPriority(i: AttentionInput): number {
  let base = 0;
  switch (i.kind) {
    case 'review': base = i.escalated ? 90 : (i.stars ?? 5) <= 2 ? 85 : i.stars === 3 ? 60 : 40; break;
    case 'question': base = 50; break;
    case 'post': base = 30; break;
    case 'profile': base = 35 + (i.points ?? 0) * 2; break;
    case 'citation': base = i.tier === 1 ? 65 : i.tier === 2 ? 40 : 15; break;
  }
  const age = i.ageDays == null ? 0 : Math.min(10, Math.max(0, i.ageDays) / 3);
  return Math.round((base + (100 - i.health) * 0.4 + age) * 10) / 10;
}
