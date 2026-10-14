import { isChoice, isNoul, isScore } from '../../engine/jev/confidence';
import type { Answers } from '../../engine/jev/types';
import { DUPLICATE_KILL, THIN_UNIQUE_WORDS } from './checks';
import { DEFAULT_GATE_THRESHOLDS, type CodeChecks, type Failure, type GatePageInput, type GateThresholds, type GateVerdict, type Router } from './types';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (x: number) => x.toLocaleString('en-GB');

/** Routes on the probability as shown (two decimals), so a displayed 0.85 is always Auto. */
export function routerFor(p: number, t: GateThresholds = DEFAULT_GATE_THRESHOLDS): Router {
  const v = r2(p);
  return v >= t.auto ? 'auto' : v >= t.review ? 'review' : 'uncertain';
}

/** Hard rules decided in code, before any model call. */
export function hardRule(c: CodeChecks): { verdict: 'kill'; rule: string } | null {
  if (c.placeholders.length) return { verdict: 'kill', rule: `Placeholder text found (${c.placeholders[0]})` };
  if (c.duplicateRatio > DUPLICATE_KILL) return { verdict: 'kill', rule: `Duplicate of ${c.duplicateOf} (${pct(c.duplicateRatio)} of phrasing shared)` };
  return null;
}

/** Which verdicts Jev may choose. Index is off the table while a fixable code problem remains. */
export function allowedVerdicts(c: CodeChecks): { allowed: GateVerdict[]; applied: string[] } {
  const applied: string[] = [];
  if (c.missingTitle || c.missingH1) applied.push(`Index not allowed: missing ${c.missingTitle && c.missingH1 ? 'title and H1' : c.missingTitle ? 'title' : 'H1'}`);
  if (c.duplicateTitleWith || c.duplicateH1With) applied.push('Index not allowed: title or H1 repeated in this batch');
  if (c.uniqueWords < 30) applied.push('Index not allowed: under 30 words unique to the page');
  if (c.duplicateRatio >= 0.6) applied.push('Index not allowed: near-duplicate of another page');
  return { allowed: applied.length ? ['improve', 'kill'] : ['index', 'improve', 'kill'], applied };
}

const noul = (a: Answers | null, k: string): number | null => (a && isNoul(a[k]) ? a[k].noul : null);

