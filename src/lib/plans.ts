/** Module 1 pricing from the PRD (section 13), in GBP a month, by URLs per site. */
export const PLANS = {
  trial: { label: 'Free trial', priceGbp: 0, urlLimit: 1_000, stripePriceEnv: null },
  starter: { label: 'Starter', priceGbp: 79, urlLimit: 5_000, stripePriceEnv: 'STRIPE_PRICE_STARTER' },
  growth: { label: 'Growth', priceGbp: 199, urlLimit: 50_000, stripePriceEnv: 'STRIPE_PRICE_GROWTH' },
  scale: { label: 'Scale', priceGbp: 399, urlLimit: 250_000, stripePriceEnv: 'STRIPE_PRICE_SCALE' },
} as const;
export type PlanKey = keyof typeof PLANS;
export const PAID_PLANS: Exclude<PlanKey, 'trial'>[] = ['starter', 'growth', 'scale'];
export const TRIAL_DAYS = 14;

export interface AccountLike { plan: string; trial_ends_at: string; subscription_status: string | null }

/** True when card payments are set up. Without them nobody can upgrade, so trials must not expire or cap URLs. */
export function billingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_STARTER && env.STRIPE_PRICE_GROWTH && env.STRIPE_PRICE_SCALE);
}

/**
 * The founder's own copy (`npm run app` sets RANKCALL_LOCAL=1) without Stripe keys: nobody can pay, so nothing expires.
 * A hosted copy without Stripe keeps normal trial rules.
 */
export function freeLocalCopy(env: Record<string, string | undefined> = process.env): boolean {
  return env.RANKCALL_LOCAL === '1' && !billingEnabled(env);
}

/**
 * `billingOn: false` (a self-hosted copy without Stripe) keeps trial accounts active with the largest URL limit,
 * since there is no way to pay; otherwise the founder's own copy would lock itself after 14 days.
 */
export function accountStatus(a: AccountLike, now = Date.now(), opts: { billingOn?: boolean } = {}) {
  const plan = (a.plan in PLANS ? a.plan : 'trial') as PlanKey;
  const trialMsLeft = Date.parse(a.trial_ends_at) - now;
  const trialDaysLeft = Math.max(0, Math.ceil(trialMsLeft / 86_400_000));
  const paid = plan !== 'trial' && (a.subscription_status === 'active' || a.subscription_status === 'trialing');
  const onTrial = plan === 'trial';
  const active = paid || (onTrial && trialMsLeft > 0);
  if (opts.billingOn === false && onTrial) {
    return { plan, label: 'Free while billing is off', urlLimit: PLANS.scale.urlLimit, onTrial, trialDaysLeft, paid, active: true, pastDue: false, billingOff: true };
  }
  return { plan, label: PLANS[plan].label, urlLimit: PLANS[plan].urlLimit, onTrial, trialDaysLeft, paid, active, pastDue: a.subscription_status === 'past_due', billingOff: false };
}
