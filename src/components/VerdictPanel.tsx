import Link from 'next/link';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { reviewVerdictAction } from '@/lib/actions';
import type { Task, VerdictRow } from '@/lib/repo';
import { fmt, Impact, ROUTER_LABEL, StatusBadge, VERDICT_LABEL, VERDICT_MEANING } from './ui';

const BAND_LABEL: Record<string, string> = {
  monthly_clicks: 'Clicks a month', click_trend: 'Click trend', impression_trend: 'Impressions', average_position: 'Average position',
  position_change: 'Position change', ctr_vs_expected: 'CTR', ranks_8_to_20_for_high_volume_queries: 'High-volume queries at 8 to 20',
  sessions: 'Sessions', conversions: 'Conversions', referring_domains: 'Referring domains', internal_inlinks: 'Internal links in', word_count: 'Word count', content_age: 'Content age',
};
const NOUL_LABEL: Record<string, string> = { title_matches_queries: 'Title promises what the top queries ask for', time_sensitive: 'Contains claims that go out of date' };
const bandText = (b: string) => b.replace(/_/g, ' ').replace(/\s*\(.*\)$/, '');

const routerStyle = (r: string | null) =>
  r === 'auto' ? 'border-solid text-accent-strong border-accent' : r === 'review' ? 'border-solid text-warn border-warn' : 'border-dashed text-leave border-line-strong';