/** Failures found by code and by Jev's answers, most severe first, with a severity for ranking. */
export function failuresOf(page: GatePageInput, c: CodeChecks, a: Answers | null, hasGsc: boolean): { f: Failure; w: number; reason: string; fix: string }[] {
  const out: { f: Failure; w: number; reason: string; fix: string }[] = [];
  const q = page.query ? `“${page.query}”` : 'the title';
  if (c.placeholders.length) out.push({ f: 'placeholder', w: 1, reason: `Placeholder text is still on the page (${c.placeholders.join('; ')}).`, fix: 'Fix the generator so every template variable is filled before the page is sent.' });
  if (c.duplicateRatio > DUPLICATE_KILL) {
    const group = c.duplicateSource === 'batch' ? Math.max(1, c.duplicateGroup ?? 1) : 0;
    if (group) out.push({ f: 'duplicate', w: 0.98,
      reason: group === 1 ? `Its text is the same as ${c.duplicateOf} in this batch: ${pct(c.duplicateRatio)} of its 5-word phrases are shared.` : `Its text is the same as ${n(group)} other pages in this batch, such as ${c.duplicateOf}: ${pct(c.duplicateRatio)} of its 5-word phrases are shared.`,
      fix: `Give each of the ${n(group + 1)} copies text specific to its own ${page.query ? `query (this one: ${q})` : 'place or item'}; if they really are the same page, publish one and drop the rest.` });
    else out.push({ f: 'duplicate', w: 0.98, reason: `It is a duplicate of ${c.duplicateOf}, already live on the site: ${pct(c.duplicateRatio)} of its 5-word phrases are shared.`, fix: `Do not publish; point searchers to ${c.duplicateOf} instead.` });
  }
  else if (c.duplicateRatio >= 0.6) out.push({ f: 'near_duplicate', w: 0.6 + c.duplicateRatio * 0.3, reason: `It shares ${pct(c.duplicateRatio)} of its phrasing with ${c.duplicateOf}${c.duplicateSource === 'site' ? ' (a live page)' : ''}.`, fix: `Rewrite the sentences it shares with ${c.duplicateOf} so they are specific to ${page.query ? q : 'this page'}; merge the two only if they cover the same place or item.` });
  if (c.missingTitle || c.missingH1) out.push({ f: 'missing_title', w: 0.9, reason: `The page has no ${c.missingTitle && c.missingH1 ? 'title or H1' : c.missingTitle ? 'title' : 'H1'}.`, fix: `Add a ${c.missingTitle ? 'title' : 'H1'} that names what this specific page covers.` });
  if (c.uniqueWords < THIN_UNIQUE_WORDS) out.push({ f: 'thin', w: c.uniqueWords < 30 ? 0.92 : 0.78, reason: c.wordCount === 0 ? 'No body text was found. If the page was fetched, its content may be loaded by JavaScript or blocked; otherwise send the body.' : c.templateShare >= 0.15 ? `Only ${n(c.uniqueWords)} of its ${n(c.wordCount)} words are unique to this page; the rest is template text.` : `It has only ${n(c.wordCount)} words of body text.`, fix: `Add at least ${n(Math.max(50, 150 - c.uniqueWords))} words specific to this page: the facts, examples or details a reader of its title would look for.` });
  if (c.duplicateTitleWith || c.duplicateH1With) out.push({ f: 'duplicate_title', w: 0.7, reason: `Its ${c.duplicateTitleWith ? 'title' : 'H1'} is also used by ${n(Math.max(c.duplicateTitleWith, c.duplicateH1With))} other ${Math.max(c.duplicateTitleWith, c.duplicateH1With) === 1 ? 'page' : 'pages'} in this batch.`, fix: 'Give the page a title and H1 that only it uses, naming its specific place or item.' });
  const risk = noul(a, 'brand_legal_risk');
  if (risk != null && risk >= 0.6) out.push({ f: 'risk', w: 0.55 + risk * 0.4, reason: `It makes a claim with brand or legal risk, such as a guaranteed outcome or a safety promise (Jev ${r2(risk)}).`, fix: 'Remove or qualify guaranteed outcomes and health, safety or financial promises.' });
  const helpful = noul(a, 'helpful_to_searcher');
  if (helpful != null && helpful < 0.4) out.push({ f: 'not_helpful', w: 0.5 + (1 - helpful) * 0.4, reason: `A person searching for ${q} would probably not find what they need here (Jev ${r2(helpful)}).`, fix: `Answer ${q} directly in the first paragraph, with the specifics a searcher expects.` });
  const depth = a && isScore(a.depth) ? a.depth : null;
  if (depth && depth.score < 0.8) out.push({ f: 'shallow', w: 0.5 + (0.8 - depth.score) * 0.4, reason: `Jev rates its coverage of the title as thin (depth ${r2(depth.score)} of 2).`, fix: 'Cover the obvious sub-questions the title raises, with concrete detail for this page.' });
  const tf = noul(a, 'template_feel');
  if (tf != null && tf >= 0.7) out.push({ f: 'template_feel', w: 0.4 + tf * 0.4, reason: `It reads like a template with the names swapped in (Jev ${r2(tf)}).`, fix: 'Replace boilerplate sentences with details that would only be true on this page.' });
  const uv = noul(a, 'unverifiable_claim');
  if (uv != null && uv >= 0.7) out.push({ f: 'unverifiable', w: 0.35 + uv * 0.4, reason: `It states facts or numbers with no source (Jev ${r2(uv)}).`, fix: 'Add a source or basis for each number and factual claim, or remove it.' });
  const mf = noul(a, 'machine_filler');
  if (mf != null && mf >= 0.7) out.push({ f: 'filler', w: 0.3 + mf * 0.4, reason: `It contains filler sentences that add no information (Jev ${r2(mf)}).`, fix: 'Cut generic filler sentences and lead with useful detail.' });
  if (hasGsc && page.query && c.queryImpressions === 0 && c.headImpressions === 0) out.push({ f: 'no_demand', w: 0.4, reason: `The site has had no Search Console impressions for ${q} or queries with its head terms (${c.headTerms.join(', ') || 'none'}) yet.`, fix: `Check there is demand for ${q} before publishing, or retarget the page at a query that has impressions.` });
  return out.sort((x, y) => y.w - x.w);
}

