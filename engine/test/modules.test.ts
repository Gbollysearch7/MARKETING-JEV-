import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractFromHtml, type PageDoc } from '../src/crawl/extract.js';
import { MockClient } from '../src/jev/client.js';
import { MemorySink } from '../src/log/decision-log.js';
import { runCompliance } from '../src/modules/compliance.js';
import { runLinking } from '../src/modules/linking.js';
import { runPageVerdicts } from '../src/modules/page-verdict.js';
import { runPublishGate } from '../src/modules/publish-gate.js';

async function fixtures(): Promise<PageDoc[]> {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
  return Promise.all(files.map(async (f) => extractFromHtml(`https://example.test/${f.replace('.html', '')}`, await readFile(new URL(f, dir), 'utf8'))));
}

describe('runLinking', () => {
  it('evaluates n*k pairs, logs every answer, and returns typed suggestions', async () => {
    const pages = await fixtures();
    const sink = new MemorySink();
    const client = new MockClient((key) => {
      if (key === 'reader_benefit') return { type: 'noul', noul: 0.9 };
      if (key === 'same_primary_intent') return { type: 'noul', noul: 0.1 };
      return undefined;
    });
    const r = await runLinking(pages, client, { topK: 2, sink, concurrency: 3 });
    expect(r.pairsEvaluated).toBe(pages.length * 2);
    expect(r.links.length).toBe(pages.length * 2);
    expect(r.links[0].priority).toBeGreaterThanOrEqual(r.links[r.links.length - 1].priority);
    expect(r.cannibalisation.length).toBe(0);
    expect(sink.records.length).toBeGreaterThan(r.pairsEvaluated * 4);
    expect(sink.records[0].criteria_set_version).toBe('pair-link.v1');
    expect(sink.records[0].model_version).toBe('mock-jev');
    expect(r.inputTokens).toBeGreaterThan(0);
  });

  it('reports cannibal pairs once, with a survivor and review flag on disagreement', async () => {
    const pages = (await fixtures()).slice(0, 2);
    const client = new MockClient((key, _q, state) => {
      if (key === 'same_primary_intent') return { type: 'noul', noul: 0.95 };
      if (key === 'reader_benefit') return { type: 'noul', noul: 0.2 };
      if (key === 'survivor') {
        const s = state as { page_a: { url: string } };
        const choice = s.page_a.url.includes('how-prop') ? 'a' : 'b';
        return { type: 'choice', choice, probabilities: { [choice]: 0.9 }, confidence: 0.85 };
      }
      return undefined;
    });
    const r = await runLinking(pages, client, { topK: 1 });
    expect(r.cannibalisation.length).toBe(1);
    expect(r.cannibalisation[0].survivor).toMatch(/how-prop-firms-work/);
    expect(r.cannibalisation[0].needsReview).toBe(false);
    expect(r.links.length).toBe(0);
  });
});

describe('runPublishGate', () => {
  it('returns one disposition per page and kills placeholders', async () => {
    const pages = await fixtures();
    pages[0] = { ...pages[0], text: pages[0].text + ' {{city}}', paragraphs: [...pages[0].paragraphs, 'Visit {{city}} today for the best deals in town.'] };
    const rows = await runPublishGate(pages, new MockClient(), { siblingsK: 2 });
    expect(rows.length).toBe(pages.length);
    expect(rows[0].disposition).toBe('kill');
    expect(rows[0].reasons[0]).toMatch(/placeholder/);
    for (const r of rows) expect(['index', 'improve', 'kill']).toContain(r.disposition);
  });
});

describe('runCompliance', () => {
  it('blocks guaranteed outcomes and passes clean copy with a warning', async () => {
    const client = new MockClient((key, _q, state) => {
      const copy = (state as { copy: string }).copy;
      const bad = /guaranteed/i.test(copy);
      if (key === 'risk_warning_prominence') return { type: 'score', score: bad ? 0 : 2, legend: {}, probabilities: {}, confidence: 0.9 };
      if (key === 'guaranteed_outcome') return { type: 'noul', noul: bad ? 0.97 : 0.02 };
      return { type: 'noul', noul: 0.05 };
    });
    const rows = await runCompliance([
      { id: 'bad', channel: 'ad', text: 'Guaranteed payout in 14 days' },
      { id: 'ok', channel: 'ad', text: 'Trading involves risk of loss. Pass the evaluation to be funded.' },
    ], client);
    expect(rows[0].status).toBe('block');
    expect(rows[0].flags.map((f) => f.rule)).toContain('guaranteed_outcome');
    expect(rows[1].status).toBe('pass');
  });
});

describe('runPageVerdicts', () => {
  it('buckets metrics in code and returns a verdict per page', async () => {
    const pages = await fixtures();
    const metrics = new Map(pages.map((p, i) => [p.url, {
      monthlyClicks: Array.from({ length: 12 }, (_x, m) => (i === 0 ? 100 - m * 7 : 50)),
      impressions12m: i === 0 ? 20000 : 3000,
      ctr: 0.02, position: 6, referringDomains: 1,
      topQueries: ['what is a prop firm', 'prop firm meaning'],
    }]));
    const client = new MockClient((key) => (key === 'contains_time_sensitive_claims' ? { type: 'noul', noul: 0.9 } : undefined));
    const rows = await runPageVerdicts(pages, metrics, client, { siblingsK: 2 });
    expect(rows.length).toBe(pages.length);
    for (const r of rows) expect(['refresh', 'merge', 'redirect', 'prune_or_redirect', 'expand', 'rewrite_for_intent', 'leave']).toContain(r.verdict);
  });
});
