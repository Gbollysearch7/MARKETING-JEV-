import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { fmt, fmtDate, fmtDateTime, VERDICT_LABEL } from "./ui";

type Run = { id: string; at: string; model: string; mix: Partial<Record<Verdict, number>>; total: number };
type Period = { start: string; end: string; clicksMonth: number; prevClicksMonth: number | null };

/** Part-to-whole across runs: one 100% bar per scoring run, verdicts in fixed order, with a legend and a table view. */
export function VerdictMixTrend({ runs }: { runs: Run[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-2" aria-hidden>
        {VERDICTS.map((v) => <span key={v} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--${v}-mark)` }} />{VERDICT_LABEL[v]}</span>)}
      </div>
      <div className="flex flex-col gap-2.5" role="img" aria-label={`Verdict mix across ${runs.length} scoring runs`}>
        {runs.map((r) => (
          <div key={r.id} className="grid grid-cols-[104px_minmax(0,1fr)_44px] items-center gap-3">
            <span className="text-[12px] text-muted" title={r.model}>{fmtDateTime(r.at)}</span>
            <div className="flex h-5 gap-[2px] overflow-hidden rounded-[5px]">
              {VERDICTS.map((v) => (r.mix[v] ? (
                <span key={v} className="block h-full transition-opacity hover:opacity-80" style={{ flex: r.mix[v], background: `var(--${v}-mark)` }} title={`${VERDICT_LABEL[v]}: ${r.mix[v]} of ${r.total} URLs (${fmtDate(r.at)}, ${r.model})`} />
              ) : null))}
            </div>
            <span className="mono text-right text-[12px] text-muted">{r.total}</span>
          </div>
        ))}
      </div>
      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-muted">Show as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tbl min-w-[560px]">
            <thead><tr><th>Run</th>{VERDICTS.map((v) => <th key={v} className="r">{VERDICT_LABEL[v]}</th>)}<th className="r">Total</th></tr></thead>
            <tbody>{runs.map((r) => <tr key={r.id}><td>{fmtDate(r.at)} <span className="text-muted">· {r.model}</span></td>{VERDICTS.map((v) => <td key={v} className="r num">{r.mix[v] ?? 0}</td>)}<td className="r num">{r.total}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Magnitude over time: organic clicks a month for each uploaded Search Console period. One series, so no legend. */
export function ClicksTrend({ periods }: { periods: Period[] }) {
  // Include the previous period from the oldest upload when the export used Compare.
  const points: { label: string; value: number; derived?: boolean }[] = [];
  const first = periods[0];
  if (first?.prevClicksMonth != null) points.push({ label: 'Previous period', value: first.prevClicksMonth, derived: true });
  for (const p of periods) points.push({ label: `${fmtDate(p.start)} – ${fmtDate(p.end)}`, value: p.clicksMonth });
  const max = Math.max(1, ...points.map((p) => p.value));
  const last = points[points.length - 1];
  const prior = points[points.length - 2];
  const change = last && prior && prior.value ? Math.round(((last.value - prior.value) / prior.value) * 100) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className="display num text-[40px] leading-none">{fmt(last?.value)}</span>
        <span className="text-[13px] text-muted">clicks a month{change != null ? <>, <span className={change >= 0 ? 'text-ok' : 'text-bad'}>{change >= 0 ? 'up' : 'down'} {Math.abs(change)}%</span> on the period before</> : ''}</span>
      </div>
      <div className="flex h-36 items-end gap-3 border-b border-line" role="img" aria-label={points.map((p) => `${p.label}: ${p.value} clicks a month`).join('; ')}>
        {points.map((p, i) => (
          <div key={p.label} className="group relative flex h-full flex-1 flex-col justify-end">
            <span className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-full hidden whitespace-nowrap rounded-md bg-inverse px-2 py-1 text-[11.5px] text-white group-hover:block">{fmt(p.value)} · {p.label}</span>
            <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(3, (p.value / max) * 100)}%`, background: i === points.length - 1 ? 'var(--accent)' : p.derived ? 'repeating-linear-gradient(135deg, var(--chart-bar) 0 3px, transparent 3px 6px)' : 'var(--chart-bar)' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-3">{points.map((p) => <span key={p.label} className="flex-1 truncate text-center text-[11px] text-muted" title={p.label}>{p.label}</span>)}</div>
    </div>
  );
}
