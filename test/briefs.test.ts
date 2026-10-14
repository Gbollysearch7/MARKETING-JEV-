import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importGsc } from '../src/engine/ingest/gsc';
import { MockProvider } from '../src/engine/jev/client';
import { briefMarkdown, buildOutline, edgeLine, linkSuggestions, outlineToText, textToOutline, titleOptions } from '../src/modules/briefs/assemble';
import { coverageOf, positionBand, relevanceBand, volumeBand } from '../src/modules/briefs/bands';
import { anglesFor, buildState, detailQuestions, goQuestions } from '../src/modules/briefs/battery';
import { mockBriefAnswer } from '../src/modules/briefs/mock';
import { changeFor, pickOf, routeOf } from '../src/modules/briefs/rules';
import { decideTarget, type TargetContext } from '../src/modules/briefs/run';
import { SAMPLE_TARGETS } from '../src/modules/briefs/samples';
import { enrichKeywords, groupQueries, headTerm, isQuestion, parseKeywordToken, parseTargets, queryIndex, similarity } from '../src/modules/briefs/text';
import { EDGES, FORMATS, LENGTHS, type TargetData } from '../src/modules/briefs/types';

const gsc = importGsc('q.csv', new Uint8Array(readFileSync('samples/search-console-page-queries.csv')));
const index = queryIndex(gsc.pageQueries, 90);
const target = (primary: string, kws: string[], relevance = 3, volume = 500): TargetData => ({
  primary, relevance, volumeSource: 'user',
  keywords: kws.map((k) => ({ keyword: k, volume, position: null, path: null })),
});

describe('keyword parsing and grouping', () => {
  it('parses keywords with optional volumes', () => {
    expect(parseKeywordToken('Via Ferrata UK (1,300)')).toEqual({ keyword: 'via ferrata uk', volume: 1300, position: null, path: null });
    expect(parseKeywordToken('top 10 tents')?.volume).toBeNull();
    expect(parseKeywordToken('   ')).toBeNull();
  });
  it('parses a pasted list into targets, primary first, deduplicated', () => {
    const t = parseTargets('best walking poles uk (1600); walking poles review | best walking poles uk\n\nhow to choose a sleeping bag\nbest walking poles uk');
    expect(t).toHaveLength(2);
    expect(t[0].primary).toBe('best walking poles uk');
    expect(t[0].keywords.map((k) => k.keyword)).toEqual(['best walking poles uk', 'walking poles review']);
  });
  it('finds head terms and questions', () => {
    expect(headTerm('best walking poles uk')).toBe('walking poles');
    expect(headTerm('how to choose a sleeping bag')).toBe('sleeping bag');
    expect(headTerm('cheap hiking boots')).toBe('hiking boots');
    expect(isQuestion('is via ferrata safe')).toBe(true);
    expect(isQuestion('via ferrata uk')).toBe(false);
  });
  it('groups Search Console queries by head term and drops utility pages', () => {
    const groups = groupQueries(index, 50);
    expect(groups.length).toBeGreaterThan(10);
    expect(groups.some((g) => /cookie|privacy|contact/.test(g.primary))).toBe(false);
    const ferrata = groups.find((g) => headTerm(g.primary) === 'via ferrata')!;
    expect(ferrata.keywords.every((k) => k.keyword.includes('via ferrata'))).toBe(true);
    expect(ferrata.keywords[0].volume).toBeGreaterThanOrEqual(ferrata.keywords[1].volume!);
  });
  it('enriches positions and ranking pages from Search Console', () => {
    const [k] = enrichKeywords([{ keyword: 'via ferrata uk', volume: 720, position: null, path: null }], index, false);
    expect(k.volume).toBe(720);
    expect(k.position).toBeGreaterThan(0);
    expect(k.path).toMatch(/via-ferrata/);
  });
  it('scores token similarity ignoring generic modifiers', () => {
    expect(similarity('best walking poles', '/guides/best-tent')).toBe(0);
    expect(similarity('walking poles uk', '/guides/best-walking-poles')).toBeGreaterThan(0.5);
  });
});

