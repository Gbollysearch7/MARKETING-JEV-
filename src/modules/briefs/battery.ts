import type { ChoiceQuestion, Questions } from '../../engine/jev/types';
import { countBand, coverageOf, positionBand, relevanceBand, totalVolume, VOLUME_SOURCE_LABEL, volumeBand } from './bands';
import { isQuestion, modifierSet, MODIFIERS } from './text';
import type { AngleOption, Coverage, Format, Intent, SiteFacts, TargetData } from './types';

export const CRITERIA_VERSION = 'briefs.v1';

export const GO_CRITERIA: Record<string, string> = {
  create: 'Write a new page for `target`. Fits when `demand.monthly_volume` is low or higher (or unknown with many keywords), `business.relevance` is medium or higher, and `coverage.site_has_page_in_top_20` is no or the existing page is about a different topic.',
  expand_existing: 'Add depth to `coverage.existing_page` instead of writing a new page. Fits when that page already ranks in the top 20 and its title covers the same topic as `target.primary_keyword`, so a new page would compete with it.',
  skip: 'Write nothing. Fits when `business.relevance` is low or very low, or `demand.monthly_volume` is none or very low, or `coverage.existing_page` already ranks top 3 and covers the topic.',
};

export const INTENT_CRITERIA: Record<Intent, string> = {
  informational: 'The searcher wants to learn or understand something (how to, what is, guides, tips).',
  commercial: 'The searcher is comparing options before buying (best, review, vs, top picks).',
  transactional: 'The searcher wants to buy now (cheap, buy, sale, price, a specific product).',
  local: 'The searcher wants something in a place or near them (near me, a town, a region).',
  navigational: 'The searcher wants a specific brand or website.',
};

export const FORMAT_CRITERIA: Record<Format, string> = {
  guide: 'A long-form explainer or how-to. Fits informational searches and question keywords.',
  comparison: 'A side-by-side comparison of two or more options. Fits keywords with vs, compare, alternative or difference.',
  listicle: 'A ranked list of picks. Fits best-of and top searches where people compare products.',
  tool_page: 'An interactive calculator, size chart, planner or finder. Fits keywords asking for a tool.',
  product_or_category: 'A shop page listing products to buy. Fits transactional searches when `site.sells_products_in_topic` is yes.',
  faq: 'A short page of questions and direct answers. Fits a handful of narrow questions with little demand each.',
  video_first: 'A page led by a video. Fits physical techniques that are easier to show than describe.',
  template: 'A downloadable checklist or template. Fits keywords asking for a checklist, list, template or printable.',
};

export const LENGTH_CRITERIA: Record<string, string> = {
  '600_900': '600 to 900 words. A narrow question, a product or category page, or an FAQ.',
  '1000_1500': '1,000 to 1,500 words. A focused how-to or a short comparison.',
  '1800_2500': '1,800 to 2,500 words. A full guide or a best-of list with several picks.',
  '3000_plus': '3,000 words or more. A definitive guide covering many sub-questions across a broad topic.',
};

export const EDGE_CRITERIA: Record<string, string> = {
  first_hand_testing: 'First-hand testing: the team uses the products or does the activity and reports what happened. Fits product and gear topics when `site.sells_products_in_topic` is yes.',
  original_data: 'Original data: figures only this site has, such as its own sales, search or survey data. Fits when `site.has_first_party_data` is yes.',
  clearer_comparison: 'A clearer comparison: a side-by-side table and a plain verdict. Fits comparison and best-of searches.',
  more_current: 'More current: up-to-date prices, rules or models. Fits topics that change year to year.',
  local_relevance: 'Local relevance: places, rules and suppliers for one country or region. Fits keywords naming a place or "near me".',
  deeper_coverage: 'Deeper coverage: answers every sub-question in `target.question_keywords` in one place. Fits broad topics with many questions.',
};

/** Angle catalogue. Only angles whose trigger matches the target's keywords are offered, plus a general fallback. */
const ANGLE_CATALOGUE: { key: string; label: string; criteria: string; when: (m: Set<string>) => boolean }[] = [
  { key: 'for_beginners', label: 'For beginners', criteria: 'Written for someone doing this for the first time: no jargon, what to expect, common mistakes.', when: (m) => m.has('beginner') || m.has('whatis') || m.has('howto') || m.has('question') },
  { key: 'uk_specific', label: 'UK-specific', criteria: 'Specific to the UK: UK places, rules, seasons, retailers and prices in pounds.', when: (m) => m.has('uk') || m.has('near') },
  { key: 'vs_market_leader', label: 'Versus the market leader', criteria: 'Set against the best-known option the reader already has in mind, and when an alternative is better.', when: (m) => m.has('vs') || m.has('best') || m.has('review') },
  { key: 'budget', label: 'On a budget', criteria: 'For readers watching cost: where to save, where not to, and good-value picks.', when: (m) => m.has('price') },
  { key: 'expert_tested', label: 'Expert-tested', criteria: 'Built on hands-on testing by experienced people, with what they found in use.', when: (m) => m.has('best') || m.has('review') },
  { key: 'step_by_step', label: 'Step by step', criteria: 'A numbered sequence the reader can follow from start to finish.', when: (m) => m.has('howto') || m.has('choose') || m.has('guide') },
  { key: 'with_checklist', label: 'With a checklist', criteria: 'Ends in a checklist the reader can use: what to check, pack or ask before deciding.', when: (m) => m.has('choose') || m.has('checklist') || m.has('beginner') },
  { key: 'for_families', label: 'For families', criteria: 'For parents and children: safety, sizes and what works for kids.', when: (m) => m.has('family') },
  { key: 'for_women', label: 'For women', criteria: 'For women: fit, sizing and needs specific to women.', when: (m) => m.has('women') },
  { key: 'buyers_guide', label: "Buyer's guide", criteria: 'What to look for when buying: features that matter, which do not, and how to match them to use.', when: (m) => m.has('choose') || m.has('buy') || m.has('best') },
];

