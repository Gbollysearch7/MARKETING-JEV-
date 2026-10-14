import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockProvider } from '../src/engine/jev/client';
import { importCrawlCsv } from '../src/engine/ingest/crawl-csv';
import { buildQuestions, buildState, candidatePages, indexPages, NEW_PAGE, volumeBand } from '../src/modules/keywords/battery';
import { clusterKeywords, clusterName, stem, tokens } from '../src/modules/keywords/cluster';
import { decodeBytes, fromSearchConsole, MAX_KEYWORDS, normaliseKeyword, parseKeywordCsv, parsePasted } from '../src/modules/keywords/input';
import { mockKeywordAnswer } from '../src/modules/keywords/mock';
import { isCannibalised, matchPrevious, readAnswers, rollup, type ScoredKeyword } from '../src/modules/keywords/rollup';

const kw = (keyword: string, o: Partial<ScoredKeyword> = {}): ScoredKeyword => ({
  keyword, volume: 100, cpc: null, currentPath: null, position: null, intent: 'commercial', intentP: 0.9, stage: 'consideration', stageP: 0.9, page: '/a', pageP: 0.9, ...o,
});

describe('keyword input', () => {
  it('normalises case and spacing', () => {
    expect(normaliseKeyword('  Best  Hiking\tBoots ')).toBe('best hiking boots');
    expect(normaliseKeyword('"Tent"')).toBe('tent');
  });

  it('reads Ahrefs headers and merges duplicates', () => {
    const csv = 'Keyword,Volume,KD,CPC,Current URL,Current position\nBest Hiking Boots,"6,600",40,1.20,https://x.example/guides/best-hiking-boots,4\nbest hiking boots,7000,40,1.2,https://x.example/blog/sale,9\ntent,900,10,0.5,,';
    const r = parseKeywordCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ keyword: 'best hiking boots', volume: 7000, cpc: 1.2, currentPath: '/guides/best-hiking-boots', position: 4 });
    expect(r.rows[1]).toMatchObject({ keyword: 'tent', currentPath: null, position: null });
    expect(r.notes.join(' ')).toMatch(/duplicate/);
  });

  it('reads Semrush headers', () => {
    const r = parseKeywordCsv('Keyword,Position,Search Volume,CPC,URL\nwild camping,7,6600,0.4,https://x.example/guides/wild');
    expect(r.rows[0]).toMatchObject({ keyword: 'wild camping', volume: 6600, position: 7, currentPath: '/guides/wild' });
  });

  it('reads a UTF-16 Keyword Planner TSV', () => {
    const text = 'Keyword Stats 2026-10-01\nKeyword\tCurrency\tAvg. monthly searches\tTop of page bid (high range)\nbivvy bag\tGBP\t1000\t0.8\n';
    const bytes = new Uint8Array([0xff, 0xfe, ...Array.from(new Uint8Array(new Uint16Array([...text].map((c) => c.charCodeAt(0))).buffer))]);
    const r = parseKeywordCsv(decodeBytes(bytes));
    expect(r.rows[0]).toMatchObject({ keyword: 'bivvy bag', volume: 1000, cpc: 0.8 });
  });

  it('accepts pasted lines with optional volumes, and pasted CSV', () => {
    const r = parsePasted('Hiking Boots, 1200\nhow to pitch a tent\n\nhiking boots\ntent footprint\t300');
    expect(r.rows.map((x) => [x.keyword, x.volume])).toEqual([['hiking boots', 1200], ['how to pitch a tent', null], ['tent footprint', 300]]);
    expect(parsePasted('keyword,volume\nbothy,500').rows[0]).toMatchObject({ keyword: 'bothy', volume: 500 });
  });

  it('caps a run and keeps the highest volumes', () => {
    const lines = Array.from({ length: MAX_KEYWORDS + 20 }, (_, i) => `kw ${i}, ${i}`).join('\n');
    const r = parsePasted(lines);
    expect(r.rows).toHaveLength(MAX_KEYWORDS);
    expect(r.rows.some((x) => x.keyword === 'kw 0')).toBe(false);
    expect(r.notes.join(' ')).toMatch(/capped at 5,000/);
  });

  it('aggregates Search Console queries by query, keeping the best-ranking page', () => {
    const r = fromSearchConsole([
      { path: '/a', query: 'Tent', clicks: 1, impressions: 100, position: 8 },
      { path: '/b', query: 'tent', clicks: 1, impressions: 50, position: 3 },
    ]);
    expect(r.volumeSource).toBe('impressions');
    expect(r.rows).toEqual([{ keyword: 'tent', volume: 150, cpc: null, currentPath: '/b', position: 3 }]);
  });
});

