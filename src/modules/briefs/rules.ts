import type { Answer } from '../../engine/jev/types';
import { totalVolume } from './bands';
import type { Coverage, Go, Pick, Router, TargetData } from './types';

/** The chosen option and its probability, which is the confidence shown to the user. */
export function pickOf<T extends string>(a: Answer | undefined): Pick<T> | null {
  if (!a || a.type !== 'choice') return null;
  const probs = a.probabilities ?? {};
  return { choice: a.choice as T, p: Math.round((probs[a.choice] ?? a.confidence ?? 0) * 1000) / 1000, probs };
}

export function routeOf(p: number): Router {
  return p >= 0.85 ? 'auto' : p >= 0.6 ? 'review' : 'uncertain';
}

export const fmtN = (n: number) => n.toLocaleString('en-GB');

const VOLUME_WORDS: Record<string, string> = { none: 'no measurable demand', unknown: 'unknown demand' };

/** Plain-language reasons from the same bands Jev saw. Code-built, never model prose. */
export function reasonsFor(t: TargetData, cov: Coverage, bands: Record<string, string>): string[] {
  const vol = totalVolume(t);
  const band = bands.monthly_volume;
  const out: string[] = [];
  const vs = band.split(' ')[0];
  out.push(vol == null ? 'Demand is unknown: no volumes and no Search Console data for these keywords.'
    : `Demand is ${VOLUME_WORDS[vs] ?? vs.replace('_', ' ')}: about ${fmtN(vol)} ${t.volumeSource === 'search_console' ? 'impressions' : 'searches'} a month across ${t.keywords.length} keyword${t.keywords.length === 1 ? '' : 's'}.`);
  out.push(cov.path ? `The site already ranks ${cov.path} at position ${cov.position?.toFixed(0)} for this topic${cov.title ? ` ("${cov.title}")` : ''}.` : 'No page on the site ranks in the top 20 for these keywords.');
  if (cov.otherPages > 0) out.push(`${cov.otherPages} other page${cov.otherPages === 1 ? '' : 's'} also rank in the top 20, so check for overlap before publishing.`);
  out.push(`Business relevance is ${t.relevance} of 5.`);
  return out;
}

/** What would change a skip or expand call. Code-built from the inputs that drove it. */
export function changeFor(go: Go, t: TargetData, cov: Coverage, bands: Record<string, string>): string[] {
  if (go === 'create') return [];
  const out: string[] = [];
  if (go === 'expand_existing') {
    out.push(`${cov.path ?? 'The existing page'} dropping out of the top 20, or covering a different topic, would make this a new page.`);
    return out;
  }
  if (t.relevance <= 2) out.push(`Higher business relevance: 3 or more out of 5 (now ${t.relevance}).`);
  const v = bands.monthly_volume.split(' ')[0];
  if (v === 'unknown') out.push('Search volumes for these keywords, so demand can be judged.');
  else if (v === 'none' || v === 'very_low') out.push('More demand: 50 or more searches a month across the target.');
  if (cov.path && cov.position != null && cov.position <= 3) out.push(`${cov.path} dropping out of the top 3.`);
  else if (cov.path) out.push(`No existing page in the top 20 (now ${cov.path} at ${cov.position?.toFixed(0)}).`);
  if (!out.length) out.push('Higher business relevance or more related keywords showing demand.');
  return out;
}
