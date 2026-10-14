import { requireSite } from '@/lib/auth';
import Link from 'next/link';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { InboxKeys } from '@/components/InboxKeys';
import { Toast } from '@/components/Toast';
import { VerdictPanel } from '@/components/VerdictPanel';
import { Empty, Impact, qs, VERDICT_LABEL } from '@/components/ui';
import { decisionsForPath, getVerdict, latestVerdictJob, listVerdicts, openTaskForPath, templates, type VerdictFilter } from '@/lib/repo';

const SIZE = 40;
const SHOWS = [
  { key: 'waiting', label: 'Waiting for you' },
  { key: 'review', label: 'Needs review' },
  { key: 'uncertain', label: 'Uncertain' },
  { key: 'irreversible', label: 'Prune and Redirect' },
  { key: 'auto', label: 'Auto-approved' },
  { key: 'all', label: 'All verdicts' },
] as const;

function filterFor(show: string, sp: Record<string, string | undefined>): VerdictFilter {
  const f: VerdictFilter = { q: sp.q, verdict: sp.verdict, template: sp.template, traffic: sp.traffic };
  if (show === 'all') return f;
  if (show === 'auto') return { ...f, router: 'auto', status: 'approved' };
  f.status = 'proposed';
  f.actionOnly = true; // Leave needs no action, so it never waits in the inbox
  if (show === 'review') f.router = 'review';
  if (show === 'uncertain') f.router = 'uncertain';
  if (show === 'irreversible') f.verdict = 'irreversible';
  return f;
}

