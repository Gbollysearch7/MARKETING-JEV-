import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockProvider } from '../src/engine/jev/client';
import { buildReviewQuestions, buildReviewState, CRITERIA_VERSION } from '../src/modules/local/battery';
import { computeHealth, postRecencyBand, reviewPeriods, seasonOf } from '../src/modules/local/health';
import { mockLocalAnswer } from '../src/modules/local/mock';
import { citationIssues, compareCitation, directoryRank, normAddress, normPhone, normPostcode, sameAddress } from '../src/modules/local/nap';
import { parseCitations, parseDate, parseLocations, parseQuestions, parseRating, parseReviews } from '../src/modules/local/parse';
import { draftAnswer, draftReply, greeting, hasPlaceholder } from '../src/modules/local/replies';
import { attentionPriority, reviewDecision } from '../src/modules/local/rules';
import { analyseLocation, isoWeek, runLocal } from '../src/modules/local/run';
import { DEFAULT_SETTINGS, type LocalLocation } from '../src/modules/local/types';

const csv = (n: string) => readFileSync(`samples/${n}`, 'utf8');
const TODAY = '2026-10-13';

describe('local parsing', () => {
  it('reads the sample exports with tolerant headers', () => {
    const l = parseLocations(csv('local-locations.csv'));
    expect(l.rows).toHaveLength(6);
    const kes = l.rows.find((x) => x.locId === 'SO-KES')!;
    expect(kes.name).toBe('Sample Outdoors Keswick');
    expect(kes.additionalCategories).toEqual(['Camping store', 'Hiking equipment store', 'Clothing store']);
    expect(kes.photoCount).toBe(26);
    expect(kes.rating).toBe(4.7);
    const r = parseReviews(csv('local-reviews.csv'));
    expect(r.rows.length).toBeGreaterThanOrEqual(55);
    expect(r.rows.filter((x) => !x.replied).length).toBeGreaterThan(20);
    expect(parseQuestions(csv('local-questions.csv')).rows).toHaveLength(12);
    expect(parseCitations(csv('local-citations.csv')).rows.length).toBeGreaterThan(30);
  });
  it('accepts other header names, star formats and UK dates', () => {
    const r = parseReviews('Store code,Reviewer,Star rating,Comment,Create time,Owner response\nA1,Jo B,FIVE,Lovely,01/10/2026,\nA1,Sam,★★,Bad,2 Oct 2026,Sorry to hear that\nA1,X,7,odd,2026-10-03,');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ locId: 'A1', rating: 5, date: '2026-10-01', replied: false });
    expect(r.rows[1]).toMatchObject({ rating: 2, date: '2026-10-02', replied: true });
    expect(r.warnings[0]).toMatch(/not 1 to 5/);
    expect(parseRating('4/5')).toBe(4);
    expect(parseDate('2026-10-13T09:00:00Z')).toBe('2026-10-13');
  });
  it('rejects a file without the key columns', () => {
    expect(() => parseReviews('Author,Rating\nJo,5')).toThrow(/location id/);
  });
});

