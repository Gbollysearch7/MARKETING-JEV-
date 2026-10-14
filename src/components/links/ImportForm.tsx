'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Result = { waiting?: number; added: number; duplicates: number; alreadyLinking: number; kind: string; notes: string[]; purpose: string; scoring: boolean; inactive: boolean };
const KIND: Record<string, string> = { ahrefs: 'Ahrefs backlinks export', semrush: 'Semrush backlinks export', generic: 'prospect list' };

/** Upload a CSV or paste one: competitor backlinks, a prospect list, or the site's own link profile. */
export function ImportForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [purpose, setPurpose] = useState<'prospects' | 'own_profile'>('prospects');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (mode === 'file') fd.delete('text'); else fd.delete('file');
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/links/upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({ error: res.status === 413 ? 'That file is too large. Export fewer rows or split it.' : `The import failed (HTTP ${res.status}). Try again, or paste the rows instead.` }));
      if (!res.ok) setError(json.error ?? 'Import failed.');
      else {
        setResult(json as Result);
        form.reset();
        setFileName('');
        router.refresh();
      }
    } catch {
      setError('Could not complete the import. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const tab = (on: boolean) => `flex min-h-9 items-center rounded-full border px-3.5 text-[13.5px] ${on ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line-strong bg-surface hover:border-ink-2'}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 py-5 sm:px-6" aria-busy={busy}>
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">What are you importing?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3.5 ${purpose === 'prospects' ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'}`}>
            <span className="flex items-center gap-2 font-medium"><input type="radio" name="purpose" value="prospects" checked={purpose === 'prospects'} onChange={() => setPurpose('prospects')} />Prospects to pitch</span>
            <span className="pl-6 text-[12.5px] text-muted">A competitor&apos;s Ahrefs or Semrush backlinks export, or your own list (url, title, snippet, DR, traffic).</span>
          </label>
          <label className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3.5 ${purpose === 'own_profile' ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'}`}>
            <span className="flex items-center gap-2 font-medium"><input type="radio" name="purpose" value="own_profile" checked={purpose === 'own_profile'} onChange={() => setPurpose('own_profile')} />Your link profile</span>
            <span className="pl-6 text-[12.5px] text-muted">A backlinks or referring-domains export of your own site. Marks prospects that already link and feeds the disavow review.</span>
          </label>
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="links-source" className="label">{purpose === 'own_profile' ? 'Name this export' : 'Source name'}</label>
        <input id="links-source" name="source" className="input max-w-md" maxLength={80} placeholder={purpose === 'own_profile' ? 'e.g. Ahrefs, October' : 'e.g. Competitor: peakgear.example'} />
      </div>
      <div className="flex gap-1.5" role="group" aria-label="How to add the CSV">
        <button type="button" className={tab(mode === 'file')} aria-pressed={mode === 'file'} onClick={() => setMode('file')}>Upload a file</button>
        <button type="button" className={tab(mode === 'paste')} aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>Paste CSV</button>
      </div>
      {mode === 'file' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-5">
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>Choose CSV</button>
          <span className="mono min-w-0 break-all text-[13px] text-muted">{fileName || 'No file chosen. CSV or TSV, up to 2,000 rows per upload.'}</span>
          <input ref={fileRef} name="file" type="file" accept=".csv,.tsv,.txt,text/csv" hidden aria-label="CSV file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="links-text" className="label">CSV text, with a header row</label>
          <textarea id="links-text" name="text" rows={6} className="input mono h-auto py-2 text-[12.5px]" placeholder={'url,title,snippet,dr,traffic\nhttps://blog.example/best-tents,Best tents,Our pick of tents…,42,5100'} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy || (mode === 'file' && !fileName)}>
          {busy ? <><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />Importing…</> : 'Import and score'}
        </button>
        <span className="text-[12.5px] text-muted">Duplicates of pages you already have are skipped.</span>
      </div>
      <div aria-live="polite">
        {error && <p className="rounded-xl bg-bad-bg px-3.5 py-2.5 text-[13.5px] text-bad">{error}</p>}
        {result && (
          <div className="flex flex-col gap-1 rounded-xl bg-ok-bg px-3.5 py-2.5 text-[13.5px] text-ok">
            <span className="font-medium">
              Read as {KIND[result.kind] ?? result.kind}: {result.added.toLocaleString('en-GB')} added
              {result.duplicates ? `, ${result.duplicates.toLocaleString('en-GB')} already in your list` : ''}
              {result.alreadyLinking && result.purpose !== 'own_profile' ? `, ${result.alreadyLinking.toLocaleString('en-GB')} from domains that already link to you` : ''}.
            </span>
            {result.notes.map((n) => <span key={n}>{n}</span>)}
            <span>{result.scoring ? 'Scoring has started; progress shows at the top of the page.' : result.inactive ? 'Choose a plan in Billing to score them.' : result.waiting ? `Not scored yet: ${result.waiting.toLocaleString('en-GB')} prospects are waiting. Choose how many to score at the top of the page.` : ''}</span>
          </div>
        )}
      </div>
    </form>
  );
}
