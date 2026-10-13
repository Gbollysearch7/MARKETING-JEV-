import type { GscImport } from '@/engine/ingest/gsc';
import { periodDays } from '@/engine/site';
import { VERDICTS } from '@/engine/verdict/types';
import { PrintButton } from '@/components/PrintButton';
import { fmt, fmtDate, Impact, StatusBadge, VERDICT_LABEL, VerdictBadge } from '@/components/ui';
import { db } from '@/lib/db';
import { getSite, latestUploads, latestVerdictJob, listTasks, outcomesForSite, uploadData, verdictSummary } from '@/lib/repo';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export default async function Report({ params, searchParams }: PageProps<'/sites/[id]/report'>) {
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const site = getSite(id)!;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : new Date().toISOString().slice(0, 7);
  const inMonth = (iso: string | null) => Boolean(iso && iso.slice(0, 7) === month);

  const reviews = db().prepare(`select status, final_verdict, verdict, reviewed_by from verdicts where site_id = ? and reviewed_at like ?`).all(id, `${month}%`) as { status: string; final_verdict: string | null; verdict: string; reviewed_by: string }[];
  const approved = reviews.filter((r) => r.status === 'approved').length;
  const changed = reviews.filter((r) => r.final_verdict && r.final_verdict !== r.verdict).length;
  const rejected = reviews.filter((r) => r.status === 'rejected').length;
  const tasks = listTasks(id);
  const completed = tasks.filter((t) => t.status === 'done' && inMonth(t.done_at));
  const outcomes = outcomesForSite(id).filter((o) => o.measured_at.slice(0, 7) <= month);
  const job = latestVerdictJob(id);
  const sum = job ? verdictSummary(job.id) : null;

  const gscU = latestUploads(id).gsc_pages;
  const gsc = gscU ? uploadData<GscImport>(gscU.id) : null;
  const days = periodDays(gsc?.period) ?? 90;
  const cur = gsc ? gsc.pages.reduce((s, p) => s + p.clicks, 0) * (30 / days) : null;
  const prev = gsc?.hasPrevious ? gsc.pages.reduce((s, p) => s + (p.prevClicks ?? 0), 0) * (30 / days) : null;
  const months = [...new Set([new Date().toISOString().slice(0, 7), ...tasks.map((t) => t.done_at?.slice(0, 7)).filter(Boolean) as string[]])].sort().reverse();

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <form className="flex items-center gap-2">
          <select name="month" defaultValue={month} className="select">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          <button className="btn">Show</button>
        </form>
        <PrintButton />
      </div>

      <div className="card space-y-8 p-8">
        <header className="border-b border-line pb-5">
          <p className="label">Monthly SEO decisions report</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">{site.name}</h1>
          <p className="text-muted">{site.domain} · {monthLabel(month)} · prepared {fmtDate(new Date().toISOString())}</p>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Decisions reviewed', fmt(reviews.length), `${approved} approved, ${changed} changed, ${rejected} rejected`],
            ['Actions completed', fmt(completed.length), 'tasks marked done this month'],
            ['Outcomes measured', fmt(outcomes.length), `${outcomes.filter((o) => o.label === 'worked').length} worked to date`],
            ['Organic clicks a month', fmt(cur), prev != null && cur != null && prev > 0 ? `${cur >= prev ? 'up' : 'down'} ${Math.abs(Math.round(((cur - prev) / prev) * 100))}% on the previous period` : 'latest Search Console period'],
          ].map(([l, v, s]) => (
            <div key={l}><div className="label">{l}</div><div className="num mt-1 text-[24px] font-semibold">{v}</div><div className="text-[12.5px] text-muted">{s}</div></div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Actions completed</h2>
          {completed.length === 0 ? <p className="text-muted">No actions were completed this month.</p> : (
            <table className="tbl">
              <thead><tr><th>Page</th><th>Action</th><th>Done</th><th className="r">Expected, clicks a month</th></tr></thead>
              <tbody>{completed.map((t) => <tr key={t.id}><td className="break-all">{t.path}{t.target && <div className="text-[12.5px] text-muted">to {t.target}</div>}</td><td><VerdictBadge v={t.verdict} size="sm" /></td><td>{fmtDate(t.done_at)}</td><td className="r"><Impact low={t.forecast_low} high={t.forecast_high} /></td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Did it work?</h2>
          {outcomes.length === 0 ? <p className="text-muted">No outcomes measured yet. Each completed action is measured 30, 60 and 90 days after it goes live.</p> : (
            <table className="tbl">
              <thead><tr><th>Page</th><th>Action</th><th className="r">Window</th><th className="r">Change, clicks a month</th><th>Result</th></tr></thead>
              <tbody>{outcomes.map((o) => <tr key={o.id}><td className="break-all">{o.path}</td><td><VerdictBadge v={o.verdict} size="sm" /></td><td className="r num">{o.window_days} days</td><td className="r num">{o.delta >= 0 ? '+' : ''}{fmt(o.delta)}</td><td><StatusBadge s={o.label} /></td></tr>)}</tbody>
            </table>
          )}
        </section>

        {sum && (
          <section>
            <h2 className="mb-2 font-semibold">Where the site stands</h2>
            <p className="mb-3 text-[13px] text-muted">Verdicts from the latest scoring of {fmt(sum.byVerdict.reduce((s, x) => s + x.n, 0))} URLs.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {VERDICTS.map((v) => <div key={v} className="rounded-lg border border-line p-3"><VerdictBadge v={v} size="sm" /><div className="num mt-2 text-[20px] font-semibold">{fmt(sum.byVerdict.find((x) => x.v === v)?.n ?? 0)}</div><div className="sr-only">{VERDICT_LABEL[v]}</div></div>)}
            </div>
          </section>
        )}
        <footer className="border-t border-line pt-4 text-[12px] text-muted">Verdicts come from typed decisions with calibrated probabilities. Impact figures are ranges estimated from this site&apos;s own click-through curve, not guarantees.</footer>
      </div>
    </div>
  );
}
