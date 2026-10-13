import Link from 'next/link';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { VerdictPanel } from '@/components/VerdictPanel';
import { Empty, qs, VERDICT_LABEL } from '@/components/ui';
import { decisionsForPath, getVerdict, latestVerdictJob, listVerdicts, openTaskForPath, type VerdictFilter } from '@/lib/repo';

const SIZE = 40;
const SHOWS = [
  { key: 'waiting', label: 'Waiting for you' },
  { key: 'review', label: 'Needs review' },
  { key: 'uncertain', label: 'Uncertain' },
  { key: 'irreversible', label: 'Prune and Redirect' },
  { key: 'all', label: 'All verdicts' },
] as const;

function filterFor(show: string, sp: Record<string, string | undefined>): VerdictFilter {
  const f: VerdictFilter = { q: sp.q, verdict: sp.verdict, template: sp.template, traffic: sp.traffic };
  if (show === 'all') return f;
  f.status = 'proposed';
  f.actionOnly = true; // Leave needs no action, so it never waits in the inbox
  if (show === 'review') f.router = 'review';
  if (show === 'uncertain') f.router = 'uncertain';
  if (show === 'irreversible') f.verdict = 'irreversible';
  return f;
}

export default async function Inbox({ params, searchParams }: PageProps<'/sites/[id]/inbox'>) {
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const job = latestVerdictJob(id);
  if (!job) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Decision inbox</h1>
        <section className="card"><Empty title="Nothing scored yet"><Link className="underline" href={`/sites/${id}/data`}>Upload your data</Link>, then score every URL from the Overview.</Empty></section>
      </div>
    );
  }
  const show = SHOWS.some((s) => s.key === sp.show) ? sp.show! : 'waiting';
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = listVerdicts(job.id, filterFor(show, sp), SIZE, (page - 1) * SIZE);
  const keep = { show: show === 'waiting' ? undefined : show, q: sp.q, verdict: sp.verdict, page: page > 1 ? String(page) : undefined };
  const base = `/sites/${id}/inbox`;

  const selected = (sp.v ? getVerdict(sp.v) : null) ?? rows[0] ?? null;
  const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
  const next = rows.find((r, i) => i > idx && r.status === 'proposed' && r.id !== selected?.id) ?? rows.find((r) => r.status === 'proposed' && r.id !== selected?.id);
  const back = `${base}${qs(keep, { v: selected?.id })}`;
  const nextBack = `${base}${qs(keep, { v: next?.id })}`;
  const nouls = selected
    ? decisionsForPath(selected.job_id, selected.path).filter((d) => d.answer.type === 'noul').map((d) => ({ key: d.question_key, p: Number(d.answer.noul) }))
    : [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">Decision inbox</h1>
          <p className="text-muted">Biggest expected impact first. Approve sends a decision to the work queue; changing it teaches the model.</p>
        </div>
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
          {SHOWS.map((s) => {
            const on = s.key === show;
            return (
              <Link key={s.key} href={`${base}${qs({ show: s.key === 'waiting' ? undefined : s.key })}`} aria-current={on ? 'true' : undefined}
                className={`flex min-h-9 items-center rounded-full border px-3.5 ${on ? 'border-ink bg-ink font-semibold text-white' : 'border-line-strong bg-surface hover:border-ink-2'}`}>
                {s.label}{on ? ` · ${total.toLocaleString('en-GB')}` : ''}
              </Link>
            );
          })}
        </nav>
      </header>

      <form className="flex flex-wrap items-center gap-2">
        {show !== 'waiting' && <input type="hidden" name="show" value={show} />}
        <input name="q" defaultValue={sp.q} placeholder="URL contains" className="input w-56" aria-label="URL contains" />
        {show !== 'irreversible' && (
          <select name="verdict" defaultValue={sp.verdict ?? ''} className="select" aria-label="Verdict">
            <option value="">Any verdict</option>
            {VERDICTS.map((v) => <option key={v} value={v}>{VERDICT_LABEL[v]}</option>)}
            {show === 'all' && <option value="skipped">Not scored</option>}
          </select>
        )}
        <button className="btn">Apply</button>
        {(sp.q || sp.verdict) && <Link href={`${base}${qs({ show: keep.show })}`} className="text-[13px] text-muted underline">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <section className="card">
          <Empty title={show === 'waiting' ? 'Inbox zero' : 'Nothing matches'}>
            {show === 'waiting' ? <>Every decision has been reviewed. See the <Link className="underline" href={`/sites/${id}/queue`}>work queue</Link>.</> : 'Try another filter.'}
          </Empty>
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <section aria-label="Decisions" className="card min-w-0 flex-[1_1_340px] overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto">
            {rows.map((r) => {
              const verdict = (r.final_verdict ?? r.verdict) as Verdict | null;
              const on = r.id === selected?.id;
              const ps = (Object.entries(r.probabilities) as [Verdict, number][]).sort((a, b) => b[1] - a[1]);
              return (
                <Link key={r.id} href={`${base}${qs(keep, { v: r.id })}`} aria-current={on ? 'true' : undefined} scroll={false}
                  className={`flex flex-col gap-2 border-b border-line border-l-[3px] px-4 py-3.5 ${on ? 'border-l-accent bg-[#f4f5ff]' : 'border-l-transparent hover:bg-[#fafbfc]'}`}>
                  <span className="flex items-center justify-between gap-2">
                    {verdict ? (
                      <span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ color: `var(--${verdict})`, background: `var(--${verdict}-bg)` }}>{VERDICT_LABEL[verdict]}</span>
                    ) : <span className="rounded-md bg-sunken px-2 py-0.5 text-[12px] font-semibold text-ink-2">Not scored</span>}
                    <span className="flex items-center gap-2">
                      {r.status !== 'proposed' && <span className={`text-[12px] font-semibold ${r.status === 'approved' ? 'text-ok' : 'text-bad'}`}>{r.status === 'approved' ? 'Approved' : 'Rejected'}</span>}
                      {!r.skipped && <span className="mono text-[12.5px] text-ink-2">{r.probability.toFixed(2)}</span>}
                    </span>
                  </span>
                  <span className="mono truncate text-[13px]">{r.path}</span>
                  {ps.length > 1 && (
                    <span aria-hidden className="flex h-1 gap-0.5 overflow-hidden rounded-full bg-sunken">
                      {ps.map(([k, p]) => <span key={k} style={{ flex: Math.max(1, Math.round(p * 100)), background: k === 'leave' ? '#a6aebb' : `var(--${k})` }} />)}
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
          <div className="min-w-0 flex-[999_1_480px]">
            {selected && <VerdictPanel v={selected} siteId={id} nouls={nouls} task={openTaskForPath(id, selected.path)} back={back} nextBack={nextBack} />}
          </div>
        </div>
      )}
    </div>
  );
}
