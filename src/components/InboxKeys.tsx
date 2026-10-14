'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function Key({ k }: { k: string }) {
  return <kbd className="mono inline-grid min-w-5 place-items-center rounded-md border border-line bg-surface px-1 text-[11px] text-ink-2 shadow-[var(--shadow-sm)]">{k}</kbd>;
}

/**
 * Keyboard triage for the decision inbox: J/K or arrows move, A approves, R rejects, C opens "Change".
 * Ignored while typing in a field, and when a modifier key is held.
 */
export function InboxKeys({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || document.querySelector('dialog[open], [aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const click = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && el.getClientRects().length && !(el as HTMLButtonElement).disabled) { e.preventDefault(); el.click(); }
      };
      switch (e.key) {
        case 'j': if (nextHref) { e.preventDefault(); router.push(nextHref); } break;
        case 'k': if (prevHref) { e.preventDefault(); router.push(prevHref); } break;
        case 'a': click('[data-key="approve"]'); break;
        case 'r': click('[data-key="reject"]'); break;
        case 'c': {
          const d = document.querySelector<HTMLDetailsElement>('[data-key="change"]');
          if (d && d.getClientRects().length) { e.preventDefault(); d.open = true; d.querySelector<HTMLElement>('select')?.focus(); }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, prevHref, nextHref]);

  return (
    <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted lg:flex" aria-label="Keyboard shortcuts">
      <span className="flex items-center gap-1.5"><Key k="J" /><Key k="K" /> move</span>
      <span className="flex items-center gap-1.5"><Key k="A" /> approve</span>
      <span className="flex items-center gap-1.5"><Key k="R" /> reject</span>
      <span className="flex items-center gap-1.5"><Key k="C" /> change</span>
    </div>
  );
}
