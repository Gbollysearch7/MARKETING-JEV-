'use client';

import { useState } from 'react';

/** Copies the brief's Markdown to the clipboard and confirms in place. */
export function CopyMarkdown({ markdown, className = 'btn h-10' }: { markdown: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(markdown);
          setState('copied');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2400);
      }}
    >
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked by the browser' : 'Copy as Markdown'}</span>
    </button>
  );
}
