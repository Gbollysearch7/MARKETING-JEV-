import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Billing proof: Stripe-shaped events, signed exactly as Stripe signs them, go through the real webhook route
 * and applyStripeEvent against a throwaway SQLite database. Checkout and portal calls use a mocked fetch.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/billing', () => import('../src/lib/billing'));
vi.mock('@/lib/crypto', () => import('../src/lib/crypto'));

const dataDir = mkdtempSync(path.join(tmpdir(), 'rankcall-billing-'));
const SECRET = 'whsec_test_only_not_a_real_secret';
const ENV = {
  DATA_DIR: dataDir,
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_STARTER: 'price_starter_test',
  STRIPE_PRICE_GROWTH: 'price_growth_test',
  STRIPE_PRICE_SCALE: 'price_scale_test',
};
const saved: Record<string, string | undefined> = {};

type Billing = typeof import('../src/lib/billing');
type Db = typeof import('../src/lib/db');
type Route = typeof import('../src/app/api/billing/webhook/route');
let billing: Billing;
let dbm: Db;
let route: Route;

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  delete saved.APP_URL; saved.APP_URL = process.env.APP_URL; delete process.env.APP_URL;
  dbm = await import('../src/lib/db');
  billing = await import('../src/lib/billing');
  route = await import('../src/app/api/billing/webhook/route');
});

afterAll(() => {
  dbm.db().close();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  rmSync(dataDir, { recursive: true, force: true });
});

const nowSec = () => Math.floor(Date.now() / 1000);
/** Stripe's scheme: header "t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>". */
const sign = (body: string, t = nowSec(), secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

let seq = 0;
const event = (type: string, object: Record<string, unknown>, created = nowSec()) => ({ id: `evt_test_${++seq}`, object: 'event', api_version: '2025-09-30.clover', livemode: false, type, created, data: { object } });

async function deliver(evt: unknown, opts: { header?: string | null; rawBody?: string } = {}) {
  const body = opts.rawBody ?? JSON.stringify(evt);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const header = opts.header === undefined ? sign(body) : opts.header;
  if (header !== null) headers['stripe-signature'] = header;
  const res = await route.POST(new Request('http://localhost/api/billing/webhook', { method: 'POST', headers, body }));
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
}

function makeAccount(id: string) {
  dbm.db().prepare(`insert into accounts (id, name, plan, trial_ends_at, created_at) values (?, 'Sample Outdoors', 'trial', ?, ?)`)
    .run(id, new Date(Date.now() + 14 * 86_400_000).toISOString(), new Date().toISOString());
}
const account = (id: string) => dbm.db().prepare('select plan, subscription_status, stripe_customer_id, stripe_subscription_id from accounts where id = ?').get(id) as {
  plan: string; subscription_status: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null;
};

const checkoutCompleted = (accountId: string, plan = 'growth', extra: Record<string, unknown> = {}) => event('checkout.session.completed', {
  id: 'cs_test_1', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', status: 'complete',
  client_reference_id: accountId, customer: `cus_${accountId}`, subscription: `sub_${accountId}`,
  metadata: { account_id: accountId, plan }, ...extra,
});
const subscription = (type: string, accountId: string, opts: { status?: string; price?: string; subId?: string; created?: number; meta?: boolean } = {}) => event(type, {
  id: opts.subId ?? `sub_${accountId}`, object: 'subscription', customer: `cus_${accountId}`, status: opts.status ?? 'active',
  items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', price: { id: opts.price ?? 'price_growth_test', object: 'price', currency: 'gbp' } }] },
  metadata: opts.meta === false ? {} : { account_id: accountId, plan: 'growth' },
}, opts.created);

describe('webhook signature checks', () => {
  beforeAll(() => makeAccount('acc_sig'));

  it('rejects a bad signature and changes nothing', async () => {
    const evt = checkoutCompleted('acc_sig');
    const r = await deliver(evt, { header: sign(JSON.stringify(evt), nowSec(), 'whsec_wrong') });
    expect(r.status).toBe(400);
    expect(account('acc_sig')).toMatchObject({ plan: 'trial', subscription_status: null });
  });

  it('rejects a tampered body signed for different bytes', async () => {
    const evt = checkoutCompleted('acc_sig');
    const r = await deliver(evt, { header: sign(JSON.stringify({ ...evt, type: 'ping' })) });
    expect(r.status).toBe(400);
  });

  it('rejects a stale timestamp (older than 5 minutes), even with a correct HMAC', async () => {
    const evt = checkoutCompleted('acc_sig');
    const r = await deliver(evt, { header: sign(JSON.stringify(evt), nowSec() - 301) });
    expect(r.status).toBe(400);
    expect(account('acc_sig').plan).toBe('trial');
  });

  it('rejects a missing header', async () => {
    expect((await deliver(checkoutCompleted('acc_sig'), { header: null })).status).toBe(400);
  });

  it('accepts a header with several v1 signatures when one matches (secret rotation)', async () => {
    const evt = checkoutCompleted('acc_sig');
    const body = JSON.stringify(evt);
    const t = nowSec();
    const good = sign(body, t).split(',')[1];
    const r = await deliver(evt, { header: `t=${t},v1=${'0'.repeat(64)},${good}` });
    expect(r.status).toBe(200);
    expect(account('acc_sig')).toMatchObject({ plan: 'growth', subscription_status: 'active' });
  });

  it('rejects a correctly signed body that is not JSON', async () => {
    const raw = 'not json';
    expect((await deliver(null, { rawBody: raw, header: sign(raw) })).status).toBe(400);
  });

  it('answers 503 when no webhook secret is configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      expect((await deliver(checkoutCompleted('acc_sig'))).status).toBe(503);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    }
  });
});

