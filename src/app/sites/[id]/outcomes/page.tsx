import Link from 'next/link';
import { Empty, fmt, fmtDate, Impact, PageTitle, Section, StatusBadge, VerdictBadge } from '@/components/ui';
import { measureOutcomesAction } from '@/lib/actions';
import { gscUploadsWithPeriod, listTasks, outcomesForTask } from '@/lib/repo';

export default async function Outcomes({ params }: PageProps<'/sites/[id]/outcomes'>) {
  const { id } = await params;
  const done = listTasks(id, { status: 'done' });
  const uploads = gscUploadsWithPeriod(id);
  const latestEnd = uploads.map((u) => u.period_end!).sort().pop();
  return (
    <div className="space-y-5">
      <PageTitle
        title="Outcomes"
        sub="Every completed task is compared with its forecast at 30, 60 and 90 days and labelled worked, neutral or backfired. Merges and redirects are measured on the target page; prunes on the rest of the site."
        actions={<form action={measureOutcomesAction}><input type="hidden" name="siteId" value={id} /><button className="btn">Measure now</button></form>}
      />
      <div className="card px-5 py-3.5 text-[13px] text-muted">
        {latestEnd ? <>Latest Search Console data runs to <b className="text-ink">{fmtDate(latestEnd)}</b>. </> : null}
        A window is measured once an upload starts on or after the done date and runs at least that many days past it. Upload a fresh export from the <Link href={`/sites/${id}/data`} className="underline">Data</Link> tab each month.
      </div>
      <Section>
        {done.length === 0 ? <Empty title="No completed tasks yet">Mark tasks done in the <Link href={`/sites/${id}/queue`} className="underline">Work queue</Link>.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Task</th><th>Done</th><th className="r">Baseline a month</th><th className="r">Forecast</th><th>30 days</th><th>60 days</th><th>90 days</th></tr></thead>
            <tbody>
              {done.map((t) => {
                const outs = new Map(outcomesForTask(t.id).map((o) => [o.window_days, o]));
                return (
                  <tr key={t.id}>
                    <td className="max-w-[320px]"><VerdictBadge v={t.verdict} size="sm" /> <span className="break-all font-medium">{t.path}</span>{t.target && <div className="text-[12.5px] text-muted">to {t.target}</div>}</td>
                    <td className="whitespace-nowrap">{fmtDate(t.done_at)}</td>
                    <td className="r num">{fmt(t.verdict === 'prune' ? (t.baseline_site_clicks_month ?? 0) - t.baseline_clicks_month : t.baseline_clicks_month)}{t.verdict === 'prune' && <div className="text-[11.5px] text-muted">rest of site</div>}</td>
                    <td className="r"><Impact low={t.forecast_low} high={t.forecast_high} /></td>
                    {[30, 60, 90].map((w) => {
                      const o = outs.get(w);
                      return <td key={w}>{o ? <><StatusBadge s={o.label} /><div className="num mt-1 text-[12px] text-muted">{o.delta >= 0 ? '+' : ''}{fmt(o.delta)} a month</div></> : <span className="text-[12.5px] text-faint">Waiting for data</span>}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
