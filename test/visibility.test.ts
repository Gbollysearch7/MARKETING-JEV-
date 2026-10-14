import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockProvider } from '../src/engine/jev/client';
import { analyseAnswer, classifySource, extractUrls, highlightSpans, normDate, normDomain, normEngine, parseAnswersCsv, positionOf, segment, termRegex } from '../src/modules/visibility/parse';
import { changeAlert, groupRate, lostPrompts, rates, trend, visibilityAfter, type AnswerFacts } from '../src/modules/visibility/aggregate';
import { CRITERIA_VERSION, lossQuestions, lossState, sentimentQuestions, sentimentState } from '../src/modules/visibility/battery';
import { fixFor, readLoss, readSentiment, routerFor } from '../src/modules/visibility/rules';
import { mockVisibilityAnswer } from '../src/modules/visibility/mock';
import { contentTokens, coverageFor, suggestPrompts, topicFromTitle, topicOf } from '../src/modules/visibility/prompts';
import { runAnthropic, runGemini, runOpenAI, runPerplexity } from '../src/modules/visibility/runners';
import type { BrandConfig } from '../src/modules/visibility/types';

const BRAND: BrandConfig = {
  name: 'Sample Outdoors', aliases: ['SampleOutdoors'], domain: 'sample-outdoors.example',
  competitors: [{ name: 'Ridgeline Outfitters', domain: 'ridgeline-outfitters.example' }, { name: 'Cairn & Crag', domain: 'cairnandcrag.example' }],
};

describe('matching', () => {
  it('normalises domains', () => {
    expect(normDomain('https://www.Sample-Outdoors.example/guides?x=1')).toBe('sample-outdoors.example');
    expect(normDomain('example.com')).toBe('example.com');
  });
  it('matches whole words, any case, including names with punctuation', () => {
    expect('I like sample outdoors a lot'.match(termRegex('Sample Outdoors')!)).toHaveLength(1);
    expect('Sample Outdoorsy kit'.match(termRegex('Sample Outdoors')!)).toBeNull();
    expect('Try Cairn & Crag.'.match(termRegex('Cairn & Crag')!)).toHaveLength(1);
    expect('see sample-outdoors.example/boots'.match(termRegex('sample-outdoors.example')!)).toHaveLength(1);
  });
});

describe('analyseAnswer', () => {
  it('finds mention, position, competitors and citations', () => {
    const text = 'Top picks: **Ridgeline Outfitters** is popular. Sample Outdoors is a reliable choice. Sources: https://www.sample-outdoors.example/guides/boots, https://www.reddit.com/r/UKhiking/x.';
    const p = analyseAnswer(text, ['https://www.trailgear-reviews.example/boots'], BRAND);
    expect(p.mentioned).toBe(true);
    expect(p.position).toBe('early');
    expect(p.competitors).toEqual(['Ridgeline Outfitters']);
    expect(p.brandCited).toBe(true);
    expect(p.cited.map((c) => c.type).sort()).toEqual(['forum', 'review_site', 'vendor']);
  });
  it('reports absent when the brand is not named', () => {
    const p = analyseAnswer('Cairn & Crag and Ridgeline Outfitters are good.', [], BRAND);
    expect(p).toMatchObject({ mentioned: false, position: 'absent', brandCited: false, competitors: ['Cairn & Crag', 'Ridgeline Outfitters'] });
  });
  it('bands position by character index', () => {
    expect(positionOf(5, 100, null)).toBe('first');
    expect(positionOf(5, 100, 40)).toBe('first');
    expect(positionOf(20, 100, 10)).toBe('early');
    expect(positionOf(80, 100, 10)).toBe('late');
    expect(positionOf(null, 100, 10)).toBe('absent');
  });
  it('classifies sources by domain pattern', () => {
    expect(classifySource('https://www.reddit.com/r/x', 'a.com', [])).toBe('forum');
    expect(classifySource('https://www.trustpilot.com/review/x', 'a.com', [])).toBe('review_site');
    expect(classifySource('https://www.bbc.co.uk/news/x', 'a.com', [])).toBe('news');
    expect(classifySource('https://en.wikipedia.org/wiki/X', 'a.com', [])).toBe('directory');
    expect(classifySource('https://shop.b.com/x', 'a.com', ['b.com'])).toBe('vendor');
    expect(classifySource('https://www.outdoor-news.example/x', 'a.com', [])).toBe('news');
    expect(classifySource('https://random.example/x', 'a.com', [])).toBe('other');
  });
  it('dedupes URLs and accepts bare domains in the provided list', () => {
    expect(extractUrls('see https://a.com/x. and https://a.com/x', ['a.com/x b.org'])).toEqual(['https://a.com/x', 'https://b.org']);
  });
  it('splits highlighted text into plain segments, never markup', () => {
    const text = '<script>alert(1)</script> Sample Outdoors vs Ridgeline Outfitters';
    const segs = segment(text, highlightSpans(text, BRAND));
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.filter((s) => s.span).map((s) => s.span!.kind)).toEqual(['brand', 'competitor']);
  });
});

