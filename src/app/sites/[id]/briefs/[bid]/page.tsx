import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { fmt, fmtDate, Prob, StatusBadge } from '@/components/ui';
import { Confidence, GoBadge, Tag } from '@/components/briefs/bits';
import { CopyMarkdown } from '@/components/briefs/CopyMarkdown';
import { expandTarget, getBrief, getTarget, syncMeasured } from '@/lib/modules/briefs';
import { editBriefAction, moveBriefAction, publishBriefAction } from '@/lib/modules/briefs-actions';
import { briefMarkdown, EDGE_LABEL, FORMAT_LABEL, INTENT_LABEL, LENGTH_LABEL, outlineToText } from '@/modules/briefs/assemble';
import type { BriefStatus, Pick } from '@/modules/briefs/types';

const STATUS_LABEL: Record<BriefStatus, string> = { proposed: 'Proposed', approved: 'Approved', writing: 'In writing', published: 'Published', measured: 'Measured' };
const STATUS_TONE: Record<BriefStatus, string> = { proposed: 'proposed', approved: 'approved', writing: 'in_progress', published: 'done', measured: 'worked' };
const TOASTS: Record<string, [string, 'ok' | 'bad']> = {
  saved: ['Brief saved', 'ok'], moved: ['Brief moved', 'ok'], published: ['Published URL saved. It is measured when a later Search Console upload shows it.', 'ok'],
  badurl: ['Enter the full published URL, starting with https://', 'bad'],
};

function DecisionRow({ label, pick, names }: { label: string; pick: Pick | null; names?: Record<string, string> }) {
  if (!pick) return null;
  const others = Object.entries(pick.probs).filter(([k]) => k !== pick.choice).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="font-semibold">{names?.[pick.choice] ?? pick.choice}</span>
      </div>
      <Prob p={pick.p} color="var(--accent)" />
      {others.length > 0 && <div className="text-[12px] text-muted">Next: {others.map(([k, p]) => `${names?.[k] ?? k} ${p.toFixed(2)}`).join(' · ')}</div>}
    </div>
  );
}

