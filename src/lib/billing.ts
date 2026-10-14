import 'server-only';
import { db } from './db';
import { PAID_PLANS, PLANS, type PlanKey } from './plans';

type PaidPlan = Exclude<PlanKey, 'trial'>;

/** Stripe is optional until keys are set: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and one price id per plan. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_STARTER && process.env.STRIPE_PRICE_GROWTH && process.env.STRIPE_PRICE_SCALE);
}

/**
 * The public base URL for links back into the app. APP_URL (for example https://rankcall.co.uk) wins over the
 * request's own origin, because the Host and X-Forwarded-Proto headers are client-controlled.
 */
export function appBaseUrl(requestOrigin: string): string {
  const configured = process.env.APP_URL?.trim();
  return (configured || requestOrigin).replace(/\/+$/, '');
}

/** The plan a Stripe price id belongs to, from the STRIPE_PRICE_* env vars, or null for a price we do not sell. */
export function planForPrice(priceId: unknown): PaidPlan | null {
  if (typeof priceId !== 'string' || !priceId) return null;
  return PAID_PLANS.find((k) => process.env[PLANS[k].stripePriceEnv] === priceId) ?? null;
}

async function stripe(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  // Never echo the request (it carries the customer's email); Stripe's error message is enough to debug.
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${String((json.error as { message?: string } | undefined)?.message ?? 'request failed').slice(0, 300)}`);
  return json;
}

/** A Stripe Checkout page for a subscription in GBP. The account id rides along so the webhook can match it. */
export async function checkoutUrl(account: { id: string; stripe_customer_id: string | null }, email: string, plan: PaidPlan, origin: string): Promise<string> {
  const price = process.env[PLANS[plan].stripePriceEnv];
  if (!price) throw new Error(`No Stripe price is set for the ${PLANS[plan].label} plan`);
  const base = appBaseUrl(origin);
  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${base}/billing?done=1`,
    cancel_url: `${base}/billing`,
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
  const session = await stripe('billing_portal/sessions', { customer: customerId, return_url: `${appBaseUrl(origin)}/billing` });
  return String(session.url);
}

export type StripeEvent = { id?: string; type: string; created?: number; data: { object: Record<string, unknown> } };
export type ApplyResult = 'applied' | 'duplicate' | 'stale' | 'ignored';

let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  // One row per Stripe event we have seen: makes retries idempotent and lets us drop out-of-order events.
  db().exec(`create table if not exists billing_events (
    id text primary key,
    type text not null,
    account_id text,
    created integer not null default 0,
    result text not null,
    received_at text not null
  );
  create index if not exists billing_events_account on billing_events(account_id, created);`);
  schemaReady = true;
}

interface AccountRow { id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string | null }

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** Stripe sends expandable fields as an id string or as the expanded object. */
const idOf = (v: unknown): string | null => str(v) ?? (v && typeof v === 'object' ? str((v as { id?: unknown }).id) : null);

function findAccount(ids: { accountId?: string | null; subscriptionId?: string | null; customerId?: string | null }): AccountRow | null {
  const d = db();
  const q = (sql: string, v: string | null | undefined) => (v ? ((d.prepare(`select id, stripe_customer_id, stripe_subscription_id, subscription_status from accounts where ${sql} = ?`).get(v) as AccountRow | undefined) ?? null) : null);
  return q('id', ids.accountId) ?? q('stripe_subscription_id', ids.subscriptionId) ?? q('stripe_customer_id', ids.customerId);
}

/** The first subscription item whose price we sell. */
function subscriptionPlan(o: Record<string, unknown>): PaidPlan | null {
  const items = ((o.items as { data?: { price?: { id?: unknown } }[] } | undefined)?.data) ?? [];
  for (const it of items) {
    const plan = planForPrice(it.price?.id);
    if (plan) return plan;
  }
  return null;
}

/** invoice.subscription moved to invoice.parent.subscription_details.subscription in newer Stripe API versions. */
function invoiceSubscription(o: Record<string, unknown>): string | null {
  const parent = o.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  return idOf(o.subscription) ?? idOf(parent?.subscription_details?.subscription);
}

/**
 * Apply a verified Stripe event to the account it belongs to.
 * Idempotent: a replayed event id is skipped. Order-safe: a subscription event older than one already applied
 * to the same account is skipped, so a late retry cannot undo a cancellation.
 */
