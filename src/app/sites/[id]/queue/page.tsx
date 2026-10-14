import { requireSite } from '@/lib/auth';
import Link from 'next/link';
import type { Verdict } from '@/engine/verdict/types';
import { TaskEditor } from '@/components/TaskEditor';
import { Toast } from '@/components/Toast';
import { BreakPath, Empty, fmtDate, Impact, StatusBadge, VERDICT_LABEL } from '@/components/ui';
import { REDIRECT_FORMATS, redirectRules } from '@/lib/exports';
import { listTasks, outcomesForTask, type Task } from '@/lib/repo';

const DONE_SHOWN = 25;
const COLUMNS: { key: Task['status']; label: string; empty: string }[] = [
  { key: 'todo', label: 'To do', empty: 'Approved decisions land here.' },
  { key: 'in_progress', label: 'In progress', empty: 'Move a task here when work starts.' },
  { key: 'done', label: 'Done, being measured', empty: 'Done tasks are measured at 30, 60 and 90 days.' },
];

function Badge({ v }: { v: Verdict }) {
  return <span className="self-start rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ color: `var(--${v})`, background: `var(--${v}-bg)` }}>{VERDICT_LABEL[v]}</span>;
}

export default async function Queue({ params, searchParams }: PageProps<'/sites/[id]/queue'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const all = listTasks(id);
  const cancelled = listTasks(id, { status: 'cancelled' });
  const rules = redirectRules(all);
  const today = new Date().toISOString().slice(0, 10);
  const fromUrl = all.find((t) => t.id === sp.t) ?? cancelled.find((t) => t.id === sp.t);
  const selected = fromUrl ?? all.find((t) => t.status !== 'done') ?? all[0] ?? null;
  const outs = selected ? outcomesForTask(selected.id) : [];
  const base = `/sites/${id}/queue`;

  return (
    <div className="flex flex-col gap-5">
      {sp.saved && selected && <Toast key={`${sp.t}-${sp.saved}`} message={selected.status === 'done' ? 'Saved. The outcome is measured from each later Search Console upload.' : selected.status === 'cancelled' ? 'Task cancelled' : 'Task saved'} />}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[720px] flex-col gap-1">
          <h1 className="display text-[40px] leading-[1.05]">Work queue</h1>
          <p className="text-muted">Approved decisions, each with a brief. Mark one done when the change is live and its outcome starts being measured.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn h-11" href={`/api/sites/${id}/export/tasks`}>Export tasks CSV</a>
          <details className="relative">
            <summary className="btn btn-dark h-11 list-none">Download redirect file ▾</summary>
            <div className="absolute right-0 z-10 mt-2 flex w-72 flex-col rounded-xl border border-line bg-surface p-2 shadow-[0_8px_24px_rgba(13,17,23,0.12)]">
              <p className="px-2 pb-2 pt-1 text-[12.5px] text-muted">{rules.filter((r) => r.code === 301).length} redirects and {rules.filter((r) => r.code === 410).length} removals from Merge, Redirect and Prune tasks.</p>
              {Object.entries(REDIRECT_FORMATS).map(([k, f]) => (
                <a key={k} className="rounded-lg px-2 py-2 text-[13.5px] hover:bg-sunken" href={`/api/sites/${id}/export/redirects?format=${k}`}>{f.label}</a>
              ))}
            </div>
          </details>
        </div>
      </header>

      {all.length === 0 && cancelled.length === 0 ? (
        <section className="card"><Empty title="No tasks yet">Approve decisions in the <Link href={`/sites/${id}/inbox`} className="underline">decision inbox</Link> to fill the queue.</Empty></section>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className={`min-w-0 ${fromUrl ? 'hidden xl:block' : ''}`}>
            <p className="mb-3 text-[12px] text-muted xl:hidden">Select a task to open its brief. Scroll across to see all three statuses.</p>
            <div role="region" aria-label="Task board" tabIndex={0} className="overflow-x-auto pb-3">
            <div className="grid grid-cols-[repeat(3,minmax(220px,1fr))] items-start gap-3.5">
            {COLUMNS.map((c) => {
              let items = all.filter((t) => t.status === c.key);
              // Done tasks pile up over months; show the most recent unless asked for all.
              const hiddenDone = c.key === 'done' && sp.done !== 'all' ? Math.max(0, items.length - DONE_SHOWN) : 0;
              if (c.key === 'done') items = [...items].sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')).slice(0, hiddenDone ? DONE_SHOWN : undefined);
              return (
                <section key={c.key} aria-label={c.label} className="flex max-h-[65vh] flex-col gap-2.5 overflow-y-auto xl:max-h-[calc(100vh-220px)]">
                  <h2 className="flex justify-between px-1 text-[13px] font-semibold text-ink-2">{c.label}<span className="mono text-muted">{items.length + hiddenDone}</span></h2>
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-line-strong px-3.5 py-5 text-center text-[13px] text-muted">{c.empty}</div>}
                  {items.map((t) => {
                    const on = t.id === selected?.id;
                    return (
                      <Link key={t.id} href={`${base}?t=${t.id}`} aria-current={on ? 'true' : undefined}
                        className={`flex flex-col gap-2.5 rounded-xl bg-surface p-3.5 ${on ? 'border-2 border-accent' : 'border border-line hover:border-line-strong'}`}>
                        <Badge v={t.verdict} />
                        <span className="mono text-[13px] [overflow-wrap:anywhere]" title={t.path}><BreakPath path={t.path} /></span>
                        <span className="flex justify-between gap-2 text-[12.5px] text-muted">
                          <span className="min-w-0 break-words">{t.owner || 'Unassigned'}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}</span>
                          <span className="mono flex-none whitespace-nowrap text-ink-2"><Impact low={t.forecast_low} high={t.forecast_high} /></span>
                        </span>
                      </Link>
                    );
                  })}
                  {hiddenDone > 0 && <Link href={`${base}?done=all`} className="px-1 text-[12.5px] text-muted underline">Show {hiddenDone} older done {hiddenDone === 1 ? 'task' : 'tasks'}</Link>}
                </section>
              );
            })}
            {cancelled.length > 0 && <p className="col-span-full text-[12.5px] text-muted">{cancelled.length} cancelled {cancelled.length === 1 ? 'task' : 'tasks'} hidden.</p>}
            </div>
            </div>
          </div>

          {selected && (
            <section key={selected.id} aria-label="Brief" className={`card min-w-0 flex-col ${fromUrl ? 'flex' : 'hidden xl:flex'}`}>
              <Link href={base} className="border-b border-line px-5 py-3 font-medium text-accent xl:hidden">← Back to the task board</Link>
              <div className="flex flex-col gap-2.5 border-b border-line px-6 py-5">
                <div className="flex items-center justify-between gap-2"><Badge v={selected.verdict} /><StatusBadge s={selected.status} /></div>
                <h2 className="mono text-[18px] font-medium [overflow-wrap:anywhere]"><BreakPath path={selected.path} /></h2>
                {selected.target && <div className="mono text-[13px] text-muted [overflow-wrap:anywhere]">→ <BreakPath path={selected.target} /></div>}
                <p className="text-ink-2">{selected.brief.summary}</p>
                <div className="text-[13px] text-muted">Expected <span className="font-medium text-ink"><Impact low={selected.forecast_low} high={selected.forecast_high} /></span> clicks a month in 90 days</div>
              </div>
              <TaskEditor key={selected.id} task={selected} today={today} back={`${base}?t=${selected.id}&saved=1`} />
              <div className="flex flex-col gap-2.5 border-b border-line px-6 py-4">
                <h3 className="text-[13px] font-semibold text-muted">Checklist</h3>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5">{selected.brief.checklist.map((c) => <li key={c}>{c}</li>)}</ol>
                {selected.brief.redirect && (
                  <div className="mono rounded-lg bg-bg px-3 py-2 text-[12px]">{selected.brief.redirect.code === 410 ? `${selected.path}  →  410 Gone` : `${selected.path}  →  ${selected.target ?? '(choose a target)'}  301`}</div>
                )}
                {selected.brief.notes.map((n) => <p key={n} className="text-[12.5px] text-muted">{n}</p>)}
              </div>
              {selected.brief.queries.length > 0 && (
                <div className="flex flex-col px-6 py-4">
                  <h3 className="mb-1.5 text-[13px] font-semibold text-muted">Queries to target</h3>
                  <div className="grid grid-cols-[minmax(0,1fr)_72px_48px] gap-2 border-b border-line py-1.5 text-[12px] text-muted"><span>Query</span><span className="text-right">Impr.</span><span className="text-right">Pos.</span></div>
                  {selected.brief.queries.map((q) => (
                    <div key={q.query} className="grid grid-cols-[minmax(0,1fr)_72px_48px] gap-2 py-1.5 text-[13px]"><span>{q.query}</span><span className="mono text-right">{q.impressions.toLocaleString('en-GB')}</span><span className="mono text-right">{q.position.toFixed(1)}</span></div>
                  ))}
                </div>
              )}
              {outs.length > 0 && (
                <div className="flex flex-wrap gap-3 border-t border-line px-6 py-4 text-[12.5px]">
                  {outs.map((o) => <span key={o.window_days} className="flex items-center gap-1.5">{o.window_days} days <StatusBadge s={o.label} /></span>)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