describe('CSV import', () => {
  it('reads columns, engines and dates', () => {
    const csv = 'Prompt,Engine,Answer text,Cited URLs,Run date\n"best tent",ChatGPT,"Answer one",https://a.com,06/10/2026\nbest tent,Google AI Overviews,Two,,2026-10-06T08:00:00Z\nbest tent,mystery,Three,,\n,claude,no prompt,,';
    const { rows, notes } = parseAnswersCsv(csv, '2026-10-13');
    expect(rows.map((r) => r.engine)).toEqual(['chatgpt', 'ai_overviews', 'other']);
    expect(rows.map((r) => r.runDate)).toEqual(['2026-10-06', '2026-10-06', '2026-10-13']);
    expect(notes.join(' ')).toMatch(/skipped/);
    expect(() => parseAnswersCsv('foo,bar\n1,2', '2026-10-13')).toThrow();
  });
  it('normalises engines and dates', () => {
    expect(normEngine('Perplexity')).toBe('perplexity');
    expect(normEngine('anthropic')).toBe('claude');
    expect(normEngine('Gemini 2.5')).toBe('gemini');
    expect(normDate('6 Oct 2026')).toBe('2026-10-06');
    expect(normDate('nope')).toBeNull();
  });
});

describe('prompts and coverage', () => {
  const pages = [{ path: '/guides/how-to-choose-tent', title: 'How to choose tent' }, { path: '/guides/best-hiking-boots', title: 'Best hiking boots in 2024: tested and reviewed' }];
  it('finds a covering page by title tokens, ignoring brand words', () => {
    expect(coverageFor('best tents for beginners', pages).match).toBe('close');
    expect(coverageFor('is Sample Outdoors good for hiking boots', pages, ['Sample Outdoors']).path).toBe('/guides/best-hiking-boots');
    expect(coverageFor('bothy etiquette and what to bring', pages).match).toBe('none');
    expect(contentTokens('Best Tents for Beginners')).toEqual(['tent']);
  });
  it('extracts topics and suggests buyer prompts', () => {
    expect(topicOf('best hiking boots uk')).toBe('hiking boots');
    expect(topicFromTitle('Best down jacket in 2024: tested and reviewed')).toBe('down jacket');
    const s = suggestPrompts({ brand: 'Sample Outdoors', competitors: ['Ridgeline Outfitters'], queries: [{ query: 'best down jacket', impressions: 900 }, { query: 'waterproof jackets uk', impressions: 500 }], titles: [], existing: ['best down jacket for beginners'] });
    const texts = s.map((x) => x.text);
    expect(texts).not.toContain('best down jacket for beginners');
    expect(texts).toContain('is Sample Outdoors good for down jacket');
    expect(texts).toContain('down jacket vs waterproof jackets');
    expect(texts).toContain('Sample Outdoors vs Ridgeline Outfitters');
  });
});

const fact = (o: Partial<AnswerFacts>): AnswerFacts => ({ promptId: 'p1', prompt: 'q', engine: 'chatgpt', runDate: '2026-10-01', mentioned: false, brandCited: false, competitors: [], sourceTypes: [], ...o });

