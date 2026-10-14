import { requireSite } from '@/lib/auth';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Empty, fmt, fmtDate, Impact, PageTitle, StatusBadge, VerdictBadge } from '@/components/ui';
import { measureOutcomesAction } from '@/lib/actions';
import { gscUploadsWithPeriod, listTasks, outcomesForTask } from '@/lib/repo';

/** Forecast range as a band and the actual change as a tick, on one shared scale. */
function RangeBar({ low, high, actual, min, max }: { low: number; high: number; actual: number | null; min: number; max: number }) {
  const pos = (x: number) => `${((x - min) / (max - min || 1)) * 100}%`;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-sunken" role="img" aria-label={`Forecast ${low} to ${high}${actual != null ? `, actual ${actual}` : ''} clicks a month`}>
      <div className="absolute h-full rounded-full bg-accent-soft ring-1 ring-[var(--accent-soft)]" style={{ left: pos(Math.min(low, high)), width: `calc(${pos(Math.max(low, high))} - ${pos(Math.min(low, high))})` }} />
      <div className="absolute top-0 h-full w-px bg-line-strong" style={{ left: pos(0) }} />
      {actual != null && <div className="absolute -top-1 h-[18px] w-[3px] rounded-full bg-ink" style={{ left: pos(actual) }} />}
    </div>
  );
}

export default async function Outcomes({ params }: PageProps<'/sites/[id]/outcomes'>) {
  const { id } = await params;
  await requireSite(id);
  const done = listTasks(id, { status: 'done' });
  const uploads = gscUploadsWithPeriod(id);
  const latestEnd = uploads.map((u) => u.period_end!).sort().pop();
  const rows = done.map((t) => {
    const outs = outcomesForTask(t.id);
    const latest = outs.sort((a, b) => b.window_days - a.window_days)[0] ?? null;
    return { t, outs: new Map(outs.map((o) => [o.window_days, o])), latest };
  });
  const labels = rows.map((r) => r.latest?.label).filter(Boolean) as string[];
  const count = (l: string) => labels.filter((x) => x === l).length;
  const values = rows.flatMap((r) => [r.t.forecast_low, r.t.forecast_high, r.latest?.delta ?? 0, 0]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Outcomes"
        sub="Every completed task is checked against its forecast at 30, 60 and 90 days. Merges and redirects are measured on the target page; prunes on the rest of the site."
        actions={<form action={measureOutcomesAction}><input type="hidden" name="siteId" value={id} /><SubmitButton pending="Measuring…">Measure now</SubmitButton></form>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Completed tasks', done.length, ''], ['Worked', count('worked'), 'text-ok'], ['Neutral', count('neutral'), 'text-ink-2'], ['Backfired', count('backfired'), 'text-bad']].map(([l, n, c]) => (
          <div key={l as string} className="card px-5 py-4"><div className="label">{l}</div><div className={`display num mt-1 text-[38px] leading-none ${c}`}>{fmt(n as number)}</div></div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[['Mark a task done', 'The done date starts the clock.'], ['Upload a fresh export', latestEnd ? `Monthly, from Search Console. Latest data runs to ${fmtDate(latestEnd)}.` : 'Monthly, from Search Console.'], ['Get a label', 'Worked, neutral or backfired, against the forecast range.']].map(([t, d], i) => (
          <div key={t} className="flex gap-3 rounded-2xl border border-line bg-surface/60 p-4">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-strong">{i + 1}</span>
            <div><div className="font-medium">{t}</div><div className="text-[13px] text-muted">{d}</div></div>
          </div>
        ))}
      </div>
      <section className="card overflow-hidden">
        {done.length === 0 ? (
          <Empty title="Nothing measured yet">Mark tasks done in the <Link href={`/sites/${id}/queue`} className="underline">work queue</Link>, then upload a newer Search Console export.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[880px]">
              <thead><tr><th>Task</th><th>Done</th><th className="w-[260px]">Forecast against actual, clicks a month</th><th>30 days</th><th>60 days</th><th>90 days</th></tr></thead>
              <tbody>
                {rows.map(({ t, outs, latest }) => (
                  <tr key={t.id}>
                    <td className="max-w-[300px]"><VerdictBadge v={t.verdict} size="sm" /><div className="mono mt-1.5 break-all text-[12.5px]">{t.path}</div>{t.target && <div className="mono text-[12px] text-muted">→ {t.target}</div>}</td>
                    <td className="whitespace-nowrap text-muted">{fmtDate(t.done_at)}</td>
                    <td>
                      <RangeBar low={t.forecast_low} high={t.forecast_high} actual={latest?.delta ?? null} min={min} max={max} />
                      <div className="mt-2 text-[12px] text-muted">Forecast <Impact low={t.forecast_low} high={t.forecast_high} />{latest ? <> · actual <span className="mono text-ink">{latest.delta >= 0 ? '+' : ''}{fmt(latest.delta)}</span></> : ''}</div>
                    </td>
                    {[30, 60, 90].map((w) => {
                      const o = outs.get(w);
                      return <td key={w}>{o ? <><StatusBadge s={o.label} /><div className="num mt-1 text-[12px] text-muted">{o.delta >= 0 ? '+' : ''}{fmt(o.delta)} a month</div></> : <span className="text-[12.5px] text-muted">Waiting for data</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
