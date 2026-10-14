import type { ChoiceQuestion, NoulQuestion, Questions, ScoreQuestion } from '../../engine/jev/types';
import { postRecencyBand, ratingBand, reviewAgeBand, seasonOf } from './health';
import { THEME_LABEL, type LocalLocation, type LocalQuestion, type LocalReview, type QaAction, type ReviewAction, type Theme, type PostType } from './types';

/** Question-set version, logged with every Local SEO decision. Bump when a question or option changes. */
export const CRITERIA_VERSION = 'local.v1';

// ---------- reviews ----------

export const REVIEW_ACTION_CRITERIA: Record<ReviewAction, string> = {
  reply_template: 'A standard thank-you or apology fits. The review is genuine, short or general, and raises nothing specific that the reply has to address.',
  reply_custom: 'A genuine review that mentions specifics (a named product, a member of staff, a particular problem or a question) that a standard reply would ignore, but that the shop team can answer without a manager.',
  escalate_to_manager: 'A genuine complaint the shop manager must look into before anyone replies: a faulty or unsafe product, a refund, order or booking dispute, rude or unfair treatment, or a threat of legal action.',
  flag_for_removal: 'The review breaks review-platform rules: spam or advertising, off-topic (not about a visit to or purchase from this shop, or about a different business), abusive or hateful language, or personal information. Never choose this only because the review is negative.',
};

export const THEME_CRITERIA: Record<Theme, string> = {
  service: 'Overall service and experience in the shop: helpfulness, advice, how the visit went.',
  staff: 'A named or described member of staff, their knowledge, friendliness or attitude.',
  price: 'Prices, value for money, discounts or price matching.',
  product: 'The goods themselves: range, stock, quality, fit, faults.',
  wait_time: 'Queues, waiting to be served, slow checkout or slow repairs.',
  cleanliness: 'How clean, tidy or well kept the shop, fitting rooms or toilets are.',
  booking: 'Appointments, fittings, rentals, click and collect, orders or reservations.',
  other: 'None of the above, or no text to judge.',
};

export function buildReviewState(review: LocalReview, loc: Pick<LocalLocation, 'name' | 'primaryCategory'>, today: string) {
  return {
    review: {
      stars: `${review.rating}_of_5`,
      text: review.text.trim() ? review.text.trim().slice(0, 1200) : '(no text, star rating only)',
      age: reviewAgeBand(review.date, today),
    },
    location: { name: loc.name, primary_category: loc.primaryCategory || 'unknown' },
  };
}

export function buildReviewQuestions(): Questions {
  return {
    action: {
      type: 'choice',
      instructions: 'What should the team at `location` do with `review`, given `review.stars` and `review.text`?',
      criteria: { ...REVIEW_ACTION_CRITERIA },
    } satisfies ChoiceQuestion,
    theme: {
      type: 'choice',
      instructions: 'Which single topic is `review.text` mainly about?',
      criteria: { ...THEME_CRITERIA },
    } satisfies ChoiceQuestion,
    sentiment: {
      type: 'score',
      instructions: 'How does the customer feel overall in `review.text`, taking `review.stars` into account?',
      criteria: ['Very negative: angry or seriously let down', 'Negative: disappointed', 'Mixed or neutral', 'Positive: pleased', 'Very positive: delighted'],
    } satisfies ScoreQuestion,
    breaks_rules: {
      type: 'noul',
      instructions: 'Is `review.text` spam, advertising, off-topic (not about this shop), or abusive?',
    } satisfies NoulQuestion,
  };
}

// ---------- weekly post ----------

export const POST_CRITERIA: Record<PostType, string> = {
  offer: 'A time-limited promotion. Fits a natural sales moment in `calendar.season` (January sales, Black Friday, end of season) or when `recent_reviews.themes` mention price.',
  event: 'An in-store event, demo, talk, kit-fitting day or guided walk. Fits when `calendar.season` suits an activity, such as school holidays or the start of a walking or ski season.',
  update: 'News or advice: new stock, seasonal kit advice, a reminder of opening hours. Fits most weeks, especially when `recent_reviews.themes` praise products or staff knowledge.',
  none_this_week: 'Skip this week, because one post a week is enough. Fits when `posting.last_post` is this_week; never fits when the last post was longer ago.',
};

export function buildPostState(loc: LocalLocation, daysSincePost: number | null, recentThemes: Theme[], today: string, rating: number | null) {
  const counts = new Map<Theme, number>();
  for (const t of recentThemes) counts.set(t, (counts.get(t) ?? 0) + 1);
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => THEME_LABEL[t].toLowerCase());
  return {
    location: { name: loc.name, primary_category: loc.primaryCategory || 'unknown', additional_categories: loc.additionalCategories.slice(0, 6) },
    posting: { last_post: postRecencyBand(daysSincePost) },
    recent_reviews: { themes: ordered.length ? ordered : ['none in the last 30 days'], rating: ratingBand(rating) },
    calendar: { season: seasonOf(today) },
  };
}

export function buildPostQuestions(): Questions {
  return {
    post: {
      type: 'choice',
      instructions: 'Which kind of Google Business Profile post should `location` publish this week, given `posting.last_post`, `recent_reviews` and `calendar.season`?',
      criteria: { ...POST_CRITERIA },
    } satisfies ChoiceQuestion,
  };
}

// ---------- questions and answers ----------

export const QA_CRITERIA: Record<QaAction, string> = {
  answer_from_profile: 'The question can be answered from the facts in `profile` (opening hours, address, phone, website, categories or description).',
  escalate: 'A genuine customer question that `profile` does not answer, so someone at the shop must reply (stock, prices, services, accessibility, parking and so on).',
  spam: 'Not a genuine question: advertising, links, abuse, or nothing to do with the shop.',
};

export const ANSWER_SOURCES = ['hours', 'address', 'phone', 'website', 'categories', 'description', 'none'] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export function buildQaState(q: LocalQuestion, loc: LocalLocation, today: string) {
  return {
    question: { text: q.question.slice(0, 600), age: reviewAgeBand(q.date, today) },
    profile: {
      name: loc.name,
      primary_category: loc.primaryCategory || 'unknown',
      additional_categories: loc.additionalCategories.slice(0, 8),
      hours: loc.hours || 'not set',
      address: [loc.address, loc.postcode].filter(Boolean).join(', ') || 'not set',
      phone: loc.phone ? 'listed' : 'not set',
      website: loc.website ? 'listed' : 'not set',
      description: loc.description ? loc.description.slice(0, 600) : 'not set',
    },
  };
}

export function buildQaQuestions(): Questions {
  return {
    qa_action: {
      type: 'choice',
      instructions: 'What should the team at the shop in `profile` do with `question`?',
      criteria: { ...QA_CRITERIA },
    } satisfies ChoiceQuestion,
    answer_source: {
      type: 'choice',
      instructions: 'Which field of `profile` best answers `question`?',
      criteria: {
        hours: '`profile.hours`: when the shop is open.',
        address: '`profile.address`: where the shop is or how to find it.',
        phone: '`profile.phone`: how to call the shop.',
        website: '`profile.website`: ordering or browsing online.',
        categories: '`profile.primary_category` and `profile.additional_categories`: what the shop sells or does.',
        description: '`profile.description`: services, brands or facilities described there.',
        none: 'No field in `profile` answers it.',
      },
    } satisfies ChoiceQuestion,
  };
}
