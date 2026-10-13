import Link from 'next/link';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { JobProgress } from '@/components/JobProgress';
import { Empty, fmt, fmtDateTime, Impact, StatusBadge, VERDICT_LABEL } from '@/components/ui';
import { deleteSiteAction, runVerdictsAction } from '@/lib/actions';
import { latestUploads, latestVerdictJob, listJobs, listVerdicts, outcomesForSite, runningJob, verdictSummary } from '@/lib/repo';

const USD_PER_M_INPUT = 0.042;
const BAR = (v: Verdict) => (v === 'leave' ? 'var(--line-strong)' : `var(--${v})`);

export default async function Overview({ params }: PageProps<'/sites/[id]'>) {
  const { id } = await params;
  const uploads = latestUploads(id);
  const running = runningJob(id);
  const job = latestVerdictJob(id);
  const sum = job ? verdictSummary(job.id) : null;
  const outcomes = outcomesForSite(id);
  const history = listJobs(id, 'verdicts', 6);
  const hasData = Boolean(uploads.gsc_pages || uploads.gsc_queries || uploads.crawl);
  const inbox = `/sites/${id}/inbox`;

  const total = sum?.byVerdict.reduce((s, x) => s + x.n, 0) ?? 0;
  const count = (v: Verdict) => sum?.byVerdict.find((x) => x.v === v);
  const router = (r: string) => sum?.byRouter.find((x) => x.r === r)?.n ?? 0;
  const pending = sum?.byStatus.find((x) => x.s === 'proposed')?.n ?? 0;
  const lo = sum?.byVerdict.reduce((s, x) => s + (x.lo ?? 0), 0) ?? 0;
  const hi = sum?.byVerdict.reduce((s, x) => s + (x.hi ?? 0), 0) ?? 0;
  const top = job ? listVerdicts(job.id, { status: 'proposed', actionOnly: true }, 4, 0).rows : [];
  const latest = new Map<string, (typeof outcomes)[number]>();
  for (const o of outcomes) { const c = latest.get(o.task_id); if (!c || o.window_days > c.window_days) latest.set(o.task_id, o); }
  const outCount = (l: string) => [...latest.values()].filter((o) => o.label === l).length;
  const missing = ([['gsc_pages', 'Search Console'], ['gsc_queries', 'page and query data'], ['ga4', 'GA4'], ['crawl', 'a crawl'], ['backlinks', 'backlinks']] as const).filter(([k]) => !uploads[k]).map(([, l]) => l);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] text-muted">
            {job ? <>Scored {fmtDateTime(job.finished_at)} · {fmt(total)} URLs{sum?.skipped ? ` · ${fmt(sum.skipped)} not scored` : ''} · {job.provider === 'mock' ? 'mock decisions' : job.model}</> : 'Not scored yet'}
          </div>
          <h1 className="text-balance text-[34px] font-bold leading-[1.1] tracking-[-0.025em]">
            {!job ? (hasData ? 'Ready to score every URL.' : 'Start by adding your data.') : pending ? `${fmt(pending)} decision${pending === 1 ? ' is' : 's are'} waiting for you.` : 'Every decision is reviewed.'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/sites/${id}/data`} className="btn h-11">{hasData ? 'Update data' : 'Add data'}</Link>
          <form action={runVerdictsAction}>
            <input type="hidden" name="siteId" value={id} />
            <button className={`btn h-11 ${job ? '' : 'btn-primary'}`} disabled={!hasData || Boolean(running)}>{job ? 'Score again' : 'Score every URL'}</button>
          </form>
          {job && pending > 0 && <Link href={inbox} className="btn btn-primary h-11">Open the inbox →</Link>}
        </div>
      </header>

      {running && <JobProgress jobId={running.id} initial={running} label={running.type === 'crawl' ? 'Crawling the sitemap' : 'Scoring every URL'} />}
      {hasData && missing.length > 0 && (
        <div className="rounded-xl bg-sunken px-4 py-3 text-[13px] text-ink-2">Verdicts get sharper with {missing.join(', ')}. <Link className="font-semibold text-accent" href={`/sites/${id}/data`}>Add them</Link></div>
      )}

      {!job || !sum ? (
        <section className="card"><Empty title={hasData ? 'Ready to score' : 'No data yet'}>{hasData ? 'Press "Score every URL" to get a verdict on every page.' : <>Go to <Link className="underline" href={`/sites/${id}/data`}>Data sources</Link> and upload your Search Console export, or crawl the sitemap.</>}</Empty></section>
      ) : (
        <>
          <section aria-label="Site at a glance" className="card flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-semibold">Every URL, one verdict</h2>
              <div className="text-[13px] text-muted">Expected if all applied: <span className="font-medium text-ink"><Impact low={lo} high={hi} /></span> clicks a month in 90 days</div>
            </div>
            <div role="img" aria-label={VERDICTS.map((v) => `${count(v)?.n ?? 0} ${v}`).join(', ')} className="flex h-10 gap-[3px] overflow-hidden rounded-[10px]">
              {VERDICTS.map((v) => (count(v)?.n ? <div key={v} style={{ flex: count(v)!.n, background: BAR(v) }} /> : null))}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3">
              {VERDICTS.map((v) => {
                const c = count(v);
                return (
                  <Link key={v} href={`${inbox}?show=all&verdict=${v}`} className="flex flex-col gap-1 rounded-xl border border-line p-3.5 hover:border-line-strong">
                    <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: `var(--${v})` }}><span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: BAR(v) }} />{VERDICT_LABEL[v]}</span>
                    <span className="num text-[28px] font-bold tracking-[-0.02em]">{fmt(c?.n ?? 0)}</span>
                    <span className="mono text-[12px] text-muted">{v === 'leave' ? 'no action needed' : v === 'prune' ? 'removes dead weight' : c ? <Impact low={c.lo} high={c.hi} /> : '—'}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-5">
            <section aria-label="Confidence" className="card flex flex-col gap-4 p-6">
              <div><h2 className="text-[16px] font-semibold">How sure we are</h2><p className="text-[13px] text-muted">Only confident calls skip you. Prune and Redirect always wait for your approval.</p></div>
              {([['auto', 'Auto-approved', 'var(--accent)'], ['review', 'Needs review', '#9a6700'], ['uncertain', 'Uncertain', 'repeating-linear-gradient(135deg,#8a93a3 0 4px,#c4cad4 4px 8px)']] as const).map(([r, l, bg]) => (
                <Link key={r} href={r === 'auto' ? `${inbox}?show=all` : `${inbox}?show=${r}`} className="grid grid-cols-[132px_minmax(0,1fr)_40px] items-center gap-3 hover:underline">
                  <span className="font-semibold">{l}</span>
                  <span className="h-2.5 rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${total ? Math.round((router(r) / total) * 100) : 0}%`, background: bg }} /></span>
                  <span className="num mono text-right">{fmt(router(r))}</span>
                </Link>
              ))}
              <div className="mono flex flex-wrap gap-4 text-[11.5px] text-muted"><span>auto ≥ 0.85</span><span>review 0.60–0.84</span><span>uncertain &lt; 0.60</span></div>
            </section>

            <section aria-label="Biggest decisions" className="card flex flex-col gap-1 px-6 pb-3 pt-6">
              <div className="flex items-baseline justify-between gap-3"><h2 className="text-[16px] font-semibold">Biggest decisions first</h2><Link href={inbox} className="text-[13px] font-semibold text-accent">See all {fmt(pending)}</Link></div>
              {top.length === 0 ? <p className="py-6 text-muted">Nothing waiting.</p> : top.slice(0, 4).map((r) => (
                <Link key={r.id} href={`${inbox}?v=${r.id}`} className="grid min-h-[52px] grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line last:border-0">
                  <span className="justify-self-start rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ color: `var(--${r.verdict})`, background: `var(--${r.verdict}-bg)` }}>{VERDICT_LABEL[r.verdict!]}</span>
                  <span className="mono truncate text-[13px]">{r.path}</span>
                  <span className="mono text-[12.5px] text-muted"><Impact low={r.impact_low} high={r.impact_high} /></span>
                </Link>
              ))}
            </section>
          </div>

          <section aria-label="Outcomes" className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-ink p-7 text-white">
            <div className="flex max-w-[520px] flex-col gap-1.5">
              <h2 className="text-[20px] font-bold tracking-[-0.01em]">Did it work? Every action gets a verdict too.</h2>
              <p className="text-[#b8c0cc]">Mark a task done. Each later Search Console upload measures it at 30, 60 and 90 days against its forecast.</p>
            </div>
            <div className="flex gap-7">
              <div className="flex flex-col"><span className="num text-[30px] font-bold">{outCount('worked')}</span><span className="text-[12.5px] text-[#8fe3c9]">worked</span></div>
              <div className="flex flex-col"><span className="num text-[30px] font-bold">{outCount('neutral')}</span><span className="text-[12.5px] text-[#b8c0cc]">neutral</span></div>
              <div className="flex flex-col"><span className="num text-[30px] font-bold">{outCount('backfired')}</span><span className="text-[12.5px] text-[#ffb4ab]">backfired</span></div>
            </div>
            <Link href={`/sites/${id}/outcomes`} className="btn h-11 border-white bg-white text-ink hover:bg-[#eef0f3]">Open outcomes</Link>
          </section>
        </>
      )}

      {history.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-line px-6 py-3.5"><h2 className="font-semibold">Scoring runs</h2></div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Started</th><th>Status</th><th>Decisions by</th><th className="r">URLs</th><th className="r">Input tokens</th><th className="r">Model cost</th></tr></thead>
              <tbody>
                {history.map((j) => (
                  <tr key={j.id}>
                    <td>{fmtDateTime(j.created_at)}</td>
                    <td><StatusBadge s={j.status} />{j.error && <div className="mt-1 max-w-md text-[12.5px] text-bad">{j.error}</div>}</td>
                    <td className="text-muted">{j.provider === 'mock' ? 'Offline mock' : j.model}</td>
                    <td className="r num">{fmt(j.total)}</td>
                    <td className="r num">{fmt(j.input_tokens)}</td>
                    <td className="r num">{j.provider === 'mock' ? '—' : `$${((j.input_tokens / 1e6) * USD_PER_M_INPUT).toFixed(4)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="text-right">
        <summary className="cursor-pointer text-[13px] text-muted">Delete this site</summary>
        <form action={deleteSiteAction} className="mt-2 inline-flex flex-wrap items-center justify-end gap-3">
          <input type="hidden" name="siteId" value={id} />
          <span className="text-[13px] text-muted">This removes every upload, verdict, task and outcome for the site.</span>
          <button className="btn btn-sm text-bad">Delete permanently</button>
        </form>
      </details>
    </div>
  );
}
