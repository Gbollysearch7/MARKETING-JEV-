import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Empty, fmt, fmtDateTime, PageTitle, qs, Section } from '@/components/ui';
import { GATE_BAR, GateBadge, pctOf, SplitBar } from '@/components/gate/bits';
import { PageDetail } from '@/components/gate/PageDetail';
import { batchJob, batchTemplates, getBatch, getGatePage, indexedWithoutImpressions, listGatePages, SOURCE_LABEL } from '@/lib/modules/gate';
import { deleteBatchAction, rescoreBatchAction } from '@/lib/modules/gate-actions';
import { GATE_LABEL, type GateVerdict } from '@/modules/gate/types';

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' }, { key: 'index', label: 'Index' }, { key: 'improve', label: 'Improve' }, { key: 'kill', label: 'Kill' },
];

export default async function Batch({ params, searchParams }: PageProps<'/sites/[id]/gate/[bid]'>) {
  const { id, bid } = await params;
  await requireSite(id);
  const batch = getBatch(bid);
  if (!batch || batch.site_id !== id) notFound();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const job = batchJob(batch);
  const running = batch.status === 'running' || batch.status === 'queued';
  const flagged = indexedWithoutImpressions(id, batch);
  const filter = { verdict: sp.verdict, template: sp.template, q: sp.q, flag: sp.flag };
  const rows = listGatePages(batch.id, filter, flagged, true);
  const all = batch.counts.index + batch.counts.improve + batch.counts.kill;
  const tpls = batchTemplates(batch.id);
  const base = `/sites/${id}/gate/${batch.id}`;
  const keep = { verdict: sp.verdict, template: sp.template, q: sp.q, flag: sp.flag };
  const requested = sp.p ? getGatePage(sp.p) : null;
  const selected = requested && requested.batch_id === batch.id ? requested : null;
  const filtered = Boolean(sp.verdict || sp.template || sp.q || sp.flag);
  const paused = batch.templates.filter((t) => t.pause);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/sites/${id}/gate`} className="-mb-3 text-[13.5px] font-medium text-accent">← All batches</Link>
      <PageTitle
        title={batch.name}
        sub={<>{SOURCE_LABEL[batch.source]} · {fmtDateTime(batch.created_at)}{batch.model ? <> · {batch.model === 'mock' ? 'offline mock' : batch.model === 'rules' ? 'hard rules only' : batch.model}</> : null}{batch.avg_ms != null ? <> · <span className="num">{batch.avg_ms < 1000 ? `${batch.avg_ms} ms` : `${(batch.avg_ms / 1000).toFixed(1)} s`}</span> per page</> : null}</>}
        actions={
          <>
            {batch.status === 'done' && <a className="btn h-11" href={`/api/sites/${id}/gate/${batch.id}/export`} download>Export CSV</a>}
            {!running && (
              <form action={rescoreBatchAction}>
                <input type="hidden" name="batchId" value={batch.id} />
                <SubmitButton className="btn h-11" pending="Starting…">Score again</SubmitButton>
              </form>
            )}
            <form action={deleteBatchAction}>
              <input type="hidden" name="batchId" value={batch.id} />
              <SubmitButton className="btn btn-ghost btn-danger h-11" pending="Deleting…">Delete</SubmitButton>
            </form>
          </>
        }
      />

      {running && job && <JobProgress jobId={job.id} initial={job} label={`Scoring ${batch.page_count ? `${fmt(batch.page_count)} pages` : 'pages'}`} />}
      {batch.status === 'failed' && <p role="alert" className="card border-bad/30 px-5 py-4 text-bad">Scoring failed: {batch.error}</p>}
      {batch.notes.length > 0 && <ul className="flex flex-col gap-1 text-[13px] text-muted">{batch.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3">
        <div className="card px-5 py-4"><div className="label">Pages</div><div className="display num mt-1 text-[38px] leading-none">{fmt(batch.page_count)}</div><div className="mt-1 text-[12.5px] text-muted">{tpls.length} template{tpls.length === 1 ? '' : 's'}</div></div>
        {(['index', 'improve', 'kill'] as GateVerdict[]).map((v) => (
          <Link key={v} href={`${base}${qs({ ...keep, verdict: v })}`} className="card px-5 py-4 transition-shadow hover:shadow-[var(--shadow-lg)]">
            <div className="label flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: GATE_BAR[v] }} />{GATE_LABEL[v]}</div>
            <div className={`display num mt-1 text-[38px] leading-none ${v === 'index' ? 'text-ok' : v === 'improve' ? 'text-warn' : 'text-bad'}`}>{fmt(batch.counts[v])}</div>
            <div className="mt-1 text-[12.5px] text-muted">{pctOf(batch.counts[v], all)} of scored pages</div>
          </Link>
        ))}
        {flagged.size > 0 && (
          <Link href={`${base}?flag=no_impressions`} className="card px-5 py-4 transition-shadow hover:shadow-[var(--shadow-lg)]">
            <div className="label">Indexed, no impressions</div>
            <div className="display num mt-1 text-[38px] leading-none text-warn">{fmt(flagged.size)}</div>
            <div className="mt-1 text-[12.5px] text-muted">in later Search Console data</div>
          </Link>
        )}
      </div>

      {paused.map((t) => (
        <section key={t.template} className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-inverse px-6 py-5 text-white sm:px-7" aria-label={`Pause template ${t.template}`}>
          <div className="flex min-w-[min(260px,100%)] flex-1 flex-col gap-1.5">
            <span className="mono text-[13px] text-white/70">Template {t.template} · {fmt(t.pages)} pages</span>
            <h2 className="text-[21px] font-bold leading-tight">Pause this template before it ships</h2>
            <p className="text-white/75">{pctOf(t.counts.kill, t.pages)} of its pages would be killed, above the 40% limit. Most common failure: {t.topFailureLabel?.toLowerCase()} ({t.topFailurePages} pages). Fix the template, then score the batch again.</p>
          </div>
          <div className="flex min-w-[min(240px,100%)] flex-1 flex-col gap-2">
            <SplitBar counts={t.counts} className="h-3.5" />
            <div className="num flex flex-wrap gap-x-4 text-[12.5px] text-white/75"><span>Index {t.counts.index}</span><span>Improve {t.counts.improve}</span><span>Kill {t.counts.kill}</span></div>
          </div>
        </section>
      ))}

      {batch.templates.length > 0 && (
        <Section title="Template report" sub="A template with more than 40% Kill should be paused before any page ships.">
          <table className="tbl min-w-[720px]">
            <thead><tr><th>Template</th><th className="r">Pages</th><th className="w-[26%]">Split</th><th className="r">Index</th><th className="r">Improve</th><th className="r">Kill</th><th>Most common failure</th><th>Recommendation</th></tr></thead>
            <tbody>
              {batch.templates.map((t) => (
                <tr key={t.template}>
                  <td><Link className="mono hover:underline" href={`${base}${qs({ template: t.template })}`}>{t.template}</Link></td>
                  <td className="r num">{fmt(t.pages)}</td>
                  <td className="align-middle"><SplitBar counts={t.counts} /></td>
                  <td className="r num">{pctOf(t.counts.index, t.pages)}</td>
                  <td className="r num">{pctOf(t.counts.improve, t.pages)}</td>
                  <td className={`r num ${t.pause ? 'font-semibold text-bad' : ''}`}>{pctOf(t.counts.kill, t.pages)}</td>
                  <td>{t.topFailureLabel ? <>{t.topFailureLabel} <span className="num text-muted">({t.topFailurePages})</span></> : <span className="text-faint">None</span>}</td>
                  <td>{t.pause ? <span className="inline-flex rounded-full bg-bad-bg px-2 py-0.5 text-[11.5px] font-semibold text-bad">Pause this template</span> : <span className="inline-flex rounded-full bg-ok-bg px-2 py-0.5 text-[11.5px] font-medium text-ok">OK to ship</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <div className="flex flex-col gap-3">
        <nav aria-label="Filter by verdict" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = (sp.verdict ?? '') === f.key && !sp.flag;
            const n = f.key ? batch.counts[f.key as GateVerdict] : batch.page_count;
            return (
              <Link key={f.key || 'all'} href={`${base}${qs({ template: sp.template, q: sp.q, verdict: f.key || undefined })}`} aria-current={on ? 'true' : undefined}
                className={`flex min-h-9 items-center rounded-full border px-3.5 text-[13.5px] ${on ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line-strong bg-surface hover:border-ink-2'}`}>
                {f.label} <span className="num ml-1.5 opacity-70">{fmt(n)}</span>
              </Link>
            );
          })}
          {flagged.size > 0 && (
            <Link href={`${base}${qs({ flag: 'no_impressions' })}`} aria-current={sp.flag ? 'true' : undefined}
              className={`flex min-h-9 items-center rounded-full border px-3.5 text-[13.5px] ${sp.flag ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line-strong bg-surface hover:border-ink-2'}`}>
              Indexed, no impressions <span className="num ml-1.5 opacity-70">{flagged.size}</span>
            </Link>
          )}
        </nav>
        <form key={JSON.stringify(keep)} className="flex flex-wrap items-center gap-2">
          {sp.verdict && <input type="hidden" name="verdict" value={sp.verdict} />}
          {sp.flag && <input type="hidden" name="flag" value={sp.flag} />}
          <input name="q" defaultValue={sp.q} placeholder="URL or title contains" className="input w-56 max-w-full" aria-label="URL or title contains" />
          {tpls.length > 1 && (
            <select name="template" defaultValue={sp.template ?? ''} className="select" aria-label="Template">
              <option value="">All templates</option>
              {tpls.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <button className="btn">Apply</button>
          {filtered && <Link href={base} className="text-[13px] text-muted underline">Clear filters</Link>}
        </form>
      </div>

      <div className={`grid items-start gap-4 ${selected ? 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]' : ''}`}>
        <section className="card min-w-0 overflow-hidden" aria-label="Results">
          {rows.length === 0 ? (
            <Empty title={running && !all ? 'Scoring in progress' : 'No matching pages'}>
              {running && !all ? 'Results appear here as soon as the batch finishes.' : <Link className="underline" href={base}>Clear your filters</Link>}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className={`tbl ${selected ? 'min-w-[600px]' : 'min-w-[720px]'}`}>
                <thead><tr><th>Page</th><th>Verdict</th><th className="r">Confidence</th><th>Strongest reason and first fix</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const on = r.id === selected?.id;
                    return (
                      <tr key={r.id} className={on ? '[&>td]:bg-selected' : ''}>
                        <td className="max-w-[260px]">
                          <Link href={`${base}${qs(keep, { p: r.id })}`} aria-current={on ? 'true' : undefined} className="mono block truncate text-[13px] font-medium hover:underline" title={r.path}>{r.path}</Link>
                          <span className="block truncate text-[12.5px] text-muted">{r.title || 'No title'}</span>
                          {flagged.has(r.path) && <span className="mt-1 inline-flex rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">Indexed but not earning impressions</span>}
                        </td>
                        <td><GateBadge v={r.verdict} size="sm" /></td>
                        <td className="r num">{r.verdict ? (r.model === 'rules' ? <span className="text-[12.5px] text-muted">Rule</span> : r.confidence.toFixed(2)) : '—'}</td>
                        <td className="text-[13.5px] text-ink-2">
                          {r.reasons[0] ?? <span className="text-faint">—</span>}
                          {r.verdict && r.verdict !== 'index' && r.fixes[0] && <span className="mt-0.5 block text-[12.5px] text-muted"><span className="font-medium text-ink-2">Fix:</span> {r.fixes[0]}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {selected && (
          <div className="order-first min-w-0 xl:sticky xl:top-6 xl:order-none">
            <PageDetail p={selected} siteId={id} batchId={batch.id} closeHref={`${base}${qs(keep)}`} flagged={flagged.has(selected.path)} />
          </div>
        )}
      </div>
    </div>
  );
}
