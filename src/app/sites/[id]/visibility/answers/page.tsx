import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDate, PageTitle, Pager, qs, Section } from '@/components/ui';
import { EngineChip, PositionBadge, SentimentBadge, SourceChip } from '@/components/visibility/bits';
import { latestJobOf } from '@/lib/modjobs';
import { answerFacts, engineStatus, listAnswers, listPrompts, MAX_LIVE_PROMPTS, RUN_JOB, runningVisibilityJob } from '@/lib/modules/visibility';
import { clearAnswersAction, liveRunAction, loadSampleAction, pasteAnswersAction } from '@/lib/modules/visibility-actions';
import { runDates } from '@/modules/visibility/aggregate';
import { MAX_OUTPUT_TOKENS, RUNS_PER_PROMPT } from '@/modules/visibility/runners';
import { ENGINE_LABEL, ENGINES, SOURCE_TYPES } from '@/modules/visibility/types';

const SIZE = 25;
const EXAMPLE = `prompt,engine,answer text,cited urls,run date
best hiking boots for beginners,chatgpt,"Here are some options: …",https://example.com/boots,2026-10-06`;

export default async function VisibilityAnswers({ params, searchParams }: PageProps<'/sites/[id]/visibility/answers'>) {
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  await requireSite(id);
  const page = Math.max(1, Number(sp.page) || 1);
  const f = { engine: sp.engine, date: sp.date, mentioned: sp.mentioned, prompt: sp.prompt };
  const { rows, total } = listAnswers(id, f, SIZE, (page - 1) * SIZE);
  const facts = answerFacts(id);
  const dates = runDates(facts).reverse();
  const engines = ENGINES.filter((e) => facts.some((x) => x.engine === e));
  const status = engineStatus();
  const connected = status.filter((s) => s.connected);
  const prompts = listPrompts(id);
  const job = runningVisibilityJob(id);
  const lastRun = latestJobOf(id, RUN_JOB);
  const base = `/sites/${id}/visibility`;
  const callCount = Math.min(prompts.length, MAX_LIVE_PROMPTS) * connected.length * RUNS_PER_PROMPT;
  const toast = sp.done === 'imported' ? `Imported ${sp.n ?? 0} answers${Number(sp.dup) ? `, ${sp.dup} duplicates skipped` : ''}` : sp.done === 'cleared' ? 'All answers deleted' : null;

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast key={`${sp.done}${sp.n}`} message={toast} />}
      <PageTitle title="Answers" sub="Every captured AI answer, read in code for brand mentions, position, citations and competitors. Jev then scores how you are described and explains each lost prompt." />
      {sp.error && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[13.5px] text-bad">{sp.error}</div>}
      {sp.notes && <div className="rounded-xl bg-warn-bg px-4 py-3 text-[13.5px] text-warn">{sp.notes}</div>}
      {job && <div className="card px-5 py-4"><JobProgress jobId={job.id} initial={job} label={job.type === RUN_JOB ? 'Asking the AI engines' : 'Jev is reading the answers'} /></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Import captured answers" sub="CSV with columns: prompt, engine, answer text, cited URLs (optional), run date. Engines: chatgpt, claude, perplexity, gemini, ai_overviews, other.">
          <div className="flex flex-col gap-5 px-4 py-5 sm:px-6">
            <form action={`/api/sites/${id}/visibility/upload`} method="post" encType="multipart/form-data" className="flex flex-col gap-2">
              <label className="text-[13px] font-medium" htmlFor="vis-file">Upload a CSV</label>
              <div className="flex flex-wrap items-center gap-2">
                <input id="vis-file" type="file" name="file" accept=".csv,.tsv,.txt,text/csv" required className="input min-w-0 flex-1 py-1.5 text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-sunken file:px-3 file:py-1 file:text-[12.5px] file:text-ink" />
                <button className="btn btn-primary">Upload</button>
              </div>
            </form>
            <form action={pasteAnswersAction} className="flex flex-col gap-2">
              <input type="hidden" name="siteId" value={id} />
              <label className="text-[13px] font-medium" htmlFor="vis-paste">Or paste CSV text</label>
              <textarea id="vis-paste" name="csv" rows={5} className="input mono text-[12px]" placeholder={EXAMPLE} />
              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton className="btn" pending="Importing…">Import pasted answers</SubmitButton>
                <span className="text-[12px] text-muted">Up to about 1 MB; upload bigger files.</span>
              </div>
            </form>
            {facts.length === 0 && (
              <form action={loadSampleAction} className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken px-4 py-3">
                <input type="hidden" name="siteId" value={id} />
                <span className="flex-1 text-[13px] text-ink-2">Try it with 60 sample answers for Sample Outdoors across three engines and two run dates.</span>
                <SubmitButton className="btn btn-sm" pending="Loading…">Load sample data</SubmitButton>
              </form>
            )}
          </div>
        </Section>

        <Section title="Run engines live" sub={`Each prompt is sent ${RUNS_PER_PROMPT} times to every connected engine and the answers are dated today.`}>
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
            <ul className="flex flex-col gap-2">
              {status.map((s) => (
                <li key={s.engine} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${s.connected ? 'bg-ok' : 'bg-line-strong'}`} />
                    <span className="font-medium">{ENGINE_LABEL[s.engine]}</span>
                    <span className="text-[12px] text-muted">{s.provider}</span>
                  </span>
                  <span className="text-[12px]">{s.connected ? <span className="text-ok">Connected · <span className="mono">{s.model}</span></span> : <span className="text-muted">Set <code className="mono">{s.envKey}</code> on the server</span>}</span>
                </li>
              ))}
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3.5 py-2.5 text-muted">
                <span className="flex items-center gap-2"><span aria-hidden className="h-2 w-2 rounded-full bg-line-strong" /><span className="font-medium">Google AI Overviews and AI Mode</span></span>
                <span className="text-[12px]">Not available yet: needs a headless browser. Paste captured answers instead.</span>
              </li>
            </ul>
            <form action={liveRunAction} className="flex flex-col gap-2">
              <input type="hidden" name="siteId" value={id} />
              <div><SubmitButton className="btn btn-primary" pending="Starting…" disabled={!connected.length || !prompts.length || Boolean(job)}>
                {connected.length && prompts.length ? `Run ${fmt(callCount)} calls now` : 'Run engines now'}
              </SubmitButton></div>
              <p className="text-[12.5px] text-muted">
                {!connected.length
                  ? 'No engine key is set, so live runs are off. Add a key to the server environment and restart; until then, import captured answers.'
                  : !prompts.length ? <>Add prompts on <Link className="underline" href={`${base}/setup`}>Brand and prompts</Link> first.</>
                  : `${Math.min(prompts.length, MAX_LIVE_PROMPTS)} prompts × ${connected.length} engine${connected.length === 1 ? '' : 's'} × ${RUNS_PER_PROMPT} runs, capped at ${fmt(MAX_OUTPUT_TOKENS)} output tokens each. Provider charges apply.`}
                {' '}The runners call each provider’s public API directly and have not been tested against live keys in this build.
              </p>
              {lastRun && <p className="text-[12px] text-muted">Last live run {fmtDate(lastRun.finished_at)}: {lastRun.message}</p>}
            </form>
          </div>
        </Section>
      </div>

      <Section
        title={`${fmt(total)} answer${total === 1 ? '' : 's'}`}
        sub="Mentions and citations are found in code; sentiment is Jev's read."
        actions={
          <div className="flex flex-wrap gap-2">
            <select className="select h-8 py-0 text-[13px]" aria-label="Filter by engine" defaultValue={f.engine ?? ''} form="vis-filter" name="engine">
              <option value="">All engines</option>{engines.map((e) => <option key={e} value={e}>{ENGINE_LABEL[e]}</option>)}
            </select>
            <select className="select h-8 py-0 text-[13px]" aria-label="Filter by run date" defaultValue={f.date ?? ''} form="vis-filter" name="date">
              <option value="">All dates</option>{dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
            <select className="select h-8 py-0 text-[13px]" aria-label="Filter by mention" defaultValue={f.mentioned ?? ''} form="vis-filter" name="mentioned">
              <option value="">Mentioned or not</option><option value="yes">Mentions you</option><option value="no">Does not mention you</option>
            </select>
            <form id="vis-filter" action={`${base}/answers`}>{f.prompt && <input type="hidden" name="prompt" value={f.prompt} />}<button className="btn btn-sm">Filter</button></form>
            {(f.engine || f.date || f.mentioned || f.prompt) && <Link className="btn btn-sm btn-ghost" href={`${base}/answers`}>Clear</Link>}
          </div>
        }
      >
        {total === 0 ? (
          <Empty title={facts.length ? 'No answers match' : 'No answers yet'}>{facts.length ? 'Try other filters.' : 'Import a CSV above or load the sample data.'}</Empty>
        ) : (
          <>
            <table className="tbl min-w-[980px]">
              <thead><tr><th>Prompt</th><th>Engine</th><th>Run</th><th>You</th><th>Competitors named</th><th>Cited sources</th><th>Sentiment</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const types = SOURCE_TYPES.map((t) => ({ t, n: r.cited.filter((c) => c.type === t).length })).filter((x) => x.n);
                  return (
                    <tr key={r.id}>
                      <td className="max-w-[260px]"><Link className="hover:underline" href={`${base}/prompts/${r.promptId}#a-${r.id}`}>{r.prompt}</Link></td>
                      <td><EngineChip e={r.engine} /></td>
                      <td className="whitespace-nowrap text-[12.5px] text-muted">{fmtDate(r.runDate)} · #{r.runIndex}</td>
                      <td><div className="flex flex-col items-start gap-1"><PositionBadge p={r.position} />{r.brandCited && <span className="text-[11.5px] text-ok">Cited</span>}</div></td>
                      <td className="max-w-[200px] text-[13px] text-ink-2">{r.competitors.length ? r.competitors.join(', ') : <span className="text-faint">None</span>}</td>
                      <td><div className="flex max-w-[220px] flex-wrap gap-1">{types.length ? types.map((x) => <SourceChip key={x.t} t={x.t} n={x.n} />) : <span className="text-[12px] text-faint">None</span>}</div></td>
                      <td><SentimentBadge s={r.sentiment} conf={r.sentimentConf} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager total={total} page={page} size={SIZE} href={(p) => `${base}/answers${qs(f, { page: p })}`} />
          </>
        )}
      </Section>

      {facts.length > 0 && (
        <details className="card px-5 py-4">
          <summary className="cursor-pointer text-[13.5px] text-muted">Delete all captured answers</summary>
          <form action={clearAnswersAction} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="siteId" value={id} />
            <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="confirm" value="yes" className="h-4 w-4" /> Delete {fmt(facts.length)} answers and open losses. Prompts, brand settings and done fixes are kept.</label>
            <SubmitButton className="btn btn-sm btn-danger" pending="Deleting…">Delete answers</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
