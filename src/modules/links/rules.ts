import { isChoice, isNoul, isScore, orderedScoreProbs } from '../../engine/jev/confidence';
import type { Answers } from '../../engine/jev/types';
import { AUTHORITY_TEXT } from './features';
import {
  ANGLE_LABEL, ANGLES, PROSPECT_TYPE_LABEL, PROSPECT_TYPES, SITE_TYPE_LABEL, SITE_TYPES, TOXIC_KEYS, TOXIC_LABEL,
  type Angle, type Band, type Features, type Level, type LinkVerdict, type ProspectType, type SiteType, type ToxicKey,
} from './types';

export const TOXIC_THRESHOLD = 0.7;
export const LINK_FARM_CONFIDENCE = 0.6;
export const RELEVANT_THRESHOLD = 0.5;
/** Confidence routing, as everywhere in the product. */
export const AUTO = 0.85;
export const REVIEW = 0.6;

export interface Assessment {
  verdict: LinkVerdict;
  /** Probability-style confidence in the verdict, 0..1. */
  confidence: number;
  router: 'auto' | 'review' | 'uncertain';
  relevance: number;
  siteType: SiteType | null;
  siteTypeConfidence: number;
  quality: Level | null;
  toxic: Record<ToxicKey, number>;
  prospectType: ProspectType | null;
  angle: Angle | null;
  /** Rules that fired, as short keys, for the log. */
  rules: string[];
}

const levelOf = (score: number): Level => (score < 0.75 ? 'low' : score < 1.5 ? 'medium' : 'high');

/** Combine Jev's answers and the code features into a verdict. Toxic beats Skip beats Pursue. */
export function assess(a: Answers, f: Features): Assessment {
  const rel = isNoul(a.relevant) ? a.relevant.noul : 0.5;
  const st = isChoice(a.site_type) && (SITE_TYPES as readonly string[]).includes(a.site_type.choice) ? (a.site_type.choice as SiteType) : null;
  const stConf = isChoice(a.site_type) ? a.site_type.confidence : 0;
  const q = isScore(a.quality) ? a.quality : undefined;
  const quality = q ? levelOf(q.score) : null;
  const toxic = Object.fromEntries(TOXIC_KEYS.map((k) => [k, isNoul(a[k]) ? a[k].noul : 0])) as Record<ToxicKey, number>;
  const pt = isChoice(a.prospect_type) && (PROSPECT_TYPES as readonly string[]).includes(a.prospect_type.choice) ? (a.prospect_type.choice as ProspectType) : null;
  const angle = isChoice(a.angle) && (ANGLES as readonly string[]).includes(a.angle.choice) ? (a.angle.choice as Angle) : null;
  const rules: string[] = [];

  const maxToxic = Math.max(...TOXIC_KEYS.map((k) => toxic[k]));
  let verdict: LinkVerdict;
  let confidence: number;
  if (maxToxic >= TOXIC_THRESHOLD) {
    verdict = 'toxic';
    confidence = maxToxic;
    rules.push('toxic_noul');
  } else if (st === 'link_farm' && stConf >= LINK_FARM_CONFIDENCE) {
    verdict = 'toxic';
    confidence = isChoice(a.site_type) ? a.site_type.probabilities.link_farm ?? stConf : stConf;
    rules.push('link_farm');
  } else if (f.alreadyLinking) {
    verdict = 'skip';
    confidence = 1;
    rules.push('already_linking');
  } else if (rel < RELEVANT_THRESHOLD) {
    verdict = 'skip';
    confidence = 1 - rel;
    rules.push('not_relevant');
  } else if (quality === 'low') {
    verdict = 'skip';
    confidence = q ? (orderedScoreProbs(q)[0] ?? 0.5) : 0.5;
    rules.push('low_quality');
  } else {
    verdict = 'pursue';
    // As sure as the weakest link: relevant, and not toxic.
    confidence = Math.min(rel, 1 - maxToxic);
    rules.push('pursue');
  }
  const router = confidence >= AUTO ? 'auto' : confidence >= REVIEW ? 'review' : 'uncertain';
  return { verdict, confidence: Math.round(confidence * 1000) / 1000, router, relevance: rel, siteType: st, siteTypeConfidence: stConf, quality, toxic, prospectType: pt, angle, rules };
}

// ---------- likelihood (from this site's own outcome ledger) ----------

/** Starting win rates before a site has outcomes of its own: cautious, ordered by how often each kind of site links out. */
export const PRIOR_WIN_RATE: Record<SiteType, number> = {
  resource_page: 0.3, guest_post: 0.35, directory: 0.5, editorial: 0.15, forum: 0.2, news: 0.08, link_farm: 0,
};
/** How many outcomes the prior is worth. With fewer real outcomes than this, the prior dominates. */
export const PRIOR_WEIGHT = 6;

