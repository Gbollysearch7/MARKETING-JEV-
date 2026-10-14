import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, PageTitle, Section } from '@/components/ui';
import { Confidence, GoBadge, Tag } from '@/components/briefs/bits';
import { clustersForImport, hasQueryData, listBriefs, listTargets, runningBriefJob, syncMeasured, type BriefItem, type BriefTarget } from '@/lib/modules/briefs';
import {
  addTargetAction, decideTargetsAction, deleteTargetAction, importClustersAction, loadSampleTargetsAction, moveBriefAction,
  pasteTargetsAction, setRelevanceAction, targetsFromSearchConsoleAction,
} from '@/lib/modules/briefs-actions';
import { FORMAT_LABEL, LENGTH_LABEL } from '@/modules/briefs/assemble';
import type { BriefStatus } from '@/modules/briefs/types';

const COLUMNS: { key: BriefStatus; label: string; empty: string }[] = [
  { key: 'proposed', label: 'Proposed', empty: 'New briefs land here after a decision run.' },
  { key: 'approved', label: 'Approved', empty: 'Approve a proposed brief to hand it to a writer.' },
  { key: 'writing', label: 'In writing', empty: 'Move a brief here when writing starts.' },
  { key: 'published', label: 'Published', empty: 'Add the live URL from the brief page.' },
  { key: 'measured', label: 'Measured', empty: 'Set automatically when a later Search Console upload shows the URL.' },
];

const TOASTS: Record<string, [string, 'ok' | 'bad']> = {
  added: ['Targets added', 'ok'], duplicate: ['That keyword is already a target', 'bad'], empty: ['Enter at least one keyword', 'bad'],
  none_new: ['No new targets found', 'bad'], sample: ['Sample targets loaded and being decided', 'ok'], deciding: ['Deciding targets. Progress is shown above.', 'ok'],
  nothing: ['Every target is already decided', 'ok'], busy: ['A decision run is already in progress', 'bad'], missing: ['Target not found', 'bad'],
  relevance: ['Relevance saved. Decide again to update the call.', 'ok'], deleted: ['Target removed', 'ok'], moved: ['Brief moved', 'ok'],
};

const SOURCE_LABEL: Record<BriefTarget['source'], string> = { manual: 'Typed', search_console: 'Search Console', cluster: 'Cluster', sample: 'Sample' };

function volumeOf(t: BriefTarget) {
  const known = t.keywords.filter((k) => k.volume != null);
  return known.length ? known.reduce((s, k) => s + (k.volume ?? 0), 0) : null;
}

function bestPage(t: BriefTarget): { path: string; position: number } | null {
  const ranked = t.keywords.filter((k) => k.path && k.position != null && k.position <= 20).sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  return ranked[0] ? { path: ranked[0].path!, position: ranked[0].position! } : null;
}

function SampleButton({ siteId, primary }: { siteId: string; primary?: boolean }) {
  return (
    <form action={loadSampleTargetsAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <SubmitButton className={`btn ${primary ? 'btn-primary' : ''} h-10`} pending="Loading…">Load sample data</SubmitButton>
    </form>
  );
}

function RelevanceSelect({ name = 'relevance', value = 3, id }: { name?: string; value?: number; id: string }) {
  return (
    <select id={id} name={name} defaultValue={value} className="select h-9 w-full">
      {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 5 ? '· core' : n === 1 ? '· off-topic' : ''}</option>)}
    </select>
  );
}

function BoardCard({ b, t, siteId }: { b: BriefItem; t: BriefTarget | undefined; siteId: string }) {
  const go = t?.decision?.go;
  const move = (status: BriefStatus, label: string, primary = false) => (
    <form action={moveBriefAction}>
      <input type="hidden" name="briefId" value={b.id} />
      <input type="hidden" name="from" value="board" />
      <SubmitButton className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-ghost'}`} name="status" value={status} pending="Moving…">{label}</SubmitButton>
    </form>
  );
  return (
    <article className="enter flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 shadow-[var(--shadow-sm)] hover:border-line-strong">
      <div className="flex flex-wrap items-center gap-1.5">
        {go && <GoBadge go={go.choice} size="sm" />}
        <Tag>{FORMAT_LABEL[b.content.format]}</Tag>
      </div>
      <Link href={`/sites/${siteId}/briefs/${b.id}`} className="font-semibold leading-snug hover:underline">{b.content.title}</Link>
      <div className="mono break-words text-[12px] text-muted">{t?.primary}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>{LENGTH_LABEL[b.content.length]}</span>
        {go && t?.decision && <Confidence p={go.p} router={t.decision.router} />}
      </div>
      {b.status === 'published' && <div className="rounded-lg bg-sunken px-2.5 py-1.5 text-[12px] text-ink-2"><span className="mono break-all">{b.published_path ?? b.published_url}</span><br />Waiting for a Search Console upload that shows this URL.</div>}
      {b.status === 'measured' && <div className="rounded-lg bg-ok-bg px-2.5 py-1.5 text-[12.5px] text-ok"><span className="num display text-[22px] leading-none">{fmt(b.measured_clicks_month)}</span> clicks a month</div>}
      <div className="-mx-1 flex flex-wrap gap-1 border-t border-line pt-2">
        {b.status === 'proposed' && move('approved', 'Approve', true)}
        {b.status === 'approved' && <>{move('writing', 'Start writing', true)}{move('proposed', 'Back')}</>}
        {b.status === 'writing' && <><Link className="btn btn-sm btn-primary" href={`/sites/${siteId}/briefs/${b.id}#publish`}>Add published URL</Link>{move('approved', 'Back')}</>}
        {(b.status === 'published' || b.status === 'measured') && move('writing', 'Back to writing')}
        <Link href={`/sites/${siteId}/briefs/${b.id}`} className="btn btn-sm btn-ghost">Open</Link>
      </div>
    </article>
  );
}

