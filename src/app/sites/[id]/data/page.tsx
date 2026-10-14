import { requireSite } from '@/lib/auth';
import Link from 'next/link';
import { JobProgress } from '@/components/JobProgress';
import { CrawlForm } from '@/components/SiteForms';
import { SubmitButton } from '@/components/SubmitButton';
import { UploadCard } from '@/components/UploadCard';
import { GoogleCard, GOOGLE_MESSAGES } from '@/components/google/GoogleCard';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDate, fmtDateTime, Pager, PageTitle, qs, Section } from '@/components/ui';
import { deleteUploadAction, loadSamplesAction } from '@/lib/actions';
import { getSite, latestUploads, listUploads, listUrls, runningJob, templates, type Upload } from '@/lib/repo';

const SOURCE_TAG: Record<string, string> = { sample: 'sample', google_api: 'Google' };
const KIND_LABEL: Record<string, string> = { gsc_pages: 'Search Console pages', gsc_queries: 'Page and query data', ga4: 'GA4 landing pages', crawl: 'Crawl', backlinks: 'Backlinks' };
const SIZE = 50;

function Current({ u, empty }: { u?: Upload; empty: string }) {
  if (!u) return <span className="text-faint">{empty}</span>;
  return (
    <div>
      <div className="font-medium">{u.filename}</div>
      <div className="text-muted">
        {fmt(u.row_count)} rows{u.period_start ? ` · ${fmtDate(u.period_start)} to ${fmtDate(u.period_end)}` : ''} · {u.source === 'google_api' ? `synced from Google ${fmtDateTime(u.created_at)}` : u.source === 'sample' ? 'sample data' : `added ${fmtDateTime(u.created_at)}`}
      </div>
      {u.notes.map((n) => <div key={n} className="mt-1 text-[12.5px] text-muted">{n}</div>)}
    </div>
  );
}

