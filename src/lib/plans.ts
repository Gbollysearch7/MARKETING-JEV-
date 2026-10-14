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

export function accountStatus(a: AccountLike, now = Date.now()) {
  const plan = (a.plan in PLANS ? a.plan : 'trial') as PlanKey;
  const trialMsLeft = Date.parse(a.trial_ends_at) - now;
  const trialDaysLeft = Math.max(0, Math.ceil(trialMsLeft / 86_400_000));
  const paid = plan !== 'trial' && (a.subscription_status === 'active' || a.subscription_status === 'trialing');
  const onTrial = plan === 'trial';
  const active = paid || (onTrial && trialMsLeft > 0);
  return { plan, label: PLANS[plan].label, urlLimit: PLANS[plan].urlLimit, onTrial, trialDaysLeft, paid, active, pastDue: a.subscription_status === 'past_due' };
}
