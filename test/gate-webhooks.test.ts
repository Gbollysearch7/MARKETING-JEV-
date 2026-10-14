import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseWebflowEvent, verifyWebflowSignature, webflowItemToPage, type WebflowItem } from '../src/modules/gate/webflow';
import { normalisePage } from '../src/modules/gate/parse';

vi.mock('server-only', () => ({}));
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rk-webflow-'));
delete process.env.TYPESAFE_API_KEY;

const SECRET = 'wf_secret_0123456789abcdef';
const sign = (ts: string, body: string, secret = SECRET) => createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');

describe('Webflow signatures', () => {
  const body = JSON.stringify({ triggerType: 'collection_item_created', payload: { id: 'i1' } });
  const now = 1_760_000_000_000;
  const ts = String(now);
  it('accepts a fresh, correct signature', () => expect(verifyWebflowSignature(body, ts, sign(ts, body), SECRET, now)).toBe('ok'));
  it('accepts a body that differs only in whitespace from what was signed', () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebflowSignature(pretty, ts, sign(ts, body), SECRET, now)).toBe('ok');
  });
  it('rejects a tampered body, the wrong secret and a malformed signature', () => {
    expect(verifyWebflowSignature(body.replace('i1', 'i2'), ts, sign(ts, body), SECRET, now)).toBe('invalid');
    expect(verifyWebflowSignature(body, ts, sign(ts, body, 'another_secret_value'), SECRET, now)).toBe('invalid');
    expect(verifyWebflowSignature(body, ts, 'zz', SECRET, now)).toBe('invalid');
    expect(verifyWebflowSignature(body, String(now + 1), sign(ts, body), SECRET, now)).toBe('invalid');
  });
  it('rejects requests older than 5 minutes, and missing headers', () => {
    const old = String(now - 6 * 60_000);
    expect(verifyWebflowSignature(body, old, sign(old, body), SECRET, now)).toBe('stale');
    const secs = String(Math.floor(now / 1000) - 30);
    expect(verifyWebflowSignature(body, secs, sign(secs, body), SECRET, now)).toBe('ok');
    expect(verifyWebflowSignature(body, null, sign(ts, body), SECRET, now)).toBe('missing');
    expect(verifyWebflowSignature(body, ts, null, SECRET, now)).toBe('missing');
  });
});

describe('Webflow field mapping', () => {
  const item: WebflowItem = { id: 'item1', collectionId: '64f0c0ffee0000000000abcd', fieldData: { name: 'Walks in Keswick', slug: 'walks-in-keswick', 'post-body': '<p>Five walks.</p>', 'post-summary': 'Routes for every ability.' } };
  it('maps name, slug, the chosen body field, summary and collection', () => {
    const { page, template, notes } = webflowItemToPage(item, { bodyField: 'post-body', metaField: 'post-summary', collectionName: 'Blog posts' });
    expect(template).toBe('Blog posts');
    expect(notes).toEqual([]);
    const p = normalisePage(page, 0);
    expect(p).toMatchObject({ path: '/blog-posts/walks-in-keswick', title: 'Walks in Keswick', h1: 'Walks in Keswick', body: 'Five walks.', meta: 'Routes for every ability.', template: 'Blog posts' });
  });
  it('falls back to the longest text field, with a note', () => {
    const { page, notes, template } = webflowItemToPage({ ...item, fieldData: { name: 'X', slug: 'x', intro: 'short', content: 'a much longer piece of body text' } }, { bodyField: 'post-body' });
    expect(page.body).toBe('a much longer piece of body text');
    expect(notes[0]).toMatch(/content/);
    expect(template).toBe('collection-00abcd');
  });
  it('parses item and non-item events', () => {
    expect(parseWebflowEvent({ triggerType: 'collection_item_changed', payload: item })?.item?.id).toBe('item1');
    expect(parseWebflowEvent({ triggerType: 'site_publish', payload: { domains: [] } })).toEqual({ triggerType: 'site_publish', item: null });
    expect(parseWebflowEvent({ nope: 1 })).toBeNull();
  });
});

