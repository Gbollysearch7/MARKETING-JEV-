import { requireSite } from '@/lib/auth';
import type { GscImport } from '@/engine/ingest/gsc';
import { periodDays } from '@/engine/site';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { PrintButton } from '@/components/PrintButton';
import { fmt, fmtDate, Impact, StatusBadge, VERDICT_LABEL, VerdictBadge } from '@/components/ui';
import { db } from '@/lib/db';
import { clicksHistory, getSite, listUploads, latestVerdictJob, listTasks, outcomesForSite, uploadData, verdictSummary } from '@/lib/repo';
import { reportBoundary, reportMonth, reportUpload } from '@/lib/report-period';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(Math.round(n)))}`;
const LIST = 25;

type Review = { path: string; status: string; verdict: Verdict; final_verdict: Verdict | null; final_target: string | null; target: string | null; reviewed_at: string; reviewed_by: string; impact_low: number; impact_high: number };

function H2({ n, children, sub }: { n: number; children: string; sub?: string }) {
  return (
    <div className="mb-3 flex flex-col gap-0.5">
      <h2 className="flex items-baseline gap-2.5 text-[17px] font-semibold"><span className="mono text-[12px] text-faint">{String(n).padStart(2, '0')}</span>{children}</h2>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

export default async function Report({ params, searchParams }: PageProps<'/sites/[id]/report'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const site = getSite(id)!;
  const month = reportMonth(sp.month);
  const before = reportBoundary(month);
  const monthStart = `${month}-01T00:00:00.000Z`;
  const inMonth = (iso: string | null) => Boolean(iso && iso.slice(0, 7) === month);
  const d = db();

  // Decisions: human reviews this month. Carried-over reviews were counted in the month they were made.
  const reviews = d.prepare(`select path, status, verdict, final_verdict, final_target, target, reviewed_at, reviewed_by, impact_low, impact_high from verdicts
    where site_id = ? and reviewed_at >= ? and reviewed_at < ? and reviewed_by in ('user', 'auto') order by reviewed_at desc`).all(id, monthStart, before) as Review[];
  const human = reviews.filter((r) => r.reviewed_by === 'user');
  const approved = human.filter((r) => r.status === 'approved' && (!r.final_verdict || r.final_verdict === r.verdict)).length;
  const changed = human.filter((r) => r.status === 'approved' && r.final_verdict && r.final_verdict !== r.verdict).length;
  const rejected = human.filter((r) => r.status === 'rejected').length;
  // Each run re-approves confident calls, so count distinct pages rather than rows.
  const automatic = new Set(reviews.filter((r) => r.reviewed_by === 'auto' && r.status === 'approved' && r.verdict !== 'leave').map((r) => r.path)).size;

  // Work: shipped this month, and what is next.
  const tasks = listTasks(id);
  const completed = tasks.filter((t) => t.status === 'done' && inMonth(t.done_at));
  const open = tasks.filter((t) => (t.status === 'todo' || t.status === 'in_progress') && t.created_at < before);
  const shippedLo = completed.reduce((s, t) => s + t.forecast_low, 0);
  const shippedHi = completed.reduce((s, t) => s + t.forecast_high, 0);

  // Impact: the latest measured window for each task, measured by the month's end.
  const allOutcomes = outcomesForSite(id).filter((o) => o.measured_at < before);
  const latestByTask = new Map<string, (typeof allOutcomes)[number]>();
  for (const o of allOutcomes) { const c = latestByTask.get(o.task_id); if (!c || o.window_days > c.window_days) latestByTask.set(o.task_id, o); }
  const outcomes = [...latestByTask.values()].sort((a, b) => b.delta - a.delta);
  const worked = outcomes.filter((o) => o.label === 'worked');
  const backfired = outcomes.filter((o) => o.label === 'backfired');
  const netDelta = outcomes.reduce((s, o) => s + o.delta, 0);
  const newlyMeasured = allOutcomes.filter((o) => o.measured_at >= monthStart).length;

  // Where the site stands, and how that moved during the month.
  const job = latestVerdictJob(id, before);
  const startJob = latestVerdictJob(id, monthStart);
  const sum = job ? verdictSummary(job.id) : null;
  const startSum = startJob && startJob.id !== job?.id ? verdictSummary(startJob.id) : null;
  const mix = (s: typeof sum, v: Verdict) => s?.byVerdict.find((x) => x.v === v)?.n ?? 0;
  const scored = sum?.byVerdict.reduce((s, x) => s + x.n, 0) ?? 0;
  const needAction = sum ? scored - mix(sum, 'leave') : 0;
  const startNeedAction = startSum ? startSum.byVerdict.reduce((s, x) => s + x.n, 0) - mix(startSum, 'leave') : null;
  const waiting = job ? (d.prepare(`select count(*) n, coalesce(sum(impact_low), 0) lo, coalesce(sum(impact_high), 0) hi from verdicts where job_id = ? and status = 'proposed' and skipped is null and verdict != 'leave'`).get(job.id) as { n: number; lo: number; hi: number }) : { n: 0, lo: 0, hi: 0 };

  // Traffic.
  const uploads = listUploads(id);
  const gscU = reportUpload(uploads, before);
  const gsc = gscU ? uploadData<GscImport>(gscU.id) : null;
  const days = periodDays(gsc?.period) ?? 90;
  const cur = gsc ? gsc.pages.reduce((s, p) => s + p.clicks, 0) * (30 / days) : null;
  const prev = gsc?.hasPrevious ? gsc.pages.reduce((s, p) => s + (p.prevClicks ?? 0), 0) * (30 / days) : null;
  const change = cur != null && prev ? Math.round(((cur - prev) / prev) * 100) : null;
  const trend = clicksHistory(id).filter((p) => p.end < before.slice(0, 10)).slice(-6);
  const trendMax = Math.max(1, ...trend.map((p) => p.clicksMonth), trend[0]?.prevClicksMonth ?? 0);

  const activityMonths = d.prepare(`select distinct substr(created_at, 1, 7) month from jobs where site_id = ? union select distinct substr(reviewed_at, 1, 7) month from verdicts where site_id = ? and reviewed_at is not null`).all(id, id) as { month: string }[];
  const months = [...new Set([month, reportMonth(undefined), ...activityMonths.map((m) => m.month), ...uploads.map((u) => u.created_at.slice(0, 7)), ...tasks.map((t) => t.done_at?.slice(0, 7)).filter(Boolean) as string[]])].sort().reverse();

  // Headlines: plain sentences assembled from the numbers above. No generated prose.
  const headlines: string[] = [];
  if (cur != null) headlines.push(`Organic search brought about ${fmt(cur)} clicks a month${change != null ? `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the previous period` : ''}.`);
  if (human.length) headlines.push(`${plural(human.length, 'recommendation')} reviewed: ${fmt(approved)} approved, ${fmt(changed)} adjusted and ${fmt(rejected)} rejected.`);
  if (completed.length) headlines.push(`${plural(completed.length, 'change')} went live, expected to add ${signed(shippedLo)} to ${signed(shippedHi)} clicks a month within 90 days.`);
  if (outcomes.length) headlines.push(`Of ${plural(outcomes.length, 'change')} measured so far, ${fmt(worked.length)} worked${backfired.length ? ` and ${fmt(backfired.length)} backfired` : ''}; net ${signed(netDelta)} clicks a month.`);
  if (startNeedAction != null && sum) headlines.push(`Pages needing action went from ${fmt(startNeedAction)} to ${fmt(needAction)}.`);
  if (!headlines.length) headlines.push('No recorded activity this month yet.');

  let n = 0;
  return (
    <div className="report mx-auto max-w-[920px] space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <form key={month} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="report-month">Report month</label>
          <select id="report-month" name="month" defaultValue={month} className="select">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          <button className="btn">Show</button>
        </form>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12.5px] text-muted sm:inline">Choose “Save as PDF” in the print dialogue.</span>
          <PrintButton />
        </div>
      </div>

      <article className="card report-card flex flex-col gap-10 p-6 sm:p-10">
        <header className="flex flex-col gap-4 border-b border-line pb-7">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <span className="font-semibold uppercase tracking-[0.08em]">Monthly SEO report</span>
            <span>Prepared {fmtDate(new Date().toISOString())}</span>
          </div>
          <div>
            <h1 className="display text-[44px] leading-[1.02] sm:text-[52px]">{site.name}</h1>
            <p className="mt-1.5 text-[15px] text-ink-2"><span className="mono text-[14px]">{site.domain}</span> · {monthLabel(month)}</p>
          </div>
          <ul className="flex flex-col gap-2 rounded-xl bg-sunken px-5 py-4 text-[14.5px] text-ink">
            {headlines.map((h) => <li key={h} className="flex gap-2.5"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-accent" />{h}</li>)}
          </ul>
        </header>

        <section aria-label="Key figures" className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {[
            ['Organic clicks a month', fmt(cur), change != null ? `${change >= 0 ? 'Up' : 'Down'} ${Math.abs(change)}% on the period before` : gscU ? 'Latest Search Console period' : 'No Search Console data yet', change == null ? '' : change >= 0 ? 'text-ok' : 'text-bad'],
            ['Decisions made', fmt(human.length), `${fmt(approved)} approved · ${fmt(changed)} adjusted · ${fmt(rejected)} rejected`, ''],
            ['Changes shipped', fmt(completed.length), completed.length ? `Forecast ${signed(shippedLo)} to ${signed(shippedHi)} clicks a month` : 'None marked done this month', ''],
            ['Changes that worked', outcomes.length ? `${fmt(worked.length)}/${fmt(outcomes.length)}` : '—', outcomes.length ? `Net ${signed(netDelta)} clicks a month` : 'Measured 30, 60 and 90 days after launch', outcomes.length ? (netDelta >= 0 ? 'text-ok' : 'text-bad') : ''],
          ].map(([l, v, s, tone]) => (
            <div key={l} className="flex flex-col gap-1 border-l-2 border-line pl-4">
              <div className="label">{l}</div>
              <div className="display num text-[38px] leading-none">{v}</div>
              <div className={`text-[12.5px] ${tone || 'text-muted'}`}>{s}</div>
            </div>
          ))}
        </section>

        <section>
          <H2 n={++n} sub={gscU ? `From Search Console. Latest period ${gscU.period_start && gscU.period_end ? `${fmtDate(gscU.period_start)} to ${fmtDate(gscU.period_end)}` : 'with no date range (estimated over 90 days)'}, imported ${fmtDate(gscU.created_at)}.` : undefined}>Search traffic</H2>
          {trend.length === 0 ? <p className="text-muted">{gscU ? 'Upload Search Console exports with a date range to chart the trend.' : 'No Search Console export was available by the end of this month.'}</p> : (
            <div className="flex flex-col gap-2">
              {[...(trend[0].prevClicksMonth != null ? [{ label: 'Period before', v: trend[0].prevClicksMonth, prior: true }] : []), ...trend.map((p) => ({ label: `${fmtDate(p.start)} – ${fmtDate(p.end)}`, v: p.clicksMonth, prior: false }))].map((p, i, all) => (
                <div key={p.label} className="grid grid-cols-[minmax(0,118px)_minmax(0,1fr)_60px] items-center gap-2 text-[12.5px] sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_72px] sm:gap-3 sm:text-[13px]">
                  <span className={p.prior ? 'text-muted' : 'text-ink-2'}>{p.label}</span>
                  <span className="h-3 rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${Math.max(1, Math.round((p.v / trendMax) * 100))}%`, background: i === all.length - 1 ? 'var(--accent)' : 'var(--chart-bar)' }} /></span>
                  <span className="num mono text-right">{fmt(p.v)}</span>
                </div>
              ))}
              <p className="text-[12px] text-muted">Clicks a month, scaled from each export’s date range.</p>
            </div>
          )}
        </section>

        <section>
          <H2 n={++n} sub="Every URL gets one recommendation. These are the ones reviewed by a person this month.">Decisions made</H2>
          {human.length === 0 ? <p className="text-muted">No recommendations were reviewed this month.{automatic ? ` ${plural(automatic, 'high-confidence change was', 'high-confidence changes were')} approved automatically.` : ''}</p> : (
            <>
              <div className="overflow-x-auto print:overflow-visible"><table className="tbl min-w-[600px]">
                <thead><tr><th>Page</th><th>Recommended</th><th>Decision</th><th className="r">Date</th></tr></thead>
                <tbody>{human.slice(0, LIST).map((r) => (
                  <tr key={`${r.path}-${r.reviewed_at}`}>
                    <td className="mono max-w-[340px] text-[12.5px] [overflow-wrap:anywhere]">{r.path}</td>
                    <td><VerdictBadge v={r.verdict} size="sm" /></td>
                    <td className="text-[13px]">{r.status === 'rejected' ? <span className="text-bad">Rejected</span> : r.final_verdict && r.final_verdict !== r.verdict ? <span>Changed to <VerdictBadge v={r.final_verdict} size="sm" /></span> : <span className="text-ok">Approved</span>}{(r.final_target ?? (r.status === 'approved' && !r.final_verdict ? r.target : null)) && <div className="mono text-[11.5px] text-muted [overflow-wrap:anywhere]">to {r.final_target ?? r.target}</div>}</td>
                    <td className="r whitespace-nowrap text-muted">{fmtDate(r.reviewed_at)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {human.length > LIST && <p className="mt-2 text-[12.5px] text-muted">And {plural(human.length - LIST, 'more decision')}. The full list is in the decision log.</p>}
              {automatic > 0 && <p className="mt-2 text-[12.5px] text-muted">A further {plural(automatic, 'high-confidence change was', 'high-confidence changes were')} approved automatically.</p>}
            </>
          )}
        </section>

        <section>
          <H2 n={++n} sub="Changes marked live this month, with the traffic change forecast at the time.">Changes shipped</H2>
          {completed.length === 0 ? <p className="text-muted">No changes were marked done this month.</p> : (
            <div className="overflow-x-auto print:overflow-visible"><table className="tbl min-w-[600px]">
              <thead><tr><th>Page</th><th>Action</th><th className="r">Live</th><th className="r">Forecast, clicks a month</th></tr></thead>
              <tbody>{completed.map((t) => <tr key={t.id}><td className="mono max-w-[340px] text-[12.5px] [overflow-wrap:anywhere]">{t.path}{t.target && <div className="text-[11.5px] text-muted">to {t.target}</div>}</td><td><VerdictBadge v={t.verdict} size="sm" /></td><td className="r whitespace-nowrap">{fmtDate(t.done_at)}</td><td className="r"><Impact low={t.forecast_low} high={t.forecast_high} /></td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section>
          <H2 n={++n} sub="Each change is measured against its own baseline 30, 60 and 90 days after it went live. The latest window is shown.">Impact</H2>
          {outcomes.length === 0 ? <p className="text-muted">No results yet. The first measurement arrives with the Search Console export covering 30 days after a change goes live.</p> : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
                <span className="rounded-full bg-ok-bg px-3 py-1 text-ok">{fmt(worked.length)} worked</span>
                <span className="rounded-full bg-sunken px-3 py-1 text-ink-2">{fmt(outcomes.length - worked.length - backfired.length)} neutral</span>
                <span className="rounded-full bg-bad-bg px-3 py-1 text-bad">{fmt(backfired.length)} backfired</span>
                {newlyMeasured > 0 && <span className="px-1 py-1 text-muted">{plural(newlyMeasured, 'measurement')} new this month</span>}
              </div>
              <div className="overflow-x-auto print:overflow-visible"><table className="tbl min-w-[600px]">
                <thead><tr><th>Page</th><th>Action</th><th className="r">After</th><th className="r">Change, clicks a month</th><th>Result</th></tr></thead>
                <tbody>{outcomes.slice(0, LIST).map((o) => <tr key={o.id}><td className="mono max-w-[320px] text-[12.5px] [overflow-wrap:anywhere]">{o.path}</td><td><VerdictBadge v={o.verdict} size="sm" /></td><td className="r num whitespace-nowrap">{o.window_days} days</td><td className={`r num ${o.delta > 0 ? 'text-ok' : o.delta < 0 ? 'text-bad' : ''}`}>{signed(o.delta)}</td><td><StatusBadge s={o.label} /></td></tr>)}</tbody>
              </table></div>
            </>
          )}
        </section>

        <section>
          <H2 n={++n} sub="Approved work, biggest expected gain first.">Next steps</H2>
          {open.length === 0 && waiting.n === 0 ? <p className="text-muted">Nothing is waiting. The next scoring run will pick up new opportunities.</p> : (
            <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {open.slice(0, 6).map((t) => (
                <li key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <VerdictBadge v={t.verdict} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-[13.5px]">{t.brief.summary}</span>
                    <span className="text-[12px] text-muted">{t.status === 'in_progress' ? 'In progress' : 'To do'}{t.owner ? ` · ${t.owner}` : ''}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}</span>
                  </span>
                  <span className="text-right text-[12.5px] text-muted"><Impact low={t.forecast_low} high={t.forecast_high} /></span>
                </li>
              ))}
              {open.length > 6 && <li className="px-4 py-3 text-[13px] text-muted">And {plural(open.length - 6, 'more approved task')}.</li>}
              {waiting.n > 0 && <li className="px-4 py-3 text-[13px] text-ink-2">{plural(waiting.n, 'further recommendation is', 'further recommendations are')} waiting for review{waiting.hi ? <>, together forecast at <Impact low={waiting.lo} high={waiting.hi} /> clicks a month</> : ''}.</li>}
            </ol>
          )}
        </section>

        {sum && (
          <section>
            <H2 n={++n} sub={`Scored ${fmtDate(job?.finished_at)}: ${fmt(scored)} URLs.${startSum ? ` Compared with the run on ${fmtDate(startJob?.finished_at)}.` : ''}`}>Where the site stands</H2>
            <div role="img" aria-label={VERDICTS.map((v) => `${mix(sum, v)} ${VERDICT_LABEL[v]}`).join(', ')} className="mb-3 flex h-3 gap-[2px] overflow-hidden rounded-full">
              {VERDICTS.map((v) => (mix(sum, v) ? <span key={v} style={{ flex: mix(sum, v), background: `var(--${v}-mark)` }} /> : null))}
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {VERDICTS.map((v) => {
                const now = mix(sum, v);
                const delta = startSum ? now - mix(startSum, v) : null;
                return (
                  <div key={v} className="rounded-lg border border-line p-3">
                    <VerdictBadge v={v} size="sm" />
                    <div className="num mt-2 text-[22px] font-semibold">{fmt(now)}</div>
                    {delta != null && delta !== 0 && <div className="text-[11.5px] text-muted">{signed(delta)} this month</div>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="flex flex-wrap justify-between gap-2 border-t border-line pt-5 text-[11.5px] text-muted">
          <span className="max-w-[620px]">Forecasts are estimated ranges, not guarantees. Clicks come from Google Search Console and are scaled to a 30-day month. Recommendations are made per URL from the site’s own data; every decision is logged.</span>
          <span>Prepared with Rankcall</span>
        </footer>
      </article>
    </div>
  );
}
