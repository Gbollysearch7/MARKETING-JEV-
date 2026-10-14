import type { ReactNode } from 'react';
import { VERDICT_LABEL } from '@/components/ui';
import type { Verdict } from '@/engine/verdict/types';

export const pct = (x: number | null | undefined, digits = 0) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);

export const HUMAN_LABEL = (h: string) => (h === 'rejected' ? 'Rejected' : VERDICT_LABEL[h as Verdict] ?? h);

/** A proportion with its 95% interval, or a plain "not enough" when there is nothing to show. */
export function Interval({ p, low, high, n }: { p: number; low: number; high: number; n: number }) {
  if (!n) return <span className="text-faint">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="num">{pct(p)}</span>
      <span className="num ml-1.5 text-[12px] text-muted">{pct(low)}–{pct(high)}</span>
    </span>
  );
}

/** Agreement as a bar with its interval shaded, on a 0–100% scale with an optional target line. */
export function AgreementBar({ p, low, high, n, color = 'var(--accent)', target }: { p: number; low: number; high: number; n: number; color?: string; target?: number }) {
  if (!n) return <div className="h-2 w-full rounded-full bg-sunken" aria-hidden />;
  return (
    <div className="relative h-2 w-full min-w-[90px] rounded-full bg-sunken" role="img" aria-label={`${pct(p)} agreement, 95% interval ${pct(low)} to ${pct(high)}`}>
      <div className="absolute h-full rounded-full opacity-30" style={{ left: `${low * 100}%`, width: `${(high - low) * 100}%`, background: color }} />
      <div className="absolute h-full rounded-full" style={{ width: `${p * 100}%`, background: color }} />
      {target != null && <div className="absolute -top-1 h-4 w-px bg-ink" style={{ left: `${target * 100}%` }} />}
    </div>
  );
}

/** Small-sample warning, shown wherever a figure rests on fewer than 30 items. */
export function SampleNote({ n, min, what }: { n: number; min: number; what: string }) {
  if (n >= min) return null;
  return (
    <div className="rounded-xl bg-warn-bg px-4 py-3 text-[13px] text-warn">
      {n === 0 ? `No ${what} yet.` : `Not enough ${what} yet: ${n} of the ${min} needed before these figures mean much.`} The ranges show how wide the uncertainty still is.
    </div>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'warn' }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : '';
  return (
    <div className="card px-5 py-4">
      <div className="label">{label}</div>
      <div className={`display num mt-1 text-[38px] leading-none ${c}`}>{value}</div>
      {sub && <div className="mt-1 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}

/** Model verdicts down the side, the person's answer across the top. Agreement on the diagonal. */
export function Matrix({ rows, cols, m, rowTitle, colTitle }: { rows: readonly string[]; cols: readonly string[]; m: number[][]; rowTitle: string; colTitle: string }) {
  const total = m.flat().reduce((s, x) => s + x, 0);
  return (
    <table className="tbl min-w-[640px]">
      <caption className="sr-only">{rowTitle} by {colTitle}</caption>
      <thead>
        <tr><th scope="col">{rowTitle} ↓ · {colTitle} →</th>{cols.map((c) => <th key={c} scope="col" className="r">{HUMAN_LABEL(c)}</th>)}<th scope="col" className="r">Total</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r}>
            <td className="whitespace-nowrap font-medium">
              <span className="inline-flex items-center gap-2"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `var(--${r}-mark)` }} />{HUMAN_LABEL(r)}</span>
            </td>
            {cols.map((c, j) => {
              const v = m[i][j];
              const cls = !v ? 'text-faint' : r === c ? 'bg-ok-bg text-ok font-semibold' : 'bg-warn-bg text-warn';
              return <td key={c} className={`r num ${cls}`}>{v || '·'}</td>;
            })}
            <td className="r num text-muted">{m[i].reduce((s, x) => s + x, 0)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td className="text-muted">Total</td>{cols.map((c, j) => <td key={c} className="r num text-muted">{m.reduce((s, row) => s + row[j], 0)}</td>)}<td className="r num">{total}</td></tr></tfoot>
    </table>
  );
}

export interface CalRow { low: number; high: number; n: number; meanP: number | null; observed: number | null; gap: number | null }

/** Calibration as a table, each row with a bar for observed agreement and a tick at the stated probability. */
export function CalibrationTable({ rows, unit }: { rows: CalRow[]; unit: string }) {
  return (
    <table className="tbl min-w-[620px]">
      <thead><tr><th>Stated probability</th><th className="r">{unit}</th><th className="r">Mean stated</th><th className="r">Observed agreement</th><th className="r">Gap</th><th className="w-[200px]"><span className="sr-only">Chart</span></th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.low} className={r.n ? '' : 'text-faint'}>
            <td className="mono text-[12.5px]">{r.low.toFixed(1)}–{r.high.toFixed(1)}</td>
            <td className="r num">{r.n || '·'}</td>
            <td className="r num">{r.meanP == null ? '—' : r.meanP.toFixed(2)}</td>
            <td className="r num">{r.observed == null ? '—' : pct(r.observed)}</td>
            <td className={`r num ${r.gap == null ? '' : Math.abs(r.gap) <= 0.1 ? 'text-ok' : 'text-bad'}`}>{r.gap == null ? '—' : `${r.gap > 0 ? '+' : ''}${(r.gap * 100).toFixed(0)} pts`}</td>
            <td>
              {r.n > 0 && r.meanP != null && r.observed != null && (
                <div className="relative h-2.5 w-full rounded-full bg-sunken" role="img" aria-label={`Stated ${r.meanP.toFixed(2)}, observed ${pct(r.observed)}`}>
                  <div className="absolute h-full rounded-full bg-accent" style={{ width: `${r.observed * 100}%` }} />
                  <div className="absolute -top-1 h-[18px] w-[3px] rounded-full bg-ink" style={{ left: `calc(${r.meanP * 100}% - 1px)` }} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CsvLink({ href, children = 'CSV' }: { href: string; children?: ReactNode }) {
  return <a className="btn btn-sm" href={href} download>{children}</a>;
}
