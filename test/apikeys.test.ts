import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rk-apikeys-'));
delete process.env.TYPESAFE_API_KEY; // offline mock decisions

const K = await import('../src/lib/apikeys');
const { db } = await import('../src/lib/db');
const { siteForApiRequest } = await import('../src/lib/auth');
const { parseApiPages } = await import('../src/modules/gate/api');

// The real runner scores with Jev inside Next; here a stand-in validates like it and records what it was given.
const runs: { siteId: string; source: string }[] = [];
const fakeRun: import('../src/lib/apikeys').GateRunner = async (siteId, body, source) => {
  runs.push({ siteId, source });
  const p = parseApiPages(body);
  if (!p.ok) return { status: p.status, json: { error: p.error, code: p.code } };
  return { status: 200, json: { pages: p.pages.map((x) => ({ path: x.path, verdict: 'index' })) } };
};
const v1Check = { POST: (r: Request) => K.handleV1GateCheck(r, fakeRun) };
const v1Sites = { GET: async (r: Request) => K.handleV1Sites(r) };

const DAY = 86_400_000;
function account(id: string, opts: { trialEnds?: number; plan?: string; sub?: string | null } = {}) {
  db().prepare('insert into accounts (id, name, plan, trial_ends_at, subscription_status, created_at) values (?, ?, ?, ?, ?, ?)')
    .run(id, id, opts.plan ?? 'trial', new Date(Date.now() + (opts.trialEnds ?? 10 * DAY)).toISOString(), opts.sub ?? null, new Date().toISOString());
}
function site(id: string, accountId: string) {
  db().prepare('insert into sites (id, name, domain, created_at, account_id) values (?, ?, ?, ?, ?)').run(id, `Site ${id}`, `${id}.example`, new Date().toISOString(), accountId);
}
const req = (url: string, init: RequestInit & { key?: string } = {}) => {
  const h = new Headers(init.headers);
  if (init.key) h.set('authorization', `Bearer ${init.key}`);
  return new Request(`http://localhost${url}`, { ...init, headers: h });
};
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const PAGE = { url: '/walks/keswick', title: 'Walks in Keswick', h1: 'Walks in Keswick', body: '<p>Five walks around Keswick, from a 3 km lakeside loop to the 11 km Catbells ridge, with parking, terrain and timings for each.</p>', template: 'walks' };

beforeAll(() => {
  account('acc_a');
  account('acc_b');
  account('acc_dead', { trialEnds: -DAY });
  site('site_a', 'acc_a');
  site('site_b', 'acc_b');
  site('site_dead', 'acc_dead');
});
afterAll(() => { db().close(); });

describe('key material', () => {
  it('generates rk_live_ + 43 base62 characters, unique each time', () => {
    const a = K.generateApiKey();
    const b = K.generateApiKey();
    expect(a).toMatch(/^rk_live_[0-9A-Za-z]{43}$/);
    expect(a).not.toBe(b);
    expect(K.looksLikeApiKey(a)).toBe(true);
    expect(K.looksLikeApiKey('rk_live_short')).toBe(false);
  });
  it('reads Bearer tokens only from the header and spots keys in the query string', () => {
    expect(K.bearerToken('Bearer rk_live_abc')).toBe('rk_live_abc');
    expect(K.bearerToken('bearer   x ')).toBe('x');
    expect(K.bearerToken('Basic abc')).toBeNull();
    expect(K.bearerToken(null)).toBeNull();
    expect(K.keyInQuery('http://x/api/v1/sites?api_key=1')).toBe(true);
    expect(K.keyInQuery('http://x/api/v1/sites?x=rk_live_abc')).toBe(true);
    expect(K.keyInQuery('http://x/api/v1/sites?page=2')).toBe(false);
  });
});

