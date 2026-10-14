import type { BuyingStage, KeywordIntent } from '@/lib/modules/contracts';
import { INTENT_LABEL, STAGE_LABEL } from '@/modules/keywords/battery';

/** Intent reuses the semantic palette: learn = refresh blue, compare = merge violet, buy = expand teal, local = redirect amber, junk = prune red. */
const INTENT_TOKEN: Record<KeywordIntent, string> = {
  informational: 'refresh', commercial: 'merge', transactional: 'expand', navigational: 'leave', local: 'redirect', junk: 'prune',
};

export function IntentBadge({ intent, size = 'md' }: { intent: KeywordIntent | null; size?: 'sm' | 'md' }) {
  if (!intent) return <span className="text-faint">—</span>;
  const t = INTENT_TOKEN[intent];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-0.5 text-[12.5px]'}`} style={{ color: `var(--${t})`, background: `var(--${t}-bg)` }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${t}-mark)` }} />
      {INTENT_LABEL[intent]}
    </span>
  );
}

export function StageText({ stage }: { stage: BuyingStage | null }) {
  return stage ? <span className="whitespace-nowrap">{STAGE_LABEL[stage]}</span> : <span className="text-faint">—</span>;
}

export function GapPill() {
  return <span className="inline-flex whitespace-nowrap rounded-full bg-warn-bg px-2.5 py-0.5 text-[12px] font-medium text-warn">Gap: new page needed</span>;
}

export function CannibalPill({ n }: { n: number }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ color: 'var(--merge)', background: 'var(--merge-bg)' }}>
      Cannibalised · {n + 1} pages
    </span>
  );
}

/** Probability of the chosen option, toned by the review thresholds (0.85 auto, 0.60 review). */
export function Conf({ p }: { p: number | null }) {
  if (p == null) return <span className="text-faint">—</span>;
  const tone = p >= 0.85 ? 'text-ok' : p >= 0.6 ? 'text-ink-2' : 'text-warn';
  return <span className={`num mono text-[12.5px] ${tone}`} title={p >= 0.85 ? 'Confident' : p >= 0.6 ? 'Worth a glance' : 'Uncertain: check this one'}>{p.toFixed(2)}</span>;
}
