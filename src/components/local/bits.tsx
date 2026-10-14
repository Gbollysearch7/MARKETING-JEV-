import type { ReactNode } from 'react';

/** Small presentational pieces shared by the Local SEO pages. Tokens only, so dark mode works. */

export type Tone = 'ok' | 'warn' | 'bad' | 'leave' | 'accent';

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  leave: 'bg-sunken text-ink-2',
  accent: 'bg-accent-soft text-accent-strong',
};
export const TEXT_TONE: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', leave: 'text-ink-2', accent: 'text-accent' };

export function Tag({ tone = 'leave', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONE[tone]}`}>{children}</span>;
}

export function Stars({ n }: { n: number }) {
  return (
    <span role="img" aria-label={`${n} out of 5 stars`} className={`tracking-[1px] ${n <= 2 ? 'text-bad' : n === 3 ? 'text-warn' : 'text-ink'}`}>
      {'★'.repeat(n)}<span className="text-line-strong">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export const healthTone = (score: number): Tone => (score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'bad');
export const healthWord = (score: number) => (score >= 80 ? 'Healthy' : score >= 60 ? 'Needs attention' : 'At risk');

/** A thin bar for a 0 to 100 value. */
export function Bar({ value, tone = 'accent', label }: { value: number; tone?: Tone; label?: string }) {
  const bg = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : tone === 'leave' ? 'var(--leave-mark)' : 'var(--accent)';
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-sunken" role={label ? 'img' : undefined} aria-label={label}>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: bg }} />
    </span>
  );
}

export function Delta({ v, digits = 0, suffix = '' }: { v: number | null; digits?: number; suffix?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-faint">—</span>;
  const r = Number(v.toFixed(digits));
  if (r === 0) return <span className="num text-muted">no change</span>;
  return <span className={`num ${r > 0 ? 'text-ok' : 'text-bad'}`}>{r > 0 ? '+' : '−'}{Math.abs(r).toFixed(digits)}{suffix}</span>;
}
