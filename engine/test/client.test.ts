import { describe, expect, it } from 'vitest';
import { MockClient, TypeSafeApiError, TypeSafeClient } from '../src/jev/client.js';
import type { SystemOneResponse } from '../src/jev/types.js';

const ok: SystemOneResponse = { model: 'jev-1.13.0', answers: { u: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } };

function fakeFetch(script: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = script.shift() ?? { status: 500 };
    return new Response(JSON.stringify(step.body ?? { error: 'x' }), { status: step.status, headers: step.headers });
  }) as typeof fetch;
  return { impl, calls };
}

describe('TypeSafeClient', () => {
  it('posts the documented request shape with bearer auth and a pinned model', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: ok }]);
    const c = new TypeSafeClient({ apiKey: 'k', model: 'jev-1.13.0', fetchImpl: impl, sleepImpl: async () => {} });
    const res = await c.decide({ state: 'hi', questions: { u: { type: 'noul', instructions: 'urgent?' } } });
    expect(res.answers.u).toEqual({ type: 'noul', noul: 0.9 });
    expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ model: 'jev-1.13.0', state: 'hi', questions: { u: { type: 'noul', instructions: 'urgent?' } } });
  });

  it('retries on 429 and 529, honouring retry-after', async () => {
    const { impl, calls } = fakeFetch([{ status: 429, headers: { 'retry-after': '1' } }, { status: 529 }, { status: 200, body: ok }]);
    const slept: number[] = [];
    const c = new TypeSafeClient({ apiKey: 'k', fetchImpl: impl, sleepImpl: async (ms) => { slept.push(ms); } });
    await c.decide({ state: 'hi', questions: { u: { type: 'noul', instructions: 'q' } } });
    expect(calls.length).toBe(3);
    expect(slept[0]).toBe(1000);
  });

  it('does not retry a 422 validation error', async () => {
    const { impl, calls } = fakeFetch([{ status: 422, body: { detail: 'bad' } }]);
    const c = new TypeSafeClient({ apiKey: 'k', fetchImpl: impl, sleepImpl: async () => {} });
    await expect(c.decide({ state: 'hi', questions: {} })).rejects.toBeInstanceOf(TypeSafeApiError);
    expect(calls.length).toBe(1);
  });

  it('refuses to construct without a key', () => {
    const prev = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    expect(() => new TypeSafeClient()).toThrow(/TYPESAFE_API_KEY/);
    if (prev) process.env.TYPESAFE_API_KEY = prev;
  });
});

describe('MockClient', () => {
  it('is deterministic and well formed', async () => {
    const m = new MockClient();
    const input = {
      state: { a: 1 },
      questions: {
        n: { type: 'noul' as const, instructions: 'q' },
        c: { type: 'choice' as const, instructions: 'q', criteria: { x: 'x', y: 'y', z: 'z' } },
        s: { type: 'score' as const, instructions: 'q', criteria: ['lo', 'mid', 'hi'] },
      },
    };
    const r1 = await m.decide(input);
    const r2 = await m.decide(input);
    expect(r1).toEqual(r2);
    const c = r1.answers.c;
    const s = r1.answers.s;
    if (c.type !== 'choice' || s.type !== 'score') throw new Error('types');
    expect(Object.values(c.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(c.probabilities[c.choice]).toBe(Math.max(...Object.values(c.probabilities)));
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(2);
    expect(s.legend['2']).toBe('hi');
  });

  it('accepts scripted overrides', async () => {
    const m = new MockClient((key) => (key === 'n' ? { type: 'noul', noul: 0.01 } : undefined));
    const r = await m.decide({ state: 's', questions: { n: { type: 'noul', instructions: 'q' } } });
    expect(r.answers.n).toEqual({ type: 'noul', noul: 0.01 });
  });
});