describe('bands, candidates and questions', () => {
  it('bands volume in code', () => {
    expect(volumeBand(null)).toBe('unknown');
    expect(volumeBand(10)).toMatch(/^very_low/);
    expect(volumeBand(500)).toMatch(/^medium/);
    expect(volumeBand(25000, 'impressions')).toBe('very_high (10,000 or more impressions)');
  });

  const ix = indexPages([
    { path: '/', title: 'Sample Outdoors' }, { path: '/privacy-policy', title: 'privacy' },
    { path: '/guides/best-hiking-boots', title: 'Best hiking boots' }, { path: '/guides/how-to-choose-hiking-boots', title: 'How to choose hiking boots' },
    { path: '/products/tent/trailmaster-2', title: 'Trailmaster tent' },
  ]);

  it('picks candidates by token overlap, skips utility pages and always adds the ranking page', () => {
    const c = candidatePages('best hiking boots', '/products/tent/trailmaster-2', ix);
    expect(c.map((x) => x.path)).toEqual(['/guides/best-hiking-boots', '/guides/how-to-choose-hiking-boots', '/products/tent/trailmaster-2']);
    expect(c[0].key).toBe('p1');
    expect(candidatePages('privacy', null, ix)).toEqual([]);
  });

  it('asks intent, stage and page as closed choices, with no raw numbers in state', () => {
    const c = candidatePages('hiking boots', null, ix);
    const q = buildQuestions(c);
    expect(Object.keys(q)).toEqual(['intent', 'stage', 'page']);
    expect(Object.keys((q.intent as { criteria: object }).criteria)).toEqual(['informational', 'commercial', 'transactional', 'navigational', 'local', 'junk']);
    expect(Object.keys((q.page as { criteria: object }).criteria)).toContain(NEW_PAGE);
    expect(Object.keys(buildQuestions([]))).toEqual(['intent', 'stage']);
    const s = buildState({ keyword: 'hiking boots', volume: 1234, cpc: 1, currentPath: '/x', position: 5.2 }, { name: 'S', domain: 's.example', topTitles: [] }, c, 'searches');
    expect(JSON.stringify(s)).not.toMatch(/1234|5\.2/);
    expect(s.currently_ranking_page?.position).toBe('4_to_10 (page one)');
  });

  it('reads answers into typed fields with the chosen probability', () => {
    const c = candidatePages('hiking boots', null, ix);
    const a = readAnswers({
      intent: { type: 'choice', choice: 'commercial', probabilities: { commercial: 0.8, informational: 0.2 }, confidence: 0.7 },
      stage: { type: 'choice', choice: 'nonsense', probabilities: { nonsense: 1 }, confidence: 1 },
      page: { type: 'choice', choice: 'p1', probabilities: { p1: 0.66 }, confidence: 0.5 },
    }, c);
    expect(a).toMatchObject({ intent: 'commercial', intentP: 0.8, stage: null, page: c[0].path, pageP: 0.66 });
  });
});

describe('clustering', () => {
  it('stems and drops stop words', () => {
    expect(stem('boots')).toBe('boot');
    expect(stem('bothies')).toBe('bothy');
    expect(tokens('How to choose the Best Tents')).toEqual(['how', 'choose', 'best', 'tent']);
  });

  it('groups by head term, keeps modifiers from joining topics, allows singletons', () => {
    const items = ['best hiking boots', 'hiking boots review', 'hiking boots', 'best tent', 'tent review', 'tent', 'best compass'].map((k) => ({ keyword: k, volume: 100 }));
    const groups = clusterKeywords(items).map((g) => g.map((i) => items[i].keyword).sort());
    expect(groups).toContainEqual(['best hiking boots', 'hiking boots', 'hiking boots review']);
    expect(groups).toContainEqual(['best tent', 'tent', 'tent review']);
    expect(groups).toContainEqual(['best compass']);
  });

  it('names a cluster after its highest-volume keyword', () => {
    expect(clusterName([{ keyword: 'tent review', volume: 10 }, { keyword: 'tent', volume: 900 }])).toBe('tent');
  });
});

describe('cluster rollup', () => {
  it('maps to the majority page and flags other claimants', () => {
    const r = rollup([kw('a', { page: '/a' }), kw('b', { page: '/a' }), kw('c', { page: '/a', currentPath: '/old', position: 12 }), kw('d', { page: '/b' }), kw('e', { page: '/b' })]);
    expect(r).toMatchObject({ mappedPath: '/a', gap: false, totalVolume: 500, intent: 'commercial' });
    // '/old' ranks for one keyword holding 20% of the volume: noise, not a competing page.
    expect(r.alsoClaimedBy.sort()).toEqual(['/b']);
    expect(r.claims.find((x) => x.path === '/b')?.keywords).toEqual(['d', 'e']);
    expect(isCannibalised(r)).toBe(true);
  });

  it('counts a single keyword as a claim only when it carries a quarter of the volume', () => {
    const r = rollup([kw('a', { page: '/a', volume: 100 }), kw('b', { page: '/a', volume: 100 }), kw('big', { page: '/a', volume: 300, currentPath: '/other', position: 5 })]);
    expect(r.alsoClaimedBy).toEqual(['/other']);
  });

  it('is a gap when most keywords choose new_page, and ignores junk in the majority', () => {
    const r = rollup([kw('a', { page: NEW_PAGE, intent: 'local' }), kw('b', { page: NEW_PAGE, intent: 'local' }), kw('c', { page: '/x' }), kw('j', { intent: 'junk', page: '/x' }), kw('k', { intent: 'junk', page: '/x' })]);
    expect(r).toMatchObject({ gap: true, mappedPath: null, intent: 'local' });
    expect(isCannibalised(r)).toBe(false);
  });
});