export default async function BriefsPage({ params, searchParams }: PageProps<'/sites/[id]/briefs'>) {
  const { id } = await params;
  const { viewer } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  syncMeasured(id);
  const targets = listTargets(id);
  const briefs = listBriefs(id);
  const running = runningBriefJob(id);
  const clusters = clustersForImport(id);
  const gapClusters = clusters.filter((c) => c.gap).length;
  const hasQ = hasQueryData(id);
  const byId = new Map(targets.map((t) => [t.id, t]));
  const briefByTarget = new Map(briefs.map((b) => [b.target_id, b]));
  const tab = sp.tab === 'targets' || sp.tab === 'queue' ? sp.tab : briefs.length ? 'queue' : 'targets';
  const pending = targets.filter((t) => t.stale || !t.decision).length;
  const skipped = targets.filter((t) => t.decision?.go.choice === 'skip' && !t.stale).length;
  const inProgress = briefs.filter((b) => ['proposed', 'approved', 'writing'].includes(b.status)).length;
  const live = briefs.filter((b) => b.status === 'published' || b.status === 'measured').length;
  const measuredClicks = briefs.filter((b) => b.status === 'measured').reduce((s, b) => s + (b.measured_clicks_month ?? 0), 0);
  const toast = sp.done ? TOASTS[sp.done] : null;
  const base = `/sites/${id}/briefs`;

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast key={`${sp.done}-${sp.n ?? ''}`} message={sp.done === 'added' && sp.n ? `${sp.n} target${sp.n === '1' ? '' : 's'} added` : toast[0]} tone={toast[1]} />}
      <PageTitle
        title="Brief desk"
        sub="For each target keyword, Jev decides whether to write at all and, if so, the format, angle and length. The brief, outline and links are then built from your own data."
        actions={targets.length > 0 && (
          <form action={decideTargetsAction}>
            <input type="hidden" name="siteId" value={id} />
            <SubmitButton className="btn btn-primary h-11" pending="Starting…" disabled={!pending || Boolean(running) || !viewer.status.active}>
              {pending ? `Decide ${pending} target${pending === 1 ? '' : 's'}` : 'All targets decided'}
            </SubmitButton>
          </form>
        )}
      />

      {running && <JobProgress key={running.id} jobId={running.id} initial={running} label="Deciding targets" />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
        {([
          ['Targets', fmt(targets.length), pending ? `${pending} to decide` : 'all decided'],
          ['Briefs in progress', fmt(inProgress), 'proposed, approved or in writing'],
          ['Skipped', fmt(skipped), 'no-go, with what would change it'],
          ['Published', fmt(live), `${briefs.filter((b) => b.status === 'measured').length} measured`],
          ['Clicks a month', fmt(measuredClicks), 'from measured briefs'],
        ] as const).map(([l, v, s]) => (
          <div key={l} className="card px-5 py-4">
            <div className="label">{l}</div>
            <div className="display num mt-1 text-[38px] leading-none">{v}</div>
            <div className="mt-1 text-[12.5px] text-muted">{s}</div>
          </div>
        ))}
      </div>

      <nav aria-label="Brief desk views" className="flex gap-1 self-start rounded-xl bg-sunken p-1">
        {([['queue', `Editorial queue · ${briefs.length}`], ['targets', `Targets · ${targets.length}`]] as const).map(([k, l]) => (
          <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium ${tab === k ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-muted hover:text-ink'}`}>{l}</Link>
        ))}
      </nav>

      {tab === 'queue' && (briefs.length === 0 ? (
        <section className="card">
          <Empty title="No briefs yet">
            <p>Add target keywords and decide them. Every target Jev says to create or expand becomes a proposed brief here.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {targets.length === 0 && <SampleButton siteId={id} primary />}
              <Link href={`${base}?tab=targets`} className="btn h-10">Go to targets</Link>
            </div>
          </Empty>
        </section>
      ) : (
        <div>
          <p className="mb-3 text-[12.5px] text-muted xl:hidden">Scroll across to see all five columns.</p>
          <div role="region" aria-label="Editorial board" tabIndex={0} className="overflow-x-auto pb-3">
            <div className="grid min-w-[1000px] grid-cols-5 items-start gap-3.5">
              {COLUMNS.map((c) => {
                const items = briefs.filter((b) => b.status === c.key);
                return (
                  <section key={c.key} aria-label={c.label} className="flex flex-col gap-2.5">
                    <h2 className="flex justify-between px-1 text-[13px] font-semibold text-ink-2">{c.label}<span className="mono text-muted">{items.length}</span></h2>
                    {items.length === 0 && <div className="rounded-xl border border-dashed border-line-strong px-3.5 py-5 text-center text-[12.5px] text-muted">{c.empty}</div>}
                    {items.map((b) => <BoardCard key={b.id} b={b} t={byId.get(b.target_id)} siteId={id} />)}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {tab === 'targets' && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <form action={addTargetAction} className="card flex flex-col gap-3 p-5">
              <input type="hidden" name="siteId" value={id} />
              <div><h2 className="text-[15px] font-semibold">Add a target</h2><p className="text-[13px] text-muted">A primary keyword and the searches it should also answer.</p></div>
              <label className="flex flex-col gap-1"><span className="label">Primary keyword</span><input name="primary" required maxLength={120} className="input" placeholder="via ferrata for beginners" /></label>
              <label className="flex flex-col gap-1"><span className="label">Related keywords, one per line (optional volume in brackets)</span><textarea name="related" rows={4} className="input text-[13.5px]" placeholder={'what is a via ferrata (1300)\nvia ferrata uk'} /></label>
              <label className="flex flex-col gap-1" htmlFor="rel-add"><span className="label">Business relevance</span><RelevanceSelect id="rel-add" /></label>
              <SubmitButton className="btn btn-primary h-10" pending="Adding…">Add target</SubmitButton>
            </form>
            <form action={pasteTargetsAction} className="card flex flex-col gap-3 p-5">
              <input type="hidden" name="siteId" value={id} />
              <div><h2 className="text-[15px] font-semibold">Paste a list</h2><p className="text-[13px] text-muted">One target per line. Separate a target&apos;s keywords with <span className="mono">;</span> and put the primary first.</p></div>
              <label className="flex flex-1 flex-col gap-1"><span className="label">Targets</span><textarea name="text" required rows={7} className="input mono flex-1 text-[12.5px]" placeholder={'best walking poles uk (1600); walking poles review\nhow to choose a sleeping bag; down vs synthetic sleeping bag'} /></label>
              <label className="flex flex-col gap-1" htmlFor="rel-paste"><span className="label">Business relevance for all</span><RelevanceSelect id="rel-paste" /></label>
              <SubmitButton className="btn h-10" pending="Adding…">Add targets</SubmitButton>
            </form>
            <div className="card flex flex-col gap-4 p-5">
              <div><h2 className="text-[15px] font-semibold">From your data</h2><p className="text-[13px] text-muted">Volumes from Search Console are impressions, so they are a floor on real demand.</p></div>
              <form action={targetsFromSearchConsoleAction} className="flex flex-col gap-1.5">
                <input type="hidden" name="siteId" value={id} />
                <SubmitButton className="btn h-10" pending="Grouping…" disabled={!hasQ}>Create targets from Search Console</SubmitButton>
                <p className="text-[12.5px] text-muted">{hasQ ? 'Groups your page-and-query data by shared head term, largest first.' : <>Needs page-and-query data. <Link className="underline" href={`/sites/${id}/data`}>Add it in Data sources</Link>.</>}</p>
              </form>
              <form action={importClustersAction} className="flex flex-col gap-1.5">
                <input type="hidden" name="siteId" value={id} />
                <SubmitButton className="btn h-10" pending="Importing…" disabled={!clusters.length}>Import from Keyword clusters</SubmitButton>
                <p className="text-[12.5px] text-muted">{clusters.length ? `${clusters.length} clusters, ${gapClusters} with no page yet (imported first).` : <>No clusters yet. Run <Link className="underline" href={`/sites/${id}/keywords`}>Keyword clusters</Link> first.</>}</p>
              </form>
              <div className="flex flex-col gap-1.5 border-t border-line pt-4">
                <SampleButton siteId={id} />
                <p className="text-[12.5px] text-muted">Eight targets for the fictional Sample Outdoors shop, with made-up volumes.</p>
              </div>
            </div>
          </div>

          <Section title="Targets" sub="Change relevance and decide again to update a call. Confidence is the probability of the chosen option.">
            {targets.length === 0 ? (
              <Empty title="No targets yet">
                <p>Type a keyword above, paste a list, build targets from Search Console, or try the sample.</p>
                <div className="mt-4 flex justify-center"><SampleButton siteId={id} primary /></div>
              </Empty>
            ) : (
              <table className="tbl min-w-[1020px]">
                <thead>
                  <tr><th>Target</th><th className="r">Volume</th><th>Ranking now</th><th className="w-[150px]">Relevance</th><th>Decision</th><th className="r">Actions</th></tr>
                </thead>
                <tbody>
                  {targets.map((t) => {
                    const v = volumeOf(t);
                    const page = bestPage(t);
                    const d = t.decision;
                    const b = briefByTarget.get(t.id);
                    return (
                      <tr key={t.id}>
                        <td className="max-w-[300px]">
                          <div className="font-semibold">{t.primary}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted"><Tag>{SOURCE_LABEL[t.source]}</Tag>{t.keywords.length} keyword{t.keywords.length === 1 ? '' : 's'}</div>
                          <details className="mt-1 text-[12.5px]">
                            <summary className="cursor-pointer text-muted hover:text-ink">Keywords</summary>
                            <ul className="mt-1.5 flex flex-col gap-0.5">
                              {t.keywords.map((k) => (
                                <li key={k.keyword} className="flex justify-between gap-3"><span>{k.keyword}</span><span className="mono whitespace-nowrap text-muted">{k.volume != null ? fmt(k.volume) : '—'}{k.position != null ? ` · #${k.position.toFixed(0)}` : ''}</span></li>
                              ))}
                            </ul>
                          </details>
                        </td>
                        <td className="r">
                          <div className="num mono">{v != null ? fmt(v) : '—'}</div>
                          <div className="text-[11.5px] text-muted">{v == null ? 'unknown' : t.volumeSource === 'search_console' ? 'impressions/mo' : t.volumeSource === 'sample' ? 'sample/mo' : 'searches/mo'}</div>
                        </td>
                        <td>{page ? <><div className="mono break-all text-[12.5px]">{page.path}</div><div className="text-[12px] text-muted">position {page.position.toFixed(1)}</div></> : <span className="text-[12.5px] text-muted">No page in the top 20</span>}</td>
                        <td>
                          <form action={setRelevanceAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="targetId" value={t.id} />
                            <label className="sr-only" htmlFor={`rel-${t.id}`}>Business relevance for {t.primary}</label>
                            <RelevanceSelect id={`rel-${t.id}`} value={t.relevance} />
                            <SubmitButton className="btn btn-sm btn-ghost" pending="…">Save</SubmitButton>
                          </form>
                        </td>
                        <td className="max-w-[340px]">
                          {!d ? <span className="text-[12.5px] text-muted">Not decided yet</span> : (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-2"><GoBadge go={d.go.choice} size="sm" /><Confidence p={d.go.p} router={d.router} />{t.stale && <Tag>Changed, decide again</Tag>}</div>
                              {d.format && d.go.choice !== 'skip' && <div className="text-[12.5px] text-ink-2">{FORMAT_LABEL[d.format.choice]}{d.length ? ` · ${LENGTH_LABEL[d.length.choice]}` : ''}</div>}
                              {d.change.length > 0 && (
                                <div className="rounded-lg bg-sunken px-2.5 py-1.5 text-[12px]">
                                  <div className="font-semibold text-ink-2">What would change the call</div>
                                  <ul className="mt-0.5 list-disc pl-4 text-muted">{d.change.map((c) => <li key={c}>{c}</li>)}</ul>
                                </div>
                              )}
                              {b && <Link className="text-[12.5px] font-semibold text-accent" href={`${base}/${b.id}`}>Open brief →</Link>}
                            </div>
                          )}
                        </td>
                        <td className="r">
                          <div className="flex justify-end gap-1">
                            <form action={decideTargetsAction}>
                              <input type="hidden" name="siteId" value={id} />
                              <input type="hidden" name="targetId" value={t.id} />
                              <SubmitButton className="btn btn-sm" pending="…" disabled={Boolean(running) || !viewer.status.active}>{d ? 'Decide again' : 'Decide'}</SubmitButton>
                            </form>
                            <form action={deleteTargetAction}>
                              <input type="hidden" name="targetId" value={t.id} />
                              <SubmitButton className="btn btn-sm btn-ghost btn-danger" pending="…">Remove</SubmitButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