/** The evidence and the decision controls for one verdict. Used by the decision inbox. */
export function VerdictPanel({ v, siteId, nouls, task, back, nextBack }: {
  v: VerdictRow;
  siteId: string;
  nouls: { key: string; p: number }[];
  task: Task | null;
  back: string;
  nextBack: string;
}) {
  const verdict = (v.final_verdict ?? v.verdict) as Verdict | null;
  const probs = (Object.entries(v.probabilities) as [Verdict, number][]).sort((a, b) => b[1] - a[1]);
  const second = probs.find(([k]) => k !== v.verdict)?.[0] ?? 'leave';
  const target = v.final_target ?? v.target;
  const needsTarget = (v.verdict === 'merge' || v.verdict === 'redirect') && !v.target;

  if (v.skipped || !verdict) {
    return (
      <section className="card flex flex-col gap-3 p-7">
        <span className="self-start rounded-md bg-sunken px-2.5 py-1 text-[13px] font-semibold text-ink-2">Not scored</span>
        <h2 className="mono break-all text-[20px]">{v.path}</h2>
        <p className="text-muted">{v.skipped}. Pages that redirect, return errors, are noindexed or point their canonical elsewhere are listed but not scored.</p>
      </section>
    );
  }

  return (
    <section aria-label="Evidence" className="card flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-line px-7 py-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-[7px] px-2.5 py-1 text-[13px] font-bold" style={{ color: `var(--${verdict})`, background: `var(--${verdict}-bg)` }}>{VERDICT_LABEL[verdict]}</span>
          {v.router && <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${routerStyle(v.router)}`}>{v.locked_by ? 'Hard rule' : ROUTER_LABEL[v.router]}</span>}
          {(v.verdict === 'prune' || v.verdict === 'redirect') && <span className="text-[12px] text-muted">Always needs your approval</span>}
          <span className="ml-auto"><StatusBadge s={v.status} /></span>
        </div>
        <h2 className="mono break-all text-[20px] font-medium tracking-[-0.01em]">{v.path}</h2>
        {target && (
          <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            <span className="mono">{target}</span>
            {v.target_probability != null && target === v.target && <span className="text-muted">· {v.target_probability.toFixed(2)}</span>}
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3 pt-1">
          <div className="flex flex-col gap-0.5"><span className="text-[12px] text-muted">Probability</span><span className="num text-[26px] font-bold tracking-[-0.02em]">{v.probability.toFixed(2)}</span></div>
          <div className="flex flex-col gap-0.5"><span className="text-[12px] text-muted">Clicks a month now</span><span className="num text-[26px] font-bold tracking-[-0.02em]">{fmt(v.monthly_clicks)}</span></div>
          <div className="flex flex-col gap-0.5"><span className="text-[12px] text-muted">Expected change in 90 days</span><span className="text-[26px] font-bold tracking-[-0.02em]"><Impact low={v.impact_low} high={v.impact_high} /></span></div>
        </div>
      </div>

      <div className="flex flex-wrap">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 border-line px-7 py-6 md:border-r">
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-muted">Why</h3>
            {v.reasons.map((r) => (
              <div key={r} className="flex items-start gap-2.5"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: `var(--${verdict})` }} /><span>{r}</span></div>
            ))}
          </div>
          {v.settle.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3.5">
              <h3 className="text-[13px] font-semibold">What would settle it</h3>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-[13.5px] text-ink-2">{v.settle.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {!v.locked_by && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-[13px] font-semibold text-muted">Every option the model weighed</h3>
              {probs.map(([k, p]) => (
                <div key={k} className="grid grid-cols-[76px_minmax(0,1fr)_40px] items-center gap-2.5">
                  <span className="text-[13px] font-semibold" style={{ color: `var(--${k})` }}>{VERDICT_LABEL[k]}</span>
                  <span className="h-2 rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${Math.round(p * 100)}%`, background: k === 'leave' ? '#a6aebb' : `var(--${k})` }} /></span>
                  <span className="num mono text-right text-[12.5px]">{p.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {nouls.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold text-muted">Atomic answers</h3>
              {nouls.map((n) => (
                <div key={n.key} className="flex items-center justify-between gap-3 text-[13px]"><span>{NOUL_LABEL[n.key] ?? n.key}</span><span className="mono">yes {n.p.toFixed(2)}</span></div>
              ))}
            </div>
          )}
          {v.rules.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[13px] font-semibold text-muted">Hard rules applied</h3>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px]">{v.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
        </div>
        {v.bands && (
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 px-7 py-6">
            <h3 className="text-[13px] font-semibold text-muted">Signals sent to Jev</h3>
            <p className="text-[12.5px] text-muted">Numbers are turned into named bands in code. The model never does arithmetic.</p>
            <div className="flex flex-col">
              {Object.entries(v.bands).map(([k, b]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
                  <span className="text-muted">{BAND_LABEL[k] ?? k}</span>
                  <span className={`text-right font-medium ${b.startsWith('unknown') ? 'text-faint' : ''}`}>{bandText(b)}</span>
                </div>
              ))}
            </div>
            {v.state != null && (
              <details className="pt-2">
                <summary className="cursor-pointer text-[12.5px] text-muted">Exact state sent</summary>
                <pre className="mono mt-2 max-h-[360px] overflow-auto rounded-lg bg-bg p-3 text-[11.5px] leading-relaxed">{JSON.stringify(v.state, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3 rounded-b-2xl border-t border-line bg-[#fbfbfc] px-7 py-4">
        {v.status === 'proposed' ? (
          <>
            {needsTarget && <p className="text-[13px] text-warn">No confident target. Choose one with Change below.</p>}
            <form action={reviewVerdictAction} className="flex flex-wrap items-center gap-2.5">
              <input type="hidden" name="verdictId" value={v.id} />
              <input type="hidden" name="back" value={nextBack} />
              <button name="decision" value="approve" className="btn btn-primary h-11" disabled={needsTarget}>Approve {VERDICT_LABEL[v.verdict!]}</button>
              <button name="decision" value="reject" className="btn h-11 text-bad">Reject</button>
              <span className="ml-auto mono text-[12px] text-muted">{v.model === 'mock' ? 'offline mock' : v.model} · content-verdict.v1</span>
            </form>
            <details className="rounded-xl border border-line bg-surface" open={v.router === 'uncertain' || needsTarget}>
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">Change the verdict</summary>
              <form action={reviewVerdictAction} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
                <input type="hidden" name="verdictId" value={v.id} />
                <input type="hidden" name="back" value={nextBack} />
                <input type="hidden" name="decision" value="change" />
                <label className="flex flex-col gap-1 text-[12px] text-muted">Verdict
                  <select name="verdict" className="select" defaultValue={second}>{VERDICTS.map((x) => <option key={x} value={x}>{VERDICT_LABEL[x]} · {VERDICT_MEANING[x]}</option>)}</select>
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-muted">Target path, for Merge and Redirect
                  <input name="target" className="input mono" defaultValue={v.target ?? ''} placeholder="/guides/best-tent" />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">Reason, optional, it teaches the model
                  <input name="reason" className="input" placeholder="For example: seasonal page, traffic returns every spring" />
                </label>
                <div className="sm:col-span-2"><button className="btn btn-dark">Save and approve</button></div>
              </form>
            </details>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <StatusBadge s={v.status} />
            {v.reviewed_by === 'auto' && <span className="text-muted">Auto-approved at 0.85 or above</span>}
            {v.final_verdict && v.final_verdict !== v.verdict && <span className="text-muted">Changed from {VERDICT_LABEL[v.verdict!]}</span>}
            {task && <Link className="font-semibold text-accent" href={`/sites/${siteId}/queue?t=${task.id}`}>Open the task</Link>}
            <Link className="ml-auto text-muted underline" href={back}>Back to the list</Link>
          </div>
        )}
      </div>
    </section>
  );
}
