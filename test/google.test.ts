import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const dir = mkdtempSync(path.join(tmpdir(), 'rankcall-google-'));
process.env.DATA_DIR = dir;

import { importGa4 } from '../src/engine/ingest/ga4';
import { importGsc } from '../src/engine/ingest/gsc';
import { ga4ReportAll, gscQueryAll, type Ga4Row, type GscRow } from '../src/lib/google/api';
import { ga4Import, gscPagesImport, gscQueriesImport } from '../src/lib/google/convert';
import { appSecret, buildAuthUrl, decryptSecret, encryptSecret, googleConfig, gscPropertyMatches, missingGoogleEnv, pkceChallenge, SCOPE_GA4, SCOPE_GSC, signState, syncPeriods, verifyState } from '../src/lib/google/core';
import { accessTokenFor, fetchGoogleData, handleCallback, handleConnect, handleDisconnect, handleListProperties, handleSaveProperties, handleSync, type Deps } from '../src/lib/google/flow';
import { getConnection, getTokens, rawTokenColumns, saveConnection, setProperties } from '../src/lib/google/store';
import { db } from '../src/lib/db';

const SECRET = 'x'.repeat(48);
const ENV = { GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'shh-client-secret', APP_SECRET: SECRET, APP_URL: 'https://app.rankcall.test' };
const NOW = Date.UTC(2026, 9, 14, 12);
const SITE = 'site_a';
const OTHER = 'site_b';
const USER = { userId: 'user_a', accountId: 'acct_a' };

beforeAll(() => {
  const d = db();
  d.prepare(`insert into accounts (id, name, plan, trial_ends_at, created_at) values ('acct_a','A','trial','2099-01-01','2026-01-01'), ('acct_b','B','trial','2099-01-01','2026-01-01')`).run();
  d.prepare(`insert into sites (id, name, domain, sitemap_url, created_at, account_id) values (?, 'A', 'sample-outdoors.example', null, '2026-01-01', 'acct_a'), (?, 'B', 'other.example', null, '2026-01-01', 'acct_b')`).run(SITE, OTHER);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Call = { url: string; init?: RequestInit };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const idToken = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

/** Fake Google: records calls and answers by URL. */
function fakeGoogle(handler: (url: string, body: string) => Response | undefined) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const res = handler(url, typeof init?.body === 'string' ? init.body : '');
    if (!res) throw new Error(`Unexpected fetch ${url}`);
    return res;
  }) as typeof fetch;
  return { f, calls };
}

function deps(over: Partial<Deps> = {}): Deps {
  return {
    env: ENV, fetch: (async () => { throw new Error('no network in tests'); }) as typeof fetch,
    viewer: async () => USER,
    siteFor: async (id) => (id === SITE ? { id: SITE, domain: 'sample-outdoors.example' } : null), // the account owns only site_a
    startSync: () => ({ id: 'job_1' }), now: () => NOW, ...over,
  };
}
const post = (url: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } });

describe('configuration', () => {
  it('lists missing env var names and switches on when all are set', () => {
    expect(missingGoogleEnv({})).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_SECRET']);
    expect(missingGoogleEnv({ ...ENV, APP_URL: undefined, NODE_ENV: 'production' })).toEqual(['APP_URL']);
    expect(missingGoogleEnv({ ...ENV, APP_SECRET: 'short' })).toEqual(['APP_SECRET']);
    expect(googleConfig(ENV)?.redirectUri).toBe('https://app.rankcall.test/api/google/callback');
  });
  it('fails closed without APP_SECRET', () => {
    expect(() => appSecret({})).toThrow(/APP_SECRET/);
  });
});