export const COMPLETE_ANGLE: AngleOption = { key: 'complete_overview', label: 'The complete overview', criteria: 'A general, comprehensive treatment with no particular audience or slant.' };

export function anglesFor(t: TargetData): AngleOption[] {
  const m = modifierSet(t.keywords.map((k) => k.keyword));
  const picked = ANGLE_CATALOGUE.filter((a) => a.when(m)).map(({ key, label, criteria }) => ({ key, label, criteria }));
  // Always at least three choices: add the beginner and step-by-step framings if the keywords did not trigger enough.
  for (const fallback of ['for_beginners', 'step_by_step']) {
    if (picked.length >= 2) break;
    const a = ANGLE_CATALOGUE.find((x) => x.key === fallback)!;
    if (!picked.some((p) => p.key === a.key)) picked.push({ key: a.key, label: a.label, criteria: a.criteria });
  }
  return [...picked, COMPLETE_ANGLE];
}

export interface BuiltState { state: Record<string, unknown>; bands: Record<string, string>; coverage: Coverage }

/** The state for the first call (go, intent, format). Only keywords, titles and named bands. */
export function buildState(t: TargetData, titles: Map<string, string | null>, site: SiteFacts): BuiltState {
  const coverage = coverageOf(t, titles);
  const kws = t.keywords.map((k) => k.keyword);
  const mods = modifierSet(kws);
  const vol = totalVolume(t);
  const bands = {
    monthly_volume: volumeBand(vol),
    relevance: relevanceBand(t.relevance),
    existing_position: positionBand(coverage.position),
    keywords: countBand(kws.length),
  };
  const state: Record<string, unknown> = {
    target: {
      primary_keyword: t.primary,
      related_keywords: kws.filter((k) => k !== t.primary).slice(0, 15),
      question_keywords: kws.filter(isQuestion).slice(0, 10),
      modifiers_found: MODIFIERS.filter((x) => mods.has(x.key)).map((x) => x.label),
    },
    demand: {
      monthly_volume: bands.monthly_volume,
      volume_source: VOLUME_SOURCE_LABEL[vol == null ? 'none' : t.volumeSource],
      keywords_in_target: bands.keywords,
    },
    coverage: {
      site_has_page_in_top_20: coverage.path ? 'yes' : 'no',
      ...(coverage.path ? { existing_page: { url_path: coverage.path, title: coverage.title ?? undefined, best_position: bands.existing_position } } : {}),
      other_site_pages_in_top_20: coverage.otherPages === 0 ? 'none' : coverage.otherPages === 1 ? 'one' : 'two_or_more',
    },
    business: { relevance: bands.relevance },
    site: {
      sells_products_in_topic: site.sellsInTopic ? 'yes' : 'no',
      has_first_party_data: site.hasSearchConsole || site.hasGa4 ? 'yes' : 'no',
    },
  };
  return { state, bands, coverage };
}

export function goQuestions(hasExisting: boolean): Questions {
  const criteria: Record<string, string> = { create: GO_CRITERIA.create };
  if (hasExisting) criteria.expand_existing = GO_CRITERIA.expand_existing;
  criteria.skip = GO_CRITERIA.skip;
  return {
    go: { type: 'choice', instructions: 'Should the site publish content for `target`, given `demand`, `coverage` and `business.relevance`? The bands are already calculated; treat "unknown" as missing data, not as zero.', criteria } satisfies ChoiceQuestion,
    intent: { type: 'choice', instructions: 'What is the dominant search intent behind `target.primary_keyword` and `target.related_keywords`?', criteria: { ...INTENT_CRITERIA } } satisfies ChoiceQuestion,
    format: { type: 'choice', instructions: 'Which content format best serves the searches in `target`, given `target.modifiers_found` and `site`?', criteria: { ...FORMAT_CRITERIA } } satisfies ChoiceQuestion,
  };
}

/** The state for the second call adds the decisions already made, so length can depend on intent and format. */
export function detailState(base: Record<string, unknown>, go: string, intent: string, format: string): Record<string, unknown> {
  return { ...base, decided: { action: go, intent, format } };
}

export function detailQuestions(angles: AngleOption[]): Questions {
  const ac: Record<string, string> = {};
  for (const a of angles) ac[a.key] = `${a.label}. ${a.criteria}`;
  return {
    angle: { type: 'choice', instructions: 'Which angle would make a piece on `target.primary_keyword` most useful to the people making these searches, given `target.related_keywords` and `target.modifiers_found`?', criteria: ac } satisfies ChoiceQuestion,
    length: { type: 'choice', instructions: 'How long should the piece be, given `decided.intent`, `decided.format` and how many sub-questions `target.question_keywords` and `target.related_keywords` cover?', criteria: { ...LENGTH_CRITERIA } } satisfies ChoiceQuestion,
    edge: { type: 'choice', instructions: 'What should make this piece better than the pages already ranking for `target.primary_keyword`, given `site` and `decided.format`?', criteria: { ...EDGE_CRITERIA } } satisfies ChoiceQuestion,
  };
}