describe('subscription lifecycle', () => {
  const id = 'acc_life';
  beforeAll(() => makeAccount(id));
  const t0 = nowSec() - 120;

  it('checkout.session.completed puts the account on the paid plan', async () => {
    const r = await deliver(checkoutCompleted(id, 'growth'));
    expect(r).toEqual({ status: 200, body: { received: true, result: 'applied' } });
    expect(account(id)).toEqual({ plan: 'growth', subscription_status: 'active', stripe_customer_id: `cus_${id}`, stripe_subscription_id: `sub_${id}` });
  });

  it('is idempotent: replaying the same event id is acknowledged and skipped', async () => {
    const evt = subscription('customer.subscription.updated', id, { price: 'price_scale_test', created: t0 });
    expect((await deliver(evt)).body).toMatchObject({ result: 'applied' });
    expect(account(id).plan).toBe('scale');
    // Change the row behind Stripe's back, then replay: the replay must not reapply.
    dbm.db().prepare(`update accounts set plan = 'starter' where id = ?`).run(id);
    const again = await deliver(evt);
    expect(again).toEqual({ status: 200, body: { received: true, result: 'duplicate' } });
    expect(account(id).plan).toBe('starter');
  });

  it('customer.subscription.updated follows the price, so a plan change in the portal sticks', async () => {
    const r = await deliver(subscription('customer.subscription.updated', id, { price: 'price_growth_test', created: t0 + 1, meta: false }));
    expect(r.body).toMatchObject({ result: 'applied' });
    expect(account(id)).toMatchObject({ plan: 'growth', subscription_status: 'active' });
  });

  it('ignores a subscription on a price we do not sell', async () => {
    const r = await deliver(subscription('customer.subscription.updated', id, { price: 'price_someone_else', status: 'active', created: t0 + 2 }));
    expect(r.body).toMatchObject({ result: 'ignored' });
    expect(account(id).plan).toBe('growth');
  });

  it('invoice.payment_failed marks the account past due (current Stripe invoice shape)', async () => {
    const evt = event('invoice.payment_failed', {
      id: 'in_test_1', object: 'invoice', customer: `cus_${id}`, status: 'open', billing_reason: 'subscription_cycle',
      parent: { type: 'subscription_details', subscription_details: { subscription: `sub_${id}` } },
    }, t0 + 3);
    expect((await deliver(evt)).body).toMatchObject({ result: 'applied' });
    expect(account(id).subscription_status).toBe('past_due');
  });

  it('invoice.payment_failed also works with the older top-level invoice.subscription field', async () => {
    dbm.db().prepare(`update accounts set subscription_status = 'active' where id = ?`).run(id);
    const evt = event('invoice.payment_failed', { id: 'in_test_2', object: 'invoice', customer: `cus_${id}`, subscription: `sub_${id}` }, t0 + 4);
    await deliver(evt);
    expect(account(id).subscription_status).toBe('past_due');
  });

  it('customer.subscription.deleted for a different subscription does not cancel this one', async () => {
    const r = await deliver(subscription('customer.subscription.deleted', id, { subId: 'sub_old', status: 'canceled', created: t0 + 5, meta: false }));
    expect(r.body).toMatchObject({ result: 'ignored' });
    expect(account(id).subscription_status).toBe('past_due');
  });

  it('customer.subscription.deleted cancels the account', async () => {
    const r = await deliver(subscription('customer.subscription.deleted', id, { status: 'canceled', created: t0 + 10 }));
    expect(r.body).toMatchObject({ result: 'applied' });
    expect(account(id).subscription_status).toBe('canceled');
  });

  it('a late retry of an older "active" update cannot undo the cancellation', async () => {
    const r = await deliver(subscription('customer.subscription.updated', id, { status: 'active', created: t0 + 6 }));
    expect(r.body).toMatchObject({ result: 'stale' });
    expect(account(id).subscription_status).toBe('canceled');
  });

  it('ignores event types it does not handle, and events for unknown accounts', async () => {
    expect((await deliver(event('customer.created', { id: 'cus_x', object: 'customer' }))).body).toMatchObject({ result: 'ignored' });
    expect((await deliver(checkoutCompleted('acc_does_not_exist'))).body).toMatchObject({ result: 'ignored' });
  });

  it('checkout that is not yet paid leaves the account incomplete, not active', () => {
    makeAccount('acc_async');
    expect(billing.applyStripeEvent(checkoutCompleted('acc_async', 'starter', { payment_status: 'unpaid' }))).toBe('applied');
    expect(account('acc_async')).toMatchObject({ plan: 'starter', subscription_status: 'incomplete' });
  });

  it('checkout with unexpected plan metadata never grants a plan by itself', () => {
    makeAccount('acc_meta');
    billing.applyStripeEvent(checkoutCompleted('acc_meta', 'enterprise'));
    expect(account('acc_meta').plan).toBe('trial');
    billing.applyStripeEvent(checkoutCompleted('acc_meta', 'trial'));
    expect(account('acc_meta').plan).toBe('trial');
  });
});