describe('NAP normalisation', () => {
  it('normalises postcodes, phones and addresses', () => {
    expect(normPostcode('la229an')).toBe('LA22 9AN');
    expect(normPhone('+44 (0)1632 960102')).toBe('01632960102');
    expect(normPhone('0044 1632 960102')).toBe('01632960102');
    expect(normPhone('+44 1632 960102')).toBe('01632960102');
    expect(normAddress('3 Rydal Rd., Ambleside, Cumbria, LA22 9AN')).toBe(normAddress('3 Rydal Road, Ambleside'));
    expect(normAddress('12 Lake St, Keswick')).toBe('12 lake street keswick');
    expect(normAddress('St Johns Street')).toBe('saint johns street');
    expect(sameAddress('14 Lake Road', '14 Lake Road, Keswick')).toBe(true);
    expect(sameAddress('120 Grampian Road, Aviemore', '102 Grampian Road, Aviemore')).toBe(false);
  });
  it('flags only real mismatches, ranked by directory importance', () => {
    const locs = parseLocations(csv('local-locations.csv')).rows;
    const cits = parseCitations(csv('local-citations.csv')).rows;
    const issues = (id: string) => citationIssues(locs.find((l) => l.locId === id)!, cits.filter((c) => c.locId === id));
    // Ambleside: Apple and Yell differ only in formatting; Bing has a different phone number.
    expect(issues('SO-AMB').map((i) => i.directory)).toEqual(['Bing Places']);
    expect(issues('SO-AMB')[0].mismatches.map((m) => m.field)).toEqual(['phone']);
    // Fort William: Google first.
    const ftw = issues('SO-FTW');
    expect(ftw[0].directory).toBe('Google');
    expect(ftw[0].mismatches[0].field).toBe('name');
    expect(ftw.map((i) => i.directory)).toEqual(['Google', 'Facebook', 'Yelp']);
    // Betws-y-Coed: wrong postcode on Apple, duplicate on Yelp.
    const byc = issues('SO-BYC');
    expect(byc[0]).toMatchObject({ directory: 'Apple Maps', tier: 1 });
    expect(byc[0].mismatches.map((m) => m.field)).toEqual(['postcode']);
    expect(byc.some((i) => i.directory === 'Yelp' && i.duplicate)).toBe(true);
    expect(issues('SO-HAT')).toEqual([]);
    expect(directoryRank('Google Business Profile')).toBeLessThan(directoryRank('Thomson Local'));
    expect(directoryRank('Thomson Local')).toBeLessThan(directoryRank('FreeIndex'));
  });
  it('ignores blank listed fields', () => {
    const loc = parseLocations(csv('local-locations.csv')).rows[0];
    expect(compareCitation(loc, { locId: loc.locId, directory: 'Yell', listedName: '', address: '', phone: '', url: '' })).toEqual([]);
  });
});

describe('health score', () => {
  const locs = parseLocations(csv('local-locations.csv')).rows;
  const reviews = parseReviews(csv('local-reviews.csv')).rows;
  const questions = parseQuestions(csv('local-questions.csv')).rows;
  const cits = parseCitations(csv('local-citations.csv')).rows;
  const a = (id: string) => analyseLocation(locs.find((l) => l.locId === id)!, reviews.filter((r) => r.locId === id), questions.filter((q) => q.locId === id), cits.filter((c) => c.locId === id), TODAY);
  it('scores 0 to 100 with an itemised breakdown that adds up', () => {
    for (const l of locs) {
      const h = a(l.locId).health;
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(100);
      expect(100 - h.checks.reduce((s, c) => s + c.lost, 0)).toBe(Math.max(0, h.score));
    }
    expect(a('SO-KES').health.score).toBeGreaterThan(a('SO-FTW').health.score);
  });
  it('catches each profile gap', () => {
    const ftw = a('SO-FTW').health.checks;
    const lost = (k: string) => ftw.find((c) => c.key === k)!.lost;
    expect(lost('hours')).toBe(12);
    expect(lost('categories')).toBe(5);
    expect(lost('photos')).toBe(6);
    expect(lost('posts')).toBe(10);
    expect(a('SO-AMB').health.checks.find((c) => c.key === 'description')!.lost).toBe(6);
    expect(a('SO-HAT').health.checks.find((c) => c.key === 'description')!.lost).toBe(10);
    expect(a('SO-KES').health.checks.find((c) => c.key === 'posts')!.lost).toBe(0);
  });
  it('bands and periods', () => {
    expect(postRecencyBand(3)).toMatch(/^this_week/);
    expect(postRecencyBand(45)).toMatch(/^months_ago/);
    expect(postRecencyBand(null)).toMatch(/^never/);
    expect(seasonOf(TODAY)).toBe('October, autumn, October half term');
    const p = reviewPeriods(reviews, TODAY);
    expect(p).toHaveLength(4);
    expect(p.reduce((s, x) => s + x.count, 0)).toBeGreaterThan(40);
    expect(isoWeek(TODAY)).toBe('2026-W42');
    const h = computeHealth({ loc: { ...locs[0], hours: '', description: '', photoCount: 0, additionalCategories: [], lastPostDate: null }, reviews: [], questions: [], citationIssues: [], today: TODAY });
    expect(h.score).toBe(100 - 12 - 10 - 10 - 5 - 10);
  });
});

