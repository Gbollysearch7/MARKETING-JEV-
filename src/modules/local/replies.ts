import { hash01 } from '../../engine/jev/client';
import type { AnswerSource } from './battery';
import { displayPhone } from './nap';
import type { LocalLocation, PostType, ReviewAction, Theme } from './types';

/**
 * Reply, answer and post drafts, built entirely from this template library (there is no text
 * generation anywhere in the product). Warm British English, signed with the location name, and no
 * promises, refunds or discounts: anything that commits the business is left for a person to write.
 * Square-bracket placeholders must be replaced before a draft can be marked as posted.
 */

export type RatingBand = 'five' | 'four' | 'three' | 'low';
export const ratingBandOf = (stars: number): RatingBand => (stars >= 5 ? 'five' : stars === 4 ? 'four' : stars === 3 ? 'three' : 'low');

const OPENERS: Record<RatingBand, string[]> = {
  five: ['Thank you for such a lovely review.', 'Thank you so much for the five stars.', 'What a brilliant review to read, thank you.'],
  four: ['Thank you for the four stars and for sharing your experience.', 'Thank you for taking the time to review us.'],
  three: ['Thank you for your honest review.', 'Thank you for taking the time to give us feedback.'],
  low: ["We're very sorry to read about your visit.", "Thank you for telling us about this, and we're sorry."],
};

const LINES: Record<RatingBand, Record<Theme, string>> = {
  five: {
    service: "We're so pleased your visit went well and the advice hit the mark.",
    staff: 'It means a great deal to the team to hear they made a difference to your visit.',
    price: "We're really glad you felt you got good value.",
    product: "We're delighted you're happy with your new kit.",
    wait_time: "We're glad you were looked after so quickly.",
    cleanliness: "We're pleased you enjoyed browsing the shop.",
    booking: "We're so glad your booking went smoothly.",
    other: 'We really appreciate you taking the time to write it.',
  },
  four: {
    service: "We're glad your visit went well.",
    staff: "We're pleased the team could help.",
    price: "We know value matters, and we're glad you were happy with your visit overall.",
    product: "We're glad you found what you needed.",
    wait_time: "Thank you for your patience on a busy day, and we're glad the visit was worth it.",
    cleanliness: "We're glad you enjoyed your visit, and your comments help us keep the shop looking its best.",
    booking: "We're glad the booking worked out, and the feedback on how it went is really useful.",
    other: "We're glad you enjoyed your visit.",
  },
  three: {
    service: "We're sorry the visit didn't quite live up to what you expected.",
    staff: "We're sorry the team fell short of what you expected.",
    price: "We understand price matters, and we're sorry the visit didn't feel like better value.",
    product: "We're sorry the kit wasn't everything you hoped for.",
    wait_time: "We're sorry you had to wait. We know your time matters.",
    cleanliness: "We're sorry the shop wasn't at its best during your visit.",
    booking: "We're sorry the booking didn't go as smoothly as it should have.",
    other: "We're sorry your visit wasn't everything you hoped for.",
  },
  low: {
    service: "This isn't the experience we want anyone to have with us.",
    staff: "This isn't how we want anyone to feel after talking to our team.",
    price: "We're sorry you were unhappy with the prices.",
    product: "A problem with your kit is frustrating, especially when you're relying on it.",
    wait_time: 'Being kept waiting is frustrating, and not what we want for anyone.',
    cleanliness: "The shop should always be clean and welcoming, and we're sorry it wasn't.",
    booking: "We're sorry your booking went wrong.",
    other: "This isn't the experience we want for anyone visiting.",
  },
};

const CLOSERS: Record<RatingBand, string[]> = {
  five: ["Enjoy your time outdoors, and do pop back in whenever you're passing.", 'We hope to see you again soon.', 'Happy adventuring, and see you next time.'],
  four: ["If anything would have made it five stars, we'd love to hear it next time you're in.", 'We hope to see you again soon.'],
  three: ["We'd welcome the chance to hear more, so please get in touch with the shop{contact}."],
  low: ['Please contact the shop{contact} and ask for the manager, so we can understand what happened.', "We'd like to hear the full story, so please contact the shop{contact} and ask for the manager."],
};

export const CUSTOM_PLACEHOLDER = '[Add a sentence about the specific point they raised.]';

