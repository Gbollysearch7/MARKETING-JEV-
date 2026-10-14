'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

/** CSV file or pasted CSV text, posted to the gate upload route; opens the new batch when it starts scoring. */
export function CsvUploadForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/gate/upload`, { method: 'POST', body: new FormData(e.currentTarget) });
      const json = (await res.json()) as { batchId?: string; error?: string; billing?: boolean };
      if (json.billing) { router.push('/billing'); return; }
      if (!res.ok || !json.batchId) { setError(json.error ?? 'The upload failed. Check the file and try again.'); setBusy(false); return; }
      router.push(`/sites/${siteId}/gate/${json.batchId}`);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="label" id="gate-file-label">CSV file</span>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-4">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()} aria-describedby="gate-file-label">Choose file</button>
            <span className="mono min-w-0 truncate text-[13px] text-muted">{fileName ?? 'No file chosen'}</span>
            <input ref={file} name="file" type="file" accept=".csv,.tsv,.txt,text/csv" hidden aria-label="CSV file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          </div>
          <p className="text-[12.5px] text-muted">Columns, any order: <span className="mono">url</span> or <span className="mono">slug</span>, <span className="mono">title</span>, <span className="mono">h1</span>, <span className="mono">meta description</span>, <span className="mono">body</span> (text or HTML), <span className="mono">target query</span>, <span className="mono">template</span>. Up to 500 pages.</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="label">Or paste CSV text</span>
          <textarea name="csv" rows={5} className="input mono min-h-[118px] py-2 text-[12.5px]" placeholder={'url,title,h1,body,target query\n/walks/keswick,Walks in Keswick,…'} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="label">Batch name (optional)</span>
          <input name="name" className="input" placeholder="e.g. Location pages, October run" />
        </label>
        <button className="btn btn-primary h-11" disabled={busy} aria-busy={busy}>
          {busy ? <><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />Uploading…</> : 'Score this batch'}
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{error}</p>}
    </form>
  );
}
