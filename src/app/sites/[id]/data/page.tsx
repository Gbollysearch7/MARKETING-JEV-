import Link from 'next/link';
import { JobProgress } from '@/components/JobProgress';
import { UploadCard } from '@/components/UploadCard';
import { Empty, fmt, fmtDate, fmtDateTime, Pager, PageTitle, qs, Section } from '@/components/ui';
import { deleteUploadAction, loadSamplesAction, startCrawlAction } from '@/lib/actions';
import { getSite, latestUploads, listUploads, listUrls, runningJob, templates, type Upload } from '@/lib/repo';

const KIND_LABEL: Record<string, string> = { gsc_pages: 'Search Console pages', gsc_queries: 'Page and query data', ga4: 'GA4 landing pages', crawl: 'Crawl', backlinks: 'Backlinks' };
const SIZE = 50;

function Current({ u, empty }: { u?: Upload; empty: string }) {
  if (!u) return <span className="text-faint">{empty}</span>;
  return (
    <div>
      <div className="font-medium">{u.filename}</div>
      <div className="text-muted">
        {fmt(u.row_count)} rows{u.period_start ? ` · ${fmtDate(u.period_start)} to ${fmtDate(u.period_end)}` : ''} · {u.source === 'sample' ? 'sample data' : `added ${fmtDateTime(u.created_at)}`}
      </div>
      {u.notes.map((n) => <div key={n} className="mt-1 text-[12.5px] text-muted">{n}</div>)}
    </div>
  );
}