describe('replies', () => {
  const loc = { name: 'Sample Outdoors Keswick', phone: '01632 960101' };
  it('builds a signed, warm reply with no discounts or promises', () => {
    const t = draftReply({ key: 'k1', author: 'Hannah W.', rating: 5, theme: 'product', action: 'reply_template', location: loc });
    expect(t.startsWith('Hi Hannah,')).toBe(true);
    expect(t.endsWith('The team at Sample Outdoors Keswick')).toBe(true);
    expect(t).not.toMatch(/discount|voucher|refund|% off|free|guarantee|promise/i);
    const low = draftReply({ key: 'k2', author: 'A customer', rating: 1, theme: 'staff', action: 'escalate_to_manager', location: loc });
    expect(low.startsWith('Hello,')).toBe(true);
    expect(low).toMatch(/01632 960101/);
    expect(hasPlaceholder(draftReply({ key: 'k3', author: 'Sam', rating: 4, theme: 'staff', action: 'reply_custom', location: loc }))).toBe(true);
    expect(draftReply({ key: 'k4', author: 'Sam', rating: 1, theme: 'other', action: 'flag_for_removal', location: loc })).toBe('');
    expect(greeting('Anonymous')).toBe('Hello,');
  });
});

describe('rules', () => {
  const review = { locId: 'A', key: 'r1', author: 'Jo', rating: 2, text: 'Rude staff.', date: TODAY, replied: false, replyText: '' };
  const loc = { name: 'Shop', phone: '' };
  const choice = (c: string, p = 0.9) => ({ type: 'choice' as const, choice: c, probabilities: { [c]: p, other: 1 - p }, confidence: p });
  it('never removes a review that does not break the rules', () => {
    const d = reviewDecision(review, loc, { action: choice('flag_for_removal'), theme: choice('staff'), breaks_rules: { type: 'noul', noul: 0.1 } }, DEFAULT_SETTINGS);
    expect(d.action).toBe('escalate_to_manager');
    expect(d.jevAction).toBe('flag_for_removal');
    expect(d.router).toBe('review');
  });
  it('auto-approves only confident templated 5-star replies, never 1 to 2 stars', () => {
    const five = { ...review, rating: 5, text: 'Great' };
    expect(reviewDecision(five, loc, { action: choice('reply_template', 0.95), theme: choice('service') }, DEFAULT_SETTINGS).status).toBe('approved');
    expect(reviewDecision(five, loc, { action: choice('reply_template', 0.95), theme: choice('service') }, { ...DEFAULT_SETTINGS, autoApproveFiveStar: false }).status).toBe('proposed');
    expect(reviewDecision(five, loc, { action: choice('reply_template', 0.7), theme: choice('service') }, DEFAULT_SETTINGS).status).toBe('proposed');
    expect(reviewDecision(review, loc, { action: choice('reply_template', 0.99), theme: choice('staff') }, { autoApproveFiveStar: true, autoApproveFourStar: true }).status).toBe('proposed');
  });
  it('ranks urgent items on unhealthy locations first', () => {
    expect(attentionPriority({ kind: 'review', health: 50, stars: 1 })).toBeGreaterThan(attentionPriority({ kind: 'review', health: 50, stars: 5 }));
    expect(attentionPriority({ kind: 'citation', health: 40, tier: 1 })).toBeGreaterThan(attentionPriority({ kind: 'citation', health: 90, tier: 1 }));
  });
});