describe('create, verify, revoke', () => {
  it('stores only the hash and last four, finds the key by value, and stops working once revoked', () => {
    const { key, token } = K.createApiKey({ accountId: 'acc_a', name: 'CI', scopes: ['gate:check'] });
    const row = db().prepare('select * from apikeys_keys where id = ?').get(key.id) as Record<string, string>;
    expect(row.key_hash).toBe(K.hashApiKey(token));
    expect(row.key_hash).not.toContain(token.slice(8, 20));
    expect(Object.values(row).some((v) => v === token)).toBe(false);
    expect(key.last4).toBe(token.slice(-4));
    expect(K.findActiveKey(token)?.id).toBe(key.id);
    expect(K.findActiveKey(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(K.revokeApiKey('acc_b', key.id)).toBe(false); // another account cannot revoke it
    expect(K.revokeApiKey('acc_a', key.id)).toBe(true);
    expect(K.findActiveKey(token)).toBeNull();
    expect(K.listApiKeys('acc_a').find((k) => k.id === key.id)?.revoked_at).toBeTruthy();
  });
  it('rejects empty names and unknown scopes, and honours expiry', () => {
    expect(() => K.createApiKey({ accountId: 'acc_a', name: ' ', scopes: ['gate:check'] })).toThrow(/name/);
    expect(() => K.createApiKey({ accountId: 'acc_a', name: 'x', scopes: ['admin:all'] })).toThrow(/scope/);
    const { token } = K.createApiKey({ accountId: 'acc_a', name: 'Short', scopes: ['gate:check'], expiresInDays: 1 });
    expect(K.findActiveKey(token)).not.toBeNull();
    expect(K.findActiveKey(token, Date.now() + 2 * DAY)).toBeNull();
  });
});

describe('rate limit', () => {
  it('allows N per window, then answers with Retry-After seconds', () => {
    const rl = new K.RateLimiter(3, 60_000);
    const t = 1_000_000;
    expect(rl.take('k', t).ok).toBe(true);
    expect(rl.take('k', t + 1).ok).toBe(true);
    expect(rl.take('k', t + 2).ok).toBe(true);
    const r = rl.take('k', t + 10_000);
    expect(r).toEqual({ ok: false, retryAfter: 50 });
    expect(rl.take('other', t).ok).toBe(true);
    expect(rl.take('k', t + 60_001).ok).toBe(true);
  });
  it('returns 429 with Retry-After on the API after 60 calls a minute', async () => {
    const { token } = K.createApiKey({ accountId: 'acc_a', name: 'Burst', scopes: ['gate:check'] });
    for (let i = 0; i < K.RATE_LIMIT.requests; i++) expect((await v1Sites.GET(req('/api/v1/sites', { key: token }))).status).toBe(200);
    const res = await v1Sites.GET(req('/api/v1/sites', { key: token }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await res.json()).code).toBe('rate_limited');
  });
});

describe('API authentication', () => {
  it('needs a key in the header, never the query string', async () => {
    expect((await (await v1Sites.GET(req('/api/v1/sites'))).json()).code).toBe('missing_api_key');
    const { token } = K.createApiKey({ accountId: 'acc_a', name: 'Q', scopes: ['gate:check'] });
    const res = await v1Sites.GET(req(`/api/v1/sites?api_key=${token}`));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('key_in_query');
    expect((await v1Sites.GET(req('/api/v1/sites', { key: 'rk_live_' + 'x'.repeat(43) }))).status).toBe(401);
  });
  it('lists only the key account’s sites and logs usage with last used', async () => {
    const { key, token } = K.createApiKey({ accountId: 'acc_a', name: 'List', scopes: ['gate:check'] });
    const res = await v1Sites.GET(req('/api/v1/sites', { key: token }));
    expect(await res.json()).toEqual({ sites: [{ id: 'site_a', name: 'Site site_a', domain: 'site_a.example' }] });
    expect(K.getApiKey('acc_a', key.id)?.last_used_at).toBeTruthy();
    expect(K.recentUsage('acc_a').some((u) => u.key_id === key.id && u.route === '/api/v1/sites' && u.status === 200)).toBe(true);
  });
  it('checks scope and site ownership', async () => {
    const { token: listOnly } = K.createApiKey({ accountId: 'acc_a', name: 'Sites only', scopes: ['sites:read'] });
    const r1 = await v1Check.POST(req('/api/v1/gate/check', { ...json({ site: 'site_a', pages: [PAGE] }), key: listOnly }));
    expect(r1.status).toBe(403);
    expect((await r1.json()).code).toBe('insufficient_scope');
    const { token } = K.createApiKey({ accountId: 'acc_a', name: 'Gate', scopes: ['gate:check'] });
    const r2 = await v1Check.POST(req('/api/v1/gate/check', { ...json({ site: 'site_b', pages: [PAGE] }), key: token }));
    expect(r2.status).toBe(404);
    expect((await r2.json()).code).toBe('site_not_found');
    const r3 = await siteForApiRequest(req('/api/sites/site_b/gate/check', { method: 'POST', key: token }), 'site_b');
    expect(r3).toBeInstanceOf(Response);
    expect((r3 as Response).status).toBe(404);
  });
  it('answers 402 with a clear error when the account’s trial has ended', async () => {
    const { token } = K.createApiKey({ accountId: 'acc_dead', name: 'Old', scopes: ['gate:check'] });
    const res = await v1Check.POST(req('/api/v1/gate/check', { ...json({ site: 'site_dead', pages: [PAGE] }), key: token }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('account_inactive');
    expect(body.error).toMatch(/trial/);
    const r2 = await siteForApiRequest(req('/api/sites/site_dead/gate/check', { ...json({ pages: [PAGE] }), key: token }), 'site_dead');
    expect((r2 as Response).status).toBe(402);
  });
});

describe('v1 gate check', () => {
  it('returns stable error codes for bad bodies', async () => {
    const { token } = K.createApiKey({ accountId: 'acc_a', name: 'Errors', scopes: ['gate:check'] });
    const call = (body: string) => v1Check.POST(req('/api/v1/gate/check', { method: 'POST', body, key: token }));
    expect((await (await call('{oops')).json()).code).toBe('invalid_json');
    expect((await (await call('[]')).json()).code).toBe('invalid_json');
    expect((await (await call(JSON.stringify({ pages: [PAGE] }))).json()).code).toBe('invalid_request');
    expect((await (await call(JSON.stringify({ site: 'site_a', pages: [] }))).json()).code).toBe('invalid_request');
    const r = await call(JSON.stringify({ site: 'site_a', pages: [{ body: 'no url or title' }] }));
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe('no_usable_pages');
  });
  it('passes the key account’s site and the source to the scorer, on both the v1 and the per-site route', async () => {
    const { key, token } = K.createApiKey({ accountId: 'acc_a', name: 'Score', scopes: ['gate:check'] });
    const res = await v1Check.POST(req('/api/v1/gate/check', { ...json({ site: 'site_a', source: 'wordpress', pages: [PAGE] }), key: token }));
    expect(res.status).toBe(200);
    expect((await res.json()).pages[0]).toEqual({ path: '/walks/keswick', verdict: 'index' });
    expect(runs.at(-1)).toEqual({ siteId: 'site_a', source: 'wordpress' });
    const r2 = await siteForApiRequest(req('/api/sites/site_a/gate/check', { ...json({ pages: [PAGE] }), key: token }), 'site_a');
    expect(r2).not.toBeInstanceOf(Response);
    if (!(r2 instanceof Response)) {
      expect(r2).toMatchObject({ accountId: 'acc_a', active: true, keyId: key.id });
      expect(r2.site.id).toBe('site_a');
    }
  });
  it('validates page bodies the same way for every route', () => {
    expect(parseApiPages({ pages: [PAGE, PAGE] })).toMatchObject({ ok: true, notes: ['1 repeated URL was skipped.'] });
    expect(parseApiPages({ pages: 'x' })).toMatchObject({ ok: false, code: 'invalid_request', status: 400 });
    expect(parseApiPages({ pages: [1] })).toMatchObject({ ok: false, code: 'no_usable_pages', status: 422 });
  });
});
