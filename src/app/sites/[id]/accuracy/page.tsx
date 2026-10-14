import Link from 'next/link';
import { AgreementBar, CalibrationTable, CsvLink, Interval, Matrix, pct, SampleNote, Tile } from '@/components/accuracy/bits';
import { Toast } from '@/components/Toast';
import { Empty, fmtDate, fmtDateTime, PageTitle, Section, VerdictBadge } from '@/components/ui';
import { VERDICTS } from '@/engine/verdict/types';
import {
  AGREEMENT_TARGET, AGREEMENT_TARGET_MIN_P, autoApprovedCount, benchmarkRows, CALIBRATION_TARGET, getBenchmark, HUMAN_COLUMNS,
  latestScoredJob, listBenchmarks, MIN_SAMPLE, modelLabel, outcomeEvidence, reviewItems, summariseBenchmark, summariseReviews,
} from '@/lib/accuracy';
import { requireSite } from '@/lib/auth';

const kappaWord = (k: number | null) => (k == null ? '' : k < 0 ? 'worse than chance' : k < 0.2 ? 'slight' : k < 0.4 ? 'fair' : k < 0.6 ? 'moderate' : k < 0.8 ? 'substantial' : 'almost perfect');

export default async function Accuracy({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const api = `/api/sites/${id}/accuracy`;

  const items = reviewItems(id);
  const s = summariseReviews(items);
  const auto = autoApprovedCount(id);
  const enough = s.n >= MIN_SAMPLE;
  const highEnough = s.high.n >= MIN_SAMPLE;
  const cal = s.calibration;

  const job = latestScoredJob(id);
  const runs = listBenchmarks(id);
  const run = (sp.run ? getBenchmark(id, sp.run) : null) ?? (runs[0] ? getBenchmark(id, runs[0].id) : null);
  const bench = run ? summariseBenchmark(benchmarkRows(run.id)) : null;
  const outcomes = outcomeEvidence(id);

  const toast = sp.imported ? `Imported ${sp.imported} labels${sp.unmatched ? ` · ${sp.unmatched} rows not in this run` : ''}` : null;

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast key={sp.run} message={toast} />}
      <PageTitle
        title="Accuracy"
        sub="How often people agree with Rankcall’s verdicts, whether its stated confidence holds up, and what happened after approved changes."
        actions={<CsvLink href={`${api}/export?kind=reviews`}>Export reviews CSV</CsvLink>}
      />

      {/* ---------- from reviews ---------- */}
      <div className="flex flex-col gap-1">
        <h2 className="display text-[28px] leading-tight">From your reviews</h2>
        <p className="text-[14px] text-muted">Every verdict a person approved, changed or rejected in the inbox. A change or rejection counts as a disagreement. Auto-approved verdicts were not looked at, so they are not counted.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Reviews" value={s.n.toLocaleString('en-GB')} sub={`${auto.toLocaleString('en-GB')} auto-approved, not reviewed`} />
        <Tile label="Agreement" value={s.n ? pct(s.overall.p) : '—'} sub={s.n ? `95% range ${pct(s.overall.low)}–${pct(s.overall.high)}` : 'No reviews yet'} />
        <Tile
          label={`Agreement at ${AGREEMENT_TARGET_MIN_P.toFixed(2)} or above`}
          value={s.high.n ? pct(s.high.p) : '—'}
          tone={highEnough ? (s.high.low >= AGREEMENT_TARGET ? 'ok' : s.high.high < AGREEMENT_TARGET ? 'bad' : 'warn') : undefined}
          sub={`Target ${pct(AGREEMENT_TARGET)} (milestone A2) · ${s.high.n} reviews`}
        />
        <Tile
          label="Calibration error"
          value={cal.error == null ? '—' : cal.error.toFixed(2)}
          tone={enough && cal.error != null ? (cal.error <= CALIBRATION_TARGET ? 'ok' : 'bad') : undefined}
          sub={`Target ${CALIBRATION_TARGET.toFixed(2)} or less (milestone A6)`}
        />
      </div>
      <SampleNote n={s.n} min={MIN_SAMPLE} what="reviews" />
      {s.n > 0 && highEnough && (
        <p className="text-[13.5px] text-muted">
          {s.high.low >= AGREEMENT_TARGET
            ? `Meets the A2 target: even the low end of the 95% range (${pct(s.high.low)}) is at or above ${pct(AGREEMENT_TARGET)}.`
            : s.high.high < AGREEMENT_TARGET
              ? `Below the A2 target: even the high end of the 95% range (${pct(s.high.high)}) is under ${pct(AGREEMENT_TARGET)}.`
              : `Not settled yet: the 95% range (${pct(s.high.low)}–${pct(s.high.high)}) straddles the ${pct(AGREEMENT_TARGET)} target. More reviews will tell.`}
        </p>
      )}

      {s.n > 0 && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="By verdict" sub="How often people kept each verdict the model proposed." actions={<CsvLink href={`${api}/export?kind=summary`} />}>
              <table className="tbl min-w-[460px]">
                <thead><tr><th>Model verdict</th><th className="r">Reviews</th><th className="r">Agreement · 95% range</th><th className="w-[120px]"><span className="sr-only">Chart</span></th></tr></thead>
                <tbody>
                  {s.byVerdict.map((v) => (
                    <tr key={v.verdict}>
                      <td><VerdictBadge v={v.verdict} size="sm" /></td>
                      <td className="r num">{v.n || '·'}</td>
                      <td className="r"><Interval {...v} /></td>
                      <td className="align-middle"><AgreementBar {...v} color={`var(--${v.verdict}-mark)`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="By confidence band" sub="Bands follow the confidence router.">
              <table className="tbl min-w-[460px]">
                <thead><tr><th>Band</th><th className="r">Reviews</th><th className="r">Agreement · 95% range</th><th className="w-[120px]"><span className="sr-only">Chart</span></th></tr></thead>
                <tbody>
                  {s.byBand.map((b) => (
                    <tr key={b.key}>
                      <td><div className="font-medium">{b.label}</div><div className="mono text-[12px] text-muted">{b.range}</div></td>
                      <td className="r num">{b.n || '·'}</td>
                      <td className="r"><Interval {...b} /></td>
                      <td className="align-middle"><AgreementBar {...b} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.byBand[0].n === 0 && <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted sm:px-6">Verdicts at 0.85 or above are approved automatically, so they only show up here when someone opens and changes one.</p>}
            </Section>
          </div>

          <Section
            title="Calibration"
            sub={`Does a verdict stated at 0.9 get kept 9 times in 10? The bar is the share people kept; the tick is the stated probability. Calibration error is the gap in each bucket, weighted by its share of reviews${cal.error != null ? `: ${cal.error.toFixed(2)} against a target of ${CALIBRATION_TARGET.toFixed(2)}` : ''}.`}
            actions={<CsvLink href={`${api}/export?kind=calibration`} />}
          >
            <CalibrationTable rows={cal.rows} unit="Reviews" />
          </Section>

          <Section title="Model against reviewer" sub="Rows are what the model proposed; columns are what the reviewer chose. Agreement runs down the diagonal." actions={<CsvLink href={`${api}/export?kind=confusion`} />}>
            <Matrix rows={VERDICTS} cols={HUMAN_COLUMNS} m={s.matrix} rowTitle="Model" colTitle="Reviewer" />
          </Section>

          <Section title="Most common overrides" sub="Where reviewers most often changed the model’s call, with examples." actions={<CsvLink href={`${api}/export?kind=overrides`} />}>
            {s.overrides.length === 0 ? (
              <Empty title="No overrides yet">Every reviewed verdict was approved as proposed.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {s.overrides.slice(0, 8).map((o) => (
                  <li key={`${o.from}-${o.to}`} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:gap-6 sm:px-6">
                    <div className="flex min-w-[220px] items-center gap-2">
                      <VerdictBadge v={o.from} size="sm" /><span aria-hidden className="text-muted">→</span>
                      {o.to === 'rejected' ? <span className="inline-flex rounded-full bg-bad-bg px-2 py-0.5 text-[11.5px] font-medium text-bad">Rejected</span> : <VerdictBadge v={o.to} size="sm" />}
                      <span className="display num ml-auto text-[24px] leading-none sm:ml-3">{o.n}</span>
                    </div>
                    <ul className="flex min-w-0 flex-1 flex-col gap-1">
                      {o.examples.map((e) => (
                        <li key={e.id} className="min-w-0 text-[13px]">
                          <Link href={`/sites/${id}/verdicts/${e.id}`} className="mono break-all underline-offset-2 hover:underline">{e.path}</Link>
                          <span className="num ml-2 text-muted">p {e.p.toFixed(2)}</span>
                          {e.reason && <span className="ml-2 text-muted">· “{e.reason}”</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* ---------- expert benchmark ---------- */}
      <div id="benchmark" className="mt-4 flex scroll-mt-6 flex-col gap-1">
        <h2 className="display text-[28px] leading-tight">Expert benchmark</h2>
        <p className="text-[14px] text-muted">Reviews only cover the verdicts people chose to open. For a fair test, give an SEO a random sample to label blind, without seeing the model’s verdicts, then import their answers.</p>
      </div>
      {sp.err && (
        <div role="alert" className="whitespace-pre-line rounded-xl bg-bad-bg px-4 py-3 text-[13px] text-bad">{sp.err}</div>
      )}
      {!job ? (
        <section className="card"><Empty title="Nothing scored yet">Score the site from the <Link className="underline" href={`/sites/${id}`}>Overview</Link>, then come back to make a labelling sheet.</Empty></section>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <form method="get" action={`${api}/sheet`} className="card flex flex-col gap-3 px-5 py-4">
            <div><div className="font-medium">1. Export a labelling sheet</div><p className="text-[13px] text-muted">A random sample from the run of {fmtDate(job.finished_at)}, stratified by verdict, with each URL’s metrics. The model’s verdicts are left out.</p></div>
            <label className="flex items-center gap-2 text-[13px]"><span className="label">URLs</span><input className="input w-24" type="number" name="n" min={10} max={1000} defaultValue={100} /></label>
            <button className="btn btn-primary mt-auto self-start">Download sheet</button>
          </form>
          <form method="post" action={`${api}/import`} encType="multipart/form-data" className="card flex flex-col gap-3 px-5 py-4">
            <div><div className="font-medium">2. Import the filled-in sheet</div><p className="text-[13px] text-muted">Fill <span className="mono">expert_verdict</span> with refresh, expand, merge, redirect, prune or leave (any case). Blank rows are skipped.</p></div>
            <label className="flex flex-col gap-1 text-[13px]"><span className="sr-only">Labelled CSV</span><input className="text-[13px] file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5" type="file" name="file" accept=".csv,text/csv" required /></label>
            <button className="btn mt-auto self-start">Import labels</button>
          </form>
          <form method="post" action={`${api}/sample`} className="card flex flex-col gap-3 border-dashed px-5 py-4">
            <div><div className="font-medium">Or try it with sample labels</div><p className="text-[13px] text-muted">Made-up expert labels for the fictional Sample Outdoors data, generated by a script. They show how the view works; they are not real results.</p></div>
            <button className="btn mt-auto self-start">Load sample labels</button>
          </form>
        </div>
      )}

      {runs.length > 0 && (
        <Section title="Benchmark history" sub="Each import is tied to the scoring run, model and question set it tested, so changes between versions show up here.">
          <table className="tbl min-w-[780px]">
            <thead><tr><th>Imported</th><th>Scoring run</th><th>Model</th><th>Question set</th><th className="r">Labelled</th><th className="r">Agreement</th><th className="r">Kappa</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={r.id === run?.id ? 'bg-selected' : ''}>
                  <td className="whitespace-nowrap">{fmtDateTime(r.created_at)}{r.source === 'sample' && <span className="ml-2 inline-flex rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">Sample data</span>}</td>
                  <td className="whitespace-nowrap text-muted">{fmtDate(r.job_finished_at)}</td>
                  <td className="mono text-[12.5px]">{modelLabel(r)}</td>
                  <td className="mono text-[12.5px]">{r.criteria_version}</td>
                  <td className="r num">{r.labelled}</td>
                  <td className="r num">{pct(r.agreement)}</td>
                  <td className="r num">{r.kappa == null ? '—' : r.kappa.toFixed(2)}</td>
                  <td className="r">{r.id === run?.id ? <span className="text-[12.5px] text-muted">Showing</span> : <Link className="btn btn-sm" href={`?run=${r.id}#benchmark-run`}>Open</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {run && bench && (
        <div id="benchmark-run" className="flex scroll-mt-6 flex-col gap-6">
          {run.source === 'sample' && (
            <div className="rounded-xl border border-dashed border-line-strong bg-warn-bg px-4 py-3 text-[13px] text-warn">Sample data: these expert labels were generated by a script for the fictional Sample Outdoors site. They demonstrate the benchmark; they say nothing about real accuracy.</div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Labelled URLs" value={bench.n} sub={`${modelLabel(run)} · ${run.criteria_version}`} />
            <Tile label="Agreement" value={pct(bench.overall.p)} sub={`95% range ${pct(bench.overall.low)}–${pct(bench.overall.high)}`} />
            <Tile label="Cohen’s kappa" value={bench.kappa == null ? '—' : bench.kappa.toFixed(2)} sub={bench.kappa == null ? undefined : `${kappaWord(bench.kappa)} agreement beyond chance`} />
            <Tile
              label={`At ${AGREEMENT_TARGET_MIN_P.toFixed(2)} or above`}
              value={bench.high.n ? pct(bench.high.p) : '—'}
              tone={bench.high.n >= MIN_SAMPLE ? (bench.high.low >= AGREEMENT_TARGET ? 'ok' : bench.high.high < AGREEMENT_TARGET ? 'bad' : 'warn') : undefined}
              sub={`Target ${pct(AGREEMENT_TARGET)} · ${bench.high.n} URLs`}
            />
          </div>
          <SampleNote n={bench.n} min={MIN_SAMPLE} what="labelled URLs" />

          <Section title="Model against expert" sub="Rows are the model’s verdict; columns are the expert’s." actions={<CsvLink href={`${api}/export?kind=benchmark&run=${run.id}`}>Export run CSV</CsvLink>}>
            <Matrix rows={VERDICTS} cols={VERDICTS} m={bench.matrix} rowTitle="Model" colTitle="Expert" />
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Per verdict" sub="Precision: when the model said it, the expert agreed. Recall: when the expert said it, the model did too.">
              <table className="tbl min-w-[440px]">
                <thead><tr><th>Verdict</th><th className="r">Model said</th><th className="r">Expert said</th><th className="r">Precision</th><th className="r">Recall</th></tr></thead>
                <tbody>
                  {bench.perVerdict.map((v) => (
                    <tr key={v.verdict}>
                      <td><VerdictBadge v={v.verdict as (typeof VERDICTS)[number]} size="sm" /></td>
                      <td className="r num">{v.predicted || '·'}</td>
                      <td className="r num">{v.actual || '·'}</td>
                      <td className="r num">{pct(v.precision)}</td>
                      <td className="r num">{pct(v.recall)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="Calibration on the benchmark" sub={bench.calibration.error == null ? undefined : `Calibration error ${bench.calibration.error.toFixed(2)} (target ${CALIBRATION_TARGET.toFixed(2)} or less).`}>
              <CalibrationTable rows={bench.calibration.rows.filter((r) => r.n > 0)} unit="URLs" />
            </Section>
          </div>

          <Section title={`Disagreements (${bench.disagreements.length})`} sub="Open a verdict to see the evidence the model used.">
            {bench.disagreements.length === 0 ? <Empty title="No disagreements">The expert agreed with every verdict in this run.</Empty> : (
              <table className="tbl min-w-[720px]">
                <thead><tr><th>URL</th><th>Model</th><th className="r">Probability</th><th>Expert</th><th>Notes</th></tr></thead>
                <tbody>
                  {bench.disagreements.map((r) => (
                    <tr key={r.path}>
                      <td className="max-w-[320px]">{r.verdict_id ? <Link className="mono break-all text-[12.5px] underline-offset-2 hover:underline" href={`/sites/${id}/verdicts/${r.verdict_id}`}>{r.path}</Link> : <span className="mono break-all text-[12.5px]">{r.path}</span>}</td>
                      <td><VerdictBadge v={r.model} size="sm" /></td>
                      <td className="r num">{r.p.toFixed(2)}</td>
                      <td><VerdictBadge v={r.expert} size="sm" /></td>
                      <td className="max-w-[280px] text-[13px] text-muted">{r.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}

      {/* ---------- outcomes ---------- */}
      <div className="mt-4 flex flex-col gap-1">
        <h2 className="display text-[28px] leading-tight">Outcome evidence</h2>
        <p className="text-[14px] text-muted">Agreement says people liked the call; outcomes say whether it worked. From the <Link href={`/sites/${id}/outcomes`} className="underline">outcomes ledger</Link>, latest measurement per completed task (30, 60 or 90 days).</p>
      </div>
      <Section actions={<CsvLink href={`${api}/export?kind=outcomes`} />} title="Completed tasks by verdict">
        {outcomes.total.done === 0 ? (
          <Empty title="No completed tasks yet">Mark tasks done in the <Link href={`/sites/${id}/queue`} className="underline">work queue</Link>, then upload a newer Search Console export to measure them.</Empty>
        ) : (
          <table className="tbl min-w-[620px]">
            <thead><tr><th>Verdict</th><th className="r">Completed</th><th className="r">Worked</th><th className="r">Didn’t (neutral · backfired)</th><th className="r">Too early</th><th className="r">Worked, of measured</th></tr></thead>
            <tbody>
              {[...outcomes.per.filter((x) => x.done > 0).map((x) => ({ ...x, key: x.verdict as string })), { ...outcomes.total, key: 'all' }].map((x) => {
                const measured = x.worked + x.neutral + x.backfired;
                return (
                  <tr key={x.key} className={x.key === 'all' ? 'font-medium' : ''}>
                    <td>{x.key === 'all' ? 'All verdicts' : <VerdictBadge v={x.key as (typeof VERDICTS)[number]} size="sm" />}</td>
                    <td className="r num">{x.done}</td>
                    <td className="r num text-ok">{x.worked || '·'}</td>
                    <td className="r num">{x.neutral + x.backfired ? <>{x.neutral} · <span className="text-bad">{x.backfired}</span></> : '·'}</td>
                    <td className="r num text-muted">{x.early || '·'}</td>
                    <td className="r num">{measured ? `${pct(x.worked / measured)} of ${measured}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
      <p className="text-[12.5px] text-muted">Every figure on this page is computed from this site’s own reviews, labels and measurements. Ranges are Wilson 95% intervals; with fewer than {MIN_SAMPLE} items they are wide on purpose.</p>
    </div>
  );
}
