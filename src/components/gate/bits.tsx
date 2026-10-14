import { GATE_LABEL, GATE_TONE, type GateVerdict } from '@/modules/gate/types';

const TONE_CLASS = { ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad' } as const;
/** Chart fills: validated categorical marks with the same meaning (good, caution, bad). */
export const GATE_BAR: Record<GateVerdict, string> = { index: 'var(--expand-mark)', improve: 'var(--redirect-mark)', kill: 'var(--prune-mark)' };

export function GateBadge({ v, size = 'md' }: { v: GateVerdict | null; size?: 'sm' | 'md' }) {
  if (!v) return <span className="inline-flex rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-medium text-muted">Pending</span>;
  const tone = GATE_TONE[v];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${TONE_CLASS[tone]} ${size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-0.5 text-[12.5px]'}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: GATE_BAR[v] }} />
      {GATE_LABEL[v]}
    </span>
  );
}

export function RouterTag({ r }: { r: string | null }) {
  if (!r) return null;
  const label = r === 'auto' ? 'Auto' : r === 'review' ? 'Needs review' : 'Uncertain';
  const cls = r === 'auto' ? 'bg-ok-bg text-ok' : r === 'review' ? 'bg-warn-bg text-warn' : 'border border-dashed border-[var(--line-input)] bg-sunken text-ink-2';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${cls}`}>{label}</span>;
}

/** Index / Improve / Kill split as one thin bar, with an accessible summary. */
export function SplitBar({ counts, className = 'h-2' }: { counts: Record<GateVerdict, number>; className?: string }) {
  const total = counts.index + counts.improve + counts.kill;
  if (!total) return <span className={`block rounded-full bg-sunken ${className}`} aria-hidden />;
  return (
    <span role="img" aria-label={`${counts.index} Index, ${counts.improve} Improve, ${counts.kill} Kill`} className={`flex gap-0.5 overflow-hidden rounded-full ${className}`}>
      {(['index', 'improve', 'kill'] as GateVerdict[]).filter((v) => counts[v]).map((v) => <span key={v} style={{ flex: counts[v], background: GATE_BAR[v] }} />)}
    </span>
  );
}

export const pctOf = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');
