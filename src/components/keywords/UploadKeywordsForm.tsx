'use client';

import { useState } from 'react';

/** A plain multipart POST to the upload route (works without JavaScript); shows progress once submitted. */
export function UploadKeywordsForm({ siteId, disabled }: { siteId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  return (
    <form action={`/api/sites/${siteId}/keywords/upload`} method="post" encType="multipart/form-data" onSubmit={() => setBusy(true)} className="flex flex-col gap-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center transition-colors hover:border-[var(--hover-border)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <span className="text-[14px] font-medium">{name || 'Choose a CSV or TSV file'}</span>
        <span className="text-[12.5px] text-muted">Your own list, Ahrefs, Semrush or Keyword Planner export</span>
        <input type="file" name="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" required className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? '')} />
      </label>
      <button className="btn btn-primary" disabled={disabled || busy || !name} aria-busy={busy}>
        {busy ? (<><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />Uploading…</>) : 'Upload and score'}
      </button>
    </form>
  );
}
