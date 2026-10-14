import Link from 'next/link';
import { loadSamplesAction, runVerdictsAction } from '@/lib/actions';
import { SubmitButton } from './SubmitButton';

type Step = { key: string; title: string; detail: string; done: boolean; action: React.ReactNode };

/** First-run checklist. Each step ticks itself off from real state; it disappears once everything is done. */
export function Onboarding({ siteId, hasData, scored, reviewed, taskDone }: { siteId: string; hasData: boolean; scored: boolean; reviewed: boolean; taskDone: boolean }) {
  const base = `/sites/${siteId}`;
  const steps: Step[] = [
    {
      key: 'data', title: 'Add your data', detail: 'Start with a Search Console export or a crawl. Add analytics and backlinks later.', done: hasData,
      action: (
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/data`} className="btn btn-primary btn-sm">Upload exports</Link>
          <form action={loadSamplesAction}><input type="hidden" name="siteId" value={siteId} /><SubmitButton className="btn btn-sm" pending="Loading…">Try with sample data</SubmitButton></form>
        </div>
      ),
    },
    {
      key: 'score', title: 'Score every URL', detail: 'Every page gets a verdict, a reason and a confidence.', done: scored,
      action: <form action={runVerdictsAction}><input type="hidden" name="siteId" value={siteId} /><SubmitButton className="btn btn-primary btn-sm" pending="Starting…" disabled={!hasData}>Score now</SubmitButton></form>,
    },
    { key: 'review', title: 'Review your first decision', detail: 'Approve, change or reject. Shortcuts: A, R, J and K.', done: reviewed, action: <Link href={`${base}/inbox`} className="btn btn-primary btn-sm">Open the inbox</Link> },
    { key: 'done', title: 'Ship a change and mark it done', detail: 'Its outcome is measured at 30, 60 and 90 days.', done: taskDone, action: <Link href={`${base}/queue`} className="btn btn-primary btn-sm">Open the work queue</Link> },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const current = steps.find((s) => !s.done)!;
  return (
    <section aria-label="Getting started" className="card enter overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div><h2 className="display text-[26px] leading-tight">Get your first win</h2><p className="text-[13px] text-muted">{doneCount} of {steps.length} done</p></div>
        <div className="flex h-1.5 w-40 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Getting started progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s, i) => {
          const isCurrent = s.key === current.key;
          return (
            <li key={s.key} className={`flex flex-wrap items-center gap-4 px-6 py-4 ${isCurrent ? 'bg-surface-2' : ''}`}>
              <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[12.5px] font-semibold ${s.done ? 'bg-accent text-[var(--accent-ink)]' : isCurrent ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'bg-sunken text-muted'}`}>
                {s.done ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${s.done ? 'text-muted line-through decoration-[var(--line-input)]' : ''}`}>{s.title}</div>
                {!s.done && <div className="text-[13px] text-muted">{s.detail}</div>}
              </div>
              {isCurrent && s.action}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