export interface TypeStats { contacted: number; replied: number; won: number; lost: number }

export function likelihoodOf(siteType: SiteType | null, stats: Partial<Record<SiteType, TypeStats>>): { level: Level; rate: number; won: number; closed: number } {
  const t = siteType ?? 'editorial';
  const s = stats[t] ?? { contacted: 0, replied: 0, won: 0, lost: 0 };
  const closed = s.won + s.lost;
  const rate = (s.won + PRIOR_WIN_RATE[t] * PRIOR_WEIGHT) / (closed + PRIOR_WEIGHT);
  const level: Level = rate < 0.15 ? 'low' : rate < 0.35 ? 'medium' : 'high';
  return { level, rate, won: s.won, closed };
}

// ---------- priority ----------

export const AUTHORITY_WEIGHT: Record<Band, number> = { unknown: 0.5, none: 0.3, low: 0.55, medium: 0.8, high: 1 };
export const LIKELIHOOD_WEIGHT: Record<Level, number> = { low: 0.45, medium: 0.75, high: 1 };

/** Priority 1–100 = relevance × authority weight × likelihood weight. Only Pursue prospects get one. */
export function priorityOf(verdict: LinkVerdict, relevance: number, authority: Band, likelihood: Level): number | null {
  if (verdict !== 'pursue') return null;
  return Math.max(1, Math.min(100, Math.round(100 * relevance * AUTHORITY_WEIGHT[authority] * LIKELIHOOD_WEIGHT[likelihood])));
}

// ---------- reasons (plain sentences from the answers, built in code) ----------

const pct = (x: number) => `${Math.round(x * 100)}%`;
const article = (s: string) => (/^[aeiou]/i.test(s) ? 'an' : 'a');

export function reasonsFor(x: Assessment, f: Features, lk: { level: Level; won: number; closed: number }): string[] {
  const out: string[] = [];
  if (x.verdict === 'toxic') {
    const hits = TOXIC_KEYS.filter((k) => x.toxic[k] >= TOXIC_THRESHOLD);
    if (hits.length) out.push(`Looks like a site that ${hits.map((k) => `${TOXIC_LABEL[k]} (${pct(x.toxic[k])})`).join(' and ')}. Never contact it.`);
    else out.push(`Classed as a link farm (${pct(x.siteTypeConfidence)} sure). Never contact it.`);
    if (f.alreadyLinking) out.push('It already links to your site, so it is listed for a disavow review.');
  } else if (x.rules.includes('already_linking')) {
    out.push('Already links to your site, so there is nothing to pitch.');
  } else if (x.rules.includes('not_relevant')) {
    out.push(`Not topically relevant to your site (relevance ${pct(x.relevance)}).`);
  } else if (x.rules.includes('low_quality')) {
    out.push('Low quality as a link source, so outreach time is better spent elsewhere.');
  } else {
    out.push(`Topically relevant to your site (relevance ${pct(x.relevance)}).`);
  }
  if (x.siteType && x.verdict !== 'toxic') out.push(`Looks like ${article(SITE_TYPE_LABEL[x.siteType])} ${SITE_TYPE_LABEL[x.siteType].toLowerCase()}${x.quality ? `, ${x.quality} quality` : ''}.`);
  out.push(`Authority ${AUTHORITY_TEXT[f.authority]}.`);
  if (f.linkAttr === 'nofollow' || f.linkAttr === 'sponsored' || f.linkAttr === 'ugc') out.push(`The link in the export is ${f.linkAttr}, so it passes less value.`);
  if (f.spamTerms.length && x.verdict !== 'toxic') out.push(`Spam topics in the title or domain (${f.spamTerms.join(', ')}); check before pitching.`);
  if (x.verdict === 'pursue') {
    if (x.prospectType) out.push(`Opening: ${PROSPECT_TYPE_LABEL[x.prospectType].toLowerCase()}.${x.angle ? ` Suggested angle: ${ANGLE_LABEL[x.angle].toLowerCase()}.` : ''}`);
    out.push(lk.closed > 0
      ? `Reply chance ${lk.level}: ${lk.won} won of ${lk.closed} closed ${x.siteType ? SITE_TYPE_LABEL[x.siteType].toLowerCase() : 'similar'} prospects on this site, blended with a starting rate.`
      : `Reply chance ${lk.level}: no outcomes logged yet for ${x.siteType ? SITE_TYPE_LABEL[x.siteType].toLowerCase() + 's' : 'this kind of site'}, so this uses the starting rate.`);
  }
  return out;
}
