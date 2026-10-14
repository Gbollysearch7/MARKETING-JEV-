import type { ReactNode } from 'react';
import { segment } from '@/modules/visibility/parse';
import { REASON_LABEL } from '@/modules/visibility/rules';
import { ENGINE_LABEL, OWNER_LABEL, POSITION_LABEL, SOURCE_LABEL, type Engine, type LossReason, type Owner, type Position, type Router, type Sentiment, type SourceType, type Span } from '@/modules/visibility/types';

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);

/** Change in percentage points, coloured by direction. */
export function Delta({ now, before, suffix = 'pts' }: { now: number | null; before: number | null; suffix?: string }) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 1000) / 10;
  if (d === 0) return <span className="text-muted">no change</span>;
  return <span className={d > 0 ? 'text-ok' : 'text-bad'}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} {suffix}</span>;
}

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap';

export function EngineChip({ e }: { e: Engine }) {
  return <span className={`${pill} border border-line bg-surface text-ink-2`}>{ENGINE_LABEL[e]}</span>;
}

const REASON_TONE: Record<LossReason, string> = {
  no_page_covers: 'refresh', not_cited_by_trusted_sources: 'expand', competitor_third_party: 'merge', weak_entity: 'leave', blocked_or_walled: 'prune',
};

export function ReasonBadge({ r }: { r: LossReason | null }) {
  if (!r) return <span className="text-[12.5px] text-faint">Not explained yet</span>;
  const t = REASON_TONE[r];
  return (
    <span className={`${pill} gap-1.5`} style={{ color: `var(--${t})`, background: `var(--${t}-bg)` }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${t}-mark, var(--${t}))` }} />
      {REASON_LABEL[r]}
    </span>
  );
}

export function OwnerBadge({ o }: { o: Owner | null }) {
  if (!o) return null;
  const cls = o === 'technical' ? 'bg-warn-bg text-warn' : o === 'pr' ? 'bg-accent-soft text-accent-strong' : 'bg-ok-bg text-ok';
  return <span className={`${pill} ${cls}`}>{OWNER_LABEL[o]}</span>;
}

export function SentimentBadge({ s, conf }: { s: Sentiment | null; conf?: number | null }) {
  if (!s) return <span className="text-[12px] text-faint">—</span>;
  const cls = s === 'positive' ? 'bg-ok-bg text-ok' : s === 'negative' ? 'bg-bad-bg text-bad' : 'bg-sunken text-ink-2';
  return <span className={`${pill} ${cls}`} title={conf != null ? `Probability ${conf.toFixed(2)}` : undefined}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

export function PositionBadge({ p }: { p: Position }) {
  const cls = p === 'first' ? 'bg-ok-bg text-ok' : p === 'early' ? 'bg-accent-soft text-accent-strong' : p === 'late' ? 'bg-warn-bg text-warn' : 'bg-sunken text-muted';
  return <span className={`${pill} ${cls}`}>{POSITION_LABEL[p]}</span>;
}

export function RouterNote({ r }: { r: Router | null }) {
  if (!r) return null;
  const label = r === 'auto' ? 'Confident' : r === 'review' ? 'Check' : 'Uncertain';
  const cls = r === 'auto' ? 'text-ok' : r === 'review' ? 'text-warn' : 'text-muted';
  return <span className={`text-[11.5px] ${cls}`}>{label}</span>;
}

export function SourceChip({ t, n }: { t: SourceType; n?: number }) {
  return <span className={`${pill} bg-sunken text-ink-2`}>{SOURCE_LABEL[t]}{n != null ? <span className="num ml-1 text-muted">{n}</span> : null}</span>;
}

/** A horizontal bar for a 0..1 value. */
export function Bar({ v, tone = 'var(--accent)', label }: { v: number | null; tone?: string; label?: string }) {
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-sunken" role="img" aria-label={label ?? pct(v)}>
      <span className="block h-full rounded-full" style={{ width: `${Math.round((v ?? 0) * 100)}%`, background: tone }} />
    </span>
  );
}

/**
 * The answer as plain text with brand and competitor mentions marked. Text is split into React text nodes,
 * so nothing in a captured answer is ever interpreted as HTML.
 */
export function HighlightedAnswer({ text, spans }: { text: string; spans: Span[] }): ReactNode {
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink-2">
      {segment(text, spans).map((s, i) => s.span ? (
        <mark key={i} className={`rounded-[4px] px-0.5 ${s.span.kind === 'brand' ? 'bg-ok-bg font-medium text-ok' : 'bg-warn-bg text-warn'}`} title={s.span.kind === 'brand' ? 'Your brand' : `Competitor: ${s.span.label}`}>{s.text}</mark>
      ) : <span key={i}>{s.text}</span>)}
    </p>
  );
}