describe('consent URL, PKCE and state', () => {
  it('asks for read-only Search Console and GA4 scopes, offline access and an S256 challenge', () => {
    const u = new URL(buildAuthUrl(googleConfig(ENV)!, 'STATE', 'CHALLENGE'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = Object.fromEntries(u.searchParams);
    expect(p).toMatchObject({ client_id: ENV.GOOGLE_CLIENT_ID, redirect_uri: 'https://app.rankcall.test/api/google/callback', response_type: 'code', access_type: 'offline', prompt: 'consent', state: 'STATE', code_challenge: 'CHALLENGE', code_challenge_method: 'S256' });
    expect(p.scope.split(' ').sort()).toEqual(['email', 'openid', SCOPE_GA4, SCOPE_GSC].sort());
  });
  it('matches the RFC 7636 S256 test vector', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  const state = signState({ nonce: 'n1', siteId: SITE, userId: 'user_a', expiresAt: NOW + 60_000 }, SECRET);
  it('accepts a valid state for the same user', () => {
    expect(verifyState(state, SECRET, 'user_a', NOW)).toMatchObject({ n: 'n1', s: SITE, u: 'user_a' });
  });
  it('rejects tampering, the wrong key, another user and expiry', () => {
    const [body, sig] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ n: 'n1', s: OTHER, u: 'user_a', e: NOW + 60_000 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, SECRET, 'user_a', NOW)).toBeNull();
    expect(verifyState(`${body}.${sig.slice(0, -2)}AA`, SECRET, 'user_a', NOW)).toBeNull();
    expect(verifyState(state, 'y'.repeat(48), 'user_a', NOW)).toBeNull();
    expect(verifyState(state, SECRET, 'user_b', NOW)).toBeNull();
    expect(verifyState(state, SECRET, 'user_a', NOW + 61_000)).toBeNull();
    expect(verifyState('garbage', SECRET, 'user_a', NOW)).toBeNull();
    expect(verifyState(null, SECRET, 'user_a', NOW)).toBeNull();
  });
});

describe('token encryption', () => {
  it('round-trips, uses a fresh IV and rejects tampering or the wrong key', () => {
    const a = encryptSecret('1//refresh-token', SECRET);
    expect(a).not.toContain('refresh-token');
    expect(encryptSecret('1//refresh-token', SECRET)).not.toBe(a);
    expect(decryptSecret(a, SECRET)).toBe('1//refresh-token');
    expect(() => decryptSecret(a, 'z'.repeat(48))).toThrow();
    const parts = a.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), SECRET)).toThrow();
  });
});

describe('connect and callback', () => {
  it('requires sign-in, ownership and configuration', async () => {
    const r1 = await handleConnect(new Request(`https://app.rankcall.test/api/google/connect?site=${SITE}`), deps({ viewer: async () => null }));
    expect(r1.headers.get('location')).toBe('https://app.rankcall.test/login');
    expect((await handleConnect(new Request(`https://app.rankcall.test/api/google/connect?site=${OTHER}`), deps())).status).toBe(404);
    expect((await handleConnect(new Request('https://app.rankcall.test/api/google/connect?site=../x'), deps())).status).toBe(404);
    const r3 = await handleConnect(new Request(`https://app.rankcall.test/api/google/connect?site=${SITE}`), deps({ env: {} }));
    expect(r3.headers.get('location')).toContain(`/sites/${SITE}/data?google=not_configured`);
  });

  async function startAndGetState() {
    const r = await handleConnect(new Request(`https://app.rankcall.test/api/google/connect?site=${SITE}`), deps());
    expect(r.status).toBe(302);
    const u = new URL(r.headers.get('location')!);
    return { state: u.searchParams.get('state')!, challenge: u.searchParams.get('code_challenge')! };
  }

  it('exchanges the code with the PKCE verifier and stores tokens encrypted', async () => {
    const { state, challenge } = await startAndGetState();
    const g = fakeGoogle((url, body) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        const p = new URLSearchParams(body);
        expect(p.get('grant_type')).toBe('authorization_code');
        expect(p.get('code')).toBe('auth-code');
        expect(p.get('redirect_uri')).toBe('https://app.rankcall.test/api/google/callback');
        expect(pkceChallenge(p.get('code_verifier')!)).toBe(challenge);
        return json({ access_token: 'ya29.access', expires_in: 3599, refresh_token: '1//refresh', scope: `openid email ${SCOPE_GSC} ${SCOPE_GA4}`, id_token: idToken({ iss: 'https://accounts.google.com', aud: ENV.GOOGLE_CLIENT_ID, email: 'owner@sample-outdoors.example' }) });
      }
    });
    const r = await handleCallback(new Request(`https://app.rankcall.test/api/google/callback?code=auth-code&state=${state}`), deps({ fetch: g.f }));
    expect(r.headers.get('location')).toBe(`https://app.rankcall.test/sites/${SITE}/data?google=connected#google`);
    const conn = getConnection(SITE)!;
    expect(conn).toMatchObject({ google_email: 'owner@sample-outdoors.example', account_id: 'acct_a', status: 'connected' });
    expect(conn.scopes).toContain(SCOPE_GSC);
    const raw = rawTokenColumns(SITE)!;
    expect(raw.refresh_token_enc).not.toContain('refresh');
    expect(raw.access_token_enc).not.toContain('ya29');
    expect(getTokens(SITE, ENV)).toMatchObject({ refreshToken: '1//refresh', accessToken: 'ya29.access', expiresAt: NOW + 3599_000 });
    expect(JSON.stringify(conn)).not.toContain('1//refresh');

    // The same state cannot be replayed.
    const again = await handleCallback(new Request(`https://app.rankcall.test/api/google/callback?code=auth-code&state=${state}`), deps({ fetch: g.f }));
    expect(again.headers.get('location')).toContain('google=state_invalid');
    expect(g.calls.length).toBe(1);
  });

  it('rejects a state started by another user, an expired state, and Google errors', async () => {
    const { state } = await startAndGetState();
    const g = fakeGoogle(() => json({}));
    const other = await handleCallback(new Request(`https://app.rankcall.test/api/google/callback?code=c&state=${state}`), deps({ fetch: g.f, viewer: async () => ({ userId: 'user_x', accountId: 'acct_a' }) }));
    expect(other.headers.get('location')).toBe('https://app.rankcall.test/sites?google=state_invalid');
    const late = await handleCallback(new Request(`https://app.rankcall.test/api/google/callback?code=c&state=${state}`), deps({ fetch: g.f, now: () => NOW + 11 * 60_000 }));
    expect(late.headers.get('location')).toContain('google=state_invalid');
    const s2 = (await startAndGetState()).state;
    const denied = await handleCallback(new Request(`https://app.rankcall.test/api/google/callback?error=access_denied&state=${s2}`), deps({ fetch: g.f }));
    expect(denied.headers.get('location')).toContain('google=denied');
    expect(g.calls.length).toBe(0);
  });
});

