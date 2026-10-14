import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/auth';
import { Empty, fmtDate, PageTitle, Prob, Section } from '@/components/ui';
import { EngineChip, HighlightedAnswer, OwnerBadge, pct, PositionBadge, ReasonBadge, RouterNote, SentimentBadge, SourceChip } from '@/components/visibility/bits';
import { LossStatusSelect } from '@/components/visibility/LossStatusSelect';
import { capturedThisWeek, getSettings, promptDetail, ukToday } from '@/lib/modules/visibility';
import { CaptureForm } from '@/components/visibility/CaptureForm';
import { Toast } from '@/components/Toast';
import { weekStart } from '@/modules/visibility/aggregate';

export default async function PromptDetail({ params, searchParams }: PageProps<'/sites/[id]/visibility/prompts/[pid]'>) {
  const { id, pid } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { site } = await requireSite(id);
  const d = promptDetail(site, pid);
  if (!d) notFound();
  const cfg = getSettings(site);
  const base = `/sites/${id}/visibility`;
  const byDate = new Map<string, typeof d.answers>();
  for (const a of d.answers) byDate.set(a.runDate, [...(byDate.get(a.runDate) ?? []), a]);

  const today = ukToday();
  return (
    <div className="flex flex-col gap-6">
      {sp.done === 'captured' && <Toast key={sp.msg} message={(sp.msg ?? 'Saved').slice(0, 120)} />}
      {sp.error && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[13.5px] text-bad">{sp.error}</div>}
      <div>
        <Link href={base} className="text-[13px] text-muted hover:text-ink">← AI visibility</Link>
      </div>
      <PageTitle title={<span className="break-words">“{d.prompt.text}”</span>} sub={<>{d.prompt.grp ? <>Group <strong className="font-medium text-ink">{d.prompt.grp}</strong> · </> : null}{d.answers.length} captured answer{d.answers.length === 1 ? '' : 's'}. <span className="rounded-[4px] bg-ok-bg px-1 text-ok">{cfg.name}</span> and <span className="rounded-[4px] bg-warn-bg px-1 text-warn">competitors</span> are highlighted.</>} />

      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {d.byDate.map((b) => (
          <div key={b.date} className="card px-5 py-4">
            <div className="label">Week of {fmtDate(b.date)}</div>
            <div className="display num mt-1 text-[34px] leading-none">{pct(b.visibility)}</div>
            <div className="mt-1 text-[12.5px] text-muted">visibility across engines</div>
          </div>
        ))}
      </div>

      {d.loss && (
        <Section title="Why you lost it" sub={`On ${fmtDate(d.loss.runDate)}${d.loss.stillLost ? '' : ' (won back since)'}`}>
          <div className="grid gap-4 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
            <div className="flex flex-col gap-2">
              <div className="label">Reason</div>
              <div className="flex flex-wrap items-center gap-2"><ReasonBadge r={d.loss.reason} /><RouterNote r={d.loss.router} /></div>
              {d.loss.confidence != null && <Prob p={d.loss.confidence} />}
              <div className="flex flex-wrap gap-1">{d.loss.engines.map((e) => <EngineChip key={e} e={e} />)}</div>
              <div className="text-[13px] text-ink-2">Won by {d.loss.winner ?? 'no named competitor'}</div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="label">Fix</div>
              <p className="text-[14px]">{d.loss.fix ?? 'Run “Explain losses” on the overview.'}</p>
              <OwnerBadge o={d.loss.owner} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="label">Status</div>
              {d.loss.id ? <LossStatusSelect lossId={d.loss.id} status={d.loss.status} prompt={d.prompt.text} /> : <span className="text-[13px] text-faint">After analysis</span>}
              {d.loss.doneAt && <span className="text-[12px] text-muted">Done {fmtDate(d.loss.doneAt)}{d.loss.after ? ` · ${pct(d.loss.after.visibility)} on ${fmtDate(d.loss.after.date)}` : ''}</span>}
            </div>
          </div>
        </Section>
      )}


      {d.answers.length === 0 ? (
        <section className="card"><Empty title="No answers for this prompt yet">Paste answers above, or import a file on the <Link className="underline" href={`${base}/answers`}>Answers</Link> screen.</Empty></section>
      ) : [...byDate.entries()].map(([date, answers]) => (
        <section key={date} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">{fmtDate(date)}</h2>
          {answers.map((a) => (
            <article key={a.id} id={`a-${a.id}`} className="card flex scroll-mt-6 flex-col gap-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <EngineChip e={a.engine} />
                <span className="text-[12px] text-muted">Run #{a.runIndex}{a.model ? <> · <span className="mono">{a.model}</span></> : null} · {a.source === 'live' ? 'live API' : a.source === 'sample' ? 'sample' : a.source === 'manual' ? 'pasted by hand' : 'imported'}</span>
                <span className="flex-1" />
                <PositionBadge p={a.position} />
                {a.brandCited && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11.5px] font-medium text-ok">Your site cited</span>}
                {a.mentioned && <SentimentBadge s={a.sentiment} conf={a.sentimentConf} />}
              </div>
              <HighlightedAnswer text={a.answer} spans={a.spans} />
              {a.cited.length > 0 && (
                <div className="border-t border-line pt-3">
                  <div className="label mb-2">Cited</div>
                  <ul className="flex flex-col gap-1.5">
                    {a.cited.map((c) => (
                      <li key={c.url} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <SourceChip t={c.type} />
                        <span className="mono min-w-0 break-all text-ink-2">{c.url}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
      <Section title="Add answers for this prompt" sub="Paste what each assistant said today. Empty boxes are skipped.">
        <div id="capture" className="scroll-mt-6">
          <CaptureForm siteId={id} prompts={[]} selectedId={pid} date={today} today={today} weekOf={weekStart(today)} captured={capturedThisWeek(id, today)} from={`${base}/prompts/${pid}`} fixedPrompt={{ id: pid, text: d.prompt.text, grp: d.prompt.grp }} />
        </div>
      </Section>
    </div>
  );
}
