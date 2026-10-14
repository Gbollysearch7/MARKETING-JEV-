'use client';

import { useState } from 'react';

/** Copies the current text of a textarea (including any edits) so it can be pasted into the profile. */
export function CopyButton({ targetId, label = 'Copy' }: { targetId: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = async () => {
    const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
      setState('done');
    } catch {
      el.select();
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button type="button" className="btn btn-sm" onClick={copy} aria-live="polite">
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Selected, press Ctrl+C' : label}
    </button>
  );
}
