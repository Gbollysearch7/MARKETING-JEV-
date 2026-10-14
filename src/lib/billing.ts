import 'server-only';
import { db } from './db';
import { PLANS, type PlanKey } from './plans';

/** Stripe is optional until keys are set: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and one price id per plan. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_STARTER && process.env.STRIPE_PRICE_GROWTH && process.env.STRIPE_PRICE_SCALE);
}

async function stripe(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

/** A Stripe Checkout page for a subscription in GBP. The account id rides along so the webhook can match it. */
export async function checkoutUrl(account: { id: string; stripe_customer_id: string | null }, email: string, plan: Exclude<PlanKey, 'trial'>, origin: string): Promise<string> {
  const price = process.env[PLANS[plan].stripePriceEnv]!;
  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/billing?done=1`,
    cancel_url: `${origin}/billing`,
    client_reference_id: account.id,
    'metadata[account_id]': account.id,
    'metadata[plan]': plan,
    'subscription_data[metadata][account_id]': account.id,
    'subscription_data[metadata][plan]': plan,
    allow_promotion_codes: 'true',
  };
  if (account.stripe_customer_id) params.customer = account.stripe_customer_id;
  else params.customer_email = email;
  const session = await stripe('checkout/sessions', params);
  return String(session.url);
}

export async function portalUrl(customerId: string, origin: string): Promise<string> {
  const session = await stripe('billing_portal/sessions', { customer: customerId, return_url: `${origin}/billing` });
  return String(session.url);
}

type StripeEvent = { type: string; data: { object: Record<string, unknown> } };

/** Apply a verified Stripe event to the account it belongs to. */
export function applyStripeEvent(event: StripeEvent) {
  const o = event.data.object;
  const meta = (o.metadata ?? {}) as Record<string, string>;
  const d = db();
  if (event.type === 'checkout.session.completed') {
    const accountId = (o.client_reference_id as string) || meta.account_id;
    if (!accountId) return;
    d.prepare(`update accounts set plan = ?, subscription_status = 'active', stripe_customer_id = ?, stripe_subscription_id = ? where id = ?`)
      .run(meta.plan in PLANS ? meta.plan : 'starter', o.customer as string, o.subscription as string, accountId);
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const accountId = meta.account_id;
    const status = o.status as string;
    if (accountId) d.prepare('update accounts set subscription_status = ?, stripe_subscription_id = ?, plan = coalesce(?, plan) where id = ?').run(status, o.id as string, meta.plan in PLANS ? meta.plan : null, accountId);
    else d.prepare('update accounts set subscription_status = ? where stripe_subscription_id = ?').run(status, o.id as string);
  } else if (event.type === 'customer.subscription.deleted') {
    d.prepare(`update accounts set subscription_status = 'canceled' where stripe_subscription_id = ?`).run(o.id as string);
  }
}
