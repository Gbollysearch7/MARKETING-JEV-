import { requireSite } from '@/lib/auth';
import type { GscImport } from '@/engine/ingest/gsc';
import { periodDays } from '@/engine/site';
import { VERDICTS } from '@/engine/verdict/types';
import { PrintButton } from '@/components/PrintButton';
import { fmt, fmtDate, Impact, StatusBadge, VERDICT_LABEL, VerdictBadge } from '@/components/ui';
import { db } from '@/lib/db';
import { getSite, listUploads, latestVerdictJob, listTasks, outcomesForSite, uploadData, verdictSummary } from '@/lib/repo';
import { reportBoundary, reportMonth, reportUpload } from '@/lib/report-period';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export default async function Report({ params, searchParams }: PageProps<'/sites/[id]/report'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const site = getSite(id)!;
  const month = reportMonth(sp.month);
  const before = reportBoundary(month);
  const inMonth = (iso: string | null) => Boolean(iso && iso.slice(0, 7) === month);

  const reviews = db().prepare(`select status, final_verdict, verdict, reviewed_by from verdicts where site_id = ? and reviewed_at like ?`).all(id, `${month}%`) as { status: string; final_verdict: string | null; verdict: string; reviewed_by: string }[];
  const human = reviews.filter((r) => r.reviewed_by === 'user');
  const approved = human.filter((r) => r.status === 'approved' && (!r.final_verdict || r.final_verdict === r.verdict)).length;
  const changed = human.filter((r) => r.status === 'approved' && r.final_verdict && r.final_verdict !== r.verdict).length;
  const rejected = human.filter((r) => r.status === 'rejected').length;
  const automatic = reviews.filter((r) => r.reviewed_by === 'auto').length;
  const tasks = listTasks(id);
  const completed = tasks.filter((t) => t.status === 'done' && inMonth(t.done_at));
  const outcomes = outcomesForSite(id).filter((o) => o.measured_at < before);
  const job = latestVerdictJob(id, before);
  const sum = job ? verdictSummary(job.id) : null;

  const uploads = listUploads(id);
  const gscU = reportUpload(uploads, before);
  const gsc = gscU ? uploadData<GscImport>(gscU.id) : null;
  const days = periodDays(gsc?.period) ?? 90;
  const cur = gsc ? gsc.pages.reduce((s, p) => s + p.clicks, 0) * (30 / days) : null;
  const prev = gsc?.hasPrevious ? gsc.pages.reduce((s, p) => s + (p.prevClicks ?? 0), 0) * (30 / days) : null;
  const activityMonths = db().prepare(`select distinct substr(created_at, 1, 7) month from jobs where site_id = ? union select distinct substr(reviewed_at, 1, 7) month from verdicts where site_id = ? and reviewed_at is not null`).all(id, id) as { month: string }[];
  const months = [...new Set([month, reportMonth(undefined), ...activityMonths.map((m) => m.month), ...uploads.map((u) => u.created_at.slice(0, 7)), ...tasks.map((t) => t.done_at?.slice(0, 7)).filter(Boolean) as string[]])].sort().reverse();

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <form key={month} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="report-month">Report month</label>
          <select id="report-month" name="month" defaultValue={month} className="select">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          <button className="btn">Show</button>
        </form>
        <PrintButton />
      </div>

      <div className="card report-card space-y-8 p-5 sm:p-8">
        <header className="border-b border-line pb-5">
          <p className="label">Monthly SEO decisions report</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">{site.name}</h1>
          <p className="text-muted">{site.domain} · {monthLabel(month)} · prepared {fmtDate(new Date().toISOString())}</p>
          <p className="mt-3 text-[12px] text-muted">Activity is for the selected month. Traffic and scoring use the latest retained data available by that month’s end.</p>
          <p className="mt-1 text-[12px] text-muted">{gscU ? <>Traffic period: {gscU.period_start && gscU.period_end ? `${fmtDate(gscU.period_start)} to ${fmtDate(gscU.period_end)}` : 'date range not supplied; estimated over 90 days'}. Imported {fmtDate(gscU.created_at)}.</> : 'No Search Console pages export was available for this month.'}</p>
          <p className="mt-1 text-[12px] text-muted">{automatic} automatic approvals recorded this month, shown separately from human reviews.</p>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Human reviews', fmt(human.length), `${approved} approved, ${changed} changed, ${rejected} rejected`],
            ['Actions completed', fmt(completed.length), 'tasks marked done this month'],
            ['Measurement windows', fmt(outcomes.length), `${outcomes.filter((o) => o.label === 'worked').length} successful windows to date`],
            ['Organic clicks a month', fmt(cur), prev != null && cur != null && prev > 0 ? `${cur >= prev ? 'up' : 'down'} ${Math.abs(Math.round(((cur - prev) / prev) * 100))}% on the previous period` : 'latest Search Console period'],
          ].map(([l, v, s]) => (
            <div key={l}><div className="label">{l}</div><div className="num mt-1 text-[24px] font-semibold">{v}</div><div className="text-[12.5px] text-muted">{s}</div></div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Actions completed</h2>
          {completed.length === 0 ? <p className="text-muted">No actions were completed this month.</p> : (
            <div className="overflow-x-auto print:overflow-visible"><table className="tbl">
              <thead><tr><th>Page</th><th>Action</th><th>Done</th><th className="r">Expected, clicks a month</th></tr></thead>
              <tbody>{completed.map((t) => <tr key={t.id}><td className="break-all">{t.path}{t.target && <div className="text-[12.5px] text-muted">to {t.target}</div>}</td><td><VerdictBadge v={t.verdict} size="sm" /></td><td>{fmtDate(t.done_at)}</td><td className="r"><Impact low={t.forecast_low} high={t.forecast_high} /></td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Did it work?</h2>
          {outcomes.length === 0 ? <p className="text-muted">No outcomes measured yet. Each completed action is measured 30, 60 and 90 days after it goes live.</p> : (
            <div className="overflow-x-auto print:overflow-visible"><table className="tbl">
              <thead><tr><th>Page</th><th>Action</th><th className="r">Window</th><th className="r">Change, clicks a month</th><th>Result</th></tr></thead>
              <tbody>{outcomes.map((o) => <tr key={o.id}><td className="break-all">{o.path}</td><td><VerdictBadge v={o.verdict} size="sm" /></td><td className="r num">{o.window_days} days</td><td className="r num">{o.delta >= 0 ? '+' : ''}{fmt(o.delta)}</td><td><StatusBadge s={o.label} /></td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        {sum && (
          <section>
            <h2 className="mb-2 font-semibold">Where the site stands</h2>
            <p className="mb-3 text-[13px] text-muted">Scored {fmtDate(job?.finished_at)}: {fmt(sum.byVerdict.reduce((s, x) => s + x.n, 0))} URLs. Latest completed run available by the selected month’s end.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {VERDICTS.map((v) => <div key={v} className="rounded-lg border border-line p-3"><VerdictBadge v={v} size="sm" /><div className="num mt-2 text-[20px] font-semibold">{fmt(sum.byVerdict.find((x) => x.v === v)?.n ?? 0)}</div><div className="sr-only">{VERDICT_LABEL[v]}</div></div>)}
            </div>
          </section>
        )}
        <footer className="border-t border-line pt-4 text-[12px] text-muted">Impact figures are estimated ranges, not guarantees. Reports use retained records; later edits to tasks can change historical activity totals. Save a copy to preserve this report as prepared.</footer>
      </div>
    </div>
  );
}