describe('bands and rules', () => {
  it('bands numbers into named ranges', () => {
    expect(volumeBand(null)).toBe('unknown');
    expect(volumeBand(30)).toMatch(/^very_low/);
    expect(volumeBand(1200)).toMatch(/^medium/);
    expect(positionBand(2)).toBe('top_3');
    expect(positionBand(15)).toBe('11_to_20');
    expect(positionBand(null)).toBe('not_ranking');
    expect(relevanceBand(5)).toMatch(/^very_high/);
  });
  it('finds existing coverage in the top 20 only', () => {
    const t: TargetData = { ...target('x', []), keywords: [
      { keyword: 'a', volume: 1, position: 8, path: '/a' }, { keyword: 'b', volume: 1, position: 12, path: '/a' },
      { keyword: 'c', volume: 1, position: 5, path: '/b' }, { keyword: 'd', volume: 1, position: 40, path: '/c' },
    ] };
    const cov = coverageOf(t, new Map([['/a', 'Page A']]));
    expect(cov).toEqual({ path: '/a', title: 'Page A', position: 8, otherPages: 1 });
  });
  it('routes by confidence and explains what would change a skip', () => {
    expect(routeOf(0.9)).toBe('auto');
    expect(routeOf(0.7)).toBe('review');
    expect(routeOf(0.4)).toBe('uncertain');
    const t = target('cheap thing', ['cheap thing'], 2, 20);
    const change = changeFor('skip', t, { path: '/p', title: null, position: 2, otherPages: 0 }, { monthly_volume: volumeBand(20) });
    expect(change.join(' ')).toMatch(/relevance/);
    expect(change.join(' ')).toMatch(/50 or more/);
    expect(change.join(' ')).toMatch(/top 3/);
    expect(changeFor('create', t, { path: null, title: null, position: null, otherPages: 0 }, { monthly_volume: 'low' })).toEqual([]);
    expect(pickOf({ type: 'choice', choice: 'skip', confidence: 0.5, probabilities: { skip: 0.7, create: 0.3 } })?.p).toBe(0.7);
  });
});

describe('battery', () => {
  it('only offers expand_existing when a page ranks', () => {
    expect(Object.keys((goQuestions(false).go as { criteria: object }).criteria)).toEqual(['create', 'skip']);
    expect(Object.keys((goQuestions(true).go as { criteria: object }).criteria)).toEqual(['create', 'expand_existing', 'skip']);
  });
  it('generates angles per target from its keywords', () => {
    const uk = anglesFor(target('best walking poles uk', ['best walking poles uk', 'walking poles review']));
    expect(uk.map((a) => a.key)).toEqual(expect.arrayContaining(['uk_specific', 'expert_tested', 'vs_market_leader', 'complete_overview']));
    expect(uk.map((a) => a.key)).not.toContain('budget');
    const cheap = anglesFor(target('cheap hiking boots', ['cheap hiking boots']));
    expect(cheap.map((a) => a.key)).toContain('budget');
    expect(cheap.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys((detailQuestions(cheap).angle as { criteria: object }).criteria)).toEqual(cheap.map((a) => a.key));
  });
  it('puts only bands in the state, never raw numbers', () => {
    const { state } = buildState(target('via ferrata uk', ['via ferrata uk'], 4, 720), new Map(), { sellsInTopic: true, hasSearchConsole: true, hasGa4: false, hasCrawl: false });
    const json = JSON.stringify(state);
    expect(json).not.toMatch(/"720"|:720/);
    expect(json).toContain('medium (500 to 1,999 a month)');
  });
});

describe('brief assembly', () => {
  const t = target('via ferrata for beginners', ['via ferrata for beginners', 'what is a via ferrata', 'is via ferrata safe', 'via ferrata uk', 'via ferrata kit list', 'cheap via ferrata kit']);
  it('turns questions into H2 questions and modifiers into sections', () => {
    const o = buildOutline(t, 'guide', 'for_beginners');
    const h2s = o.map((s) => s.h2);
    expect(h2s).toContain('What is a via ferrata?');
    expect(h2s).toContain('Is via ferrata safe?');
    expect(h2s).toContain('Via ferrata in the UK');
    expect(h2s.some((h) => /budget/.test(h))).toBe(true);
    // Every keyword is answered somewhere.
    const answered = new Set(o.flatMap((s) => s.answers));
    for (const k of t.keywords) expect(answered.has(k.keyword)).toBe(true);
  });
  it('makes three distinct title options', () => {
    for (const f of FORMATS) {
      const titles = titleOptions(t, f, 'uk_specific', 2026);
      expect(titles).toHaveLength(3);
      expect(new Set(titles.map((x) => x.toLowerCase())).size).toBe(3);
    }
    expect(titleOptions(target('best walking poles uk', ['best walking poles uk']), 'listicle', 'expert_tested', 2026).join(' ')).toContain('UK');
  });
  it('phrases every edge and round-trips the outline text', () => {
    for (const e of EDGES) expect(edgeLine(e, t)).toContain('via ferrata');
    const o = buildOutline(t, 'faq', 'complete_overview');
    expect(textToOutline(outlineToText(o))).toEqual(o);
  });
  it('suggests internal links by similarity', () => {
    const pages = [
      { path: '/guides/best-via-ferrata', title: 'Best via ferrata routes', clicks: 400, template: '/guides/*' },
      { path: '/products/via-ferrata/kit-1', title: 'Via ferrata kit', clicks: 10, template: '/products/*' },
      { path: '/guides/best-tent', title: 'Best tents', clicks: 900, template: '/guides/*' },
    ];
    const { to, from } = linkSuggestions(t, pages, null, true);
    expect(to[0].path).toBe('/products/via-ferrata/kit-1');
    expect(to.map((l) => l.path)).not.toContain('/guides/best-tent');
    expect(from.map((l) => l.path)).toEqual(['/guides/best-via-ferrata']);
  });
});

