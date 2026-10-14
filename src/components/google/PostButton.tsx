'use client';

import { useState, type ReactNode } from 'react';

/**
 * A plain HTML form POST (to a route handler) whose button shows progress while the browser navigates.
 * `confirm` adds a required checkbox before the button can be used.
 */
export function PostButton({ action, fields, children, pending, className = 'btn btn-sm', confirm }: {
  action: string; fields: Record<string, string>; children: ReactNode; pending: string; className?: string; confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form method="post" action={action} onSubmit={() => setBusy(true)} className={confirm ? 'flex flex-col items-start gap-2' : undefined}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {confirm && <label className="flex items-start gap-2 text-[12.5px] text-muted"><input type="checkbox" required className="mt-0.5" />{confirm}</label>}
      <button className={className} disabled={busy} aria-busy={busy}>
        {busy ? <><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />{pending}</> : children}
      </button>
    </form>
  );
}
