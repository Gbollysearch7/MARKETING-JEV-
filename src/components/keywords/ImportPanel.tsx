import { SubmitButton } from '@/components/SubmitButton';
import { fmt } from '@/components/ui';
import { importSearchConsoleAction, loadSampleKeywordsAction, pasteKeywordsAction } from '@/lib/modules/keywords-actions';
import { MAX_KEYWORDS } from '@/modules/keywords/input';
import { UploadKeywordsForm } from './UploadKeywordsForm';

/** Three ways in: upload, paste, or Search Console. Each import replaces the list and starts a run. */
export function ImportPanel({ siteId, gscQueries, busy }: { siteId: string; gscQueries: number | null; busy: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-[15px] font-semibold">Upload a CSV</h3>
            <p className="text-[13px] text-muted">Only a keyword column is required. Volume, CPC, current URL and position are used when present.</p>
          </div>
          <UploadKeywordsForm siteId={siteId} disabled={busy} />
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-[15px] font-semibold">Paste keywords</h3>
            <p className="text-[13px] text-muted">One per line, optionally with a volume after a comma, or paste a CSV with a header row.</p>
          </div>
          <form action={pasteKeywordsAction} className="flex flex-1 flex-col gap-3">
            <input type="hidden" name="siteId" value={siteId} />
            <label className="sr-only" htmlFor="kw-paste">Keywords</label>
            <textarea id="kw-paste" name="text" required rows={5} className="input min-h-[112px] flex-1 resize-y py-2 font-[inherit]" placeholder={'best hiking boots, 6600\nhow to clean hiking boots\nwild camping scotland'} />
            <SubmitButton className="btn btn-primary" pending="Importing…" disabled={busy}>Import and score</SubmitButton>
          </form>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-[15px] font-semibold">Import from Search Console</h3>
            <p className="text-[13px] text-muted">Uses your latest page and query upload. Impressions stand in for volume; the best-ranking page is kept as the current page.</p>
          </div>
          <div className="flex-1 rounded-xl bg-sunken px-4 py-3 text-[13px]">
            {gscQueries ? <><span className="display num text-[26px] leading-none">{fmt(gscQueries)}</span> <span className="text-muted">queries available</span></> : <span className="text-muted">No page and query upload yet. Add one on <a className="underline" href={`/sites/${siteId}/data`}>Data sources</a>.</span>}
          </div>
          <form action={importSearchConsoleAction}>
            <input type="hidden" name="siteId" value={siteId} />
            <SubmitButton className="btn w-full" pending="Importing…" disabled={busy || !gscQueries}>Import queries and score</SubmitButton>
          </form>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
        <p>Keywords are lowercased, trimmed and de-duplicated. Each run is capped at {fmt(MAX_KEYWORDS)} keywords for now (highest volume kept). Each import replaces the current list.</p>
        <form action={loadSampleKeywordsAction}>
          <input type="hidden" name="siteId" value={siteId} />
          <SubmitButton className="btn btn-sm btn-ghost" pending="Loading…" disabled={busy}>Load sample data</SubmitButton>
        </form>
      </div>
    </div>
  );
}