export default async function DataPage({ params, searchParams }: PageProps<'/sites/[id]/data'>) {
  const { id } = await params;
  const { viewer } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const site = getSite(id)!;
  const latest = latestUploads(id);
  const all = listUploads(id);
  const running = runningJob(id);
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = listUrls(id, { q: sp.q, template: sp.template, sort: sp.sort, limit: SIZE, offset: (page - 1) * SIZE });
  const tpls = templates(id);
  const filters = { q: sp.q, template: sp.template, sort: sp.sort };
  const googleMsg = sp.google ? GOOGLE_MESSAGES[sp.google] : undefined;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Data"
        sub="Start with a Search Console export or a site crawl. Add analytics and backlinks to strengthen your recommendations."
        actions={all.length === 0 ? (
          <form action={loadSamplesAction}><input type="hidden" name="siteId" value={id} /><SubmitButton pending="Loading…">Load sample data</SubmitButton></form>
        ) : null}
      />

      {googleMsg && <Toast key={sp.google} message={googleMsg.text} tone={googleMsg.tone} />}
      {running && running.type !== 'google_sync' && <JobProgress key={running.id} jobId={running.id} initial={running} label={running.type === 'crawl' ? 'Crawling sitemap' : 'Scoring URLs'} />}

      <section aria-label="Data coverage" className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div><h2 className="font-semibold">{latest.gsc_pages || latest.gsc_queries || latest.crawl ? 'Ready to score' : 'First, import your pages'}</h2>
          <p className="mt-1 text-[13px] text-muted">{latest.gsc_pages || latest.gsc_queries || latest.crawl ? 'Review the joined URLs below before starting a scoring run.' : 'Choose Search Console or Crawl below. Other sources can be added later.'}</p>
          <p className="mt-1 text-[12px] text-muted">Analytics protects converting pages. Page-and-query data enables cannibalisation checks. Backlinks help identify valuable pages.</p>
        </div>
        {(latest.gsc_pages || latest.gsc_queries || latest.crawl) && <Link className="btn btn-primary" href={`/sites/${id}`}>Continue to scoring →</Link>}
      </section>
      <GoogleCard siteId={id} domain={site.domain} />
      <div className="grid gap-4 md:grid-cols-2">
        <UploadCard
          siteId={id} slot="gsc" title="Search Console" accept=".zip,.csv,.tsv,.txt" multiple ready={Boolean(latest.gsc_pages || latest.gsc_queries)}
          help={<>Performance &gt; Export &gt; Download CSV gives a zip. Turn on <b>Compare</b> first so decay shows. For more than 1,000 pages or for cannibalisation, also upload a page and query CSV from Looker Studio, BigQuery or Search Analytics for Sheets.</>}
          current={<div className="space-y-2"><Current u={latest.gsc_pages} empty="No pages export yet" /><Current u={latest.gsc_queries} empty="No page and query data yet" /></div>}
        />
        <UploadCard
          siteId={id} slot="ga4" title="GA4" accept=".csv" ready={Boolean(latest.ga4)}
          help={<>Reports &gt; Engagement &gt; Landing page, then Share &gt; Download file &gt; CSV. Sessions and key events protect converting pages from being pruned.</>}
          current={<Current u={latest.ga4} empty="No GA4 export yet" />}
        />
        <div className="card flex flex-col p-5">
          <h3 className="flex items-center gap-2 font-semibold">Crawl<span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${latest.crawl ? 'bg-ok-bg text-ok' : 'bg-sunken text-muted'}`}><span className={`h-1.5 w-1.5 rounded-full ${latest.crawl ? 'bg-ok' : 'bg-[var(--line-input)]'}`} />{latest.crawl ? 'Ready' : 'Missing'}</span></h3>
          <p className="mt-1 text-[13px] text-muted">Crawl the sitemap here, up to 10,000 pages. For bigger sites, upload a Screaming Frog &quot;Internal: HTML&quot; or Sitebulb export instead.</p>
          <CrawlForm siteId={id} sitemap={site.sitemap_url ?? `https://${site.domain}/sitemap.xml`} limit={Math.min(10000, viewer.status.urlLimit)} running={Boolean(running)} active={viewer.status.active} />
          <div className="mt-3 border-t border-line pt-3 text-[13px]"><Current u={latest.crawl} empty="No crawl yet" /></div>
        </div>
        <UploadCard
          siteId={id} slot="crawl" title="Crawler export" accept=".csv,.tsv,.txt"
          help={<>Screaming Frog: Internal tab, filter HTML, Export. Sitebulb: URLs export. Gives status codes, canonicals, word counts and inlinks.</>}
          current={<span className="text-muted">Replaces the crawl above when uploaded.</span>}
        />
        <UploadCard
          siteId={id} slot="backlinks" title="Backlinks (optional)" accept=".csv,.tsv,.txt" ready={Boolean(latest.backlinks)}
          help={<>Ahrefs Site Explorer &gt; Best by links, or Semrush Indexed pages. Referring domains decide Redirect versus Prune.</>}
          current={<Current u={latest.backlinks} empty="No backlinks export yet" />}
        />
      </div>

      <Section
        title="URLs"
        sub={`${fmt(total)} URLs after joining the latest uploads.`}
        actions={
          <form key={JSON.stringify(filters)} className="flex flex-wrap gap-2">
            <input name="q" defaultValue={sp.q} aria-label="Filter URLs by path or title" placeholder="Filter by path or title" className="input w-56" />
            <select aria-label="Page template" name="template" defaultValue={sp.template ?? ''} className="select">
              <option value="">All templates</option>
              {tpls.map((t) => <option key={t.template} value={t.template}>{t.template} ({t.n})</option>)}
            </select>
            <select aria-label="Sort URLs" name="sort" defaultValue={sp.sort ?? 'clicks'} className="select">
              <option value="clicks">Most clicks</option><option value="impressions">Most impressions</option><option value="sessions">Most sessions</option><option value="position">Best position</option><option value="path">Path A to Z</option>
            </select>
            <button className="btn">Apply</button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <Empty title={sp.q || sp.template ? "No matching URLs" : "No URLs yet"}>{sp.q || sp.template ? <Link href={`/sites/${id}/data`} className="underline">Clear filters</Link> : "Upload a Search Console export or crawl the sitemap."}</Empty>
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
                  <td className="max-w-[280px] truncate" title={u.filename}>{u.filename}{SOURCE_TAG[u.source] && <span className="ml-2 rounded bg-sunken px-1.5 text-[11px] text-muted">{SOURCE_TAG[u.source]}</span>}</td>
                  <td className="whitespace-nowrap text-muted">{u.period_start ? `${fmtDate(u.period_start)} to ${fmtDate(u.period_end)}` : '—'}</td>
                  <td className="r num">{fmt(u.row_count)}</td>
                  <td className="text-muted">{fmtDateTime(u.created_at)}</td>
                  <td className="r">
                    <form action={deleteUploadAction}><input type="hidden" name="siteId" value={id} /><input type="hidden" name="uploadId" value={u.id} /><details className="text-left"><summary className="cursor-pointer text-[12px] text-bad">Remove</summary><label className="mt-2 flex items-start gap-2 text-[12px] text-muted"><input type="checkbox" required />Permanently remove this upload. This cannot be undone.</label><SubmitButton className="btn btn-sm mt-2 text-bad" pending="Removing…">Remove upload</SubmitButton></details></form>
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
