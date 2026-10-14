import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockProvider } from '../src/engine/jev/client';
import { buildQuestions, GATE_CRITERIA_VERSION } from '../src/modules/gate/battery';
import { computeChecks, headTermsFor, queryImpressionMap, toBands } from '../src/modules/gate/checks';
import { mockGateAnswer } from '../src/modules/gate/mock';
import { finishBatch, normalisePage, parseGateCsv, parseUrlList, toPath } from '../src/modules/gate/parse';
import { templateReport } from '../src/modules/gate/report';
import { allowedVerdicts, combine, hardRule, routerFor } from '../src/modules/gate/rules';
import { runGate, type Decide } from '../src/modules/gate/run';
import { findPlaceholders, jaccard, shingleSet, stripHtml, words } from '../src/modules/gate/text';
import type { GatePageInput } from '../src/modules/gate/types';

const page = (path: string, body: string, extra: Partial<GatePageInput> = {}): GatePageInput => ({
  path, url: null, title: `Title ${path}`, h1: `H1 ${path}`, meta: '', body, query: '', template: 'walks', ...extra,
});

describe('text', () => {
  it('strips HTML to text, dropping scripts and decoding entities', () => {
    expect(stripHtml('<h1>Walks &amp; trails</h1><script>var x=1</script><p>Bring&nbsp;water.</p>')).toBe('Walks & trails Bring water.');
    expect(stripHtml('plain   text')).toBe('plain text');
  });
  it('finds placeholders and leaves normal prose alone', () => {
    expect(findPlaceholders('Walks near {{town}}')[0]).toMatch(/template tag/);
    expect(findPlaceholders('[INSERT LOCAL HIGHLIGHTS] here')[0]).toMatch(/INSERT/);
    expect(findPlaceholders('Lorem ipsum dolor')[0]).toMatch(/lorem/);
    expect(findPlaceholders('TODO: add route')).toHaveLength(1);
    expect(findPlaceholders('Distance: undefined km')).toHaveLength(1);
    expect(findPlaceholders('A 6 km loop past the old mill.')).toHaveLength(0);
  });
  it('computes shingle Jaccard', () => {
    const a = shingleSet(words('one two three four five six seven'));
    const b = shingleSet(words('one two three four five six eight'));
    expect(jaccard(a, a)).toBe(1);
    expect(jaccard(a, b)).toBeCloseTo(2 / 4);
    expect(jaccard(new Set(), a)).toBe(0);
  });
});

describe('parsing', () => {
  it('turns slugs, paths and URLs into path keys', () => {
    expect(toPath('https://www.example.com/Walks/Keswick/')).toBe('/walks/keswick');
    expect(toPath('walks/keswick')).toBe('/walks/keswick');
    expect(toPath('/walks/keswick?x=1')).toBe('/walks/keswick');
    expect(toPath('')).toBeNull();
  });
  it('reads a CSV with loose column names and HTML bodies', () => {
    const csv = 'Slug,Page Title,H1,Meta Description,Body HTML,Target Keyword,Template\nwalks/a,Walks in A,A walks,Desc,<p>Hello <b>there</b></p>,walks in a,walks\n,No slug title,,,"<p>Body</p>",,\n';
    const { pages } = parseGateCsv(csv);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ path: '/walks/a', title: 'Walks in A', h1: 'A walks', meta: 'Desc', body: 'Hello there', query: 'walks in a', template: 'walks' });
    expect(pages[1].path).toBe('/no-slug-title');
    expect(pages[1].template).toBe('/*');
  });
  it('rejects a CSV without a body column', () => {
    expect(() => parseGateCsv('url,title\n/a,A\n')).toThrow(/body/);
  });
  it('dedupes paths and caps batches at 500', () => {
    const many = Array.from({ length: 510 }, (_x, i) => page(`/p/${i}`, 'x'));
    many.push(page('/p/1', 'dupe'));
    const r = finishBatch(many);
    expect(r.pages).toHaveLength(500);
    expect(r.notes.join(' ')).toMatch(/repeated/);
    expect(r.notes.join(' ')).toMatch(/first 500/);
  });
  it('normalises API pages and URL lists', () => {
    const p = normalisePage({ slug: 'walks/b', title: 'B', html: '<p>Text</p>', target_query: 'walks in b' }, 0);
    expect(typeof p === 'object' && p.body).toBe('Text');
    expect(normalisePage({}, 3)).toMatch(/Row 4/);
    expect(parseUrlList('https://a.example/x\nnot a url, https://a.example/y https://a.example/x')).toEqual(['https://a.example/x', 'https://a.example/y']);
  });
});

