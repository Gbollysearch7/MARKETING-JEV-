import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Router, Verdict } from '@/engine/verdict/types';

export const VERDICT_LABEL: Record<Verdict, string> = { refresh: 'Refresh', expand: 'Expand', merge: 'Merge', redirect: 'Redirect', prune: 'Prune', leave: 'Leave' };
export const VERDICT_MEANING: Record<Verdict, string> = {
  refresh: 'Keep URL, update content',
  expand: 'Keep URL, add depth',
  merge: 'Combine into a stronger sibling',
  redirect: '301 to the best match',
  prune: 'Remove and 410',
  leave: 'No action',
};

export function VerdictBadge({ v, size = 'md' }: { v: Verdict | null; size?: 'sm' | 'md' }) {
  if (!v) return <span className="text-faint">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-md font-medium ${size === 'sm' ? 'px-1.5 py-0.5 text-[11.5px]' : 'px-2 py-0.5 text-[12.5px]'}`}
      style={{ color: `var(--${v})`, background: `var(--${v}-bg)` }}
    >
      {VERDICT_LABEL[v]}
    </span>
  );
}

export const ROUTER_LABEL: Record<Router, string> = { auto: 'Auto', review: 'Needs review', uncertain: 'Uncertain' };

export function RouterBadge({ r }: { r: Router | null }) {
  if (!r) return null;
  const cls = r === 'auto' ? 'bg-ok-bg text-ok' : r === 'review' ? 'bg-warn-bg text-warn' : 'bg-sunken text-muted border border-dashed border-line-strong';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${cls}`}>{ROUTER_LABEL[r]}</span>;
}

export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    proposed: 'bg-sunken text-muted', approved: 'bg-ok-bg text-ok', rejected: 'bg-bad-bg text-bad',
    todo: 'bg-sunken text-muted', in_progress: 'bg-warn-bg text-warn', done: 'bg-ok-bg text-ok', cancelled: 'bg-sunken text-faint',
    worked: 'bg-ok-bg text-ok', neutral: 'bg-sunken text-muted', backfired: 'bg-bad-bg text-bad',
    running: 'bg-warn-bg text-warn', failed: 'bg-bad-bg text-bad',
  };
  const label: Record<string, string> = { in_progress: 'In progress', todo: 'To do' };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${map[s] ?? 'bg-sunken text-muted'}`}>{label[s] ?? s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

/** Probability as a number plus a thin bar, so a column of them scans quickly. */
export function Prob({ p, color = 'var(--ink)' }: { p: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-9 text-right">{p.toFixed(2)}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken">
        <span className="block h-full rounded-full" style={{ width: `${Math.round(p * 100)}%`, background: color }} />
      </span>
    </span>
  );
}

export function Impact({ low, high }: { low: number; high: number }) {
  if (low === 0 && high === 0) return <span className="text-faint">—</span>;
  const f = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;
  return <span className="num whitespace-nowrap">{f(low)} to {f(high)}</span>;
}

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function PageTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, sub, children, actions, className = '' }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {sub && <p className="text-[13px] text-muted">{sub}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <div className="card h-full px-4 py-3.5 transition-colors hover:border-line-strong">
      <div className="label">{label}</div>
      <div className="num mt-1 text-[22px] font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-muted">{children}</div>}
    </div>
  );
}

export function Pager({ total, page, size, href }: { total: number; page: number; size: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
      <span className="num">{fmt((page - 1) * size + 1)}–{fmt(Math.min(total, page * size))} of {fmt(total)}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn btn-sm" href={href(page - 1)}>Previous</Link> : <span className="btn btn-sm opacity-40">Previous</span>}
        {page < pages ? <Link className="btn btn-sm" href={href(page + 1)}>Next</Link> : <span className="btn btn-sm opacity-40">Next</span>}
      </div>
    </div>
  );
}

/** Build a query string from the current filters plus overrides, dropping empty values. */
export function qs(base: Record<string, string | undefined>, over: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