describe('checkout and portal requests', () => {
  let calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'cs_test_x', url: 'https://checkout.stripe.com/c/pay/cs_test_x' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.APP_URL; });

  const form = (i: number) => Object.fromEntries(new URLSearchParams(String(calls[i].init.body)));

  it('creates a GBP subscription checkout for a new customer with the account id attached', async () => {
    const url = await billing.checkoutUrl({ id: 'acc_1', stripe_customer_id: null }, 'owner@sample-outdoors.example', 'growth', 'http://localhost:3000');
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_x');
    expect(calls[0].url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_dummy');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(form(0)).toEqual({
      mode: 'subscription',
      'line_items[0][price]': 'price_growth_test',
      'line_items[0][quantity]': '1',
      success_url: 'http://localhost:3000/billing?done=1',
      cancel_url: 'http://localhost:3000/billing',
      client_reference_id: 'acc_1',
      'metadata[account_id]': 'acc_1',
      'metadata[plan]': 'growth',
      'subscription_data[metadata][account_id]': 'acc_1',
      'subscription_data[metadata][plan]': 'growth',
      allow_promotion_codes: 'true',
      customer_email: 'owner@sample-outdoors.example',
    });
  });

  it('reuses the Stripe customer and uses APP_URL over a spoofable request origin', async () => {
    process.env.APP_URL = 'https://app.rankcall.example/';
    await billing.checkoutUrl({ id: 'acc_2', stripe_customer_id: 'cus_existing' }, 'x@sample-outdoors.example', 'scale', 'https://evil.example');
    const f = form(0);
    expect(f.customer).toBe('cus_existing');
    expect(f.customer_email).toBeUndefined();
    expect(f['line_items[0][price]']).toBe('price_scale_test');
    expect(f.success_url).toBe('https://app.rankcall.example/billing?done=1');
    expect(f.cancel_url).toBe('https://app.rankcall.example/billing');
  });

  it('opens the billing portal for the customer with a return URL', async () => {
    process.env.APP_URL = 'https://app.rankcall.example';
    await billing.portalUrl('cus_existing', 'https://evil.example');
    expect(calls[0].url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(form(0)).toEqual({ customer: 'cus_existing', return_url: 'https://app.rankcall.example/billing' });
  });

  it('surfaces Stripe errors without echoing the request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'No such price' } }), { status: 400 })));
    await expect(billing.checkoutUrl({ id: 'acc_3', stripe_customer_id: null }, 'secret@sample-outdoors.example', 'starter', 'http://x')).rejects.toThrow(/^Stripe 400: No such price$/);
  });

  it('maps price ids to plans and nothing else', () => {
    expect(billing.planForPrice('price_starter_test')).toBe('starter');
    expect(billing.planForPrice('price_unknown')).toBeNull();
    expect(billing.planForPrice(undefined)).toBeNull();
  });
});
