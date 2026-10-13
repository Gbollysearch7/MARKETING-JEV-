import { isProtectedType, type Signals } from './signals';
import { VERDICTS, type Thresholds, type UrlData, type Verdict } from './types';

export interface RuleOutcome {
  /** Set when the URL is not scored at all (not a live, indexable, canonical page). */
  skip: string | null;
  /** Set when a hard rule fixes the verdict without asking the model. */
  locked: { verdict: Verdict; reason: string } | null;
  /** Verdicts the model may choose from after hard constraints. */
  allowed: Verdict[];
  /** Plain-language constraints applied, shown on the evidence panel. */
  applied: string[];
}

/** Hard rules run before the model (PRD section 5, decision design). */
export function applyRules(u: UrlData, s: Signals, t: Thresholds, hasCandidates: boolean): RuleOutcome {
  const applied: string[] = [];
  if (u.crawl) {
    if (u.crawl.status >= 300 && u.crawl.status < 400) return { skip: `Already redirects (${u.crawl.status})`, locked: null, allowed: [], applied };
    if (u.crawl.status >= 400) return { skip: `Returns ${u.crawl.status}`, locked: null, allowed: [], applied };
    if (!u.crawl.indexable) return { skip: 'Not indexable (noindex or blocked)', locked: null, allowed: [], applied };
    if (u.crawl.canonicalPath && u.crawl.canonicalPath !== u.path) return { skip: `Canonicalised to ${u.crawl.canonicalPath}`, locked: null, allowed: [], applied };
  }
  if (isProtectedType(s.pageType)) {
    return { skip: null, locked: { verdict: 'leave', reason: `Protected page type (${s.pageType})` }, allowed: ['leave'], applied: [`Protected page type (${s.pageType}): always Leave`] };
  }

  let allowed: Verdict[] = [...VERDICTS];
  const drop = (vs: Verdict[], why: string) => {
    const before = allowed.length;
    allowed = allowed.filter((v) => !vs.includes(v));
    if (allowed.length < before) applied.push(why);
  };
  if (s.conversions != null && s.conversions >= t.protectConversions) drop(['prune', 'redirect'], `Has conversions (${s.conversions}): never pruned or redirected`);
  if (s.ageDays != null && s.ageDays < t.protectNewerThanDays) drop(['prune'], `Updated ${s.ageDays} days ago: never pruned before ${t.protectNewerThanDays} days`);
  if (!s.competing.length) drop(['merge'], 'No competing page shares 3 or more top-20 queries: Merge not available');
  if (!hasCandidates) drop(['redirect'], 'No candidate destination page: Redirect not available');
  return { skip: null, locked: null, allowed, applied };
}
