import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/Brand';
import { BRAND } from '@/lib/brand';
import { Icon } from '@/components/Icon';
import { AgencySection, FeatureGrid, Roadmap, SpeedStrip } from '@/components/LandingSections';
import { LiveDemo } from '@/components/LiveDemo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getViewer } from '@/lib/auth';
import { PAID_PLANS, PLANS } from '@/lib/plans';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: ${BRAND.tagline}` },
};

const VERDICTS = [
  { k: 'refresh', name: 'Refresh', line: 'Keep the page, update what has gone stale.', when: 'Clicks are slipping while impressions hold.' },
  { k: 'expand', name: 'Expand', line: 'Add the depth that moves it onto page one.', when: 'It ranks 8 to 20 for searches people actually make.' },
  { k: 'merge', name: 'Merge', line: 'Fold it into the stronger page it competes with.', when: 'Two pages split the same searches.' },
  { k: 'redirect', name: 'Redirect', line: 'Send it, and its links, to the closest match.', when: 'No traffic, but other sites still link to it.' },
  { k: 'prune', name: 'Prune', line: 'Remove it cleanly with a 410.', when: 'No traffic, no links, no sales, and thin.' },
  { k: 'leave', name: 'Leave', line: 'Do nothing. It is doing its job.', when: 'Performing, recently updated, or protected.' },
] as const;

const SOURCES = ['Google Search Console', 'GA4', 'Screaming Frog', 'Sitebulb', 'Ahrefs', 'Semrush'];

const FAQ = [
  ['Do I need to connect my Google account?', 'Not today. Export from Search Console and GA4 and drop the files in. Direct Google connections are on the way; uploads keep working.'],
  ['What makes the confidence score trustworthy?', 'Every verdict comes from a typed decision with a calibrated probability, not a paragraph of AI text. Anything below 0.85 waits for a person, and Prune and Redirect always do.'],
  ['Will it delete pages on its own?', 'Never. It writes a task and a redirect file. You approve every removal and redirect, and you make the change on your site.'],
  ['How do I know it worked?', 'Mark a task done. Each later Search Console upload compares the page with its forecast at 30, 60 and 90 days and labels it worked, neutral or backfired.'],
  ['Is it built for agencies?', 'Yes. Each client is its own site, and the monthly report is ready to send. White-label reports and multi-site bundles are part of the plan.'],
];

export default async function Landing() {
  const viewer = await getViewer();
  const appHref = viewer ? '/sites' : '/signup';
  return (
    <div className="overflow-x-clip bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-transparent bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Wordmark href="/" />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <a href="#how" className="btn btn-ghost btn-sm">How it works</a>
            <a href="#features" className="btn btn-ghost btn-sm">Features</a>
            <a href="#agencies" className="btn btn-ghost btn-sm">Agencies</a>
            <a href="#modules" className="btn btn-ghost btn-sm">Modules</a>
            <a href="#pricing" className="btn btn-ghost btn-sm">Pricing</a>
            <a href="#faq" className="btn btn-ghost btn-sm">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {viewer ? (
              <Link href="/sites" className="btn btn-primary btn-sm">Open the app</Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
                <Link href="/signup" className="btn btn-primary btn-sm">Start free trial</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto flex max-w-[1180px] flex-col items-center gap-8 px-5 pb-16 pt-16 text-center sm:px-8 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] text-ink-2 shadow-[var(--shadow-sm)]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Built on calibrated decision models · 14-day free trial
          </span>
          <h1 className="display max-w-[900px] text-balance text-[52px] leading-[1.02] sm:text-[76px]">
            Know exactly what to do with <em className="text-accent">every page</em> on your site.
          </h1>
          <p className="max-w-[640px] text-pretty text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">
            Upload your Search Console export. Every URL gets a verdict, the reason behind it, how sure we are, and the traffic it could win. Then we check whether it worked.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={appHref} className="btn btn-primary h-12 rounded-xl px-6 text-[15px]">{viewer ? 'Open the app' : 'Start free trial'} <Icon name="arrow" /></Link>
            <a href="#how" className="btn h-12 rounded-xl px-6 text-[15px]">See how it works</a>
          </div>
          <p className="text-[12.5px] text-muted">Full verdicts on up to 1,000 URLs. No card needed.</p>
          <div className="w-full pt-8"><LiveDemo /></div>
        </section>

        <section aria-label="Works with" className="border-y border-line bg-surface/60">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-7 sm:px-8">
            <span className="text-[12.5px] text-muted">Works with exports from</span>
            {SOURCES.map((s) => <span key={s} className="text-[14px] font-medium text-ink-2">{s}</span>)}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1180px] scroll-mt-20 px-5 py-24 sm:px-8">
          <div className="mx-auto mb-14 max-w-[700px] text-center">
            <p className="mb-3 text-[13px] font-medium text-accent">How it works</p>
            <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">From a spreadsheet of URLs to a plan you can defend.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ['01', 'Upload what you already have', 'Search Console, GA4 and a crawl from Screaming Frog or Sitebulb. Or crawl the sitemap here. Everything joins on the URL.', 'data'],
              ['02', 'Every page gets a verdict', 'Numbers are worked out in code, then a decision model makes one typed call per page. Confident calls go straight to your queue; the rest wait for you.', 'inbox'],
              ['03', 'See what actually worked', 'Mark a task done. Later uploads measure it against its forecast at 30, 60 and 90 days, and the monthly report writes itself.', 'outcomes'],
            ].map(([n, t, d, icon]) => (
              <div key={n} className="card flex flex-col gap-4 p-7">
                <div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name={icon} size={18} /></span><span className="mono text-[12px] text-muted">{n}</span></div>
                <h3 className="text-[18px] font-semibold tracking-[-0.01em]">{t}</h3>
                <p className="text-[14.5px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="verdicts" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8">
            <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-[620px]">
                <p className="mb-3 text-[13px] font-medium text-accent">Six verdicts</p>
                <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">One clear answer per page. No audit PDF to decode.</h2>
              </div>
              <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-2">Hard rules run first: legal pages, pages that sell and anything under 30 days old are never pruned.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {VERDICTS.map((v) => (
                <div key={v.k} className="flex flex-col gap-3 bg-surface p-7">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium" style={{ color: `var(--${v.k})`, background: `var(--${v.k}-bg)` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${v.k}-mark)` }} />{v.name}</span>
                  <p className="display text-[24px] leading-[1.15]">{v.line}</p>
                  <p className="text-[13.5px] text-muted">{v.when}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1180px] items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="flex flex-col gap-5">
            <p className="text-[13px] font-medium text-accent">The decision inbox</p>
            <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[48px]">Review forty decisions, not four thousand pages.</h2>
            <p className="text-[16px] leading-relaxed text-ink-2">Calls the model is sure about are approved for you. Everything else lands in one inbox, biggest expected gain first, with the evidence beside it.</p>
            <ul className="flex flex-col gap-3 text-[15px]">
              {['Every option it weighed, with a probability for each', 'The exact signals it saw, so nothing is a black box', 'For close calls, what evidence would settle it', 'Change a verdict and your reason becomes training data'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-1 grid h-5 w-5 flex-none place-items-center rounded-full bg-accent-soft text-accent"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg></span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="card flex flex-col gap-5 p-7">
            <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-muted">Every option the model weighed</span><span className="rounded-full border border-dashed border-[var(--line-input)] px-2.5 py-0.5 text-[12px] text-ink-2">Uncertain</span></div>
            <div className="mono text-[14px]">/guides/how-to-choose-base-layers</div>
            {[['merge', 'Merge', 46], ['leave', 'Leave', 44], ['refresh', 'Refresh', 5], ['expand', 'Expand', 3]].map(([k, n, p]) => (
              <div key={k as string} className="grid grid-cols-[80px_1fr_44px] items-center gap-3">
                <span className="text-[13px] font-medium" style={{ color: `var(--${k})` }}>{n}</span>
                <span className="h-2 rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${p}%`, background: `var(--${k}-mark)` }} /></span>
                <span className="mono text-right text-[12.5px]">{(Number(p) / 100).toFixed(2)}</span>
              </div>
            ))}
            <div className="rounded-xl bg-sunken p-4 text-[13.5px] text-ink-2"><span className="font-medium text-ink">What would settle it.</span> Query-level data would show whether the two URLs split clicks on the same searches.</div>
          </div>
        </section>

        <FeatureGrid />

        <section className="border-y border-line bg-inverse text-[#f4f1ea]">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col gap-5">
              <p className="text-[13px] font-medium text-[#b9e3c6]">The outcome ledger</p>
              <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">Every recommendation gets a verdict of its own.</h2>
              <p className="max-w-[520px] text-[16px] leading-relaxed text-[#cfc9bc]">Audits stop at advice. Here, every completed action is measured against its forecast at 30, 60 and 90 days and labelled worked, neutral or backfired. Over time those results recalibrate the thresholds for your site.</p>
            </div>
            <div className="flex flex-col gap-3 self-center">
              {[['Refresh', '/guides/best-bivvy-bag', 'Worked', '+298 a month', '#b9e3c6'], ['Merge', '/guides/how-to-choose-tent', 'Neutral', '+2 a month', '#cfc9bc'], ['Prune', '/news/store-update-2019-12', 'Worked', 'rest of site held', '#b9e3c6']].map(([v, p, l, d, c]) => (
                <div key={p} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <div className="flex min-w-0 flex-col"><span className="text-[12px] text-[#a39d90]">{v}</span><span className="mono truncate text-[13px]">{p}</span></div>
                  <div className="flex flex-col items-end"><span className="text-[13px] font-medium" style={{ color: c }}>{l}</span><span className="mono text-[12px] text-[#a39d90]">{d}</span></div>
                </div>
              ))}
              <p className="text-[12px] text-[#a39d90]">Illustration of how outcomes are reported.</p>
            </div>
          </div>
        </section>

        <AgencySection />
        <SpeedStrip />
        <Roadmap />

        <section id="pricing" className="mx-auto max-w-[1180px] scroll-mt-20 px-5 py-24 sm:px-8">
          <div className="mx-auto mb-14 max-w-[640px] text-center">
            <p className="mb-3 text-[13px] font-medium text-accent">Pricing</p>
            <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">Priced per site, not per seat.</h2>
            <p className="mt-4 text-[16px] text-ink-2">Start free for 14 days. Two months free when you pay yearly.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {PAID_PLANS.map((k, i) => {
              const plan = PLANS[k];
              const featured = i === 1;
              return (
                <div key={k} className={`flex flex-col gap-5 rounded-[20px] p-7 ${featured ? 'bg-inverse text-[#f4f1ea] shadow-[var(--shadow-lg)]' : 'card'}`}>
                  <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">{plan.label}</span>{featured && <span className="rounded-full bg-[#b9e3c6] px-2.5 py-0.5 text-[11.5px] font-medium text-ink">Best for agencies</span>}</div>
                  <div className="flex items-baseline gap-1.5"><span className="display text-[56px] leading-none">£{plan.priceGbp}</span><span className={featured ? 'text-[#cfc9bc]' : 'text-muted'}>a month</span></div>
                  <p className={featured ? 'text-[#cfc9bc]' : 'text-ink-2'}>Up to {plan.urlLimit.toLocaleString('en-GB')} URLs a site</p>
                  <ul className="flex flex-col gap-2.5 text-[14px]">
                    {['Every URL scored, weekly', 'Decision inbox and work queue', 'Outcomes at 30, 60 and 90 days', 'Monthly client-ready report'].map((f) => (
                      <li key={f} className="flex gap-2.5"><svg className={`mt-1 flex-none ${featured ? 'text-[#b9e3c6]' : 'text-accent'}`} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>{f}</li>
                    ))}
                  </ul>
                  <Link href={appHref} className={`btn mt-auto h-11 rounded-xl ${featured ? 'border-[#f4f1ea] bg-[#f4f1ea] text-ink hover:bg-white' : 'btn-primary'}`}>Start free trial</Link>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-[13.5px] text-muted">Agencies: up to 10 client sites with white-label reports, plus extra sites at a flat rate.</p>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[48px]">Questions, answered plainly.</h2>
            <div className="flex flex-col divide-y divide-line border-y border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">
                    {q}
                    <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-ink-2">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-8">
          <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-6 rounded-[28px] border border-line bg-surface px-6 py-20 text-center shadow-[var(--shadow)]">
            <h2 className="display max-w-[760px] text-balance text-[44px] leading-[1.03] sm:text-[60px]">Your next month of SEO work, decided by lunch.</h2>
            <p className="max-w-[520px] text-[16px] text-ink-2">Upload one Search Console export and see a verdict on every page in minutes.</p>
            <Link href={appHref} className="btn btn-primary h-12 rounded-xl px-6 text-[15px]">{viewer ? 'Open the app' : 'Start free trial'} <Icon name="arrow" /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted sm:px-8">
          <span className="flex items-center gap-3"><Wordmark href={null} size={20} /><span>{BRAND.tagline}</span></span>
          <nav aria-label="Footer" className="flex flex-wrap gap-5">
            <a href="#how" className="hover:text-ink">How it works</a><a href="#features" className="hover:text-ink">Features</a><a href="#modules" className="hover:text-ink">Modules</a><a href="#pricing" className="hover:text-ink">Pricing</a><Link href="/login" className="hover:text-ink">Sign in</Link><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link><Link href="/security" className="hover:text-ink">Security</Link>
            <ThemeToggle compact />
          </nav>
        </div>
      </footer>
    </div>
  );
}