export function applyStripeEvent(event: StripeEvent): ApplyResult {
  ensureSchema();
  const d = db();
  const o = (event.data?.object ?? {}) as Record<string, unknown>;
  const meta = ((o.metadata ?? {}) as Record<string, unknown>);
  const created = Number.isFinite(event.created) ? Number(event.created) : 0;

  const apply = (): { result: ApplyResult; accountId: string | null } => {
    const newerApplied = (accountId: string) =>
      Boolean(d.prepare(`select 1 from billing_events where account_id = ? and result = 'applied' and created > ? and type <> 'checkout.session.completed'`).get(accountId, created));

    switch (event.type) {
      case 'checkout.session.completed': {
        if (o.mode !== 'subscription') return { result: 'ignored', accountId: null };
        const acc = findAccount({ accountId: str(o.client_reference_id) ?? str(meta.account_id) });
        if (!acc) return { result: 'ignored', accountId: null };
        const plan = PAID_PLANS.includes(meta.plan as PaidPlan) ? (meta.plan as PaidPlan) : null;
        const paid = o.payment_status === 'paid' || o.payment_status === 'no_payment_required';
        const status = newerApplied(acc.id) ? acc.subscription_status : paid ? 'active' : 'incomplete';
        d.prepare('update accounts set plan = coalesce(?, plan), subscription_status = ?, stripe_customer_id = coalesce(?, stripe_customer_id), stripe_subscription_id = coalesce(?, stripe_subscription_id) where id = ?')
          .run(plan, status, idOf(o.customer), idOf(o.subscription), acc.id);
        return { result: 'applied', accountId: acc.id };
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const plan = subscriptionPlan(o);
        if (!plan) return { result: 'ignored', accountId: null }; // not one of our prices
        const acc = findAccount({ accountId: str(meta.account_id), subscriptionId: str(o.id), customerId: idOf(o.customer) });
        if (!acc) return { result: 'ignored', accountId: null };
        if (newerApplied(acc.id)) return { result: 'stale', accountId: acc.id };
        d.prepare('update accounts set plan = ?, subscription_status = ?, stripe_subscription_id = ?, stripe_customer_id = coalesce(?, stripe_customer_id) where id = ?')
          .run(plan, str(o.status) ?? 'incomplete', str(o.id), idOf(o.customer), acc.id);
        return { result: 'applied', accountId: acc.id };
      }
      case 'customer.subscription.deleted': {
        const acc = findAccount({ subscriptionId: str(o.id), accountId: str(meta.account_id), customerId: idOf(o.customer) });
        // Only cancel the subscription the account is on; an old one ending must not cancel a newer one.
        if (!acc || (acc.stripe_subscription_id && acc.stripe_subscription_id !== str(o.id))) return { result: 'ignored', accountId: null };
        if (newerApplied(acc.id)) return { result: 'stale', accountId: acc.id };
        d.prepare(`update accounts set subscription_status = 'canceled' where id = ?`).run(acc.id);
        return { result: 'applied', accountId: acc.id };
      }
      case 'invoice.payment_failed': {
        const sub = invoiceSubscription(o);
        const acc = findAccount({ subscriptionId: sub, customerId: idOf(o.customer) });
        if (!acc || (sub && acc.stripe_subscription_id && acc.stripe_subscription_id !== sub)) return { result: 'ignored', accountId: null };
        if (newerApplied(acc.id)) return { result: 'stale', accountId: acc.id };
        d.prepare(`update accounts set subscription_status = 'past_due' where id = ? and subscription_status in ('active', 'trialing', 'past_due', 'incomplete')`).run(acc.id);
        return { result: 'applied', accountId: acc.id };
      }
      default:
        return { result: 'ignored', accountId: null };
    }
  };

  return d.transaction((): ApplyResult => {
    if (event.id && d.prepare('select 1 from billing_events where id = ?').get(event.id)) return 'duplicate';
    const { result, accountId } = apply();
    if (event.id) {
      d.prepare('insert into billing_events (id, type, account_id, created, result, received_at) values (?, ?, ?, ?, ?, ?)')
        .run(event.id, event.type, accountId, created, result, new Date().toISOString());
    }
    return result;
  })();
}
