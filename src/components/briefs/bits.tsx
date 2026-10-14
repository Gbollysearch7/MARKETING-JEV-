import type { Go, Router } from '@/modules/briefs/types';
import { GO_LABEL } from '@/modules/briefs/assemble';

const GO_TONE: Record<Go, string> = { create: 'bg-ok-bg text-ok', expand_existing: 'bg-[var(--expand-bg)] text-[var(--expand)]', skip: 'bg-sunken text-ink-2' };

export function GoBadge({ go, size = 'md' }: { go: Go; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 self-start rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-0.5 text-[12.5px]'} ${GO_TONE[go]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {GO_LABEL[go]}
    </span>
  );
}

const ROUTER: Record<Router, [string, string]> = {
  auto: ['High confidence', 'bg-ok-bg text-ok'],
  review: ['Needs review', 'bg-warn-bg text-warn'],
  uncertain: ['Uncertain', 'bg-sunken text-ink-2 border border-dashed border-[var(--line-input)]'],
};

export function Confidence({ p, router }: { p: number; router: Router }) {
  const [label, cls] = ROUTER[router];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="num mono text-[12.5px] text-ink-2" title="Probability of the chosen option">{p.toFixed(2)}</span>
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded-md bg-sunken px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2">{children}</span>;
}