describe('access token refresh', () => {
  it('reuses a fresh token, refreshes an expiring one and flags a revoked grant', async () => {
    saveConnection({ siteId: SITE, accountId: 'acct_a', userId: 'user_a', email: 'a@x', scopes: [SCOPE_GSC, SCOPE_GA4], refreshToken: '1//r', accessToken: 'old', expiresAt: NOW + 10 * 60_000 }, ENV);
    const none = fakeGoogle(() => undefined);
    expect(await accessTokenFor(SITE, { env: ENV, fetch: none.f, now: () => NOW })).toBe('old');

    const ok = fakeGoogle((url, body) => {
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(Object.fromEntries(new URLSearchParams(body))).toMatchObject({ grant_type: 'refresh_token', refresh_token: '1//r', client_id: ENV.GOOGLE_CLIENT_ID });
      return json({ access_token: 'new', expires_in: 3600 });
    });
    const later = NOW + 20 * 60_000;
    expect(await accessTokenFor(SITE, { env: ENV, fetch: ok.f, now: () => later })).toBe('new');
    expect(getTokens(SITE, ENV)).toMatchObject({ accessToken: 'new', refreshToken: '1//r', expiresAt: later + 3600_000 });

    const revoked = fakeGoogle(() => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));
    await expect(accessTokenFor(SITE, { env: ENV, fetch: revoked.f, now: () => later + 2 * 3600_000 })).rejects.toThrow(/Connect Google again/);
    expect(getConnection(SITE)?.status).toBe('reconnect');
  });
});