export default async function DataPage({ params, searchParams }: PageProps<'/sites/[id]/data'>) {
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const site = getSite(id)!;
  const latest = latestUploads(id);
  const all = listUploads(id);
  const running = runningJob(id);
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = listUrls(id, { q: sp.q, template: sp.template, sort: sp.sort, limit: SIZE, offset: (page - 1) * SIZE });
  const tpls = templates(id);
  const filters = { q: sp.q, template: sp.template, sort: sp.sort };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Data"
        sub="Upload exports from Search Console, GA4, your crawler and your backlink tool. Everything is joined by URL path. Nothing connects to Google yet, so no Google approval is needed."
        actions={all.length === 0 ? (
          <form action={loadSamplesAction}><input type="hidden" name="siteId" value={id} /><button className="btn">Load sample data</button></form>
        ) : null}
      />

      {running && <JobProgress jobId={running.id} initial={running} label={running.type === 'crawl' ? 'Crawling sitemap' : 'Scoring URLs'} />}

      <div className="grid gap-4 md:grid-cols-2">
        <UploadCard
          siteId={id} slot="gsc" title="Search Console" accept=".zip,.csv,.tsv,.txt" multiple
          help={<>Performance &gt; Export &gt; Download CSV gives a zip. Turn on <b>Compare</b> first so decay shows. For more than 1,000 pages or for cannibalisation, also upload a page and query CSV from Looker Studio, BigQuery or Search Analytics for Sheets.</>}
          current={<div className="space-y-2"><Current u={latest.gsc_pages} empty="No pages export yet" /><Current u={latest.gsc_queries} empty="No page and query data yet" /></div>}
        />
        <UploadCard
          siteId={id} slot="ga4" title="GA4" accept=".csv"
          help={<>Reports &gt; Engagement &gt; Landing page, then Share &gt; Download file &gt; CSV. Sessions and key events protect converting pages from being pruned.</>}
          current={<Current u={latest.ga4} empty="No GA4 export yet" />}
        />
        <div className="card flex flex-col p-4">
          <h3 className="font-semibold">Crawl</h3>
          <p className="mt-1 text-[13px] text-muted">Crawl the sitemap here, up to 10,000 pages. For bigger sites, upload a Screaming Frog &quot;Internal: HTML&quot; or Sitebulb export instead.</p>
          <form action={startCrawlAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="siteId" value={id} />
            <input name="sitemap" type="url" required defaultValue={site.sitemap_url ?? `https://${site.domain}/sitemap.xml`} className="input min-w-[220px] flex-1" aria-label="Sitemap URL" />
            <input name="limit" type="number" min={1} max={10000} defaultValue={500} className="input w-24" aria-label="Page limit" />
            <button className="btn" disabled={Boolean(running)}>Crawl</button>
          </form>
          <div className="mt-3 border-t border-line pt-3 text-[13px]"><Current u={latest.crawl} empty="No crawl yet" /></div>
        </div>
        <UploadCard
          siteId={id} slot="crawl" title="Crawler export" accept=".csv,.tsv,.txt"
          help={<>Screaming Frog: Internal tab, filter HTML, Export. Sitebulb: URLs export. Gives status codes, canonicals, word counts and inlinks.</>}
          current={<span className="text-muted">Replaces the crawl above when uploaded.</span>}
        />
        <UploadCard
          siteId={id} slot="backlinks" title="Backlinks (optional)" accept=".csv,.tsv,.txt"
          help={<>Ahrefs Site Explorer &gt; Best by links, or Semrush Indexed pages. Referring domains decide Redirect versus Prune.</>}
          current={<Current u={latest.backlinks} empty="No backlinks export yet" />}
        />
      </div>

      <Section
        title="URLs"
        sub={`${fmt(total)} URLs after joining the latest uploads.`}
        actions={
          <form className="flex flex-wrap gap-2">
            <input name="q" defaultValue={sp.q} placeholder="Filter by path or title" className="input w-56" />
            <select name="template" defaultValue={sp.template ?? ''} className="select">
              <option value="">All templates</option>
              {tpls.map((t) => <option key={t.template} value={t.template}>{t.template} ({t.n})</option>)}
            </select>
            <select name="sort" defaultValue={sp.sort ?? 'clicks'} className="select">
              <option value="clicks">Most clicks</option><option value="impressions">Most impressions</option><option value="sessions">Most sessions</option><option value="position">Best position</option><option value="path">Path A to Z</option>
            </select>
            <button className="btn">Apply</button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <Empty title="No URLs yet">Upload a Search Console export or crawl the sitemap.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>URL path</th><th className="r">Clicks</th><th className="r">Prev clicks</th><th className="r">Impr.</th><th className="r">Pos.</th>
                  <th className="r">Sessions</th><th className="r">Conv.</th><th className="r">Status</th><th className="r">Words</th><th className="r">Inlinks</th><th className="r">Ref. domains</th><th>Modified</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.path}>
                    <td className="max-w-[340px]">
                      <div className="truncate font-medium" title={r.path}>{r.path}</div>
                      {r.title && <div className="truncate text-[12.5px] text-muted" title={r.title}>{r.title}</div>}
                    </td>
                    <td className="r num">{fmt(r.clicks)}</td>
                    <td className="r num text-muted">{fmt(r.prev_clicks)}</td>
                    <td className="r num">{fmt(r.impressions)}</td>
                    <td className="r num">{fmt(r.position, 1)}</td>
                    <td className="r num">{fmt(r.sessions)}</td>
                    <td className="r num">{fmt(r.conversions)}</td>
                    <td className="r num">{r.status == null ? '—' : <span className={r.status >= 300 || r.indexable === 0 ? 'text-warn' : ''}>{r.status}{r.indexable === 0 ? ' noindex' : ''}</span>}</td>
                    <td className="r num">{fmt(r.word_count)}</td>
                    <td className="r num">{fmt(r.inlinks)}</td>
                    <td className="r num">{fmt(r.referring_domains)}</td>
                    <td className="whitespace-nowrap text-muted">{r.last_modified ? fmtDate(r.last_modified) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager total={total} page={page} size={SIZE} href={(p) => `/sites/${id}/data${qs(filters, { page: p })}`} />
      </Section>

      {all.length > 0 && (
        <Section title="Upload history" sub="Older uploads stay here so outcomes can compare periods.">
          <table className="tbl">
            <thead><tr><th>Type</th><th>File</th><th>Period</th><th className="r">Rows</th><th>Added</th><th /></tr></thead>
            <tbody>
              {all.map((u) => (
                <tr key={u.id}>
                  <td>{KIND_LABEL[u.kind]}</td>
                  <td className="max-w-[280px] truncate" title={u.filename}>{u.filename}{u.source === 'sample' && <span className="ml-2 rounded bg-sunken px-1.5 text-[11px] text-muted">sample</span>}</td>
                  <td className="whitespace-nowrap text-muted">{u.period_start ? `${fmtDate(u.period_start)} to ${fmtDate(u.period_end)}` : '—'}</td>
                  <td className="r num">{fmt(u.row_count)}</td>
                  <td className="text-muted">{fmtDateTime(u.created_at)}</td>
                  <td className="r">
                    <form action={deleteUploadAction}><input type="hidden" name="siteId" value={id} /><input type="hidden" name="uploadId" value={u.id} /><button className="btn btn-sm">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <p className="text-[12.5px] text-muted">Ready? <Link href={`/sites/${id}`} className="underline">Go to Overview</Link> and score every URL.</p>
    </div>
  );
}
