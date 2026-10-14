import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { fmt } from '@/components/ui';
import { CannibalPill, Conf, GapPill, IntentBadge, StageText } from '@/components/keywords/badges';
import { clusterViews, getInput, latestRun } from '@/lib/modules/keywords';
import { mergeClustersAction, moveKeywordAction, renameClusterAction } from '@/lib/modules/keywords-actions';
import { INTENT_LABEL, STAGE_LABEL } from '@/modules/keywords/battery';

const MOVE_OPTIONS = 150;

export default async function ClusterDetail({ params, searchParams }: { params: Promise<{ id: string; cid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, cid } = await params;
  const { site } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const job = latestRun(id);
  const all = job ? clusterViews(id, job.id) : [];
  const c = all.find((x) => x.id === cid);
  if (!c) notFound();
  const input = job?.meta.inputId ? getInput(String(job.meta.inputId)) : null;
  const volLabel = input?.volume_source === 'impressions' ? 'Impressions' : 'Volume';
  const base = `/sites/${id}/keywords`;
  const url = (p: string) => `https://${site.domain}${p}`;
  const others = all.filter((x) => x.id !== c.id);
  const moveTargets = others.slice(0, MOVE_OPTIONS);
  const shared = (path: string) => c.claims.find((x) => x.path === path)?.keywords ?? [];
  const ownerKeywords = c.items.filter((k) => k.page === c.mappedPath || k.currentPath === c.mappedPath).map((k) => k.keyword);

  return (
    <div className="flex flex-col gap-6">
      {sp.done && <Toast message={sp.done} />}
      <div>
        <Link href={base} className="text-[13px] text-muted hover:text-ink">← All clusters</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display break-words text-[40px] leading-[1.05]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
              <IntentBadge intent={c.intent} />
              {c.stage && <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[12.5px] text-ink-2">{STAGE_LABEL[c.stage]}</span>}
              <span className="num">{fmt(c.keywords.length)} keyword{c.keywords.length === 1 ? '' : 's'}</span>
              <span aria-hidden>·</span>
              <span className="num">{fmt(c.totalVolume)} {volLabel.toLowerCase()}</span>
              {c.renamed && <><span aria-hidden>·</span><span>Renamed by you</span></>}
            </div>
          </div>
        </div>
      </div>
      {sp.error && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[14px] text-bad">{sp.error}</div>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <section className="card flex flex-col gap-2 p-5 sm:p-6">
          <div className="label">Page that should own this cluster</div>
          {c.kind === 'junk' ? (
            <p className="text-[14px] text-ink-2">These keywords are misspellings, other companies&apos; brands or off-topic searches. They are kept out of gaps, cannibalisation and the brief desk. Move any that belong elsewhere.</p>
          ) : c.gap ? (
            <>
              <div><GapPill /></div>
              <p className="text-[14px] text-ink-2">Most keywords here chose “no existing page is a good home”. {c.intent ? `A new ${INTENT_LABEL[c.intent].toLowerCase()} page` : "A new page"} would serve this cluster. Gap clusters are passed to the <Link className="underline" href={`/sites/${id}/briefs`}>Brief desk</Link> as brief candidates.</p>
            </>
          ) : c.mappedPath ? (
            <>
              <a href={url(c.mappedPath)} target="_blank" rel="noreferrer" className="mono break-all text-[15px] font-medium hover:underline">{c.mappedPath}</a>
              <p className="text-[13px] text-muted">Chosen by the majority of this cluster&apos;s keywords.</p>
            </>
          ) : <p className="text-muted">No pages were available to map. Add a crawl or Search Console data on <Link className="underline" href={`/sites/${id}/data`}>Data sources</Link> and re-run.</p>}
        </section>

        <section className="card flex flex-col gap-4 p-5 sm:p-6">
          <form action={renameClusterAction} className="flex flex-col gap-2">
            <input type="hidden" name="clusterId" value={c.id} />
            <label htmlFor="cl-name" className="label">Rename</label>
            <div className="flex gap-2">
              <input id="cl-name" name="name" defaultValue={c.name} required maxLength={120} className="input min-w-0 flex-1" />
              <SubmitButton className="btn" pending="Saving…">Save</SubmitButton>
            </div>
          </form>
          {others.length > 0 && (
            <form action={mergeClustersAction} className="flex flex-col gap-2">
              <input type="hidden" name="clusterId" value={c.id} />
              <label htmlFor="cl-merge" className="label">Merge this cluster into</label>
              <div className="flex gap-2">
                <select id="cl-merge" name="into" required defaultValue="" className="select min-w-0 flex-1">
                  <option value="" disabled>Choose a cluster</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({fmt(o.keywords.length)})</option>)}
                </select>
                <SubmitButton className="btn" pending="Merging…">Merge</SubmitButton>
              </div>
              <p className="text-[12px] text-muted">Edits are saved and carried over when you re-run.</p>
            </form>
          )}
        </section>
      </div>

      {c.cannibalised && c.claims.length > 0 && (
        <section id="cannibalisation" className="card flex scroll-mt-6 flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">Cannibalisation</h2>
            <CannibalPill n={c.alsoClaimedBy.length} />
          </div>
          <p className="-mt-3 text-[13.5px] text-muted">Other pages also claim this cluster: several keywords chose them, or they currently rank for its keywords. Consolidate onto {c.mappedPath ? 'the owning page' : 'one page'} so they stop competing.</p>
          {c.claims.map((cl) => (
            <article key={cl.path} className="flex flex-col gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                {c.mappedPath ? (
                  <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border-[1.5px] border-[var(--ok)] bg-ok-bg/40 p-4">
                    <span className="text-[12px] font-medium text-ok">Owner</span>
                    <a href={url(c.mappedPath)} target="_blank" rel="noreferrer" className="mono break-all text-[13.5px] hover:underline">{c.mappedPath}</a>
                    <span className="text-[12.5px] text-muted">{fmt(ownerKeywords.length)} keywords chose or rank on it</span>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-dashed border-line-strong p-4">
                    <span className="text-[12px] font-medium text-warn">No owner yet</span>
                    <span className="text-[13.5px] text-ink-2">A new page is recommended</span>
                  </div>
                )}
                <div aria-hidden className="hidden place-items-center text-[13px] text-muted md:grid">vs</div>
                <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--merge)' }}>Also claims it</span>
                  <a href={url(cl.path)} target="_blank" rel="noreferrer" className="mono break-all text-[13.5px] hover:underline">{cl.path}</a>
                  <span className="text-[12.5px] text-muted">{fmt(cl.keywords.length)} shared keyword{cl.keywords.length === 1 ? '' : 's'}</span>
                </div>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {shared(cl.path).map((k) => <li key={k} className="rounded-full bg-sunken px-2.5 py-0.5 text-[12.5px]">{k}</li>)}
              </ul>
            </article>
          ))}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-4 sm:px-6">
          <h2 className="text-[15px] font-semibold">Keywords</h2>
          <p className="text-[13px] text-muted">Confidence is Jev&apos;s probability for the chosen option: 0.85 or more is confident, under 0.60 is worth checking.{c.uncertain ? ` ${fmt(c.uncertain)} keyword${c.uncertain === 1 ? ' is' : 's are'} uncertain.` : ''}</p>
        </div>
        <div className="relative overflow-x-auto">
          <table className="tbl min-w-[1080px]">
            <thead>
              <tr>
                <th>Keyword</th><th className="r">{volLabel}</th><th className="r">Position</th><th>Intent</th><th>Stage</th><th>Chosen page</th><th>Move to</th>
              </tr>
            </thead>
            <tbody>
              {c.items.map((k, i) => (
                <tr key={k.keyword}>
                  <td className="max-w-[240px] font-medium">{k.keyword}{k.currentPath && <div className="mono truncate text-[12px] font-normal text-muted" title={`Currently ranking: ${k.currentPath}`}>now: {k.currentPath}</div>}</td>
                  <td className="r num">{fmt(k.volume)}</td>
                  <td className="r num mono text-[13px]">{k.position != null ? `#${k.position.toFixed(1)}` : <span className="text-faint">—</span>}</td>
                  <td><div className="flex items-center gap-2"><IntentBadge intent={k.intent} size="sm" /><Conf p={k.intentP} /></div></td>
                  <td className="text-[13.5px]"><div className="flex items-center gap-2"><StageText stage={k.stage} /><Conf p={k.stageP} /></div></td>
                  <td className="max-w-[260px]">
                    <div className="flex items-center gap-2">
                      {k.page === 'new_page' ? <span className="text-[13px] text-warn">New page</span> : k.page ? <span className="mono break-all text-[12.5px]">{k.page}</span> : <span className="text-faint">—</span>}
                      <Conf p={k.pageP} />
                    </div>
                  </td>
                  <td>
                    <form action={moveKeywordAction} className="flex gap-1.5">
                      <input type="hidden" name="clusterId" value={c.id} />
                      <input type="hidden" name="keyword" value={k.keyword} />
                      <label className="sr-only" htmlFor={`mv-${i}`}>Move {k.keyword} to</label>
                      <select id={`mv-${i}`} name="target" defaultValue="" required className="select h-8 w-[170px] text-[13px]">
                        <option value="" disabled>Choose…</option>
                        <option value="new">New cluster</option>
                        {moveTargets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <SubmitButton className="btn btn-sm" pending="…">Move</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
