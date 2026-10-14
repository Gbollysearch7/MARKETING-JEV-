'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';

type Result = { file: string; ok: boolean; message: string; notes?: string[] };

export function UploadCard({ siteId, slot, title, accept, multiple, help, current, ready }: {
  siteId: string; slot: string; title: string; accept: string; multiple?: boolean; help: ReactNode; current: ReactNode; ready?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || inFlight.current) return;
    if (!multiple && list.length > 1) {
      setResults([{ file: title, ok: false, message: 'Choose one file at a time for this source.' }]);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setResults([]);
    const fd = new FormData();
    fd.set('slot', slot);
    for (const f of list) fd.append('file', f);
    try {
      const res = await fetch(`/api/sites/${siteId}/upload`, { method: 'POST', body: fd });
      const json = await res.json();
      setResults(json.results ?? [{ file: list[0].name, ok: false, message: json.error ?? 'Upload failed' }]);
      router.refresh();
    } catch {
      setResults([{ file: list[0].name, ok: false, message: 'Could not complete the import. Check your connection and try uploading the file again.' }]);
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div
      className={`card flex flex-col p-5 transition-colors ${drag ? 'border-accent bg-accent-soft' : ''}`}
      aria-busy={busy}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void send(e.dataTransfer.files); }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">{title}
          {ready !== undefined && <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${ready ? 'bg-ok-bg text-ok' : 'bg-sunken text-muted'}`}><span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-ok' : 'bg-[var(--line-input)]'}`} />{ready ? 'Ready' : 'Missing'}</span>}
        </h3>
        <button type="button" aria-label={busy ? `Importing ${title}` : `Upload ${title}`} className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Importing…' : 'Upload'}
        </button>
        <input aria-label={`${title} file`} ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => e.target.files && void send(e.target.files)} />
      </div>
      <div className="mt-1 text-[13px] text-muted">{help}</div>
      <div className="mt-3 border-t border-line pt-3 text-[13px]">{current}</div>
        <ul className={results.length ? 'mt-3 space-y-1.5 text-[13px]' : ''} aria-live="polite" aria-atomic="true">
          {results.map((r) => (
            <li key={r.file} className={r.ok ? 'text-ok' : 'text-bad'}>
              <span className="font-medium">{r.file}:</span> {r.message}
              {r.notes?.map((n) => <span key={n} className="block text-muted">{n}</span>)}
            </li>
          ))}
        </ul>
      <p className="mt-auto pt-3 text-[12px] text-muted">Or drop files anywhere on this card.</p>
    </div>
  );
}