/** "Sarah K." -> "Sarah". Anonymous or missing authors get a plain greeting. */
export function greeting(author: string): string {
  const first = author.trim().split(/\s+/)[0] ?? '';
  if (!first || /^(a|an|the)$/i.test(first) || /anonymous|customer|google user|guest/i.test(author) || !/^[A-Za-zÀ-ÿ'’-]{2,}$/.test(first)) return 'Hello,';
  return `Hi ${first.charAt(0).toUpperCase()}${first.slice(1)},`;
}

const pick = <T,>(arr: T[], seed: string) => arr[Math.floor(hash01(seed) * arr.length) % arr.length];

export interface DraftInput {
  key: string;
  author: string;
  rating: number;
  theme: Theme;
  action: ReviewAction;
  location: Pick<LocalLocation, 'name' | 'phone'>;
}

/** The pre-filled reply for a review. Empty for a removal request (nothing should be posted). */
export function draftReply({ key, author, rating, theme, action, location }: DraftInput): string {
  if (action === 'flag_for_removal') return '';
  const band = ratingBandOf(rating);
  const contact = location.phone ? ` on ${displayPhone(location.phone)}` : '';
  const parts = [pick(OPENERS[band], key + 'o'), LINES[band][theme]];
  if (action === 'reply_custom') parts.push(CUSTOM_PLACEHOLDER);
  parts.push(pick(CLOSERS[band], key + 'c').replace('{contact}', contact));
  return `${greeting(author)}\n\n${parts.join(' ')}\n\nThe team at ${location.name}`;
}

export const REMOVAL_STEPS = 'In Google Business Profile, open Reviews, choose the three dots next to this review and pick "Report review". Choose the reason that applies (spam, off-topic, conflict of interest, offensive). Google decides; it usually takes a few days. Do not reply to it in the meantime.';

/** True while a draft still has a [placeholder] that a person has to fill in. */
export const hasPlaceholder = (text: string) => /\[[^\]]{3,}\]/.test(text);

// ---------- Q&A answers ----------

export function draftAnswer(source: AnswerSource, loc: LocalLocation): string {
  const call = loc.phone ? ` If you have any other questions, call us on ${displayPhone(loc.phone)}.` : '';
  const sign = `\n\nThe team at ${loc.name}`;
  switch (source) {
    case 'hours':
      return loc.hours ? `Thanks for asking. Our opening hours are: ${loc.hours}.${call}${sign}` : `Thanks for asking. [Add the opening hours.]${call}${sign}`;
    case 'address':
      return `Thanks for asking. You'll find us at ${[loc.address, loc.postcode].filter(Boolean).join(', ') || '[address]'}.${call}${sign}`;
    case 'phone':
      return loc.phone ? `Thanks for asking. You can reach the shop on ${displayPhone(loc.phone)}.${sign}` : `Thanks for asking. [Add the phone number.]${sign}`;
    case 'website':
      return loc.website ? `Thanks for asking. You can browse and order online at ${loc.website}.${call}${sign}` : `Thanks for asking. [Add the website.]${sign}`;
    case 'categories':
      return `Thanks for asking. We're ${/^[aeiou]/i.test(loc.primaryCategory) ? 'an' : 'a'} ${loc.primaryCategory.toLowerCase() || '[type of business]'}${loc.additionalCategories.length ? `, and we also cover ${loc.additionalCategories.slice(0, 3).map((c) => c.toLowerCase()).join(', ')}` : ''}.${call}${sign}`;
    case 'description':
      return `Thanks for asking. ${firstSentence(loc.description) || '[Answer from the profile description.]'}${call}${sign}`;
    case 'none':
      return `Thanks for asking. [Write the answer here.]${call}${sign}`;
  }
}

const firstSentence = (s: string) => (s.match(/^[^.!?]+[.!?]/)?.[0] ?? s.slice(0, 200)).trim();

// ---------- weekly post ----------

const SEASON_OPEN: Record<string, string> = { winter: 'Winter is here', spring: 'Spring has arrived', summer: 'Summer is in full swing', autumn: 'Autumn is here' };
const THEME_LINE: Partial<Record<Theme, string>> = {
  staff: 'Our team are always happy to help and give advice, so come and have a chat.',
  product: 'Customers have been telling us how much they like the range, so do come and browse.',
  service: "Thank you to everyone who's left us a kind review recently.",
  price: 'Pop in to see the range for yourself.',
};

/** A post outline for the chosen type. Facts the code cannot know (offer terms, event dates) are placeholders. */
export function draftPost(type: PostType, loc: LocalLocation, season: string, topTheme: Theme | null): string {
  if (type === 'none_this_week') return '';
  const s = season.split(',').map((x) => x.trim());
  const opener = SEASON_OPEN[s[1]] ?? 'This week';
  const extra = s[2] ? ` With the ${s[2]} coming up, it's a good time to visit.` : '';
  const call = loc.phone ? ` Call ${displayPhone(loc.phone)} or just pop in.` : ' Just pop in.';
  const theme = topTheme && THEME_LINE[topTheme] ? ` ${THEME_LINE[topTheme]}` : '';
  switch (type) {
    case 'offer':
      return `[Offer name] at ${loc.name}: [what the offer includes], until [end date].${extra}${call}\n\nTerms: [offer terms].`;
    case 'event':
      return `Join us at ${loc.name} for [event name] on [date and time]. [One line on what happens and who it's for.]${extra}${call}`;
    case 'update':
      return `${opener} at ${loc.name}. [One or two lines on new stock, services or opening hours this week.]${theme}${extra}${call}`;
  }
}