/** Positive evidence for an Index verdict, strongest first. */
function strengths(page: GatePageInput, c: CodeChecks, a: Answers | null): string[] {
  const out: { w: number; s: string }[] = [];
  const q = page.query ? `“${page.query}”` : 'its title';
  const helpful = noul(a, 'helpful_to_searcher');
  if (helpful != null && helpful >= 0.6) out.push({ w: helpful, s: `A person searching for ${q} would find what they need (Jev ${r2(helpful)}).` });
  const depth = a && isScore(a.depth) ? a.depth : null;
  if (depth && depth.score >= 1.2) out.push({ w: 0.5 + depth.score / 4, s: `Jev rates its coverage of the title as ${depth.score >= 1.6 ? 'thorough' : 'solid'} (depth ${r2(depth.score)} of 2).` });
  if (c.uniqueWords >= THIN_UNIQUE_WORDS) out.push({ w: 0.7, s: `${n(c.uniqueWords)} of its ${n(c.wordCount)} words are unique to this page.` });
  if (c.duplicateRatio < 0.3) out.push({ w: 0.6, s: c.duplicateOf ? `Distinct from every sibling (closest is ${c.duplicateOf} at ${pct(c.duplicateRatio)} shared phrasing).` : 'Distinct from every other page checked.' });
  if ((c.queryImpressions ?? 0) > 0) out.push({ w: 0.65, s: `Search Console shows ${n(c.queryImpressions!)} impressions for ${q}.` });
  else if ((c.headImpressions ?? 0) > 0) out.push({ w: 0.55, s: `Queries containing ${c.headTerms.map((h) => `“${h}”`).join(' and ')} have ${n(c.headImpressions!)} impressions.` });
  const tf = noul(a, 'template_feel');
  if (tf != null && tf < 0.3) out.push({ w: 0.5, s: `Reads as written for this page, not a filled-in template (Jev ${r2(tf)}).` });
  return out.sort((x, y) => y.w - x.w).map((x) => x.s);
}

export interface Combined {
  verdict: GateVerdict;
  confidence: number;
  probabilities: Partial<Record<GateVerdict, number>>;
  router: Router;
  reasons: string[];
  fixes: string[];
  failures: Failure[];
  rulesApplied: string[];
}

/** Hard-rule Kill, with no model call. */
export function ruleKill(page: GatePageInput, c: CodeChecks, rule: string, hasGsc: boolean): Combined {
  const fs = failuresOf(page, c, null, hasGsc);
  return {
    verdict: 'kill', confidence: 1, probabilities: { kill: 1 }, router: 'auto',
    reasons: fs.slice(0, 3).map((f) => f.reason), fixes: fs.map((f) => f.fix).slice(0, 4), failures: fs.map((f) => f.f), rulesApplied: [rule],
  };
}

/** Combine Jev's answers with the code checks into the verdict, confidence, three reasons and fixes. */
export function combine(page: GatePageInput, c: CodeChecks, a: Answers, applied: string[], hasGsc: boolean, t: GateThresholds = DEFAULT_GATE_THRESHOLDS): Combined {
  const va = a.verdict;
  if (!isChoice(va)) throw new Error(`No verdict answer for ${page.path}`);
  const probabilities = Object.fromEntries(Object.entries(va.probabilities).map(([k, v]) => [k, r3(v)])) as Partial<Record<GateVerdict, number>>;
  let verdict = va.choice as GateVerdict;
  let confidence = r3(va.probabilities[verdict] ?? 0);
  const rules = [...applied];
  const risk = noul(a, 'brand_legal_risk');
  if (verdict === 'index' && risk != null && risk >= 0.7) {
    verdict = 'improve';
    confidence = r3(1 - (va.probabilities.index ?? 0));
    rules.push('Index changed to Improve: brand or legal risk at 0.70 or above');
  }
  const fs = failuresOf(page, c, a, hasGsc);
  let reasons: string[];
  if (verdict === 'index') {
    reasons = strengths(page, c, a).slice(0, 3);
    const minor = fs.filter((f) => f.w < 0.6).slice(0, Math.max(0, 3 - reasons.length));
    reasons.push(...minor.map((f) => `Minor: ${f.reason.charAt(0).toLowerCase()}${f.reason.slice(1)}`));
  } else {
    reasons = fs.slice(0, 3).map((f) => f.reason);
  }
  if (!reasons.length) reasons = ['Signals are mixed; see the answers and probabilities.'];
  return {
    verdict, confidence, probabilities, router: routerFor(confidence, t),
    reasons, fixes: verdict === 'index' ? fs.filter((f) => f.w < 0.6).map((f) => f.fix).slice(0, 2) : fs.map((f) => f.fix).slice(0, 5),
    failures: fs.map((f) => f.f), rulesApplied: rules,
  };
}
