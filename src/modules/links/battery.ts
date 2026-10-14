import type { ChoiceQuestion, NoulQuestion, Questions, ScoreQuestion } from '../../engine/jev/types';
import { AUTHORITY_TEXT, LINK_ATTR_TEXT, TRAFFIC_TEXT } from './features';
import type { Angle, Features, ProspectInput, ProspectType, SiteType } from './types';

export { LINKS_CRITERIA_VERSION } from './types';

export interface SiteContext {
  name: string;
  domain: string;
  topics: { titles: string[]; words: string[] };
}

const FOOTPRINT_TEXT: Record<string, string> = {
  many_hyphens_in_domain: 'domain name has three or more hyphens',
  many_digits_in_domain: 'domain name has four or more digits',
  write_for_us_page: 'page invites guest posts ("write for us")',
  paid_placement_terms: 'page mentions prices, sponsored posts or paid placement',
  link_selling_terms: 'page offers links, backlink packages or link exchanges',
  paid_write_for_us: 'a "write for us" page combined with prices or spam topics',
};

/** The filtered state Jev sees for one prospect. Only text from the export and named bands. */
export function buildState(p: ProspectInput, f: Features, site: SiteContext, foundVia: string) {
  return {
    site: {
      name: site.name,
      domain: site.domain,
      top_page_titles: site.topics.titles,
      topic_words: site.topics.words,
    },
    prospect: {
      url: p.url,
      domain: p.domain,
      page_title: p.title || undefined,
      snippet: p.snippet || undefined,
      anchor_text: p.anchor || undefined,
      found_via: foundVia,
    },
    signals: {
      authority: AUTHORITY_TEXT[f.authority],
      traffic: TRAFFIC_TEXT[f.traffic],
      link_attribute: LINK_ATTR_TEXT[f.linkAttr],
      spam_topics_found: f.spamTerms.length ? f.spamTerms : 'none',
      footprints: f.footprints.length ? f.footprints.map((x) => FOOTPRINT_TEXT[x] ?? x) : 'none',
      page_mentions_site_name: f.mentionsBrand ? 'yes' : 'no',
      already_links_to_site: f.alreadyLinking ? 'yes' : 'no',
    },
  };
}

export const SITE_TYPE_CRITERIA: Record<SiteType, string> = {
  editorial: 'An independent blog, magazine or review site that publishes its own articles and chooses what to link to.',
  resource_page: 'A curated page of useful links on a topic (a "resources", "links" or "recommended reading" page).',
  guest_post: 'A site whose page invites outside writers to submit articles ("write for us", contributor guidelines).',
  directory: 'A listing of businesses or websites, usually by category, where sites submit themselves.',
  forum: 'A discussion forum, Q&A thread or community board where users post.',
  news: 'A news publisher or news section reporting on current events.',
  link_farm: 'A site that exists to sell or trade links: mixed unrelated topics, paid placement offers, thin pages built for links.',
};

export const PROSPECT_TYPE_CRITERIA: Record<ProspectType, string> = {
  editorial: 'An article where a link could be earned on merit, inside the body text.',
  resource_page: 'A list of recommended links where the site could be suggested as an addition.',
  guest_post: 'The opening is to write an article for this site.',
  directory: 'The opening is a listing or submission in a directory.',
  unlinked_mention: 'The page already mentions the site or its brand by name (see `signals.page_mentions_site_name`) but does not link to it.',
  broken_link: 'The page links to something that no longer works and the site could offer a replacement.',
  competitor_linked: 'The page links to a competitor (see `prospect.found_via`) and could link to the site for the same reason.',
};

export const ANGLE_CRITERIA: Record<Angle, string> = {
  data_study: 'Offer original data or survey results to cite. Fits news, reports and articles built on statistics or trends.',
  expert_quote: 'Offer an expert comment for an article. Fits news and editorial pieces that quote specialists or give advice.',
  resource_suggestion: 'Suggest one of the site\'s guides as an addition. Fits resource pages, kit lists and roundups that link out to useful guides.',
  correction: 'Point out an outdated detail or broken link and offer a current source. Fits old pages, dated guides or pages with broken links.',
  partnership: 'Propose a collaboration such as a product review, giveaway or co-created piece. Fits review sites, bloggers and community sites.',
  ask_for_link: 'Thank them for mentioning the site and ask for the mention to become a link. Fits only when `signals.page_mentions_site_name` is yes.',
};

const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({ type: 'choice', instructions, criteria });
const noul = (instructions: string): NoulQuestion => ({ type: 'noul', instructions });

/** The battery for one prospect (criteria version links.v1). Every question asks one thing. */
export function buildQuestions(): Questions {
  const quality: ScoreQuestion = {
    type: 'score',
    instructions: 'How good a place to earn a link is the site in `prospect`, judging by `prospect.page_title`, `prospect.snippet`, `signals.authority` and `signals.traffic`?',
    criteria: [
      'Low: thin, spammy, off-topic or abandoned, with little authority or traffic.',
      'Medium: a real site with some readers and modest authority.',
      'High: a well-maintained site with real readers, good authority and traffic.',
    ],
  };
  return {
    relevant: noul('Is the page in `prospect` about a topic that readers of `site` would care about, given `site.top_page_titles` and `site.topic_words`?'),
    site_type: choice('What kind of site is `prospect`, judging by `prospect.url`, `prospect.page_title` and `prospect.snippet`?', SITE_TYPE_CRITERIA),
    quality,
    sells_links: noul('Does `prospect` look like a site whose business is selling links or paid posts (price lists, link packages, "do-follow links for sale"), judging by `signals.footprints` and `prospect.snippet`? A single disclosed sponsor thank-you is not link selling.'),
    pbn_footprint: noul('Does `prospect` look like part of a private blog network built to pass links, judging by `prospect.domain`, `signals.footprints` and a mix of unrelated topics?'),
    spam_content: noul('Is the content of `prospect` spam, such as gambling, loans, essay writing or pharma (see `signals.spam_topics_found`), or auto-generated text?'),
    prospect_type: choice('What is the best link opening on the page in `prospect` for `site`?', PROSPECT_TYPE_CRITERIA),
    angle: choice('Which pitch best fits the page in `prospect`, given what the page is (`prospect.page_title`, `prospect.snippet`) and whether it already names the site (`signals.page_mentions_site_name`)?', ANGLE_CRITERIA),
  };
}