describe('end to end with the mock', () => {
  const pages = [...new Set(gsc.pageQueries.map((r) => r.path))].map((p) => ({ path: p, title: null, clicks: 10, template: '' }));
  const ctx: TargetContext = { titles: new Map(), pages, ga4: new Map(), today: '2026-10-13', site: { sellsInTopic: true, hasSearchConsole: true, hasGa4: false, hasCrawl: true } };
  it('decides every sample target and builds briefs only for go', async () => {
    const mock = new MockProvider(mockBriefAnswer);
    let calls = 0;
    const results = [];
    for (const s of SAMPLE_TARGETS) {
      const t: TargetData = { primary: s.primary, keywords: enrichKeywords(s.keywords, index, false), relevance: s.relevance, volumeSource: 'sample' };
      results.push({ s, ...(await decideTarget(t, ctx, (i) => { calls++; return mock.decide(i); })) });
    }
    const go = results.filter((r) => r.decision.go.choice !== 'skip');
    const skip = results.filter((r) => r.decision.go.choice === 'skip');
    expect(go.length).toBeGreaterThanOrEqual(4);
    expect(skip.map((r) => r.s.primary)).toEqual(expect.arrayContaining(['outdoor gear brand history']));
    expect(calls).toBe(go.length * 2 + skip.length);
    for (const r of skip) {
      expect(r.brief).toBeNull();
      expect(r.decision.change.length).toBeGreaterThan(0);
    }
    for (const r of go) {
      const b = r.brief!;
      expect(FORMATS).toContain(b.format);
      expect(LENGTHS).toContain(b.length);
      expect(r.decision.angles.map((a) => a.key)).toContain(b.angle);
      expect(b.outline.length).toBeGreaterThanOrEqual(3);
      expect(b.sources[0]).toMatch(/Add 3 to 8 sources/);
      const md = briefMarkdown(b, { primary: r.s.primary, go: r.decision.go.choice, status: 'Proposed', site: 'sample-outdoors.example' });
      expect(md).toContain(`# ${b.title}`);
      expect(md).toContain('## Outline');
    }
  });
});

describe('QA brief fixes', () => {
  it('drops the question verb from the topic, so headings read naturally', () => {
    expect(headTerm('how to store climbing harness')).toBe('climbing harness');
    expect(headTerm('is wild camping legal in the uk')).toBe('wild camping');
    expect(headTerm('camping store near me')).toBe('camping store');
  });

  it('opens a how-to guide with the question and keeps the closing sections when the outline is long', () => {
    const kws = ['how to store climbing harness', 'how to choose climbing harness', 'are climbing harness worth it', 'what is the best climbing harness', 'what size climbing harness',
      'how to wash climbing harness', 'how long do climbing harness last', 'climbing harness under £100', 'climbing harness review', 'best climbing harness', 'kids climbing harness', 'climbing harness uk',
      'womens climbing harness', 'climbing harness checklist', 'climbing harness size chart'];
    const o = buildOutline(target(kws[0], kws), 'guide', 'for_beginners');
    expect(o[0].h2).toBe('How to store climbing harness: the short answer');
    expect(o.at(-1)!.h2).toBe('Where to go next');
    expect(o.some((s) => s.h2 === 'Common questions')).toBe(true);
    expect(o.map((s) => s.h2).join(' ')).not.toMatch(/store climbing harness (on|reviews|for|in)/i);
    // Every target keyword is still asked for somewhere.
    const asked = new Set(o.flatMap((s) => s.answers));
    expect(kws.filter((k) => !asked.has(k)).length).toBeLessThanOrEqual(0);
  });

  it('suggests no internal links that only share a qualifier with the topic', () => {
    const pages = [{ path: '/guides/how-to-choose-waterproof-jackets', title: 'How to choose waterproof jackets', clicks: 100, template: 'guides' }, { path: '/guides/climbing-harness-fit', title: 'Harness fit', clicks: 5, template: 'guides' }];
    const l = linkSuggestions(target('climbing harness', ['climbing harness', 'waterproof climbing harness']), pages, null, false);
    expect(l.to.map((x) => x.path)).toEqual(['/guides/climbing-harness-fit']);
  });

  it('names the page to expand in the Markdown', () => {
    const md = briefMarkdown({ titleOptions: ['T'], title: 'T', queries: [], format: 'guide', angle: 'complete_overview', angleLabel: 'The complete overview', length: '600_900', edge: 'deeper_coverage', edgeLine: 'x', outline: [], linksTo: [], linksFrom: [], sources: [], expandPath: '/guides/best-compass', expandTitle: 'Best compass' },
      { primary: 'compass', go: 'expand_existing', status: 'Proposed', site: 'sample-outdoors.example' });
    expect(md).toContain('**Expand this page:** /guides/best-compass (Best compass)');
  });
});