describe('aggregation', () => {
  it('averages runs within each prompt and engine before averaging across them', () => {
    const f = [fact({ mentioned: true }), fact({}), fact({}), fact({ promptId: 'p2', mentioned: true })];
    expect(groupRate(f, (a) => a.mentioned)).toBeCloseTo((1 / 3 + 1) / 2);
  });
  it('computes share of voice and alerts on a move over 10 points', () => {
    const f = [fact({ mentioned: true, competitors: ['A'] }), fact({ competitors: ['A'], runDate: '2026-10-08' }), fact({ promptId: 'p2', runDate: '2026-10-08', mentioned: false })];
    expect(rates(f.slice(0, 1), 'Me', ['A']).shareOfVoice).toBe(0.5);
    expect(changeAlert(f)).toMatchObject({ from: '2026-10-01', to: '2026-10-08', points: -100 });
    expect(trend(f, 'Me', ['A'])).toHaveLength(2);
  });
  it('finds lost prompts with the winning competitor and measures 30 days after done', () => {
    const f = [fact({ competitors: ['B', 'A'] }), fact({ competitors: ['A'], engine: 'claude' }), fact({ promptId: 'p2', mentioned: true })];
    const lost = lostPrompts(f);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ promptId: 'p1', winner: 'A', lostOn: ['chatgpt', 'claude'] });
    const later = [...f, fact({ runDate: '2026-11-05', mentioned: true }), fact({ runDate: '2026-11-20', mentioned: false })];
    expect(visibilityAfter(later, 'p1', '2026-10-02T10:00:00Z')).toEqual({ date: '2026-11-05', visibility: 1 });
    expect(visibilityAfter(later, 'p1', '2026-10-20')).toEqual({ date: '2026-11-20', visibility: 0 });
  });
});

describe('rules', () => {
  it('maps reasons to a fix and owner and routes by confidence', () => {
    expect(fixFor('blocked_or_walled', { prompt: 'x', winner: null, pagePath: '/a' }).owner).toBe('technical');
    expect(fixFor('competitor_third_party', { prompt: 'x', winner: 'Ridgeline', pagePath: null }).fix).toMatch(/Ridgeline/);
    expect(fixFor('no_page_covers', { prompt: 'x', winner: null, pagePath: null }).owner).toBe('content');
    expect([routerFor(0.9), routerFor(0.7), routerFor(0.3)]).toEqual(['auto', 'review', 'uncertain']);
    expect(readLoss({ type: 'choice', choice: 'weak_entity', probabilities: { weak_entity: 0.7, no_page_covers: 0.3 }, confidence: 0.4 })?.confidence).toBe(0.7);
    expect(readLoss({ type: 'choice', choice: 'bogus', probabilities: {}, confidence: 1 })).toBeNull();
  });
});

