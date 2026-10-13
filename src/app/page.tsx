import Link from 'next/link';
import { TopBar } from '@/components/Brand';
import { createSiteAction } from '@/lib/actions';
import { db } from '@/lib/db';
import { providerInfo } from '@/lib/provider';
import { latestVerdictJob, listSites } from '@/lib/repo';
import { VERDICTS } from '@/engine/verdict/types';
import { fmt } from '@/components/ui';

function siteStats(id: string) {
  const job = latestVerdictJob(id);
  if (!job) return null;
  const d = db();
  const mix = d.prepare(`select coalesce(final_verdict, verdict) v, count(*) n from verdicts where job_id = ? and skipped is null group by v`).all(job.id) as { v: string; n: number }[];
  const review = (d.prepare(`select count(*) n from verdicts where job_id = ? and status = 'proposed' and skipped is null and coalesce(final_verdict, verdict) != 'leave'`).get(job.id) as { n: number }).n;
  const tasks = (d.prepare(`select count(*) n from tasks where site_id = ? and status in ('todo', 'in_progress')`).get(id) as { n: number }).n;
  return { mix, review, tasks, scored: mix.reduce((s, x) => s + x.n, 0) };
}

export default function Home() {
  const sites = listSites();
  const p = providerInfo();
  return (
    <>
      <TopBar live={p.live} model={p.model} />
      <main className="mx-auto flex max-w-[1120px] flex-col gap-7 px-6 pb-16 pt-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-0.025em]">Your sites</h1>
          <p className="max-w-[640px] text-muted">Every URL on each site gets a verdict: what to do, why, how sure we are and the expected traffic change.</p>
        </div>
        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Sites" className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
            {sites.length === 0 && (
              <div className="rounded-2xl border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">No sites yet. Add one on the right, or tick the sample box to try the app first.</div>
            )}
            {sites.map((s) => {
              const st = siteStats(s.id);
              return (
                <Link key={s.id} href={`/sites/${s.id}`} className="card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-5 hover:border-line-strong">
                  <span className="flex min-w-0 flex-col gap-2.5">
                    <span className="flex flex-col"><span className="text-[17px] font-bold">{s.name}</span><span className="mono text-[12.5px] text-muted">{s.domain} · {fmt(s.url_count)} URLs</span></span>
                    {st ? (
                      <>
                        <span role="img" aria-label="Verdict mix" className="flex h-2 max-w-[420px] gap-0.5 overflow-hidden rounded-full">
                          {VERDICTS.map((v) => {
                            const n = st.mix.find((m) => m.v === v)?.n ?? 0;
                            return n ? <span key={v} style={{ flex: n, background: v === 'leave' ? 'var(--line-strong)' : `var(--${v})` }} /> : null;
                          })}
                        </span>
                        <span className="flex flex-wrap gap-4 text-[13px] text-muted"><span>{fmt(st.scored)} URLs scored</span><span>{fmt(st.review)} waiting for review</span><span>{fmt(st.tasks)} open tasks</span></span>
                      </>
                    ) : (
                      <span className="text-[13px] text-muted">Not scored yet</span>
                    )}
                  </span>
                  <span className="btn btn-dark">Open</span>
                </Link>
              );
            })}
          </section>
          <section aria-label="Add a site" className="card flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 p-6">
            <h2 className="text-[17px] font-bold">Add a site</h2>
            <form action={createSiteAction} className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1 text-[13px] font-semibold">Name<input name="name" required placeholder="Acme blog" className="input h-11 font-normal" /></label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold">Domain<input name="domain" required placeholder="www.acme.co.uk" className="input h-11 font-normal" /></label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold">Sitemap URL <span className="font-normal text-muted">optional</span><input name="sitemap" type="url" placeholder="https://www.acme.co.uk/sitemap.xml" className="input h-11 font-normal" /></label>
              <label className="flex items-start gap-2.5 text-[13px] text-ink-2"><input type="checkbox" name="sample" className="mt-0.5 h-4 w-4" />Load sample exports for a fictional outdoor shop, to try the app first</label>
              <button className="btn btn-primary h-12 justify-center">Add site and upload data</button>
            </form>
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
