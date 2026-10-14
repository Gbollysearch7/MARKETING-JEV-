import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDate, PageTitle, Prob, Section } from '@/components/ui';
import { Bar, Delta, EngineChip, OwnerBadge, pct, ReasonBadge, RouterNote, SentimentBadge, SourceChip } from '@/components/visibility/bits';
import { LossStatusSelect } from '@/components/visibility/LossStatusSelect';
import { latestJobOf } from '@/lib/modjobs';
import { ANALYSIS_JOB, dashboard, runningVisibilityJob } from '@/lib/modules/visibility';
import { analyseAction, loadSampleAction } from '@/lib/modules/visibility-actions';
import { ENGINE_LABEL, SOURCE_TYPES } from '@/modules/visibility/types';

export default async function Visibility({ params, searchParams }: PageProps<'/sites/[id]/visibility'>) {
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { site } = await requireSite(id);
  const d = dashboard(site);
  const job = runningVisibilityJob(id);
  const lastJob = latestJobOf(id, ANALYSIS_JOB);
  const base = `/sites/${id}/visibility`;
  const unexplained = d.losses.filter((l) => l.stillLost && !l.reason).length;
  const openLosses = d.losses.filter((l) => l.stillLost);
  const toast = sp.done === 'sample' ? `Loaded ${sp.n ?? 0} sample answers` : null;
  const sentimentTotal = d.sentiment.reduce((s, x) => s + x.n, 0);
  const maxTrend = Math.max(0.01, ...d.trend.map((t) => Math.max(t.visibility ?? 0, t.citation ?? 0)));

  const runButton = (
    <form action={analyseAction}>
      <input type="hidden" name="siteId" value={id} />
      <SubmitButton className="btn btn-primary" pending="Starting…" disabled={Boolean(job) || d.facts.length === 0}>Explain losses</SubmitButton>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast key={sp.n} message={toast} />}
      <PageTitle
        title="AI visibility"
        sub={<>Whether AI answers mention <strong className="font-medium text-ink">{d.cfg.name}</strong> for your buyer prompts, who won when they did not, and the most likely fix.</>}
        actions={d.facts.length ? <>{d.losses.length > 0 && <a className="btn" href={`/api/sites/${id}/visibility/export`}>Export register</a>}{runButton}</> : null}
      />

      {job && <div className="card px-5 py-4"><JobProgress jobId={job.id} initial={job} label={job.type === 'visibility-run' ? 'Asking the AI engines' : 'Jev is reading the answers'} /></div>}

      {d.facts.length === 0 ? (
        <section className="card">
          <Empty title="No AI answers captured yet">
            <p>Paste or upload answers you captured from ChatGPT, Claude, Perplexity or Gemini, or connect an engine key. Then every lost prompt gets a reason, a fix and an owner.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <form action={loadSampleAction}><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn btn-primary" pending="Loading…">Load sample data</SubmitButton></form>
              <Link className="btn" href={`${base}/answers`}>Add answers</Link>
              <Link className="btn btn-ghost" href={`${base}/setup`}>Set up brand and prompts</Link>
            </div>
          </Empty>
        </section>
      ) : (
        <>
          {d.alert && (
            <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 ${d.alert.points > 0 ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}>
              <div>
                <div className="font-semibold">Visibility {d.alert.points > 0 ? 'rose' : 'fell'} {Math.abs(d.alert.points).toFixed(1)} points</div>
                <div className="text-[13.5px]">From {pct(d.alert.before)} on {fmtDate(d.alert.from)} to {pct(d.alert.after)} on {fmtDate(d.alert.to)}. Alerts fire when the move between the two latest run dates is over 10 points.</div>
              </div>
              <Link href={`${base}/answers?date=${d.alert.to}`} className="btn btn-sm">See the answers</Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card px-5 py-4">
              <div className="label">Visibility rate</div>
              <div className="display num mt-1 text-[38px] leading-none">{pct(d.latest.visibility)}</div>
              <div className="mt-1 text-[12.5px] text-muted">prompts that mention you, averaged over runs{d.previous && <> · <Delta now={d.latest.visibility} before={d.previous.visibility} /></>}</div>
            </div>
            <div className="card px-5 py-4">
              <div className="label">Citation rate</div>
              <div className="display num mt-1 text-[38px] leading-none">{pct(d.latest.citation)}</div>
              <div className="mt-1 text-[12.5px] text-muted">answers that link to {d.cfg.domain}{d.previous && <> · <Delta now={d.latest.citation} before={d.previous.citation} /></>}</div>
            </div>
            <div className="card px-5 py-4">
              <div className="label">Share of voice</div>
              <div className="display num mt-1 text-[38px] leading-none">{pct(d.latest.shareOfVoice)}</div>
              <div className="mt-1 text-[12.5px] text-muted">{d.cfg.competitors.length ? `of mentions vs ${d.cfg.competitors.length} competitor${d.cfg.competitors.length === 1 ? '' : 's'}` : <Link className="underline" href={`${base}/setup`}>Add competitors</Link>}</div>
            </div>
            <div className="card px-5 py-4">
              <div className="label">Prompts lost</div>
              <div className="display num mt-1 text-[38px] leading-none">{fmt(openLosses.length)}<span className="text-[20px] text-muted"> / {fmt(d.latest.prompts)}</span></div>
              <div className="mt-1 text-[12.5px] text-muted">on {fmtDate(d.latestDate)}{unexplained ? ` · ${unexplained} not explained yet` : ''}</div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section title="By engine" sub="Latest run date for each engine. Each prompt counts once, averaged over its runs.">
              <table className="tbl min-w-[520px]">
                <thead><tr><th>Engine</th><th className="r">Answers</th><th>Visibility</th><th className="r">Citation</th><th className="r">Share of voice</th></tr></thead>
                <tbody>
                  {d.engines.map((e) => (
                    <tr key={e.engine}>
                      <td className="font-medium">{ENGINE_LABEL[e.engine]}</td>
                      <td className="r num">{fmt(e.latest.answers)}</td>
                      <td>
                        <div className="flex items-center gap-3"><span className="num w-11">{pct(e.latest.visibility)}</span><span className="w-24"><Bar v={e.latest.visibility} /></span></div>
                        {e.previousVisibility != null && <div className="text-[11.5px]"><Delta now={e.latest.visibility} before={e.previousVisibility} /></div>}
                      </td>
                      <td className="r num">{pct(e.latest.citation)}</td>
                      <td className="r num">{pct(e.latest.shareOfVoice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="Share of voice" sub={`Answers naming each brand on ${fmtDate(d.latestDate)}`}>
              <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
                {d.latest.voices.map((v) => (
                  <div key={v.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                    <span className={`truncate text-[13.5px] ${v.isBrand ? 'font-semibold' : 'text-ink-2'}`}>{v.name}{v.isBrand && <span className="ml-1.5 text-[11.5px] font-normal text-muted">you</span>}</span>
                    <span className="num text-[13px] text-muted">{pct(v.share)} · {v.mentions}</span>
                    <span className="col-span-2"><Bar v={v.share} tone={v.isBrand ? 'var(--accent)' : 'var(--leave-mark)'} label={`${v.name}: ${pct(v.share)} share of voice`} /></span>
                  </div>
                ))}
                {!d.cfg.competitors.length && <p className="text-[13px] text-muted">Add up to five competitors on <Link className="underline" href={`${base}/setup`}>Brand and prompts</Link> to compare.</p>}
              </div>
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section title="Trend by run date" sub="Visibility and citation rate for each date answers were captured.">
              <div className="flex flex-col gap-3 px-4 py-5 sm:px-6">
                <div className="flex gap-4 text-[12px] text-ink-2" aria-hidden>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />Visibility</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--chart-bar)' }} />Citation</span>
                </div>
                <div className="flex h-40 items-end gap-4 border-b border-line" role="img" aria-label={d.trend.map((t) => `${fmtDate(t.date)}: visibility ${pct(t.visibility)}, citation ${pct(t.citation)}`).join('; ')}>
                  {d.trend.slice(-12).map((t) => (
                    <div key={t.date} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
                      <div className="flex h-full w-full max-w-[34px] flex-col justify-end">
                        <span className="num mb-1 text-center text-[11.5px] text-ink-2">{pct(t.visibility)}</span>
                        <div className="w-full rounded-t-[4px] bg-accent" style={{ height: `${Math.max(2, ((t.visibility ?? 0) / maxTrend) * 80)}%` }} />
                      </div>
                      <div className="flex h-full w-full max-w-[22px] flex-col justify-end">
                        <div className="w-full rounded-t-[4px]" style={{ height: `${Math.max(2, ((t.citation ?? 0) / maxTrend) * 80)}%`, background: 'var(--chart-bar)' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4">{d.trend.slice(-12).map((t) => <span key={t.date} className="flex-1 truncate text-center text-[11px] text-muted">{fmtDate(t.date)}</span>)}</div>
                <details className="text-[12.5px]">
                  <summary className="cursor-pointer text-muted">Show as a table</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="tbl min-w-[460px]">
                      <thead><tr><th>Run date</th><th className="r">Answers</th><th className="r">Visibility</th><th className="r">Citation</th><th className="r">Share of voice</th></tr></thead>
                      <tbody>{d.trend.map((t) => <tr key={t.date}><td>{fmtDate(t.date)}</td><td className="r num">{t.answers}</td><td className="r num">{pct(t.visibility)}</td><td className="r num">{pct(t.citation)}</td><td className="r num">{pct(t.shareOfVoice)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              </div>
            </Section>
            <Section title="How you are described" sub="Jev's read of each answer that mentions you, and the sources engines cited.">
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
                {sentimentTotal ? (
                  <div className="flex flex-col gap-2">
                    {(['positive', 'neutral', 'negative', null] as const).map((s) => {
                      const n = d.sentiment.find((x) => x.sentiment === s)?.n ?? 0;
                      if (!n && s === null) return null;
                      return (
                        <div key={String(s)} className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-3">
                          {s ? <SentimentBadge s={s} /> : <span className="text-[12px] text-muted">Not scored</span>}
                          <Bar v={n / sentimentTotal} tone={s === 'positive' ? 'var(--ok)' : s === 'negative' ? 'var(--bad)' : 'var(--leave-mark)'} label={`${s ?? 'Not scored'}: ${n}`} />
                          <span className="num text-right text-[12.5px] text-muted">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-[13px] text-muted">No answers mention you on the latest run date.</p>}
                <div>
                  <div className="label mb-2">Cited sources, latest run</div>
                  <div className="flex flex-wrap gap-1.5">
                    {SOURCE_TYPES.filter((t) => d.sourceMix[t]).map((t) => <SourceChip key={t} t={t} n={d.sourceMix[t]} />)}
                    {!Object.keys(d.sourceMix).length && <span className="text-[13px] text-muted">No URLs were cited.</span>}
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <Section
            title="Loss register"
            sub={`Prompts where you are named in fewer than half the runs on an engine, on ${fmtDate(d.latestDate)}. Mark a fix done to measure the prompt again 30 days later.`}
            actions={unexplained ? <span className="text-[12.5px] text-warn">{unexplained} waiting for Jev</span> : lastJob ? <span className="text-[12px] text-muted">Explained by {lastJob.model}</span> : null}
          >
            {d.losses.length === 0 ? (
              <Empty title="No prompts lost">You are named in at least half the runs for every prompt on every engine.</Empty>
            ) : (
              <table className="tbl min-w-[1080px]">
                <thead><tr><th>Prompt</th><th>Won by</th><th>Most likely reason</th><th>Fix and owner</th><th className="r">Confidence</th><th>Status</th><th>30 days after done</th></tr></thead>
                <tbody>
                  {d.losses.map((l) => (
                    <tr key={l.promptId} className={l.stillLost ? '' : 'opacity-80'}>
                      <td className="max-w-[240px]">
                        <Link href={`${base}/prompts/${l.promptId}`} className="font-medium hover:underline">{l.prompt}</Link>
                        <div className="mt-1 flex flex-wrap gap-1">{l.stillLost ? l.engines.map((e) => <EngineChip key={e} e={e} />) : <span className="text-[12px] text-ok">Won back on the latest run</span>}</div>
                      </td>
                      <td className="text-ink-2">{l.winner ?? <span className="text-muted">No named competitor</span>}</td>
                      <td><div className="flex flex-col items-start gap-1"><ReasonBadge r={l.reason} /><RouterNote r={l.router} /></div></td>
                      <td className="max-w-[320px] text-[13px] text-ink-2">{l.fix ? <><span>{l.fix}</span><div className="mt-1"><OwnerBadge o={l.owner} /></div></> : <span className="text-faint">Run “Explain losses”</span>}</td>
                      <td className="r">{l.confidence != null ? <Prob p={l.confidence} /> : <span className="text-faint">—</span>}</td>
                      <td>{l.id ? <LossStatusSelect lossId={l.id} status={l.status} prompt={l.prompt} /> : <span className="text-[12px] text-faint">After analysis</span>}</td>
                      <td className="text-[13px]">
                        {l.status !== 'done' || !l.doneAt ? <span className="text-faint">—</span>
                          : l.after ? <span><span className="num font-medium">{pct(l.after.visibility)}</span> <span className="text-muted">on {fmtDate(l.after.date)}</span></span>
                          : <span className="text-muted">Done {fmtDate(l.doneAt)}; waiting for a run after {fmtDate(new Date(Date.parse(l.doneAt) + 30 * 86_400_000).toISOString())}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <p className="text-[12.5px] text-muted">
            Not in this release: scheduled daily runs (capture answers or run engines by hand for now), Google AI Overviews and AI Mode capture (needs a headless browser), AI crawler signals from log files or Cloudflare, and sending fixes to Briefs or Link prospects.
          </p>
        </>
      )}
    </div>
  );
}