describe('Webflow webhook route', async () => {
  const K = await import('../src/lib/apikeys');
  const { db } = await import('../src/lib/db');
  const scored: { siteId: string; name: string; title: string }[] = [];
  const route = { POST: (r: Request, ctx: { params: Promise<{ connectionId: string }> }) => ctx.params.then(({ connectionId }) => K.handleWebflowWebhook(r, connectionId, (siteId, name, page) => { scored.push({ siteId, name, title: String(page.title) }); return { id: `batch${scored.length}` }; })) };
  let connId = '';
  const payload = (id: string) => JSON.stringify({ triggerType: 'collection_item_created', payload: { id, collectionId: '64f0c0ffee0000000000abcd', siteId: 's', fieldData: { name: 'Walks in Keswick', slug: `keswick-${id}`, 'post-body': '<p>Five walks around Keswick with parking and timings.</p>' } } });
  const post = (body: string, headers: Record<string, string>) => route.POST(new Request(`http://localhost/api/v1/webhooks/webflow/${connId}`, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }), { params: Promise.resolve({ connectionId: connId }) });
  const signed = (body: string) => { const ts = String(Date.now()); return { 'x-webflow-timestamp': ts, 'x-webflow-signature': sign(ts, body) }; };

  beforeAll(() => {
    process.env.APP_SECRET = 'test-app-secret-at-least-16';
    db().prepare('insert into accounts (id, name, plan, trial_ends_at, created_at) values (?, ?, ?, ?, ?)').run('acc', 'acc', 'trial', new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    db().prepare('insert into sites (id, name, domain, created_at, account_id) values (?, ?, ?, ?, ?)').run('site1', 'S', 's.example', new Date().toISOString(), 'acc');
    connId = K.createWebflowConnection('site1', { secret: SECRET, bodyField: 'post-body', collectionName: 'Blog posts' }).id;
  });
  afterAll(() => { db().close(); });

  it('stores the secret encrypted, not in clear', () => {
    const row = db().prepare('select secret_enc from apikeys_webflow where id = ?').get(connId) as { secret_enc: string };
    expect(row.secret_enc).not.toContain(SECRET);
    expect(K.webflowSecret(connId)).toBe(SECRET);
  });
  it('scores a correctly signed item as a "Webflow · <collection>" batch, once', async () => {
    const body = payload('a1');
    const h = signed(body);
    const res = await post(body, h);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ status: 'scoring', batch_id: 'batch1' });
    expect(scored).toEqual([{ siteId: 'site1', name: 'Webflow · Blog posts', title: 'Walks in Keswick' }]);
    expect(await (await post(body, h)).json()).toMatchObject({ duplicate: true }); // a retry or replay does not score again
    expect(K.getWebflowConnection(connId)?.events).toBe(1);
  });
  it('refuses bad and stale signatures', async () => {
    const body = payload('b1');
    const bad = await post(body, { 'x-webflow-timestamp': String(Date.now()), 'x-webflow-signature': sign(String(Date.now()), body, 'wrong_secret_wrong_secret') });
    expect(bad.status).toBe(401);
    expect((await bad.json()).code).toBe('invalid_signature');
    const old = String(Date.now() - 10 * 60_000);
    const stale = await post(body, { 'x-webflow-timestamp': old, 'x-webflow-signature': sign(old, body) });
    expect((await stale.json()).code).toBe('stale_timestamp');
    expect((await (await post(body, {})).json()).code).toBe('invalid_signature');
  });
  it('acknowledges events with no CMS item without scoring', async () => {
    const body = JSON.stringify({ triggerType: 'site_publish', payload: { domains: ['s.example'] } });
    const out = await (await post(body, signed(body))).json();
    expect(out.status).toBe('ignored');
    expect(scored).toHaveLength(1);
  });
  it('fails closed without APP_SECRET', async () => {
    const saved = process.env.APP_SECRET;
    delete process.env.APP_SECRET;
    const body = payload('c1');
    const res = await post(body, signed(body));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('not_configured');
    expect(() => K.createWebflowConnection('site1', { secret: SECRET, bodyField: 'post-body' })).toThrow(K.MissingAppSecretError);
    process.env.APP_SECRET = saved;
  });
  it('answers 404 for an unknown connection', async () => {
    const res = await route.POST(new Request('http://localhost/x', { method: 'POST', body: '{}' }), { params: Promise.resolve({ connectionId: 'wf_doesnotexist0000' }) });
    expect(res.status).toBe(404);
  });
});