export default async function Inbox({ params, searchParams }: PageProps<'/sites/[id]/inbox'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const job = latestVerdictJob(id);
  if (!job) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="display text-[40px] leading-[1.05]">Decision inbox</h1>
        <section className="card"><Empty title="Nothing scored yet"><Link className="underline" href={`/sites/${id}/data`}>Upload your data</Link>, then score every URL from the Overview.</Empty></section>
      </div>
    );
  }
  const show = SHOWS.some((s) => s.key === sp.show) ? sp.show! : 'waiting';
  const filter = filterFor(show, sp);
  const total = listVerdicts(job.id, filter, 0, 0).total;
  const page = Math.min(Math.max(1, Math.floor(Number(sp.page)) || 1), Math.max(1, Math.ceil(total / SIZE)));
  const { rows } = listVerdicts(job.id, filter, SIZE, (page - 1) * SIZE);
  const keep = { show: show === 'waiting' ? undefined : show, q: sp.q, verdict: sp.verdict, template: sp.template, traffic: sp.traffic, page: page > 1 ? String(page) : undefined };
  const filtered = Boolean(sp.q || sp.verdict || sp.template || sp.traffic);
  const tpls = templates(id);
  const base = `/sites/${id}/inbox`;

  const requested = sp.v ? getVerdict(sp.v) : null;
  const fromUrl = requested?.site_id === id ? requested : null;
  const selected = fromUrl ?? rows[0] ?? null;
  const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
  const next = rows.find((r, i) => i > idx && r.status === 'proposed' && r.id !== selected?.id) ?? rows.find((r) => r.status === 'proposed' && r.id !== selected?.id);
  const back = `${base}${qs(keep, { v: selected?.id })}`;
  const prev = idx > 0 ? rows[idx - 1] : null;
  const after = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null;
  const DONE: Record<string, string> = { approve: 'Approved', reject: 'Rejected', change: 'Changed to' };
  const dv = sp.dv && VERDICTS.includes(sp.dv as Verdict) ? VERDICT_LABEL[sp.dv as Verdict] : '';
  const toast = sp.done && DONE[sp.done] ? `${DONE[sp.done]} ${dv}${show === 'waiting' || show === 'review' || show === 'uncertain' || show === 'irreversible' ? ` · ${total.toLocaleString('en-GB')} left` : ''}` : null;
  const nextBack = `${base}${qs(keep, { v: next?.id })}`;
  const nouls = selected
    ? decisionsForPath(selected.job_id, selected.path).filter((d) => d.answer.type === 'noul').map((d) => ({ key: d.question_key, p: Number(d.answer.noul) }))
    : [];

  return (
    <div className="flex flex-col gap-5">
      {toast && <Toast key={`${sp.done}-${sp.v}`} message={toast} tone={sp.done === 'reject' ? 'bad' : 'ok'} />}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display text-[40px] leading-[1.05]">Decision inbox</h1>
          <p className="text-muted">Biggest expected impact first. Approval creates a task; your corrections are saved in the decision log.</p>
        </div>
        <nav aria-label="Filter" className={`${fromUrl ? 'hidden lg:flex' : 'flex'} flex-wrap gap-1.5`}>
          {SHOWS.map((s) => {
            const on = s.key === show;
            return (
              <Link key={s.key} href={`${base}${qs({ q: sp.q, template: sp.template, traffic: sp.traffic, verdict: s.key === 'irreversible' ? undefined : sp.verdict, show: s.key === 'waiting' ? undefined : s.key })}`} aria-current={on ? 'true' : undefined}
                className={`flex min-h-9 items-center rounded-full border px-3.5 ${on ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line-strong bg-surface hover:border-ink-2'}`}>
                {s.label}{on ? ` · ${total.toLocaleString('en-GB')}${filtered ? ' matches' : ''}` : ''}
              </Link>
            );
          })}
        </nav>
      </header>

      <form key={JSON.stringify(keep)} className={`${fromUrl ? 'hidden lg:flex' : 'flex'} flex-wrap items-center gap-2`}>
        {show !== 'waiting' && <input type="hidden" name="show" value={show} />}
        <input name="q" defaultValue={sp.q} placeholder="URL contains" className="input w-56" aria-label="URL contains" />
        {show !== 'irreversible' && (
          <select name="verdict" defaultValue={sp.verdict ?? ''} className="select" aria-label="Verdict">
            <option value="">Any verdict</option>
            {VERDICTS.map((v) => <option key={v} value={v}>{VERDICT_LABEL[v]}</option>)}
            {show === 'all' && <option value="skipped">Not scored</option>}
          </select>
        )}
        <select name="template" defaultValue={sp.template ?? ''} className="select" aria-label="Page template">
          <option value="">All templates</option>
          {tpls.map((t) => <option key={t.template} value={t.template}>{t.template}</option>)}
        </select>
        <select name="traffic" defaultValue={sp.traffic ?? ''} className="select" aria-label="Monthly traffic">
          <option value="">Any traffic</option><option value="none">No clicks</option><option value="low">1–99 clicks/month</option><option value="medium">100–999 clicks/month</option><option value="high">1,000+ clicks/month</option>
        </select>
        <button className="btn">Apply</button>
        {filtered && <Link href={`${base}${qs({ show: keep.show })}`} className="text-[13px] text-muted underline">Clear filters</Link>}
        <span className="ml-auto">
          <InboxKeys prevHref={prev ? `${base}${qs(keep, { v: prev.id })}` : null} nextHref={after ? `${base}${qs(keep, { v: after.id })}` : null} />
        </span>
      </form>

      {rows.length === 0 ? (
        <section className="card">
          <Empty title={show === 'waiting' && !filtered ? 'Inbox zero' : 'No matching decisions'}>
            {show === 'waiting' && !filtered ? <>Every decision has been reviewed. See the <Link className="underline" href={`/sites/${id}/queue`}>work queue</Link>.</> : <><span>Try another filter or </span><Link className="underline" href={`${base}${qs({ show: keep.show })}`}>clear your filters</Link>.</>}
          </Empty>
        </section>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(230px,300px)_minmax(0,1fr)]">
          <section aria-label="Decisions" className={`card min-w-0 overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto ${fromUrl ? 'hidden lg:block' : ''}`}>
            {rows.map((r) => {
              const verdict = (r.final_verdict ?? r.verdict) as Verdict | null;
              const on = r.id === selected?.id;
              const ps = (Object.entries(r.probabilities) as [Verdict, number][]).sort((a, b) => b[1] - a[1]);
              return (
                <Link key={r.id} href={`${base}${qs(keep, { v: r.id })}`} aria-current={on ? 'true' : undefined}
                  className={`flex flex-col gap-2 border-b border-line border-l-[3px] px-4 py-3.5 ${on ? 'border-l-accent bg-selected' : 'border-l-transparent hover:bg-surface-2'}`}>
                  <span className="flex items-center justify-between gap-2">
                    {verdict ? (
                      <span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ color: `var(--${verdict})`, background: `var(--${verdict}-bg)` }}>{VERDICT_LABEL[verdict]}</span>
                    ) : <span className="rounded-md bg-sunken px-2 py-0.5 text-[12px] font-semibold text-ink-2">Not scored</span>}
                    <span className="flex items-center gap-2">
                      {r.status !== 'proposed' && <span className={`text-[12px] font-semibold ${r.status === 'approved' ? 'text-ok' : 'text-bad'}`}>{r.status === 'approved' ? 'Approved' : 'Rejected'}</span>}
                      {!r.skipped && <span className="mono text-[12.5px] text-ink-2" aria-label={`Confidence ${Math.round(r.probability * 100)} percent`}>{Math.round(r.probability * 100)}%</span>}
                    </span>
                  </span>
                  <span className="mono truncate text-[13px]" title={r.path}>{r.path}</span>
                  {!r.skipped && <span className="text-[12px] text-muted">{r.impact_low === 0 && r.impact_high === 0 ? 'No traffic forecast' : <><Impact low={r.impact_low} high={r.impact_high} /> clicks/month</>}</span>}
                  {ps.length > 1 && (
                    <span aria-hidden className="flex h-1 gap-0.5 overflow-hidden rounded-full bg-sunken">
                      {ps.map(([k, p]) => <span key={k} style={{ flex: Math.max(1, Math.round(p * 100)), background: `var(--${k}-mark)` }} />)}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="flex items-center justify-between gap-2 px-4 py-3 text-[12.5px] text-muted">
              <span className="num">{((page - 1) * SIZE + 1).toLocaleString('en-GB')} to {Math.min(total, page * SIZE).toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}</span>
              <span className="flex gap-2">
                {page > 1 && <Link className="btn btn-sm" href={`${base}${qs({ ...keep, page: String(page - 1) })}`}>Previous</Link>}
                {page * SIZE < total && <Link className="btn btn-sm" href={`${base}${qs({ ...keep, page: String(page + 1) })}`}>Next</Link>}
              </span>
            </div>
          </section>
          <div className={`min-w-0 ${fromUrl ? '' : 'hidden lg:block'}`}>
            <nav aria-label="Decision navigation" className="mb-3 flex flex-wrap items-center gap-3 lg:hidden">
              <Link className="font-medium text-accent" href={`${base}${qs(keep)}`}>← Back to decisions</Link>
              <span className="ml-auto flex gap-2">
                {prev && <Link className="btn btn-sm" href={`${base}${qs(keep, { v: prev.id })}`}>Previous</Link>}
                {after && <Link className="btn btn-sm" href={`${base}${qs(keep, { v: after.id })}`}>Next</Link>}
              </span>
            </nav>
            {selected && <VerdictPanel key={selected.id} v={selected} siteId={id} nouls={nouls} task={openTaskForPath(id, selected.path)} back={back} nextBack={nextBack} />}
          </div>
        </div>
      )}
    </div>
  );
}