export default async function BriefDetail({ params, searchParams }: { params: Promise<{ id: string; bid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, bid } = await params;
  const { site } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  syncMeasured(id);
  const b = getBrief(bid);
  const t = b ? getTarget(b.target_id) : null;
  if (!b || !t || b.site_id !== id) notFound();
  const d = t.decision;
  const c = b.content;
  const ex = expandTarget(b, t);
  const md = briefMarkdown({ ...c, expandPath: ex?.path ?? null, expandTitle: ex?.title ?? null }, { primary: t.primary, go: d?.go.choice ?? 'create', status: STATUS_LABEL[b.status], site: site.domain, publishedUrl: b.published_url });
  const toast = sp.done ? TOASTS[sp.done] : null;
  const angleNames = Object.fromEntries((d?.angles ?? []).map((a) => [a.key, a.label]));
  const move = (status: BriefStatus, label: string, primary = false) => (
    <form action={moveBriefAction}>
      <input type="hidden" name="briefId" value={b.id} />
      <SubmitButton className={`btn h-10 ${primary ? 'btn-primary' : ''}`} name="status" value={status} pending="Moving…">{label}</SubmitButton>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast key={sp.done} message={toast[0]} tone={toast[1]} />}
      <Link href={`/sites/${id}/briefs?tab=queue`} className="self-start text-[13px] font-medium text-accent">← Editorial queue</Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {d && <GoBadge go={d.go.choice} />}
            <StatusBadge s={STATUS_TONE[b.status]} />
            <span className="sr-only">Status: {STATUS_LABEL[b.status]}</span>
            <span className="text-[12.5px] text-muted">{STATUS_LABEL[b.status]} · updated {fmtDate(b.updated_at)}{b.edited ? ' · edited' : ''}</span>
          </div>
          <h1 className="display text-balance text-[38px] leading-[1.08]">{c.title}</h1>
          <p className="text-muted">Primary keyword <span className="mono text-ink">{t.primary}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {b.status === 'proposed' && move('approved', 'Approve brief', true)}
          {b.status === 'approved' && <>{move('writing', 'Start writing', true)}{move('proposed', 'Back to proposed')}</>}
          {b.status === 'writing' && move('approved', 'Back to approved')}
          {(b.status === 'published' || b.status === 'measured') && move('writing', 'Back to writing')}
        </div>
      </header>

      {ex && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-[var(--expand)] bg-[var(--expand-bg)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--expand)]">Expand an existing page, do not publish a new one</div>
            <a href={`https://${site.domain}${ex.path}`} target="_blank" rel="noreferrer" className="mono break-all text-[15px] font-medium hover:underline">{ex.path}</a>
            {ex.title && <div className="text-[13px] text-ink-2">{ex.title}</div>}
          </div>
          <p className="max-w-md text-[13px] text-ink-2">It already ranks for this topic. Add the outline&apos;s missing sections to it so a second page does not compete with it.</p>
        </section>
      )}

      {(b.status === 'writing' || b.status === 'published' || b.status === 'measured') && (
        <section id="publish" className="card flex flex-col gap-3 p-5">
          {b.status === 'measured' ? (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><div className="label">Measured from Search Console</div><div className="display num text-[38px] leading-none">{fmt(b.measured_clicks_month)}</div><div className="text-[12.5px] text-muted">clicks a month to <span className="mono">{b.published_path}</span> · checked {fmtDate(b.measured_at)}</div></div>
              <p className="max-w-sm text-[12.5px] text-muted">Updated whenever a newer Search Console upload includes this URL. Full 90-day outcome labelling happens in the Content Decision Engine.</p>
            </div>
          ) : (
            <>
              <div><h2 className="text-[15px] font-semibold">{b.status === 'published' ? 'Published' : 'Mark as published'}</h2>
                <p className="text-[13px] text-muted">{b.status === 'published' ? `Live since ${fmtDate(b.published_at)}. It moves to Measured when a Search Console upload added after that date shows the URL.` : 'Enter the live URL. The brief moves to Published and is measured from your next Search Console upload.'}</p></div>
              <form action={publishBriefAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="briefId" value={b.id} />
                <label className="sr-only" htmlFor="pub-url">Published URL</label>
                <input id="pub-url" name="url" type="text" required defaultValue={b.published_url ?? (ex ? `https://${site.domain}${ex.path}` : '')} className="input min-w-0 flex-[1_1_280px]" placeholder={`https://${site.domain}/guides/…`} />
                <SubmitButton className="btn btn-primary h-10" pending="Saving…">{b.status === 'published' ? 'Update URL' : 'Mark published'}</SubmitButton>
              </form>
            </>
          )}
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card flex flex-col gap-4 p-6">
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-4">
              {([['Format', FORMAT_LABEL[c.format]], ['Angle', c.angleLabel], ['Length', LENGTH_LABEL[c.length]], ['Edge', EDGE_LABEL[c.edge]]] as const).map(([k, v]) => (
                <div key={k}><dt className="label">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
              ))}
            </dl>
            <div className="rounded-xl bg-accent-soft px-4 py-3 text-[14px] text-accent-strong"><strong>Better than the top 3 because</strong> {c.edgeLine.charAt(0).toLowerCase() + c.edgeLine.slice(1)}</div>
            <div>
              <h2 className="mb-1.5 text-[13px] font-semibold text-muted">Title options</h2>
              <ol className="flex list-decimal flex-col gap-1 pl-5">{c.titleOptions.map((o) => <li key={o} className={o === c.title ? 'font-semibold' : ''}>{o}{o === c.title && <span className="ml-2 text-[12px] font-normal text-muted">chosen</span>}</li>)}</ol>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4"><h2 className="text-[15px] font-semibold">Outline</h2><p className="text-[13px] text-muted">Each H2 with the searches it must answer. Built from the target&apos;s keywords, the format and the angle.</p></div>
            <ol className="flex flex-col">
              {c.outline.map((s, i) => (
                <li key={`${s.h2}-${i}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-b border-line px-6 py-3.5 last:border-0">
                  <span className="mono pt-0.5 text-[12px] text-faint">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="font-semibold">{s.h2}</div>
                    {s.answers.length > 0 && <div className="mt-0.5 text-[13px] text-ink-2">Must answer: {s.answers.join('; ')}</div>}
                    {s.note && <div className="mt-0.5 text-[12.5px] text-muted">{s.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4"><h2 className="text-[15px] font-semibold">Target queries</h2><p className="text-[13px] text-muted">{t.volumeSource === 'search_console' ? 'Volumes are Search Console impressions a month, a floor on demand.' : t.volumeSource === 'sample' ? 'Volumes are made-up sample figures.' : t.volumeSource === 'cluster' ? 'Volumes from your keyword list in Keyword clusters.' : 'Volumes as entered.'} Positions from your latest Search Console data.</p></div>
            <div className="overflow-x-auto">
              <table className="tbl min-w-[560px]">
                <thead><tr><th>Query</th><th className="r">Volume</th><th className="r">Position</th><th>Ranking page</th></tr></thead>
                <tbody>{c.queries.map((q) => (
                  <tr key={q.keyword}><td>{q.keyword}</td><td className="r num mono">{q.volume != null ? fmt(q.volume) : '—'}</td><td className="r num mono">{q.position != null ? q.position.toFixed(1) : '—'}</td><td className="mono break-all text-[12.5px]">{q.path ?? '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            {([['Link to', 'Pages this piece should link out to.', c.linksTo], ['Link from', 'Pages that should link to this piece once it is live.', c.linksFrom]] as const).map(([h, sub, list]) => (
              <section key={h} className="card flex flex-col gap-2 p-5">
                <div><h2 className="text-[15px] font-semibold">{h}</h2><p className="text-[12.5px] text-muted">{sub}</p></div>
                {list.length === 0 ? <p className="text-[13px] text-muted">No related pages found. Add a crawl or Search Console data for link suggestions.</p> : (
                  <ul className="flex flex-col">{list.map((l) => (
                    <li key={l.path} className="border-b border-line py-2 last:border-0"><div className="mono break-all text-[13px]">{l.path}</div><div className="text-[12px] text-muted">{l.title ? `${l.title} · ` : ''}{l.why}</div></li>
                  ))}</ul>
                )}
              </section>
            ))}
          </div>

          <section className="card flex flex-col gap-2 p-5">
            <h2 className="text-[15px] font-semibold">Sources</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px]">{c.sources.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4"><h2 className="text-[15px] font-semibold">Edit the brief</h2><p className="text-[13px] text-muted">Edited briefs are never overwritten by a new decision run.</p></div>
            <form action={editBriefAction} className="flex flex-col gap-4 p-6">
              <input type="hidden" name="briefId" value={b.id} />
              <fieldset className="flex flex-col gap-1.5">
                <legend className="label mb-1">Title</legend>
                {c.titleOptions.map((o, i) => (
                  <label key={o} className="flex items-start gap-2"><input type="radio" name="title" value={o} defaultChecked={o === c.title} className="mt-1" id={`title-${i}`} /><span>{o}</span></label>
                ))}
                <input name="customTitle" maxLength={200} className="input mt-1" placeholder="Or write your own title" defaultValue={c.titleOptions.includes(c.title) ? '' : c.title} aria-label="Custom title" />
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label className="label" htmlFor="angle">Angle</label>
                <select id="angle" name="angle" defaultValue={c.angle} className="select">
                  {(d?.angles ?? [{ key: c.angle, label: c.angleLabel, criteria: '' }]).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
                <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" name="rebuild" defaultChecked /> Rebuild title options and outline when the angle changes</label>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="label" htmlFor="outline">Outline: <span className="mono">## Heading</span>, then <span className="mono">- search to answer</span>, then <span className="mono">&gt; note</span></label>
                <textarea id="outline" name="outline" rows={14} defaultValue={outlineToText(c.outline)} className="input mono text-[12.5px]" />
              </div>
              <SubmitButton className="btn btn-primary h-10 self-start" pending="Saving…">Save brief</SubmitButton>
            </form>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-[15px] font-semibold">Export</h2>
            <a className="btn btn-primary h-10" href={`/api/sites/${id}/briefs/${b.id}/markdown`}>Download Markdown</a>
            <CopyMarkdown markdown={md} />
            <p className="text-[12.5px] text-muted">Google Docs and Notion export need an OAuth connection to your workspace, which is not available yet. Paste the Markdown into either for now.</p>
          </section>

          {d && (
            <section className="card flex flex-col p-5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">Jev&apos;s decisions</h2><Confidence p={d.go.p} router={d.router} /></div>
              <p className="text-[12px] text-muted">Each is a choice from a closed set. The bar is the probability of the chosen option.</p>
              <DecisionRow label="Go / no-go" pick={d.go} names={{ create: 'Create', expand_existing: 'Expand existing', skip: 'Skip' }} />
              <DecisionRow label="Intent" pick={d.intent} names={INTENT_LABEL} />
              <DecisionRow label="Format" pick={d.format} names={FORMAT_LABEL} />
              <DecisionRow label="Angle" pick={d.angle} names={angleNames} />
              <DecisionRow label="Length" pick={d.length} names={LENGTH_LABEL} />
              <DecisionRow label="Edge" pick={d.edge} names={EDGE_LABEL} />
              <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-sunken p-3 text-[12.5px]">
                <div className="font-semibold text-ink-2">Why</div>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-2">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                {d.change.length > 0 && <><div className="mt-1 font-semibold text-ink-2">What would change the call</div><ul className="flex list-disc flex-col gap-1 pl-4 text-ink-2">{d.change.map((r) => <li key={r}>{r}</li>)}</ul></>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] text-muted"><Tag>briefs.v1</Tag><Tag>{d.model}</Tag><span>decided {fmtDate(d.decidedAt)}</span></div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
