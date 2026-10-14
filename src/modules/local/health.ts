import type { CitationIssue } from './nap';
import type { LocalLocation, LocalQuestion, LocalReview } from './types';

/**
 * Profile health checks and the 0 to 100 health score. Every point lost is itemised, so the score is
 * never a black box: a location starts at 100 and each check takes off a fixed, documented amount.
 */

export const DAY = 86_400_000;
export const daysBetween = (fromIso: string, toIso: string) => Math.floor((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / DAY);

export type CheckArea = 'profile' | 'posts' | 'questions' | 'reviews' | 'rating' | 'citations';
export interface HealthCheck {
  key: string;
  area: CheckArea;
  label: string;
  /** Points taken off the score (0 when the check passes). */
  lost: number;
  /** Most this check can take off. */
  max: number;
  detail: string;
  /** What to do, shown when lost > 0. */
  fix: string;
}

export interface Health { score: number; checks: HealthCheck[] }

export interface HealthInput {
  loc: LocalLocation;
  reviews: LocalReview[];
  questions: LocalQuestion[];
  citationIssues: CitationIssue[];
  today: string;
}

export const DESCRIPTION_MIN = 250;
export const PHOTOS_MIN = 10;

export function averageRating(reviews: Pick<LocalReview, 'rating'>[]): number | null {
  return reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
}

export function daysSincePost(loc: LocalLocation, today: string): number | null {
  return loc.lastPostDate ? Math.max(0, daysBetween(loc.lastPostDate, today)) : null;
}

export function computeHealth({ loc, reviews, questions, citationIssues, today }: HealthInput): Health {
  const checks: HealthCheck[] = [];
  const add = (c: HealthCheck) => checks.push(c);

  add(loc.hours.trim()
    ? { key: 'hours', area: 'profile', label: 'Opening hours', lost: 0, max: 12, detail: 'Hours are set.', fix: '' }
    : { key: 'hours', area: 'profile', label: 'Opening hours', lost: 12, max: 12, detail: 'No opening hours on the profile.', fix: 'Add regular opening hours, and special hours for bank holidays.' });

  const dl = loc.description.trim().length;
  add(dl === 0
    ? { key: 'description', area: 'profile', label: 'Description', lost: 10, max: 10, detail: 'No business description.', fix: `Write a description of at least ${DESCRIPTION_MIN} characters: what the shop sells, who it serves and where it is.` }
    : dl < DESCRIPTION_MIN
      ? { key: 'description', area: 'profile', label: 'Description', lost: 6, max: 10, detail: `Description is ${dl} characters, under ${DESCRIPTION_MIN}.`, fix: `Expand the description to at least ${DESCRIPTION_MIN} characters (Google allows up to 750).` }
      : { key: 'description', area: 'profile', label: 'Description', lost: 0, max: 10, detail: `${dl} characters.`, fix: '' });

  const ph = loc.photoCount;
  add(ph == null
    ? { key: 'photos', area: 'profile', label: 'Photos', lost: 0, max: 10, detail: 'Photo count not in the export, not scored.', fix: '' }
    : ph === 0
      ? { key: 'photos', area: 'profile', label: 'Photos', lost: 10, max: 10, detail: 'No photos.', fix: `Add at least ${PHOTOS_MIN} photos: shopfront, interior, team and products.` }
      : ph < PHOTOS_MIN
        ? { key: 'photos', area: 'profile', label: 'Photos', lost: 6, max: 10, detail: `${ph} photo${ph === 1 ? '' : 's'}, fewer than ${PHOTOS_MIN}.`, fix: `Add ${PHOTOS_MIN - ph} more photos so the profile has at least ${PHOTOS_MIN}.` }
        : { key: 'photos', area: 'profile', label: 'Photos', lost: 0, max: 10, detail: `${ph} photos.`, fix: '' });

  add(loc.additionalCategories.length
    ? { key: 'categories', area: 'profile', label: 'Categories', lost: 0, max: 5, detail: `${loc.additionalCategories.length} additional categor${loc.additionalCategories.length === 1 ? 'y' : 'ies'}.`, fix: '' }
    : { key: 'categories', area: 'profile', label: 'Categories', lost: 5, max: 5, detail: 'Only a primary category is set.', fix: 'Add the additional categories that describe what else the shop sells or does.' });

  const dp = daysSincePost(loc, today);
  add(dp == null
    ? { key: 'posts', area: 'posts', label: 'Posts', lost: 10, max: 10, detail: 'No post on record.', fix: 'Publish a profile post this week.' }
    : dp >= 30
      ? { key: 'posts', area: 'posts', label: 'Posts', lost: 10, max: 10, detail: `Last post ${dp} days ago.`, fix: 'Publish a profile post this week.' }
      : dp >= 7
        ? { key: 'posts', area: 'posts', label: 'Posts', lost: 6, max: 10, detail: `Last post ${dp} days ago.`, fix: 'Publish a profile post this week.' }
        : { key: 'posts', area: 'posts', label: 'Posts', lost: 0, max: 10, detail: `Last post ${dp} day${dp === 1 ? '' : 's'} ago.`, fix: '' });

  const openQs = questions.filter((q) => !q.answered).length;
  add({ key: 'questions', area: 'questions', label: 'Unanswered questions', lost: Math.min(12, openQs * 4), max: 12, detail: openQs ? `${openQs} question${openQs === 1 ? '' : 's'} without an answer.` : 'Every question is answered.', fix: openQs ? 'Answer each question on the profile, or mark spam ones.' : '' });

  const unreplied = reviews.filter((r) => !r.replied);
  const lowUnreplied = unreplied.filter((r) => r.rating <= 2).length;
  add({ key: 'unreplied', area: 'reviews', label: 'Unreplied reviews', lost: Math.min(10, unreplied.length * 2), max: 10, detail: unreplied.length ? `${unreplied.length} review${unreplied.length === 1 ? '' : 's'} without a reply.` : 'Every review has a reply.', fix: unreplied.length ? 'Reply to every review, newest and lowest-rated first.' : '' });
  add({ key: 'unreplied_low', area: 'reviews', label: 'Unreplied 1 to 2-star reviews', lost: Math.min(12, lowUnreplied * 4), max: 12, detail: lowUnreplied ? `${lowUnreplied} low rating${lowUnreplied === 1 ? '' : 's'} still without a reply.` : 'None waiting.', fix: lowUnreplied ? 'Reply to low ratings within a day, or escalate to the shop manager.' : '' });

  const recent = reviews.filter((r) => r.date && daysBetween(r.date, today) < 30 && daysBetween(r.date, today) >= 0).length;
  add(!reviews.length
    ? { key: 'velocity', area: 'reviews', label: 'Review velocity', lost: 0, max: 4, detail: 'No reviews uploaded, not scored.', fix: '' }
    : recent === 0
      ? { key: 'velocity', area: 'reviews', label: 'Review velocity', lost: 4, max: 4, detail: 'No new reviews in the last 30 days.', fix: 'Ask happy customers for a review, for example with a QR code at the till.' }
      : { key: 'velocity', area: 'reviews', label: 'Review velocity', lost: 0, max: 4, detail: `${recent} new review${recent === 1 ? '' : 's'} in the last 30 days.`, fix: '' });

  const rating = loc.rating ?? averageRating(reviews);
  add(rating == null
    ? { key: 'rating', area: 'rating', label: 'Average rating', lost: 0, max: 10, detail: 'No rating yet, not scored.', fix: '' }
    : { key: 'rating', area: 'rating', label: 'Average rating', lost: rating < 3.5 ? 10 : rating < 4 ? 6 : rating < 4.3 ? 3 : 0, max: 10, detail: `${rating.toFixed(1)} stars.`, fix: rating < 4.3 ? 'Work through the themes in low reviews and reply to each one.' : '' });

  const tierLoss = citationIssues.reduce((s, c) => s + (c.tier === 1 ? 6 : c.tier === 2 ? 3 : 1), 0);
  add({ key: 'citations', area: 'citations', label: 'Citation consistency', lost: Math.min(15, tierLoss), max: 15, detail: citationIssues.length ? `${citationIssues.length} director${citationIssues.length === 1 ? 'y lists' : 'ies list'} different details.` : 'Listings match the profile.', fix: citationIssues.length ? 'Fix the listings below, Google, Apple and Bing first.' : '' });

  const lost = checks.reduce((s, c) => s + c.lost, 0);
  return { score: Math.max(0, Math.min(100, 100 - lost)), checks };
}

export function healthBand(score: number): 'ok' | 'warn' | 'bad' {
  return score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'bad';
}

// ---------- review velocity ----------

export interface Period { label: string; start: string; end: string; count: number; avgRating: number | null }

/** Reviews and average rating in consecutive 30-day windows, oldest first, ending today. */
export function reviewPeriods(reviews: Pick<LocalReview, 'rating' | 'date'>[], today: string, n = 4, days = 30): Period[] {
  const end = Date.parse(today.slice(0, 10)) + DAY;
  const out: Period[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const hi = end - i * days * DAY;
    const lo = hi - days * DAY;
    const inP = reviews.filter((r) => r.date && Date.parse(r.date) >= lo && Date.parse(r.date) < hi);
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    out.push({ label: i === 0 ? `Last ${days} days` : `${i * days + 1}–${(i + 1) * days} days ago`, start: iso(lo), end: iso(hi - DAY), count: inP.length, avgRating: averageRating(inP) });
  }
  return out;
}

// ---------- bands for Jev (named, never raw numbers) ----------

export function postRecencyBand(days: number | null): string {
  if (days == null) return 'never_or_unknown (no post on record)';
  if (days < 7) return 'this_week (posted in the last 7 days)';
  if (days < 30) return 'weeks_ago (last post 1 to 4 weeks ago)';
  if (days < 90) return 'months_ago (last post 1 to 3 months ago)';
  return 'long_ago (no post for over 3 months)';
}

export function seasonOf(today: string): string {
  const m = new Date(today).getUTCMonth();
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];
  const season = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  const note: Record<number, string> = { 11: 'run-up to Christmas', 0: 'January sales period', 7: 'school summer holidays', 3: 'Easter holidays', 9: 'October half term' };
  return `${month}, ${season}${note[m] ? `, ${note[m]}` : ''}`;
}

export function ratingBand(rating: number | null): string {
  if (rating == null) return 'unknown';
  if (rating >= 4.6) return 'excellent (4.6 or above)';
  if (rating >= 4.2) return 'good (4.2 to 4.5)';
  if (rating >= 3.5) return 'fair (3.5 to 4.1)';
  return 'poor (below 3.5)';
}

export function reviewAgeBand(date: string | null, today: string): string {
  if (!date) return 'unknown';
  const d = daysBetween(date, today);
  if (d <= 2) return 'last_2_days';
  if (d <= 7) return 'this_week';
  if (d <= 30) return 'this_month';
  return 'over_a_month_ago';
}
