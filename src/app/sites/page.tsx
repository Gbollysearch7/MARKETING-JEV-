import Link from 'next/link';
import { TopBar } from '@/components/Brand';
import { CreateSiteForm } from '@/components/SiteForms';
import { requireViewer } from '@/lib/auth';
import { db } from '@/lib/db';
import { providerInfo } from '@/lib/provider';
import { latestVerdictJob, listSites } from '@/lib/repo';
import { VERDICTS } from '@/engine/verdict/types';
import { fmt, fmtDate } from '@/components/ui';
import { Toast } from '@/components/Toast';
import { GOOGLE_MESSAGES } from '@/components/google/GoogleCard';

function siteStatus(id: string) {
  const d = db();
  const lastUpload = (d.prepare('select max(created_at) at from uploads where site_id = ?').get(id) as { at: string | null }).at;
  const gscEnd = (d.prepare(`select max(period_end) e from uploads where site_id = ? and kind in ('gsc_pages', 'gsc_queries')`).get(id) as { e: string | null }).e;
  const running = (d.prepare(`select type from jobs where site_id = ? and status = 'running' limit 1`).get(id) as { type: string } | undefined)?.type ?? null;
  const stale = gscEnd ? (Date.now() - Date.parse(gscEnd)) / 86_400_000 > 45 : false;
  return { lastUpload, gscEnd, running, stale };
}

function siteStats(id: string) {
  const job = latestVerdictJob(id);
  if (!job) return null;
  const d = db();
  const mix = d.prepare(`select coalesce(final_verdict, verdict) v, count(*) n from verdicts where job_id = ? and skipped is null group by v`).all(job.id) as { v: string; n: number }[];
  const review = (d.prepare(`select count(*) n from verdicts where job_id = ? and status = 'proposed' and skipped is null and coalesce(final_verdict, verdict) != 'leave'`).get(job.id) as { n: number }).n;
  const tasks = (d.prepare(`select count(*) n from tasks where site_id = ? and status in ('todo', 'in_progress')`).get(id) as { n: number }).n;
  return { mix, review, tasks, scored: mix.reduce((s, x) => s + x.n, 0), at: job.finished_at, jobCreated: job.created_at };
}

export default async function Home({ searchParams }: PageProps<'/sites'>) {
  const viewer = await requireViewer();
  const sp = (await searchParams) as Record<string, string | undefined>;
  // The Google callback lands here when it cannot return to a site (expired link, Google not set up).
  const google = sp.google ? GOOGLE_MESSAGES[sp.google] : undefined;
  const sites = listSites(viewer.account.id);
  const p = providerInfo();
  return (
    <>
      <TopBar live={p.live} model={p.model} viewer={{ email: viewer.user.email }} />
      <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-[1120px] flex-col gap-7 px-6 pb-16 pt-10">
        {google?.tone === 'ok' && <Toast key={sp.google} message={google.text} tone={google.tone} />}
        {google?.tone === 'bad' && <p role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[13.5px] text-bad">{google.text} Start again from a site’s Data page.</p>}
        <div className="flex flex-col gap-1.5">
          <h1 className="display text-[48px] leading-[1.02]">{viewer.account.name}</h1>
          <p className="max-w-[640px] text-muted">Every URL on each site gets a verdict: what to do, why, how sure we are and the expected traffic change.</p>
        </div>
        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Sites" className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
            {sites.length === 0 && (
              <div className="rounded-2xl border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">Add your first site below, or choose sample exports to explore the workflow.</div>
            )}
            {sites.map((s) => {
              const st = siteStats(s.id);
              const x = siteStatus(s.id);
              const stale = x.stale;
              const fresh = Boolean(st && x.lastUpload && x.lastUpload > st.jobCreated);
              return (
                <Link key={s.id} href={`/sites/${s.id}`} className="card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 hover:border-line-strong sm:px-6">
                  <span className="flex min-w-0 flex-col gap-2.5">
                    <span className="flex min-w-0 flex-col"><span className="truncate text-[17px] font-bold">{s.name}</span><span className="mono truncate text-[12.5px] text-muted">{s.domain} · {fmt(s.url_count)} URLs</span></span>
                    {st && (
                      <span role="img" aria-label={VERDICTS.map((v) => `${st.mix.find((m) => m.v === v)?.n ?? 0} ${v}`).join(', ')} className="flex h-2 max-w-[420px] gap-0.5 overflow-hidden rounded-full">
                        {VERDICTS.map((v) => {
                          const n = st.mix.find((m) => m.v === v)?.n ?? 0;
                          return n ? <span key={v} style={{ flex: n, background: `var(--${v}-mark)` }} /> : null;
                        })}
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
                      {x.running ? <span className="font-medium text-warn">{x.running === 'crawl' ? 'Crawling now…' : 'Scoring now…'}</span> : null}
                      {st ? (
                        <>
                          <span className={st.review ? 'rounded-full bg-[var(--primary)] px-2 py-0.5 text-[12px] font-semibold text-[var(--primary-fg)]' : 'text-ok'}>{st.review ? `${fmt(st.review)} to review` : 'Inbox zero'}</span>
                          <span>{fmt(st.tasks)} open {st.tasks === 1 ? 'task' : 'tasks'}</span>
                          <span>Scored {fmtDate(st.at)}</span>
                        </>
                      ) : <span>{x.lastUpload ? 'Data added, not scored yet' : 'No data yet'}</span>}
                      {x.gscEnd && <span className={stale ? 'text-warn' : ''}>Search Console to {fmtDate(x.gscEnd)}{stale ? ', time for a fresh export' : ''}</span>}
                      {fresh && !x.running && <span className="font-medium text-accent">New data, score again</span>}
                    </span>
                  </span>
                  <span className="btn btn-dark hidden sm:inline-flex">Open</span>
                </Link>
              );
            })}
          </section>
          <section aria-label="Add a site" className="card flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 p-6">
            <h2 className="text-[17px] font-bold">Add a site</h2>
            <CreateSiteForm />
            <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-muted">
              <li>Upload Search Console, GA4 and a crawl</li>
              <li>Score every URL in minutes</li>
              <li>Review only the decisions that need you</li>
            </ol>
          </section>
        </div>
      </main>
    </>
  );
}
