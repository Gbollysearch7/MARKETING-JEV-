import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDateTime, PageTitle, Section, StatusBadge } from '@/components/ui';
import { CsvUploadForm } from '@/components/gate/CsvUploadForm';
import { pctOf, SplitBar } from '@/components/gate/bits';
import { batchJob, listBatches, SOURCE_LABEL } from '@/lib/modules/gate';
import { checkOnePageAction, checkUrlsAction, loadGateSampleAction } from '@/lib/modules/gate-actions';
import { providerInfo } from '@/lib/provider';

const TABS = [
  { key: 'csv', label: 'CSV' },
  { key: 'urls', label: 'Sitemap or URLs' },
  { key: 'paste', label: 'One page' },
  { key: 'api', label: 'API' },
] as const;

function SampleButton({ siteId, primary }: { siteId: string; primary?: boolean }) {
  return (
    <form action={loadGateSampleAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <SubmitButton className={`btn ${primary ? 'btn-primary' : ''} h-11`} pending="Loading sample…">Load sample data</SubmitButton>
    </form>
  );
}

export default async function Gate({ params, searchParams }: PageProps<'/sites/[id]/gate'>) {
  const { id } = await params;
  const { site } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const tab = TABS.some((t) => t.key === sp.in) ? sp.in! : 'csv';
  const batches = listBatches(id);
  const running = batches.find((b) => b.status === 'running' || b.status === 'queued');
  const runningJob = running ? batchJob(running) : null;
  const done = batches.filter((b) => b.status === 'done');
  const totals = done.reduce((t, b) => ({ index: t.index + b.counts.index, improve: t.improve + b.counts.improve, kill: t.kill + b.counts.kill }), { index: 0, improve: 0, kill: 0 });
  const scored = totals.index + totals.improve + totals.kill;
  const toPause = done.flatMap((b) => b.templates.filter((t) => t.pause).map((t) => ({ b, t })));
  const live = providerInfo().live;
  const base = `/sites/${id}/gate`;

  return (
    <div className="flex flex-col gap-6">
      {sp.deleted && <Toast message="Batch deleted" />}
      <PageTitle
        title="Quality gate"
        sub="Score generated pages before they ship. Each page gets Index, Improve or Kill with its three strongest reasons, and any template where more than 40% of pages would be killed is flagged to pause."
        actions={<SampleButton siteId={id} />}
      />

      {running && runningJob && runningJob.status === 'running' && (
        <Link href={`${base}/${running.id}`} className="block">
          <JobProgress jobId={runningJob.id} initial={runningJob} label={`Scoring “${running.name}”`} />
        </Link>
      )}

      {done.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
          <div className="card px-5 py-4"><div className="label">Pages scored</div><div className="display num mt-1 text-[38px] leading-none">{fmt(scored)}</div><div className="mt-1 text-[12.5px] text-muted">across {done.length} batch{done.length === 1 ? '' : 'es'}</div></div>
          <div className="card px-5 py-4"><div className="label">Index</div><div className="display num mt-1 text-[38px] leading-none text-ok">{pctOf(totals.index, scored)}</div><div className="mt-1 text-[12.5px] text-muted">{fmt(totals.index)} pages ready to publish</div></div>
          <div className="card px-5 py-4"><div className="label">Improve</div><div className="display num mt-1 text-[38px] leading-none text-warn">{pctOf(totals.improve, scored)}</div><div className="mt-1 text-[12.5px] text-muted">{fmt(totals.improve)} pages to fix first</div></div>
          <div className="card px-5 py-4"><div className="label">Kill</div><div className="display num mt-1 text-[38px] leading-none text-bad">{pctOf(totals.kill, scored)}</div><div className="mt-1 text-[12.5px] text-muted">{fmt(totals.kill)} pages not to publish</div></div>
        </div>
      )}

      {toPause.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-inverse px-6 py-5 text-white" aria-label="Templates to pause">
          <h2 className="text-[17px] font-semibold">Pause {toPause.length === 1 ? 'this template' : `these ${toPause.length} templates`} before they ship</h2>
          <ul className="flex flex-col gap-1.5 text-[14px] text-white/75">
            {toPause.slice(0, 5).map(({ b, t }) => (
              <li key={`${b.id}-${t.template}`}>
                <Link href={`${base}/${b.id}`} className="underline decoration-white/30 underline-offset-2 hover:decoration-white"><span className="mono text-white">{t.template}</span> in “{b.name}”</Link>: {pctOf(t.counts.kill, t.pages)} Kill, most often “{t.topFailureLabel?.toLowerCase()}”.
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section title="Check pages" sub={live ? 'Decisions by Jev. Hard rules (placeholder text, exact duplicates) decide in code without a model call.' : 'Offline mock in use: set TYPESAFE_API_KEY for live Jev decisions.'}>
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-6">
          <nav aria-label="How to send pages" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const on = t.key === tab;
              return (
                <Link key={t.key} href={`${base}${t.key === 'csv' ? '' : `?in=${t.key}`}`} aria-current={on ? 'page' : undefined}
                  className={`flex min-h-9 items-center rounded-full border px-3.5 text-[13.5px] ${on ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line-strong bg-surface hover:border-ink-2'}`}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {sp.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{sp.error}</p>}

          {tab === 'csv' && <CsvUploadForm siteId={id} />}

          {tab === 'urls' && (
            <form action={checkUrlsAction} className="flex flex-col gap-4">
              <input type="hidden" name="siteId" value={id} />
              <label className="flex flex-col gap-1.5">
                <span className="label">Sitemap URL</span>
                <input name="sitemap" type="url" className="input mono" placeholder={site.sitemap_url ?? `https://${site.domain}/sitemap.xml`} />
              </label>
              <p className="text-[12.5px] text-muted">Or leave the sitemap empty and list page URLs, one per line. Pages are fetched and their main text extracted; up to 500 pages per batch. The target query is taken from Search Console when the site has it.</p>
              <label className="flex flex-col gap-1.5">
                <span className="label">Page URLs</span>
                <textarea name="urls" rows={5} className="input mono min-h-[120px] py-2 text-[12.5px]" placeholder={`https://${site.domain}/walks/keswick\nhttps://${site.domain}/walks/ambleside`} />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[220px] flex-1 flex-col gap-1.5"><span className="label">Batch name (optional)</span><input name="name" className="input" /></label>
                <SubmitButton className="btn btn-primary h-11" pending="Starting…">Fetch and score</SubmitButton>
              </div>
            </form>
          )}

          {tab === 'paste' && (
            <form action={checkOnePageAction} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="siteId" value={id} />
              <label className="flex flex-col gap-1.5"><span className="label">Title</span><input name="title" required className="input" placeholder="Walks in Keswick: five routes for every ability" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Target query</span><input name="query" className="input" placeholder="walks in keswick" /></label>
              <label className="flex flex-col gap-1.5 md:col-span-2"><span className="label">Page body (text or HTML)</span><textarea name="body" required rows={8} className="input min-h-[180px] py-2" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">URL or slug (optional)</span><input name="url" className="input mono" placeholder="/walks/keswick" /></label>
              <div className="flex items-end justify-end"><SubmitButton className="btn btn-primary h-11" pending="Checking…">Check this page</SubmitButton></div>
            </form>
          )}

          {tab === 'api' && (
            <div className="flex flex-col gap-3 text-[14px]">
              <p>Send pages from your build or publishing pipeline and get one verdict per page back in the response.</p>
              <pre className="mono overflow-x-auto rounded-xl bg-sunken px-4 py-3 text-[12.5px] leading-relaxed">{`POST /api/sites/${id}/gate/check
Content-Type: application/json

{ "name": "October location pages",
  "pages": [ { "url": "/walks/keswick", "title": "Walks in Keswick",
               "h1": "Walks in Keswick", "body": "<p>…</p>",
               "target_query": "walks in keswick", "template": "walks" } ] }`}</pre>
              <p className="text-muted">The response has <span className="mono">verdict</span>, <span className="mono">confidence</span>, <span className="mono">reasons</span>, <span className="mono">fixes</span> and the code checks for each page, plus the template report. Up to 500 pages per request. For now the API uses your signed-in session; API keys for CMS webhooks (WordPress, Webflow) are coming.</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Batches" sub="Newest first. Open a batch for the template report and every page’s reasons.">
        {batches.length === 0 ? (
          <Empty title="No batches yet">
            <p>Upload a CSV of generated pages, point the gate at a sitemap, or try it on a sample batch of location pages.</p>
            <div className="mt-4 flex justify-center"><SampleButton siteId={id} primary /></div>
          </Empty>
        ) : (
          <table className="tbl min-w-[760px]">
            <thead><tr><th>Batch</th><th className="r">Pages</th><th className="w-[30%]">Index · Improve · Kill</th><th>Templates</th><th>Status</th></tr></thead>
            <tbody>
              {batches.map((b) => {
                const n = b.counts.index + b.counts.improve + b.counts.kill;
                const paused = b.templates.filter((t) => t.pause);
                return (
                  <tr key={b.id}>
                    <td>
                      <Link href={`${base}/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                      <div className="text-[12.5px] text-muted">{SOURCE_LABEL[b.source]} · {fmtDateTime(b.created_at)}</div>
                    </td>
                    <td className="r num">{fmt(b.page_count)}</td>
                    <td>
                      {n ? (
                        <div className="flex flex-col gap-1.5">
                          <SplitBar counts={b.counts} />
                          <span className="num text-[12.5px] text-muted"><span className="text-ok">{b.counts.index}</span> · <span className="text-warn">{b.counts.improve}</span> · <span className="text-bad">{b.counts.kill}</span></span>
                        </div>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td>
                      {paused.length ? <span className="inline-flex rounded-full bg-bad-bg px-2 py-0.5 text-[11.5px] font-medium text-bad">Pause {paused.map((t) => t.template).join(', ')}</span>
                        : b.templates.length ? <span className="text-[13px] text-muted">{b.templates.length} template{b.templates.length === 1 ? '' : 's'}, none to pause</span> : <span className="text-faint">—</span>}
                    </td>
                    <td><StatusBadge s={b.status === 'queued' ? 'running' : b.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