describe('stable clusters across runs', () => {
  it('keeps previous ids when most known keywords stay together, and leaves new topics unmatched', () => {
    const prev = new Map([['tent', 'C1'], ['best tent', 'C1'], ['tent review', 'C1'], ['compass', 'C2']]);
    const ids = matchPrevious([['tent', 'best tent', 'cheap tent'], ['tent review'], ['bothy', 'bothy map'], ['compass', 'best compass', 'tent']], prev);
    expect(ids).toEqual(['C1', 'C1', null, 'C1']);
  });
});

describe('mock battery end to end on the sample list', () => {
  it('scores, clusters and rolls up the Sample Outdoors keywords', async () => {
    const input = parseKeywordCsv(readFileSync('samples/keywords-sample-outdoors.csv', 'utf8'));
    expect(input.rows.length).toBeGreaterThanOrEqual(140);
    const crawl = importCrawlCsv(new Uint8Array(readFileSync('samples/screaming-frog-internal-html.csv')));
    const ix = indexPages(crawl.pages.map((p) => ({ path: p.path, title: p.title })));
    const provider = new MockProvider(mockKeywordAnswer);
    const site = { name: 'Sample Outdoors', domain: 'www.sample-outdoors.example', topTitles: ix.pages.slice(0, 12).map((p) => p.title ?? p.path) };
    const scored: ScoredKeyword[] = [];
    for (const row of input.rows) {
      const c = candidatePages(row.keyword, row.currentPath, ix);
      const res = await provider.decide({ state: buildState(row, site, c, input.volumeSource), questions: buildQuestions(c) });
      scored.push({ ...row, ...readAnswers(res.answers, c) });
    }
    const by = (k: string) => scored.find((s) => s.keyword === k)!;
    expect(by('football boots').intent).toBe('junk');
    expect(by('decathlon tent').intent).toBe('junk');
    expect(by('outdoor shop near me').intent).toBe('local');
    expect(by('sample outdoors').intent).toBe('navigational');
    expect(by('how to clean hiking boots').stage).toBe('retention');
    expect(by('best tent').page).toBe('/guides/best-tent');
    expect(by('outdoor shop near me').page).toBe(NEW_PAGE);
    const useful = scored.filter((s) => s.intent !== 'junk');
    const groups = clusterKeywords(useful);
    expect(groups.length).toBeGreaterThan(20);
    expect(groups.length).toBeLessThan(useful.length);
    const rolled = groups.map((g) => rollup(g.map((i) => useful[i])));
    expect(rolled.some((r) => r.gap)).toBe(true);
    expect(rolled.some((r) => isCannibalised(r))).toBe(true);
  });
});

describe('QA clustering fixes', () => {
  const items = (ks: string[], intent?: string) => ks.map((keyword) => ({ keyword, volume: 100, intent }));
  it('does not merge different products on price, size or season words', () => {
    const product = ['crampons', 'binoculars', 'bag', 'tent', 'bag', 'tent', 'boots', 'poles', 'boots'];
    const g = clusterKeywords(items(['crampons under £100', 'binoculars under £100', 'sleeping bag under £100', '4 season tent', '4 season sleeping bag', 'how long do tents last', 'how long do boots last', 'walking poles for wide feet', 'hiking boots for wide feet']));
    for (const grp of g) expect(new Set(grp.map((i) => product[i])).size).toBe(1);
  });
  it('keeps how-to care searches apart from buying searches on the same product', () => {
    const ks = [...items(['climbing harness', 'best climbing harness', 'climbing harness review', 'kids climbing harness'], 'commercial'), ...items(['how to clean climbing harness', 'how to store climbing harness', 'how to wash climbing harness'], 'informational')];
    const g = clusterKeywords(ks);
    for (const grp of g) expect(new Set(grp.map((i) => ks[i].intent)).size).toBe(1);
  });
  it('names a cluster after the keyword made of its shared words, not a high-volume outlier', () => {
    expect(clusterName([{ keyword: 'hiking boots leeds', volume: 9000 }, { keyword: 'hiking boots', volume: 500 }, { keyword: 'best hiking boots', volume: 400 }])).toBe('hiking boots');
  });
});
