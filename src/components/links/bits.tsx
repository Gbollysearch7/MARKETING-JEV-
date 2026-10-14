import type { LinkVerdict } from '@/modules/links/types';
import { VERDICT_LABEL } from '@/modules/links/types';

export const VERDICT_TONE: Record<LinkVerdict, { fg: string; bg: string; mark: string }> = {
  pursue: { fg: 'var(--ok)', bg: 'var(--ok-bg)', mark: 'var(--ok)' },
  skip: { fg: 'var(--leave)', bg: 'var(--leave-bg)', mark: 'var(--leave-mark)' },
  toxic: { fg: 'var(--bad)', bg: 'var(--bad-bg)', mark: 'var(--bad)' },
};

export function VerdictPill({ v, size = 'md' }: { v: LinkVerdict | null; size?: 'sm' | 'md' }) {
  if (!v) return <span className="inline-flex rounded-full bg-sunken px-2.5 py-0.5 text-[12px] font-medium text-muted">Not scored</span>;
  const t = VERDICT_TONE[v];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-0.5 text-[12.5px]'}`} style={{ color: t.fg, background: t.bg }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: t.mark }} />
      {VERDICT_LABEL[v]}
    </span>
  );
}

const LEVEL_CLS: Record<string, string> = { high: 'bg-ok-bg text-ok', medium: 'bg-warn-bg text-warn', low: 'bg-sunken text-ink-2' };
export function LevelBadge({ level, prefix }: { level: string | null; prefix?: string }) {
  if (!level) return null;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${LEVEL_CLS[level] ?? 'bg-sunken text-muted'}`}>{prefix ? `${prefix} ` : ''}{level}</span>;
}

const STATUS_CLS: Record<string, string> = { new: 'bg-sunken text-ink-2', contacted: 'bg-warn-bg text-warn', replied: 'bg-accent-soft text-accent-strong', won: 'bg-ok-bg text-ok', lost: 'bg-bad-bg text-bad' };
export function OutreachBadge({ s }: { s: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${STATUS_CLS[s] ?? 'bg-sunken text-muted'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

/** Path part of a URL for compact display. */
export function pathOf(url: string): string {
  try { const u = new URL(url); return (u.pathname + u.search) || '/'; } catch { return url; }
}
