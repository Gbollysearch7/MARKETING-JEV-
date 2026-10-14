import { COMPLETE_ANGLE } from './battery';
import { headTerm, isQuestion, modifiersOf, normKw, proper, sentence, similarity } from './text';
import type { AngleOption, BriefContent, Coverage, Edge, Format, Go, Intent, Length, LinkSuggestion, OutlineSection, SiteFacts, TargetData } from './types';

/** Brief assembly. Everything here is templates over data and Jev's closed-set choices. No generated prose. */

export const FORMAT_LABEL: Record<Format, string> = {
  guide: 'Guide', comparison: 'Comparison', listicle: 'Listicle', tool_page: 'Tool page', product_or_category: 'Product or category page',
  faq: 'FAQ', video_first: 'Video-first', template: 'Template',
};
export const LENGTH_LABEL: Record<Length, string> = { '600_900': '600 to 900 words', '1000_1500': '1,000 to 1,500 words', '1800_2500': '1,800 to 2,500 words', '3000_plus': '3,000+ words' };
export const EDGE_LABEL: Record<Edge, string> = {
  first_hand_testing: 'First-hand testing', original_data: 'Original data', clearer_comparison: 'Clearer comparison',
  more_current: 'More current', local_relevance: 'Local relevance', deeper_coverage: 'Deeper coverage',
};
export const GO_LABEL: Record<Go, string> = { create: 'Create', expand_existing: 'Expand existing', skip: 'Skip' };
export const INTENT_LABEL: Record<Intent, string> = { informational: 'Informational', commercial: 'Commercial', transactional: 'Transactional', local: 'Local', navigational: 'Navigational' };

/** The topic noun phrase used in headings: the head term, or the primary keyword when nothing is left after stripping. */
export function topicOf(t: TargetData): string {
  return proper(headTerm(t.primary) || normKw(t.primary));
}

const ANGLE_TITLE: Record<string, string> = {
  for_beginners: 'for beginners', uk_specific: 'in the UK', vs_market_leader: 'compared with the big names', budget: 'on a budget',
  expert_tested: 'tested and rated', step_by_step: 'step by step', with_checklist: 'with a checklist', for_families: 'for families',
  for_women: 'for women', buyers_guide: "a buyer's guide", complete_overview: 'the complete guide',
};