describe('pagination', () => {
  const row = (i: number): GscRow => ({ keys: [`https://www.sample-outdoors.example/p/${i}`], clicks: 1, impressions: 10, ctr: 0.1, position: 5 });
  it('pages Search Console with startRow until a short page', async () => {
    const g = fakeGoogle((_url, body) => {
      const b = JSON.parse(body);
      expect(b.rowLimit).toBe(25_000);
      const n = b.startRow === 50_000 ? 3 : 25_000;
      return json({ rows: Array.from({ length: n }, (_, i) => row(b.startRow + i)) });
    });
    const r = await gscQueryAll(g.f, 'tok', 'sc-domain:sample-outdoors.example', { startDate: '2026-09-01', endDate: '2026-09-28', dimensions: ['page'] }, 100_000);
    expect(r.rows.length).toBe(50_003);
    expect(r.capped).toBe(false);
    expect(g.calls.map((c) => JSON.parse(String(c.init?.body)).startRow)).toEqual([0, 25_000, 50_000]);
    expect(g.calls[0].url).toBe('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Asample-outdoors.example/searchAnalytics/query');
    expect((g.calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
  it('stops at the row cap', async () => {
    const g = fakeGoogle((_url, body) => { const b = JSON.parse(body); return json({ rows: Array.from({ length: b.rowLimit }, (_, i) => row(b.startRow + i)) }); });
    const r = await gscQueryAll(g.f, 'tok', 'https://www.sample-outdoors.example/', { startDate: 'a', endDate: 'b', dimensions: ['page'] }, 30_000);
    expect(r.rows.length).toBe(30_000);
    expect(r.capped).toBe(true);
    expect(g.calls.map((c) => JSON.parse(String(c.init?.body)).rowLimit)).toEqual([25_000, 5_000]);
  });
  it('pages GA4 runReport with offset', async () => {
    const g = fakeGoogle((url, body) => {
      expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport');
      const b = JSON.parse(body);
      expect(b.dimensions).toEqual([{ name: 'landingPage' }]);
      expect(b.metrics.map((m: { name: string }) => m.name)).toEqual(['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue']);
      const n = Number(b.offset) === 0 ? 100_000 : 7;
      return json({ rowCount: 100_007, rows: Array.from({ length: n }, (_, i) => ({ dimensionValues: [{ value: `/p/${i}` }], metricValues: [{ value: '1' }, { value: '1' }, { value: '0' }, { value: '0' }] })) });
    });
    const r = await ga4ReportAll(g.f, 'tok', 'properties/123', { start: '2026-09-01', end: '2026-09-28' }, 200_000);
    expect(r.rows.length).toBe(100_007);
    expect(g.calls.map((c) => JSON.parse(String(c.init?.body)).offset)).toEqual(['0', '100000']);
    await expect(ga4ReportAll(g.f, 'tok', 'properties/1/../x', { start: 'a', end: 'b' }, 10)).rejects.toThrow();
  });
});

describe('conversion matches the CSV importers on the sample data', () => {
  const pct = (s: string) => Number(s.replace('%', '')) / 100;
  const csvRows = (text: string) => text.trim().split('\n').slice(1).map((l) => l.split(','));
  const period = { start: '2026-09-14', end: '2026-10-11' };

  it('Search Console pages with the previous period', () => {
    const zip = new Uint8Array(readFileSync('samples/search-console-performance.zip'));
    const fromCsv = importGsc('search-console-performance.zip', zip);
    const rows = csvRows(strFromU8(unzipSync(zip)['Pages.csv']));
    // Columns: page, clicks, prev clicks, impressions, prev impressions, ctr, prev ctr, position, prev position
    const cur: GscRow[] = rows.map((r) => ({ keys: [r[0]], clicks: +r[1], impressions: +r[3], ctr: pct(r[5]), position: +r[7] }));
    const prev: GscRow[] = rows.map((r) => ({ keys: [r[0]], clicks: +r[2], impressions: +r[4], ctr: pct(r[6]), position: +r[8] }));
    const fromApi = gscPagesImport(cur, prev, period);
    expect(fromApi.hasPrevious).toBe(fromCsv.hasPrevious);
    expect(fromApi.pages).toEqual(fromCsv.pages);
    expect(fromApi.pageQueries).toEqual([]);
    expect(Object.keys(fromApi).sort()).toEqual(Object.keys(fromCsv).sort());
  });

  it('page and query rows', () => {
    const bytes = new Uint8Array(readFileSync('samples/search-console-page-queries.csv'));
    const fromCsv = importGsc('search-console-page-queries.csv', bytes);
    const rows: GscRow[] = csvRows(strFromU8(bytes)).map((r) => ({ keys: [r[0], r[1]], clicks: +r[2], impressions: +r[3], ctr: pct(r[4]), position: +r[5] }));
    const fromApi = gscQueriesImport(rows, period);
    expect(fromApi.pageQueries).toEqual(fromCsv.pageQueries);
    expect(fromApi.pages).toEqual(fromCsv.pages);
    expect(fromApi.hasPrevious).toBe(false);
  });

  it('GA4 landing pages', () => {
    const bytes = new Uint8Array(readFileSync('samples/ga4-landing-pages.csv'));
    const fromCsv = importGa4(bytes);
    const lines = strFromU8(bytes).split('\n').filter((l) => l && !l.startsWith('#'));
    const head = lines[0].split(',');
    const at = (name: string) => head.indexOf(name);
    const rows: Ga4Row[] = lines.slice(1).map((l) => l.split(',')).map((r) => ({
      dimensionValues: [{ value: r[0] }],
      metricValues: [r[at('Sessions')], r[at('Engaged sessions')], r[at('Key events')], r[at('Total revenue')]].map((value) => ({ value })),
    }));
    rows.push({ dimensionValues: [{ value: '(not set)' }], metricValues: [{ value: '9' }, { value: '1' }, { value: '0' }, { value: '0' }] });
    const fromApi = ga4Import(rows, ['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue'], period);
    expect(fromApi.pages).toEqual(fromCsv.pages);
    expect(Object.keys(fromApi).sort()).toEqual(Object.keys(fromCsv).sort());
  });
});

describe('properties, sync and disconnect routes', () => {
  it('match Search Console properties to the site domain', () => {
    expect(gscPropertyMatches('sc-domain:sample-outdoors.example', 'sample-outdoors.example')).toBe(true);
    expect(gscPropertyMatches('https://www.sample-outdoors.example/', 'sample-outdoors.example')).toBe(true);
    expect(gscPropertyMatches('https://shop.sample-outdoors.example/', 'sample-outdoors.example')).toBe(false);
    expect(gscPropertyMatches('sc-domain:other.example', 'sample-outdoors.example')).toBe(false);
  });
  it('the sync window is the last 28 days vs the 28 before, ending three days ago', () => {
    expect(syncPeriods(new Date(NOW))).toEqual({ current: { start: '2026-09-14', end: '2026-10-11' }, previous: { start: '2026-08-17', end: '2026-09-13' } });
  });

  it('refuse other accounts’ sites, signed-out callers and foreign origins', async () => {
    const u = 'https://app.rankcall.test/api/google/';
    for (const h of [handleDisconnect, handleSync, handleSaveProperties]) {
      expect((await h(post(`${u}x`, { site: OTHER }), deps())).status).toBe(404);
      expect((await h(post(`${u}x`, { site: SITE }), deps({ viewer: async () => null }))).status).toBe(401);
      expect((await h(post(`${u}x`, { site: SITE }, { origin: 'https://evil.example' }), deps())).status).toBe(403);
    }
    expect((await handleListProperties(new Request(`${u}properties?site=${OTHER}`), deps())).status).toBe(404);
    expect((await handleListProperties(new Request(`${u}properties?site=${SITE}`), deps({ viewer: async () => null }))).status).toBe(401);
    // The other account's site is never touched.
    expect(getConnection(OTHER)).toBeNull();
  });

  function googleApis() {
    return fakeGoogle((url, body) => {
      if (url.startsWith('https://www.googleapis.com/webmasters/v3/sites') && !url.includes('searchAnalytics')) return json({ siteEntry: [{ siteUrl: 'sc-domain:sample-outdoors.example', permissionLevel: 'siteOwner' }, { siteUrl: 'https://other.example/', permissionLevel: 'siteFullUser' }, { siteUrl: 'https://unverified.example/', permissionLevel: 'siteUnverifiedUser' }] });
      if (url.startsWith('https://analyticsadmin.googleapis.com/v1beta/accountSummaries')) return json({ accountSummaries: [{ displayName: 'Sample Outdoors', propertySummaries: [{ property: 'properties/123', displayName: 'sample-outdoors.example' }] }] });
      if (url.includes('searchAnalytics/query')) {
        const b = JSON.parse(body);
        const prev = b.startDate === '2026-08-17';
        if (b.dimensions.length === 2) return json({ rows: [{ keys: ['https://www.sample-outdoors.example/guides/boots', 'Best Boots'], clicks: 10, impressions: 100, ctr: 0.1, position: 3 }] });
        return json({ rows: [{ keys: ['https://www.sample-outdoors.example/guides/boots/'], clicks: prev ? 20 : 10, impressions: 200, ctr: 0.05, position: 4 }] });
      }
      if (url.includes(':runReport')) return json({ rowCount: 1, metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }, { name: 'totalRevenue' }], rows: [{ dimensionValues: [{ value: '/guides/boots' }], metricValues: [{ value: '50' }, { value: '30' }, { value: '2' }, { value: '99.5' }] }] });
      if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });
    });
  }

  it('lists properties, saves only ones the account can read, then syncs into importer shapes', async () => {
    saveConnection({ siteId: SITE, accountId: 'acct_a', userId: 'user_a', email: 'a@x', scopes: ['openid', 'email', SCOPE_GSC, SCOPE_GA4], refreshToken: '1//r', accessToken: 'tok', expiresAt: NOW + 3600_000 }, ENV);
    const g = googleApis();
    const list = await handleListProperties(new Request(`https://app.rankcall.test/api/google/properties?site=${SITE}`), deps({ fetch: g.f }));
    const lists = await list.json();
    expect(lists.gsc.map((s: { siteUrl: string; matches: boolean }) => [s.siteUrl, s.matches])).toEqual([['sc-domain:sample-outdoors.example', true], ['https://other.example/', false]]);
    expect(lists.ga4).toEqual([{ property: 'properties/123', displayName: 'sample-outdoors.example', account: 'Sample Outdoors' }]);
    expect(JSON.stringify(lists)).not.toContain('tok');

    const bad = await handleSaveProperties(post('https://app.rankcall.test/api/google/properties', { site: SITE, gsc: 'sc-domain:not-mine.example', ga4: '' }), deps({ fetch: g.f }));
    expect(bad.headers.get('location')).toContain('google=property_invalid');
    const mismatch = await handleSaveProperties(post('https://app.rankcall.test/api/google/properties', { site: SITE, gsc: 'https://other.example/', ga4: '' }), deps({ fetch: g.f }));
    expect(mismatch.headers.get('location')).toContain('google=saved_mismatch');
    const ok = await handleSaveProperties(post('https://app.rankcall.test/api/google/properties', { site: SITE, gsc: 'sc-domain:sample-outdoors.example', ga4: 'properties/123' }), deps({ fetch: g.f }));
    expect(ok.status).toBe(303);
    expect(getConnection(SITE)).toMatchObject({ gsc_property: 'sc-domain:sample-outdoors.example', ga4_property: 'properties/123', ga4_property_name: 'sample-outdoors.example (Sample Outdoors)' });

    const started: string[] = [];
    const s = await handleSync(post('https://app.rankcall.test/api/google/sync', { site: SITE }), deps({ startSync: (id) => { started.push(id); return { id: 'job' }; } }));
    expect(s.headers.get('location')).toContain('google=sync_started');
    expect(started).toEqual([SITE]);

    const data = await fetchGoogleData(SITE, { env: ENV, fetch: g.f, now: () => NOW });
    expect(data.gscPages?.pages).toEqual([{ path: '/guides/boots', clicks: 10, impressions: 200, ctr: 0.05, position: 4, prevClicks: 20, prevImpressions: 200, prevPosition: 4 }]);
    expect(data.gscPages?.hasPrevious).toBe(true);
    expect(data.gscPages?.period).toEqual({ start: '2026-09-14', end: '2026-10-11' });
    expect(data.gscQueries?.pageQueries).toEqual([{ path: '/guides/boots', query: 'best boots', clicks: 10, impressions: 100, position: 3 }]);
    expect(data.ga4?.pages).toEqual([{ path: '/guides/boots', sessions: 50, engagedSessions: 30, conversions: 2, revenue: 99.5 }]);
    expect(data.counts).toMatchObject({ gscPages: 1, gscQueries: 1, ga4Pages: 1 });
  });

  it('sync asks for properties first', async () => {
    setProperties(SITE, null, null, null);
    const r = await handleSync(post('https://app.rankcall.test/api/google/sync', { site: SITE }), deps());
    expect(r.headers.get('location')).toContain('google=choose_properties');
  });

  it('disconnect revokes at Google and deletes the tokens', async () => {
    const g = googleApis();
    const r = await handleDisconnect(post('https://app.rankcall.test/api/google/disconnect', { site: SITE }, { origin: 'https://app.rankcall.test' }), deps({ fetch: g.f }));
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toContain('google=disconnected');
    expect(g.calls[0].url).toBe('https://oauth2.googleapis.com/revoke');
    expect(new URLSearchParams(String(g.calls[0].init?.body)).get('token')).toBe('1//r');
    expect(getConnection(SITE)).toBeNull();
    expect(rawTokenColumns(SITE)).toBeNull();
  });
});