describe('weekly run with the mock', () => {
  it('decides every unreplied review, open question and location', async () => {
    const locations = parseLocations(csv('local-locations.csv')).rows as LocalLocation[];
    const reviews = parseReviews(csv('local-reviews.csv')).rows;
    const questions = parseQuestions(csv('local-questions.csv')).rows;
    const provider = new MockProvider(mockLocalAnswer);
    const calls: string[] = [];
    const out = await runLocal({ locations, reviews, questions, settings: DEFAULT_SETTINGS, today: TODAY }, async (key, cv, input) => { calls.push(`${cv}:${key}`); return provider.decide(input); });
    expect(out.failures).toEqual([]);
    expect(out.reviews).toHaveLength(reviews.filter((r) => !r.replied).length);
    expect(out.questions).toHaveLength(questions.filter((q) => !q.answered).length);
    expect(out.posts).toHaveLength(6);
    expect(calls.every((c) => c.startsWith(`${CRITERIA_VERSION}:`))).toBe(true);
    const byAuthor = (a: string) => out.reviews.find((r) => r.review.author === a)!.decision;
    expect(byAuthor('Ross B.').action).toBe('flag_for_removal');
    expect(byAuthor('Grace L.').action).toBe('flag_for_removal');
    expect(byAuthor('Kate O.').action).toBe('escalate_to_manager');
    expect(byAuthor('Kate O.').status).toBe('proposed');
    expect(out.reviews.filter((r) => r.decision.action === 'flag_for_removal')).toHaveLength(2);
    expect(out.reviews.some((r) => r.decision.status === 'approved' && r.review.rating === 5)).toBe(true);
    expect(out.reviews.filter((r) => r.review.rating <= 2).every((r) => r.decision.status === 'proposed')).toBe(true);
    const spamQ = out.questions.find((q) => /followers/.test(q.question.question))!;
    expect(spamQ.decision.action).toBe('spam');
    const hours = out.questions.find((q) => /Sundays/.test(q.question.question))!;
    expect(hours.decision.action).toBe('answer_from_profile');
    expect(hours.decision.draft).toMatch(/Sun 10:00/);
    expect(out.posts.find((p) => p.locId === 'SO-KES')!.decision.post).toBe('none_this_week');
    expect(out.posts.find((p) => p.locId === 'SO-FTW')!.decision.post).not.toBe('none_this_week');
  });
  it('builds a state with bands, not raw dates', () => {
    const s = buildReviewState({ locId: 'A', key: 'k', author: 'Jo', rating: 4, text: '', date: '2026-10-12', replied: false, replyText: '' }, { name: 'Shop', primaryCategory: 'Outdoor sports store' }, TODAY);
    expect(s.review).toEqual({ stars: '4_of_5', text: '(no text, star rating only)', age: 'last_2_days' });
    expect(Object.keys(buildReviewQuestions())).toEqual(['action', 'theme', 'sentiment', 'breaks_rules']);
  });
});

describe('QA round 2: messy uploads and reply wording', () => {
  it('matches location ids across files ignoring case and spaces, and merges duplicate rows', () => {
    const locs = parseLocations('Store code,Business name,Address line 1,Locality\n so-kes ,Shop Keswick,1 Lake Road,Keswick\nSO-KES,Shop Keswick,1 Lake Road,Keswick\n');
    expect(locs.rows).toHaveLength(1);
    expect(locs.rows[0].locId).toBe('SO-KES');
    expect(locs.rows[0].address).toBe('1 Lake Road, Keswick');
    expect(locs.warnings[0]).toMatch(/more than once/);
    const revs = parseReviews('Store code,Reviewer,Star rating,Review comment,Create time\nSo-Kes,Anon,FIVE,,12/10/2026\n');
    expect(revs.rows[0].locId).toBe('SO-KES');
  });
  it('greets anonymous reviewers plainly', () => {
    expect(greeting('Anon')).toBe('Hello,');
    expect(greeting('Siobhán Ó Briain')).toBe('Hi Siobhán,');
  });
  it('lists categories in plain British English', () => {
    const loc = { primaryCategory: 'Outdoor sports store', additionalCategories: ['Camping store', 'Climbing equipment store'], phone: '', name: 'Shop', hours: '', address: '', postcode: '', website: '', description: '' } as unknown as LocalLocation;
    expect(draftAnswer('categories', loc)).toContain("We're an outdoor sports store, and we're also a camping store and a climbing equipment store.");
  });
});