/** Three title options from templates over the primary keyword, format and angle. */
export function titleOptions(t: TargetData, format: Format, angle: string, year: number): string[] {
  const P = sentence(normKw(t.primary));
  const topic = topicOf(t);
  const T = sentence(topic);
  const a = ANGLE_TITLE[angle] ?? '';
  // Skip the angle phrase when the primary keyword already says it ("wild camping uk" + "in the UK").
  const pm = new Set(modifiersOf(t.primary));
  const pw = new Set(normKw(t.primary).split(' '));
  const hasAngle = Boolean(a) && !(ANGLE_MOD[angle] && pm.has(ANGLE_MOD[angle])) && !pw.has(a.split(' ').slice(-1)[0].toLowerCase());
  const byFormat: Record<Format, string[]> = {
    guide: [`${P}: what to know before you start`, `${T} explained${hasAngle ? `, ${a}` : ''}`],
    comparison: [`${P}: compared side by side`, `${T} compared: which should you choose?`],
    listicle: [`The best ${topic} (${year})${hasAngle ? `, ${a}` : ''}`, `${P}: our picks`],
    tool_page: [`${T} calculator`, `${P}: find the right one in a minute`],
    product_or_category: [`${T}${hasAngle ? ` ${a}` : ''}`, `Shop ${topic}`],
    faq: [`${T}: your questions answered`, `${P}: quick answers`],
    video_first: [`${P} (with video)`, `Watch: ${proper(normKw(t.primary))}`],
    template: [`${T} checklist (free template)`, `${P}: printable checklist`],
  };
  const general = pw.has('guide') ? `${P}: everything you need to know` : `${P}: the complete guide`;
  const first = hasAngle ? (/^(a|the) /.test(a) ? `${P}: ${a}` : `${P} ${a}`) : general;
  const out: string[] = [];
  for (const s of [first, ...byFormat[format], general, `${P}: an overview`]) {
    const c = s.replace(/\s+/g, ' ').trim();
    if (!out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

const OPENING: Record<Format, (topic: string, primary: string) => { h2: string; note: string }> = {
  guide: (t) => ({ h2: `${sentence(t)}: the short answer`, note: 'Answer the main search in the first 100 words, then go deeper.' }),
  comparison: (t) => ({ h2: `${sentence(t)} compared at a glance`, note: 'Open with a table: options in columns, the attributes readers search for in rows.' }),
  listicle: (t) => ({ h2: `Our ${t} picks at a glance`, note: 'One line per pick saying who it suits, then a section per pick.' }),
  tool_page: (t) => ({ h2: `${sentence(t)} tool`, note: 'The tool goes above the fold. Explain the inputs and how to read the result below it.' }),
  product_or_category: (t) => ({ h2: `Shop ${t}`, note: 'Product grid first, with filters for the attributes the target queries mention.' }),
  faq: (t) => ({ h2: `${sentence(t)}: quick answers`, note: 'Two or three sentences per answer; link out for depth.' }),
  video_first: (_t, p) => ({ h2: `Watch: ${p}`, note: 'Video at the top, then a written summary of each step with timestamps.' }),
  template: (t) => ({ h2: `Download the ${t} checklist`, note: 'Template first, then how to use it.' }),
};

const MOD_SECTION: Record<string, (t: string) => { h2: string; note: string }> = {
  beginner: (t) => ({ h2: `${sentence(t)} for beginners: where to start`, note: 'What a first-timer needs to know, what to expect and the common mistakes.' }),
  uk: (t) => ({ h2: `${sentence(t)} in the UK`, note: 'UK places, rules, seasons and retailers. Prices in pounds.' }),
  near: (t) => ({ h2: `Finding ${t} near you`, note: 'How to find local options; link to location pages if the site has them.' }),
  best: (t) => ({ h2: `How to pick the best ${t}`, note: 'The criteria that separate good from great, then the picks.' }),
  review: (t) => ({ h2: `${sentence(t)} reviews: what to check`, note: 'What to look for in reviews and what the site\'s own customers say, if you have it.' }),
  price: (t) => ({ h2: `${sentence(t)} on a budget`, note: 'Where saving money is fine, where it is false economy, and good-value options.' }),
  buy: (t) => ({ h2: `Where to buy ${t}`, note: 'Link to the site\'s own product or category pages first.' }),
  checklist: (t) => ({ h2: `${sentence(t)} checklist`, note: 'A scannable list the reader can save or print.' }),
  tool: (t) => ({ h2: `${sentence(t)} sizing and planning`, note: 'Sizing tables or a planner, with how to measure.' }),
  choose: (t) => ({ h2: `How to choose ${t}`, note: 'The few attributes that matter most, in order.' }),
  family: (t) => ({ h2: `${sentence(t)} for kids and families`, note: 'Safety, sizes and what works for children.' }),
  women: (t) => ({ h2: `${sentence(t)} for women`, note: 'Fit and sizing differences, and women-specific options.' }),
  year: () => ({ h2: 'What has changed this year', note: 'New models, prices or rules since last year. Date every claim.' }),
};

const ANGLE_MOD: Record<string, string> = { for_beginners: 'beginner', uk_specific: 'uk', budget: 'price', with_checklist: 'checklist', buyers_guide: 'choose', for_families: 'family', for_women: 'women' };
const ANGLE_SECTION: Record<string, (t: string) => { h2: string; note: string }> = {
  step_by_step: (t) => ({ h2: `${sentence(t)}, step by step`, note: 'Numbered steps from start to finish, one action per step.' }),
  vs_market_leader: (t) => ({ h2: `How the best-known ${t} options compare`, note: 'Name the option readers already know and say plainly when an alternative is better.' }),
  expert_tested: () => ({ h2: 'How we tested', note: 'Who tested, where, for how long and in what conditions. Only include testing that really happened.' }),
};

/** Ordered H2s with the queries each must answer, built from the target's keywords, the format and the angle. */
export function buildOutline(t: TargetData, format: Format, angle: string): OutlineSection[] {
  const topic = topicOf(t);
  const kws = t.keywords.map((k) => normKw(k.keyword));
  const used = new Set<string>();
  const out: OutlineSection[] = [];
  const open = OPENING[format](topic, proper(normKw(t.primary)));
  out.push({ ...open, answers: [normKw(t.primary)] });
  used.add(normKw(t.primary));

  // Question-form keywords become H2 questions.
  for (const q of kws.filter((k) => isQuestion(k) && !used.has(k)).slice(0, 6)) {
    out.push({ h2: /^how to\b/.test(q) ? sentence(q) : `${sentence(q)}?`, answers: [q], note: 'Answer directly in the first sentence under the heading.' });
    used.add(q);
  }
  // Modifiers become sections.
  const groups = new Map<string, string[]>();
  for (const k of kws) for (const m of modifiersOf(k)) if (MOD_SECTION[m] || m === 'vs') groups.set(m, [...(groups.get(m) ?? []), k]);
  const angleMod = ANGLE_MOD[angle];
  if (angleMod && !groups.has(angleMod)) groups.set(angleMod, []);
  for (const [m, list] of groups) {
    if (m === 'vs') {
      for (const k of list.filter((x) => !used.has(x)).slice(0, 2)) {
        out.push({ h2: `${sentence(k)}: which to choose`, answers: [k], note: 'Side-by-side table, then a plain verdict for each type of reader.' });
        used.add(k);
      }
      continue;
    }
    const fresh = list.filter((k) => !used.has(k));
    if (list.length && !fresh.length) continue;
    out.push({ ...MOD_SECTION[m](topic), answers: fresh.slice(0, 5) });
    for (const k of fresh) used.add(k);
  }
  if (ANGLE_SECTION[angle]) out.splice(1, 0, { ...ANGLE_SECTION[angle](topic), answers: [] });
  const rest = kws.filter((k) => !used.has(k));
  if (rest.length) out.push({ h2: 'Common questions', answers: rest.slice(0, 8), note: 'Cover each remaining search in a short paragraph.' });
  if (format !== 'product_or_category') out.push({ h2: 'Where to go next', answers: [], note: 'Link to the pages under "Link to" in this brief.' });
  return out.slice(0, 12);
}

/** "What makes this better than the top 3", phrased in code from Jev's closed-set edge choice. */
export function edgeLine(edge: Edge, t: TargetData): string {
  const topic = topicOf(t);
  const lines: Record<Edge, string> = {
    first_hand_testing: `It reports what happened when the team used ${topic} first-hand, with dates and conditions, where most ranking pages restate specifications.`,
    original_data: `It uses figures only this site has (its own search, sales or customer data on ${topic}), which no competitor can copy.`,
    clearer_comparison: `It puts the ${topic} options side by side in one table with a plain verdict for each type of reader.`,
    more_current: `It is dated and current: this year's ${topic} models, prices and rules, checked at publication.`,
    local_relevance: `It is specific to where readers are: local places, rules, seasons and suppliers for ${topic}.`,
    deeper_coverage: `It answers every related question on ${topic} in one place, so the reader does not need a second search.`,
  };
  return lines[edge];
}

export interface SitePage { path: string; title: string | null; clicks: number | null; template: string }

const SKIP_PATH = /^\/(about|contact|cookie|privacy|terms|basket|cart|checkout|login|account|search)\b/;

/** Internal links to and from, ranked by token similarity between the target's keywords and each page's path and title. */
export function linkSuggestions(t: TargetData, pages: SitePage[], self: string | null, preferProducts: boolean): { to: LinkSuggestion[]; from: LinkSuggestion[] } {
  const text = t.keywords.map((k) => k.keyword).join(' ');
  const scored = pages
    .filter((p) => p.path !== self && p.path !== '/' && !SKIP_PATH.test(p.path))
    .map((p) => ({ p, s: similarity(text, `${p.path.replace(/[/-]/g, ' ')} ${p.title ?? ''}`) }))
    .filter((x) => x.s > 0);
  const isProduct = (p: SitePage) => /^\/(products?|shop|category|categories|collections?)\b/.test(p.path);
  const to = [...scored]
    .sort((a, b) => b.s + (preferProducts && isProduct(b.p) ? 0.15 : 0) - (a.s + (preferProducts && isProduct(a.p) ? 0.15 : 0)))
    .slice(0, 4)
    .map(({ p, s }) => ({ path: p.path, title: p.title, why: isProduct(p) ? 'Product or category page on the same topic' : `Related page (${Math.round(s * 100)}% keyword overlap)` }));
  const from = [...scored]
    .filter((x) => !isProduct(x.p))
    .sort((a, b) => b.s * Math.log10((b.p.clicks ?? 0) + 10) - a.s * Math.log10((a.p.clicks ?? 0) + 10))
    .slice(0, 4)
    .map(({ p }) => ({ path: p.path, title: p.title, why: (p.clicks ?? 0) > 0 ? `Related page with ${(p.clicks ?? 0).toLocaleString('en-GB')} clicks in the latest Search Console data` : 'Related page on the same topic' }));
  return { to, from };
}

export interface SourceFacts {
  site: SiteFacts;
  coverage: Coverage;
  /** Sessions and conversions of the existing page, from GA4. */
  ga4?: { sessions: number; conversions: number } | null;
  productPaths: string[];
}

/** Sources: an instruction to add 3 to 8, plus first-party facts from the site's own data. No invented citations. */
export function sourceSuggestions(t: TargetData, edge: Edge, f: SourceFacts): string[] {
  const out = ['Add 3 to 8 sources the writer has read: manufacturer specifications, official or governing-body guidance, and recent first-hand reports. Link each claim to its source.'];
  const withData = t.keywords.filter((k) => k.position != null);
  if (f.site.hasSearchConsole && withData.length) {
    const top = [...withData].sort((a, b) => (a.position ?? 99) - (b.position ?? 99))[0];
    out.push(`First-party (Search Console): the site already appears for ${withData.length} of these ${t.keywords.length} keywords; best is "${top.keyword}" at position ${top.position?.toFixed(1)}.`);
  }
  if (f.coverage.path && f.ga4) out.push(`First-party (GA4): ${f.coverage.path} had ${f.ga4.sessions.toLocaleString('en-GB')} sessions and ${f.ga4.conversions.toLocaleString('en-GB')} conversions in the latest export. Use it to say what readers do next.`);
  if (f.productPaths.length) out.push(`First-party (product pages): use the specifications on ${f.productPaths.slice(0, 3).join(', ')} as the primary source for product facts.`);
  if (edge === 'original_data') out.push('Original data: pull the site\'s own figures for this topic (for example best sellers or common questions from customers). Only publish numbers you can check.');
  if (edge === 'first_hand_testing') out.push('Testing notes: record who tested, when, where and in what conditions, so every claim can be checked.');
  return out;
}

export function assembleBrief(input: {
  target: TargetData; go: Go; format: Format; angle: string; angles: AngleOption[]; length: Length; edge: Edge; intent: Intent | null;
  coverage: Coverage; pages: SitePage[]; sourceFacts: SourceFacts; year: number;
}): BriefContent {
  const { target: t, format, angle, length, edge } = input;
  const titles = titleOptions(t, format, angle, input.year);
  const self = input.go === 'expand_existing' ? input.coverage.path : null;
  const links = linkSuggestions(t, input.pages, self ?? input.coverage.path, input.intent === 'transactional' || input.intent === 'commercial' || format === 'listicle');
  const a = input.angles.find((x) => x.key === angle) ?? COMPLETE_ANGLE;
  return {
    titleOptions: titles,
    title: titles[0],
    queries: [...t.keywords].sort((x, y) => (y.volume ?? -1) - (x.volume ?? -1)),
    format, angle: a.key, angleLabel: a.label, length, edge,
    edgeLine: edgeLine(edge, t),
    outline: buildOutline(t, format, angle),
    linksTo: links.to,
    linksFrom: links.from,
    sources: sourceSuggestions(t, edge, input.sourceFacts),
  };
}

/** Outline as editable text: "## Heading", then "- query" lines, then optional "> note". */
export function outlineToText(o: OutlineSection[]): string {
  return o.map((s) => [`## ${s.h2}`, ...s.answers.map((a) => `- ${a}`), ...(s.note ? [`> ${s.note}`] : [])].join('\n')).join('\n\n');
}

export function textToOutline(text: string): OutlineSection[] {
  const out: OutlineSection[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) out.push({ h2: line.replace(/^#+\s*/, '').slice(0, 200), answers: [], note: '' });
    else if (!out.length) out.push({ h2: line.replace(/^[-*>]\s*/, '').slice(0, 200), answers: [], note: '' });
    else if (/^[-*]\s+/.test(line)) out[out.length - 1].answers.push(line.replace(/^[-*]\s+/, '').slice(0, 200));
    else if (line.startsWith('>')) out[out.length - 1].note = `${out[out.length - 1].note} ${line.replace(/^>\s*/, '')}`.trim().slice(0, 400);
    else out[out.length - 1].answers.push(line.slice(0, 200));
  }
  return out.filter((s) => s.h2).slice(0, 30);
}

export function briefMarkdown(b: BriefContent, meta: { primary: string; go: Go; status: string; site: string; publishedUrl?: string | null }): string {
  const L: string[] = [];
  L.push(`# ${b.title}`, '');
  L.push(`- **Site:** ${meta.site}`, `- **Primary keyword:** ${meta.primary}`, `- **Action:** ${GO_LABEL[meta.go]}`, `- **Format:** ${FORMAT_LABEL[b.format]}`, `- **Angle:** ${b.angleLabel}`, `- **Length:** ${LENGTH_LABEL[b.length]}`, `- **Status:** ${meta.status}`);
  if (meta.publishedUrl) L.push(`- **Published URL:** ${meta.publishedUrl}`);
  L.push('', '## Title options', ...b.titleOptions.map((t, i) => `${i + 1}. ${t}`));
  L.push('', '## Better than the top 3 because', b.edgeLine);
  L.push('', '## Target queries', '', '| Query | Volume | Position | Ranking page |', '|---|---:|---:|---|');
  for (const q of b.queries) L.push(`| ${q.keyword} | ${q.volume ?? '—'} | ${q.position?.toFixed(1) ?? '—'} | ${q.path ?? '—'} |`);
  L.push('', '## Outline');
  b.outline.forEach((s) => {
    L.push('', `### ${s.h2}`);
    if (s.answers.length) L.push(`Must answer: ${s.answers.join('; ')}`);
    if (s.note) L.push(`_${s.note}_`);
  });
  L.push('', '## Internal links', '', '**Link to:**', ...(b.linksTo.length ? b.linksTo.map((l) => `- ${l.path}${l.title ? ` (${l.title})` : ''}`) : ['- None found']));
  L.push('', '**Link from:**', ...(b.linksFrom.length ? b.linksFrom.map((l) => `- ${l.path}${l.title ? ` (${l.title})` : ''}`) : ['- None found']));
  L.push('', '## Sources', ...b.sources.map((s) => `- ${s}`), '');
  return L.join('\n');
}