describe('end to end on the sample answers with the mock provider', () => {
  const csv = readFileSync('samples/visibility-answers.csv', 'utf8');
  const sample: BrandConfig = { ...BRAND, competitors: [...BRAND.competitors, { name: 'Fellwalker Supply', domain: 'fellwalker-supply.example' }, { name: 'Northpeak Gear Co', domain: 'northpeak-gear.example' }] };
  const { rows } = parseAnswersCsv(csv, '2026-10-13');
  const ids = new Map<string, string>();
  const facts: AnswerFacts[] = rows.map((r) => {
    if (!ids.has(r.prompt)) ids.set(r.prompt, `p${ids.size}`);
    const p = analyseAnswer(r.answer, r.citedUrls, sample);
    return { promptId: ids.get(r.prompt)!, prompt: r.prompt, engine: r.engine, runDate: r.runDate, mentioned: p.mentioned, brandCited: p.brandCited, competitors: p.competitors, sourceTypes: p.cited.map((c) => c.type) };
  });

  it('has 60 answers, 3 engines, 2 dates and a change alert', () => {
    expect(rows).toHaveLength(60);
    expect(new Set(rows.map((r) => r.engine)).size).toBe(3);
    const alert = changeAlert(facts);
    expect(alert?.points).toBeGreaterThan(10);
  });

  it('explains every lost prompt and scores sentiment', async () => {
    const provider = new MockProvider(mockVisibilityAnswer);
    const lost = lostPrompts(facts);
    expect(lost.length).toBeGreaterThanOrEqual(4);
    const pages = [{ path: '/guides/best-waterproof-jackets', title: 'Best waterproof jackets in 2024: tested and reviewed' }];
    for (const l of lost) {
      const coverage = coverageFor(l.prompt, pages, ['Sample Outdoors']);
      const state = lossState({ brand: 'Sample Outdoors', domain: sample.domain, lost: l, coverage, pageStatus: 'indexable', overallVisibility: 0.6 });
      expect(JSON.stringify(state)).not.toMatch(/"\d+"/);
      const res = await provider.decide({ state, questions: lossQuestions() });
      const r = readLoss(res.answers.loss_reason);
      expect(r).not.toBeNull();
      if (/via ferrata|bothy/.test(l.prompt)) expect(r!.reason).toBe('no_page_covers');
    }
    const s = await provider.decide({ state: sentimentState('Sample Outdoors', 'q', 'Sample Outdoors is a reliable choice and recommended.'), questions: sentimentQuestions() });
    expect(readSentiment(s.answers.sentiment)?.sentiment).toBe('positive');
    const n = await provider.decide({ state: sentimentState('Sample Outdoors', 'q', 'Sample Outdoors has slow delivery and mixed reviews; some complain about returns.'), questions: sentimentQuestions() });
    expect(readSentiment(n.answers.sentiment)?.sentiment).toBe('negative');
    expect(CRITERIA_VERSION).toBe('visibility.v1');
  });
});

describe('live runners (stubbed fetch; no provider keys in this environment)', () => {
  const stub = (body: unknown, statuses: number[] = [200]) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
      return new Response(status === 200 ? JSON.stringify(body) : 'busy', { status, headers: { 'retry-after': '0' } });
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  it('OpenAI: reads content and url citations, retries a 429', async () => {
    const { f, calls } = stub({ model: 'gpt-x', choices: [{ message: { content: 'Hi', annotations: [{ type: 'url_citation', url_citation: { url: 'https://a.com' } }] } }] }, [429, 200]);
    const r = await runOpenAI('q', { apiKey: 'k', fetchImpl: f });
    expect(r).toMatchObject({ engine: 'chatgpt', text: 'Hi', citedUrls: ['https://a.com'] });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0].init.body)).max_completion_tokens).toBe(1200);
  });
  it('Anthropic: keeps text blocks, sends version header, rejects refusals', async () => {
    const { f, calls } = stub({ model: 'claude-x', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Answer' }] });
    expect((await runAnthropic('q', { apiKey: 'k', fetchImpl: f })).text).toBe('Answer');
    expect((calls[0].init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    const r = stub({ stop_reason: 'refusal', content: [] });
    await expect(runAnthropic('q', { apiKey: 'k', fetchImpl: r.f })).rejects.toThrow(/declined/);
  });
  it('Perplexity and Gemini: collect citations', async () => {
    const p = stub({ choices: [{ message: { content: 'A' } }], citations: ['https://r.com'], search_results: [{ url: 'https://r.com' }, { url: 'https://s.com' }] });
    expect((await runPerplexity('q', { apiKey: 'k', fetchImpl: p.f })).citedUrls).toEqual(['https://r.com', 'https://s.com']);
    const g = stub({ candidates: [{ content: { parts: [{ text: 'G' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/x', title: 'reddit.com' } }] } }] });
    const gr = await runGemini('q', { apiKey: 'k', fetchImpl: g.f });
    expect(gr).toMatchObject({ text: 'G', citedUrls: ['https://reddit.com'] });
    expect(g.calls[0].url).toMatch(/:generateContent$/);
  });
  it('surfaces non-retryable errors without leaking the key', async () => {
    const { f } = stub({}, [401]);
    await expect(runOpenAI('q', { apiKey: 'secret-key', fetchImpl: f })).rejects.toThrow(/HTTP 401/);
    await expect(runOpenAI('q', { apiKey: 'secret-key', fetchImpl: f })).rejects.not.toThrow(/secret-key/);
  });
});
