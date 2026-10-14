import { Icon } from './Icon';

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mono inline-grid min-w-6 place-items-center rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink-2 shadow-[var(--shadow-sm)]">{children}</kbd>;
}

function Dot({ v }: { v: string }) {
  return <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: `var(--${v}-mark)` }} />;
}

/** Everything the product does beyond the inbox, each with a small honest preview. */
export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-[1180px] scroll-mt-20 px-5 py-24 sm:px-8">
      <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[640px]">
          <p className="mb-3 text-[13px] font-medium text-accent">Everything around the decision</p>
          <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">From the call to the change to the proof.</h2>
        </div>
        <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-2">The verdict is only the start. Rankcall turns it into work, files you can ship, and a record of what happened.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <article className="card flex flex-col gap-4 p-7 lg:col-span-2">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="overlap" size={18} /></span><h3 className="text-[18px] font-semibold tracking-[-0.01em]">Cannibalisation, found for you</h3></div>
          <p className="text-[14.5px] leading-relaxed text-ink-2">Pages that both rank in the top 20 for three or more of the same searches are paired up. The one earning more clicks is the keeper; the other becomes a merge decision.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="min-w-0 rounded-xl border-[1.5px] border-[var(--ok)] p-3.5"><div className="text-[12px] font-medium text-ok">Keep</div><div className="mono truncate text-[13px]">/guides/best-hiking-boots</div><div className="mono text-[12px] text-muted">#1.4 for “best hiking boots”</div></div>
            <span className="text-center text-[13px] text-muted">vs</span>
            <div className="min-w-0 rounded-xl border border-line p-3.5"><div className="text-[12px] font-medium" style={{ color: 'var(--merge)' }}>Competes</div><div className="mono truncate text-[13px]">/guides/how-to-choose-hiking-boots</div><div className="mono text-[12px] text-muted">#11.9 for the same search</div></div>
          </div>
        </article>
        <article className="card flex flex-col gap-4 p-7">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="queue" size={18} /></span><h3 className="text-[18px] font-semibold tracking-[-0.01em]">A work queue with briefs</h3></div>
          <p className="text-[14.5px] leading-relaxed text-ink-2">Approved decisions become tasks with an owner, a due date, a checklist and the exact searches to target.</p>
          <div className="flex flex-col gap-2 text-[13px]">
            {[['expand', 'Expand', '/guides/best-via-ferrata', 'In progress'], ['refresh', 'Refresh', '/guides/best-bivvy-bag', 'To do']].map(([v, n, p, s]) => (
              <div key={p} className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2"><Dot v={v} /><span className="font-medium">{n}</span><span className="mono flex-1 truncate text-muted">{p}</span><span className="text-[12px] text-muted">{s}</span></div>
            ))}
          </div>
        </article>
        <article className="card flex flex-col gap-4 p-7">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="link" size={18} /></span><h3 className="text-[18px] font-semibold tracking-[-0.01em]">Redirect files, ready to ship</h3></div>
          <p className="text-[14.5px] leading-relaxed text-ink-2">Every approved merge, redirect and removal, exported for Apache, Nginx, Netlify, Shopify or WordPress.</p>
          <pre className="mono overflow-x-auto rounded-xl bg-inverse p-4 text-[11.5px] leading-relaxed text-[#cfc9bc]">{`Redirect 301 /blog/spring-sale-camping-stove \\
  /guides/best-camping-stove
Redirect gone /news/store-update-2019-0`}</pre>
        </article>
        <article className="card flex flex-col gap-4 p-7">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="outcomes" size={18} /></span><h3 className="text-[18px] font-semibold tracking-[-0.01em]">Trends you can watch move</h3></div>
          <p className="text-[14.5px] leading-relaxed text-ink-2">Organic clicks across every upload, and the verdict mix across every scoring run. As fixes land, the red shrinks.</p>
          <div className="flex flex-col gap-2" aria-hidden>
            {[[14, 20, 6, 14, 6, 30], [12, 16, 5, 12, 4, 41], [9, 12, 4, 9, 2, 54]].map((mix, i) => (
              <div key={i} className="flex h-3.5 gap-[2px] overflow-hidden rounded-[4px]">
                {['refresh', 'expand', 'redirect', 'prune', 'merge', 'leave'].map((v, j) => <span key={v} style={{ flex: mix[j], background: `var(--${v}-mark)` }} />)}
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted">Illustration.</p>
        </article>
        <article className="card flex flex-col gap-4 p-7">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="log" size={18} /></span><h3 className="text-[18px] font-semibold tracking-[-0.01em]">A full decision log</h3></div>
          <p className="text-[14.5px] leading-relaxed text-ink-2">Every answer the model gave, with its version and a fingerprint of exactly what it saw. Every human correction, with the reason.</p>
          <div className="mono flex flex-col gap-1.5 text-[11.5px] text-ink-2">
            <div className="flex justify-between rounded-md bg-sunken px-2.5 py-1.5"><span>verdict → expand</span><span className="text-muted">1.00 · jev-1.13.0</span></div>
            <div className="flex justify-between rounded-md bg-sunken px-2.5 py-1.5"><span>time_sensitive → yes</span><span className="text-muted">0.78 · jev-1.13.0</span></div>
          </div>
        </article>
      </div>
    </section>
  );
}

/** For agencies: one site per client and a report that goes straight to the client. */
export function AgencySection() {
  return (
    <section id="agencies" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto grid max-w-[1180px] items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.05fr] [&>*]:min-w-0">
        <div className="flex flex-col gap-5">
          <p className="text-[13px] font-medium text-accent">For agencies</p>
          <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">Justify the retainer, every month.</h2>
          <p className="text-[16px] leading-relaxed text-ink-2">Each client is its own site with its own inbox. Juniors work through decisions with the evidence beside them, and the month ends with a report that shows what you did and what it earned.</p>
          <ul className="flex flex-col gap-3 text-[15px]">
            {['One site per client, switch in a click', 'A client-ready monthly report, saved as PDF', 'Outcomes that prove the work, not just list it', 'Priced per site, with agency bundles'].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-1 grid h-5 w-5 flex-none place-items-center rounded-full bg-accent-soft text-accent"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg></span>{t}</li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div aria-hidden className="absolute -right-3 -top-3 hidden h-full w-full rotate-[2deg] rounded-[10px] border border-line bg-surface-2 sm:block" />
          <article aria-label="Sample monthly report" className="relative flex flex-col gap-6 rounded-[10px] border border-line bg-surface p-7 shadow-[var(--shadow-lg)] sm:p-9">
            <header className="flex flex-col gap-1 border-b-2 border-ink pb-4">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Monthly SEO decisions report</span>
              <span className="display text-[32px] leading-none">Sample Outdoors</span>
              <span className="text-[12.5px] text-muted">sample-outdoors.example · October 2026</span>
            </header>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[['Pages scored', '90'], ['Decisions reviewed', '20'], ['Actions shipped', '6'], ['Clicks a month', '21,084']].map(([l, v]) => (
                <div key={l}><div className="text-[11px] text-muted">{l}</div><div className="display num text-[26px] leading-none">{v}</div></div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-medium text-muted">Planned this month</div>
              {[['expand', 'Expand', '/guides/best-via-ferrata', '+379 to +1,528'], ['refresh', 'Refresh', '/guides/best-bivvy-bag', '+152 to +455'], ['redirect', 'Redirect', '/blog/spring-sale-camping-stove', 'keeps links']].map(([v, n, p, g]) => (
                <div key={p} className="flex items-center gap-2 border-b border-line pb-2 text-[12.5px] last:border-0"><Dot v={v} /><span className="w-16 font-medium">{n}</span><span className="mono flex-1 truncate">{p}</span><span className="mono text-muted">{g}</span></div>
              ))}
            </div>
            <p className="text-[11px] text-muted">Sample report for a fictional site.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

/** The small things that make it fast to use every day. */
export function SpeedStrip() {
  return (
    <section aria-label="Built for speed" className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8">
      <div className="mx-auto mb-12 max-w-[640px] text-center">
        <p className="mb-3 text-[13px] font-medium text-accent">Built for speed</p>
        <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">Hands on the keyboard. Out by lunch.</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex flex-wrap gap-1.5"><Kbd>J</Kbd><Kbd>K</Kbd><Kbd>A</Kbd><Kbd>R</Kbd></div>
          <h3 className="font-semibold">Keyboard triage</h3>
          <p className="text-[14px] text-ink-2">Move, approve and reject without touching the mouse. Each decision confirms itself and the next one is ready.</p>
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex gap-1.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></div>
          <h3 className="font-semibold">Jump anywhere</h3>
          <p className="text-[14px] text-ink-2">Search any page of the app, or any URL on the site, and land on its decision.</p>
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex h-[26px] w-fit overflow-hidden rounded-lg border border-line" aria-hidden><span className="w-8 bg-[#faf9f6]" /><span className="w-8 bg-[#161512]" /></div>
          <h3 className="font-semibold">Light and dark</h3>
          <p className="text-[14px] text-ink-2">Follows your system, or pick one. Chart colours are checked for colour-blind readers in both.</p>
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex items-center gap-1.5" aria-hidden>{[1, 2, 3, 4].map((n) => <span key={n} className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${n < 3 ? 'bg-accent text-[var(--accent-ink)]' : 'bg-sunken text-muted'}`}>{n}</span>)}</div>
          <h3 className="font-semibold">A guided first run</h3>
          <p className="text-[14px] text-ink-2">A four-step checklist gets you to your first approved change, or try it on sample data first.</p>
        </div>
      </div>
    </section>
  );
}

const ROADMAP = [
  { name: 'Quality gate', icon: 'gate', when: 'CSV, sitemap or API', line: 'Score generated pages before they publish: Index, Improve or Kill, the three strongest reasons, and a pause warning for failing templates.' },
  { name: 'Keyword clusters', icon: 'clusters', when: 'CSV or Search Console', line: 'Keywords grouped by topic, intent and buying stage, each mapped to the page that should own it, with gaps and clashes flagged.' },
  { name: 'Brief desk', icon: 'briefs', when: 'Clusters or targets', line: 'Decide whether to write at all, then get the format, angle, length band, outline and internal links, and track it to published.' },
  { name: 'AI visibility', icon: 'eye', when: 'Captured answers', line: 'See where ChatGPT, Claude, Perplexity and Gemini mention you, which competitor won instead, and the likely reason why.' },
  { name: 'Link prospects', icon: 'link', when: 'Ahrefs or Semrush CSV', line: 'Score every outreach prospect Pursue, Skip or Toxic, with a pitch angle, a reply likelihood and a disavow file for review.' },
  { name: 'Local SEO', icon: 'pin', when: 'Location CSVs', line: 'A weekly attention list for every location: review replies to approve, posts, profile fixes and citation mismatches.' },
];

/** The six modules beyond content decisions, with what each one needs as input. */
export function Roadmap() {
  return (
    <section id="modules" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <p className="mb-3 text-[13px] font-medium text-accent">More modules</p>
            <h2 className="display text-balance text-[40px] leading-[1.05] sm:text-[52px]">One decision engine. Six more jobs, ready now.</h2>
          </div>
          <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-2">Every module reuses the same engine, confidence rules and outcome ledger. Each works from the exports you already have, and nothing is published without your approval.</p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ROADMAP.map((m) => (
            <div key={m.name} className="flex flex-col gap-3 bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sunken text-ink-2"><Icon name={m.icon} size={18} /></span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium bg-sunken text-muted`}>{m.when}</span>
              </div>
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{m.name}</h3>
              <p className="text-[14px] leading-relaxed text-ink-2">{m.line}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