const TEMPLATE = 'Planning a walk near here? Sample Outdoors has put together this guide to walking in and around the area with routes for every ability. Shop walking boots poles and waterproofs at Sample Outdoors with free returns on all orders.';
const unique = (seed: string, n: number) => Array.from({ length: n }, (_x, i) => `${seed}${i}`).join(' ');

describe('code checks', () => {
  const pages = [
    page('/walks/a', `${TEMPLATE} ${unique('alpha', 150)}`),
    page('/walks/b', `${TEMPLATE} ${unique('beta', 20)}`),
    page('/walks/c', `${TEMPLATE} ${unique('gamma', 20)}`),
    page('/walks/d', `${TEMPLATE} ${unique('gamma', 20)}`, { title: 'Title /walks/c' }),
  ];
  const checks = computeChecks(pages);
  it('detects template text and counts unique words outside it', () => {
    expect(checks[0].uniqueWords).toBe(150);
    expect(checks[1].uniqueWords).toBe(20);
    expect(checks[1].templateShare).toBeGreaterThan(0.5);
    expect(checks[0].uniqueExcerpt.startsWith('alpha0')).toBe(true);
  });
  it('finds near-duplicates and duplicate titles within the batch', () => {
    expect(checks[2].duplicateRatio).toBe(1);
    expect(checks[2].duplicateOf).toBe('/walks/d');
    expect(checks[0].duplicateRatio).toBeLessThan(0.3);
    expect(checks[2].duplicateTitleWith).toBe(1);
    expect(checks[0].duplicateTitleWith).toBe(0);
  });
  it('does not detect a template in batches under three pages', () => {
    const c = computeChecks(pages.slice(0, 2));
    expect(c[0].templateShare).toBe(-1);
    expect(c[1].uniqueWords).toBe(c[1].wordCount);
  });
  it('compares against existing site pages', () => {
    const c = computeChecks([page('/walks/new', `${TEMPLATE} ${unique('z', 5)}`)], { existing: [{ path: '/walks/live', text: `${TEMPLATE} ${unique('z', 5)}` }] });
    expect(c[0].duplicateSource).toBe('site');
    expect(c[0].duplicateOf).toBe('/walks/live');
  });
  it('bands search demand from the query and its head terms', () => {
    const map = queryImpressionMap([{ query: 'Walks in Keswick', impressions: 400 }, { query: 'walks near ambleside', impressions: 50 }]);
    expect(headTermsFor('walks in grasmere', ['walks in a', 'walks in b', 'walks in grasmere'])).toEqual(['walks']);
    const pg = [page('/walks/keswick', 'x', { query: 'walks in keswick' }), page('/walks/grasmere', 'x', { query: 'walks in grasmere' }), page('/walks/zz', 'x', { query: 'walks in zz' })];
    const [k, g] = computeChecks(pg, { queryImpressions: map });
    expect(k.queryImpressions).toBe(400);
    expect(toBands(k, true, true).search_demand).toMatch(/^query_has_impressions \(medium/);
    expect(g.queryImpressions).toBe(0);
    expect(g.headImpressions).toBe(450);
    expect(toBands(g, true, true).search_demand).toMatch(/^related_queries_have_impressions/);
    expect(toBands(g, true, false).search_demand).toMatch(/^unknown/);
    expect(toBands(g, false, true).search_demand).toMatch(/no target query/);
  });
  it('bands unique words and duplication', () => {
    expect(toBands(checks[1], false, false).unique_words).toMatch(/^almost_none/);
    expect(toBands(checks[0], false, false).unique_words).toMatch(/^some/);
    expect(toBands(checks[2], false, false).near_duplicate).toMatch(/^duplicate/);
  });
});

describe('rules', () => {
  const base = computeChecks([page('/a', unique('w', 200))])[0];
  it('kills placeholder text and duplicates above 0.9 without a model call', () => {
    expect(hardRule({ ...base, placeholders: ['{{ }}: “{{town}}”'] })?.verdict).toBe('kill');
    expect(hardRule({ ...base, duplicateRatio: 0.95, duplicateOf: '/b' })?.rule).toMatch(/Duplicate of \/b/);
    expect(hardRule({ ...base, duplicateRatio: 0.9 })).toBeNull();
  });
  it('takes Index off the table for fixable code problems', () => {
    expect(allowedVerdicts(base).allowed).toEqual(['index', 'improve', 'kill']);
    expect(allowedVerdicts({ ...base, missingH1: true }).allowed).toEqual(['improve', 'kill']);
    expect(allowedVerdicts({ ...base, duplicateTitleWith: 2 }).allowed).toEqual(['improve', 'kill']);
    expect(Object.keys((buildQuestions(['improve', 'kill'], true).verdict as { criteria: object }).criteria)).toEqual(['improve', 'kill']);
  });
  it('routes on the displayed probability', () => {
    expect(routerFor(0.849)).toBe('auto');
    expect(routerFor(0.84)).toBe('review');
    expect(routerFor(0.59)).toBe('uncertain');
  });
  it('downgrades Index to Improve on brand or legal risk, with three reasons and fixes', () => {
    const p = page('/a', unique('w', 200), { query: 'walks in a' });
    const answers = {
      verdict: { type: 'choice' as const, choice: 'index', probabilities: { index: 0.8, improve: 0.15, kill: 0.05 }, confidence: 0.7 },
      depth: { type: 'score' as const, score: 0.5, legend: {}, probabilities: { 0: 0.6, 1: 0.3, 2: 0.1 }, confidence: 0.5 },
      helpful_to_searcher: { type: 'noul' as const, noul: 0.2 },
      brand_legal_risk: { type: 'noul' as const, noul: 0.9 },
    };
    const r = combine(p, base, answers, [], false);
    expect(r.verdict).toBe('improve');
    expect(r.confidence).toBe(0.2);
    expect(r.rulesApplied.join(' ')).toMatch(/brand or legal risk/);
    expect(r.reasons).toHaveLength(3);
    expect(r.reasons[0]).toMatch(/brand or legal risk/);
    expect(r.fixes.length).toBeGreaterThan(0);
    expect(r.failures).toContain('risk');
  });
});

describe('template report', () => {
  it('flags a template with more than 40% Kill and names the most common failure', () => {
    const rows = templateReport([
      { template: 't', verdict: 'kill', failures: ['thin', 'near_duplicate'] },
      { template: 't', verdict: 'kill', failures: ['thin'] },
      { template: 't', verdict: 'improve', failures: ['thin'] },
      { template: 't', verdict: 'index', failures: [] },
      { template: 'u', verdict: 'index', failures: [] },
      { template: 'u', verdict: 'kill', failures: ['placeholder'] },
      { template: 'u', verdict: 'index', failures: [] },
    ]);
    expect(rows[0]).toMatchObject({ template: 't', pause: true, topFailure: 'thin', topFailurePages: 3 });
    expect(rows[1]).toMatchObject({ template: 'u', pause: false });
    expect(templateReport([{ template: 'one', verdict: 'kill', failures: ['thin'] }])[0].pause).toBe(false);
  });
});

describe('end to end with the mock on the sample batch', async () => {
  const { pages } = parseGateCsv(readFileSync('samples/gate-walks.csv', 'utf8'));
  const mock = new MockProvider(mockGateAnswer);
  let calls = 0;
  const decide: Decide = async (_key, input) => { calls++; return mock.decide(input); };
  const { checks, results } = await runGate(pages, decide, { hasGsc: false, concurrency: 4 });
  const by = (path: string) => results[pages.findIndex((p) => p.path === path)];

  it('loads about 40 pages in two templates', () => {
    expect(pages).toHaveLength(40);
    expect(new Set(pages.map((p) => p.template))).toEqual(new Set(['walks-location', 'routes-guide']));
  });
  it('kills placeholder and copied pages by rule, without a model call', () => {
    expect(by('/walks/ormsby-ford')).toMatchObject({ verdict: 'kill', model: 'rules', confidence: 1 });
    expect(by('/walks/kettlemere')).toMatchObject({ verdict: 'kill', model: 'rules' });
    expect(calls).toBe(40 - 4);
  });
  it('indexes the well-made pages and holds the risky one', () => {
    expect(by('/walks/ashcombe-vale').verdict).toBe('index');
    expect(by('/routes/winter-walking-safety').verdict).toBe('index');
    expect(by('/walks/oakhurst-green').verdict).toBe('improve');
    expect(by('/walks/oakhurst-green').failures).toContain('risk');
  });
  it('flags the near-duplicate thin pages', () => {
    const i = pages.findIndex((p) => p.path === '/walks/valewick');
    expect(checks[i].duplicateRatio).toBeGreaterThan(0.6);
    expect(results[i].verdict).toBe('kill');
  });
  it('gives every page at most three reasons and recommends pausing the location template', () => {
    for (const r of results) { expect(r.reasons.length).toBeGreaterThan(0); expect(r.reasons.length).toBeLessThanOrEqual(3); }
    const rep = templateReport(pages.map((p, i) => ({ template: p.template, verdict: results[i].verdict, failures: results[i].failures })));
    expect(rep.find((t) => t.template === 'walks-location')?.pause).toBe(true);
    expect(rep.find((t) => t.template === 'routes-guide')?.pause).toBe(false);
  });
  it('uses the gate.v1 criteria version', () => expect(GATE_CRITERIA_VERSION).toBe('gate.v1'));
});
