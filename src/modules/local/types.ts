/** Module 7, Local SEO Autopilot: shared shapes. Pure, no framework imports. */

export interface LocalLocation {
  locId: string;
  name: string;
  address: string;
  postcode: string;
  phone: string;
  website: string;
  primaryCategory: string;
  additionalCategories: string[];
  hours: string;
  description: string;
  photoCount: number | null;
  lastPostDate: string | null; // ISO date (yyyy-mm-dd)
  rating: number | null;
  reviewCount: number | null;
}

export interface LocalReview {
  locId: string;
  /** Stable key from location, author, date and text, so re-uploads de-duplicate. */
  key: string;
  author: string;
  rating: number;
  text: string;
  date: string | null;
  replied: boolean;
  replyText: string;
}

export interface LocalQuestion {
  locId: string;
  key: string;
  question: string;
  date: string | null;
  answered: boolean;
}

export interface LocalCitation {
  locId: string;
  directory: string;
  listedName: string;
  address: string;
  phone: string;
  url: string;
}

export type UploadKind = 'locations' | 'reviews' | 'questions' | 'citations';
export const UPLOAD_KINDS: UploadKind[] = ['locations', 'reviews', 'questions', 'citations'];
export const KIND_LABEL: Record<UploadKind, string> = { locations: 'Locations', reviews: 'Reviews', questions: 'Questions and answers', citations: 'Citations' };

export const REVIEW_ACTIONS = ['reply_template', 'reply_custom', 'escalate_to_manager', 'flag_for_removal'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  reply_template: 'Reply with template',
  reply_custom: 'Reply, personalised',
  escalate_to_manager: 'Escalate to manager',
  flag_for_removal: 'Request removal',
};

export const THEMES = ['service', 'staff', 'price', 'product', 'wait_time', 'cleanliness', 'booking', 'other'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  service: 'Service', staff: 'Staff', price: 'Price', product: 'Product', wait_time: 'Wait time', cleanliness: 'Cleanliness', booking: 'Booking', other: 'Other',
};

export const POST_TYPES = ['offer', 'event', 'update', 'none_this_week'] as const;
export type PostType = (typeof POST_TYPES)[number];
export const POST_LABEL: Record<PostType, string> = { offer: 'Offer', event: 'Event', update: 'Update', none_this_week: 'No post this week' };

export const QA_ACTIONS = ['answer_from_profile', 'escalate', 'spam'] as const;
export type QaAction = (typeof QA_ACTIONS)[number];
export const QA_LABEL: Record<QaAction, string> = { answer_from_profile: 'Answer from profile', escalate: 'Escalate', spam: 'Mark as spam' };

export const SENTIMENT_LEVELS = ['very_negative', 'negative', 'mixed', 'positive', 'very_positive'] as const;
export type Sentiment = (typeof SENTIMENT_LEVELS)[number];
export const SENTIMENT_LABEL: Record<Sentiment, string> = { very_negative: 'Very negative', negative: 'Negative', mixed: 'Mixed', positive: 'Positive', very_positive: 'Very positive' };

export type Router = 'auto' | 'review' | 'uncertain';

export interface LocalSettings {
  /** Auto-approve templated replies to 5-star reviews when Jev is confident. Default on. */
  autoApproveFiveStar: boolean;
  /** Auto-approve templated replies to 4-star reviews when Jev is confident. Default off. */
  autoApproveFourStar: boolean;
}
export const DEFAULT_SETTINGS: LocalSettings = { autoApproveFiveStar: true, autoApproveFourStar: false };
