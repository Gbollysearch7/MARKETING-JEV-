import { TopBar } from '@/components/Brand';
import { checkoutAction, portalAction } from '@/lib/actions';
import { requireViewer } from '@/lib/auth';
import { billingConfigured } from '@/lib/billing';
import { PAID_PLANS, PLANS } from '@/lib/plans';
import { providerInfo } from '@/lib/provider';

export default async function Billing({ searchParams }: PageProps<'/billing'>) {
  const viewer = await requireViewer();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const p = providerInfo();
  const st = viewer.status;
  const configured = billingConfigured();
  return (
    <>
      <TopBar live={p.live} model={p.model} viewer={{ email: viewer.user.email }} />
      <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 pb-16 pt-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="display text-[48px] leading-[1.02]">Plan and billing</h1>
          <p className="text-muted">{viewer.account.name} · Content Decision Engine, priced per site by URLs. Prices in GBP a month; 2 months free on annual.</p>
        </div>
        {sp.done && <div className="rounded-xl bg-ok-bg px-4 py-3 text-ok">Thanks. Your subscription is being confirmed and will show here in a moment.</div>}
        <section className="card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="label">Current plan</span>
            <span className="text-[22px] font-bold">{st.label}</span>
            <span className="text-[13px] text-muted">
              {st.billingOff ? `No time limit and up to ${st.urlLimit.toLocaleString('en-GB')} URLs a site while card payments are off.` : st.onTrial ? (st.active ? `${st.trialDaysLeft} ${st.trialDaysLeft === 1 ? 'day' : 'days'} left · up to ${st.urlLimit.toLocaleString('en-GB')} URLs a site` : 'Trial ended. Choose a plan to keep scoring; your data stays.') : `Up to ${st.urlLimit.toLocaleString('en-GB')} URLs a site · ${viewer.account.subscription_status ?? 'no subscription'}`}
            </span>
          </div>
          {viewer.account.stripe_customer_id && configured && (
            <form action={portalAction}><button className="btn h-11">Manage subscription and invoices</button></form>
          )}
        </section>
        {!configured && (
          <div className="rounded-xl bg-sunken px-4 py-3 text-[13.5px] text-ink-2">{st.billingOff ? 'Card payments are not switched on for this copy of Rankcall, so every feature is open with no time limit. The plans below take effect once the Stripe keys are added.' : 'Card payments are not switched on yet. They start once the Stripe keys are added; until then every account runs on the free trial.'}</div>
        )}
        <section className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
          {PAID_PLANS.map((k) => {
            const plan = PLANS[k];
            const current = st.plan === k && st.paid;
            return (
              <form key={k} action={checkoutAction} className={`card flex flex-col gap-3 p-6 ${current ? 'border-[1.5px] border-accent' : ''}`}>
                <input type="hidden" name="plan" value={k} />
                <span className="font-semibold">{plan.label}</span>
                <span className="text-[34px] font-bold tracking-[-0.02em]">£{plan.priceGbp}<span className="text-[15px] font-medium text-muted"> a month</span></span>
                <span className="text-muted">Up to {plan.urlLimit.toLocaleString('en-GB')} URLs a site</span>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
                  <li>Every URL scored weekly</li><li>Decision inbox and work queue</li><li>Outcomes at 30, 60 and 90 days</li><li>Monthly PDF report</li>
                </ul>
                {configured
                  ? <button className={`btn mt-auto h-11 justify-center ${current ? '' : 'btn-primary'}`} disabled={current || viewer.user.role !== 'owner'}>{current ? 'Current plan' : `Choose ${plan.label}`}</button>
                  : <p className="mt-auto border-t border-line pt-3 text-[12.5px] text-muted">Available once card payments are switched on.</p>}
              </form>
            );
          })}
        </section>
      </main>
    </>
  );
}
