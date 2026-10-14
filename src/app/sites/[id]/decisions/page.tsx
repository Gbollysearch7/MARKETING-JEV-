import { requireSite } from '@/lib/auth';
import Link from 'next/link';
import { Empty, fmt, fmtDateTime, Pager, PageTitle, qs, Section } from '@/components/ui';
import { db } from '@/lib/db';
import { labelsForSite, latestVerdictJob, listDecisions } from '@/lib/repo';

const SIZE = 100;

function answerText(a: Record<string, unknown>) {
  if (a.type === 'noul') return `yes ${Number(a.noul).toFixed(2)}`;
  if (a.type === 'choice') return `${a.choice} (${Number((a.probabilities as Record<string, number>)[a.choice as string]).toFixed(2)})`;
  if (a.type === 'score') return `score ${Number(a.score).toFixed(2)}`;
  return JSON.stringify(a);
}

export default async function Decisions({ params, searchParams }: PageProps<'/sites/[id]/decisions'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const job = latestVerdictJob(id);
  const labels = labelsForSite(id, 30);
  if (!job) return (<><PageTitle title="Decision log" /><Section><Empty title="No decisions yet" /></Section></>);
  const page = Math.max(1, Number(sp.page) || 1);
  const f = { path: sp.path, question: sp.question, max: sp.max };
  const { rows, total } = listDecisions(job.id, { path: sp.path, question: sp.question, maxConfidence: sp.max ? Number(sp.max) : undefined }, SIZE, (page - 1) * SIZE);
  return (
    <div className="space-y-5">
      <PageTitle title="Decision log" sub="Every answer from the latest run, with the model version, the question set version and a hash of the exact state sent. Hard-rule verdicts made no call and do not appear here." />
      {(() => {
        const st = db().prepare('select count(*) n, count(distinct path) urls, round(avg(latency_ms)) ms, min(model) model from decisions where job_id = ?').get(job.id) as { n: number; urls: number; ms: number | null; model: string | null };
        return (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Answers logged', fmt(st.n)], ['Pages asked about', fmt(st.urls)], ['Average response', st.ms ? `${fmt(st.ms)} ms` : '—'], ['Model', st.model ?? '—']].map(([l, v]) => (
              <div key={l} className="card px-5 py-4"><div className="label">{l}</div><div className={`mt-1 leading-none ${l === 'Model' ? 'mono pt-2 text-[15px]' : 'display num text-[34px]'}`}>{v}</div></div>
            ))}
          </div>
        );
      })()}
      <Section
        title="Answers"
        actions={
          <form className="flex flex-wrap gap-2">
            <input name="path" aria-label="Filter decision URLs" defaultValue={sp.path} placeholder="URL contains" className="input w-44" />
            <select aria-label="Decision question" name="question" defaultValue={sp.question ?? ''} className="select">
              <option value="">All questions</option><option value="verdict">verdict</option><option value="target">target</option><option value="title_matches_queries">title_matches_queries</option><option value="time_sensitive">time_sensitive</option>
            </select>
            <select aria-label="Maximum confidence" name="max" defaultValue={sp.max ?? ''} className="select"><option value="">Any confidence</option><option value="0.6">Confidence 0.6 or less</option><option value="0.3">Confidence 0.3 or less</option></select>
            <button className="btn">Apply</button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>URL path</th><th>Question</th><th>Answer</th><th className="r">Confidence</th><th>Model</th><th className="r">Latency</th><th>State hash</th><th>Criteria</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[260px] truncate" title={r.path}>{r.path}</td>
                  <td className="font-mono text-[12px]">{r.question_key}</td>
                  <td>{answerText(r.answer)}</td>
                  <td className="r num">{r.confidence.toFixed(2)}</td>
                  <td className="text-muted">{r.model}</td>
                  <td className="r num text-muted">{r.latency_ms ? `${fmt(r.latency_ms)} ms` : '—'}</td>
                  <td className="font-mono text-[12px] text-muted">{r.state_hash}</td>
                  <td className="text-[12px] text-muted">{r.criteria_version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} size={SIZE} href={(p) => `/sites/${id}/decisions${qs(f, { page: p })}`} />
      </Section>
      <Section title="Human corrections" sub="Saved when someone changes or rejects a verdict. These become labelled examples for calibration.">
        {labels.length === 0 ? <Empty title="No corrections yet" /> : (
          <table className="tbl">
            <thead><tr><th>URL path</th><th>Model said</th><th className="r">Probability</th><th>Human chose</th><th>Reason</th><th>When</th></tr></thead>
            <tbody>{labels.map((l, i) => <tr key={i}><td className="break-all">{l.path}</td><td>{l.model_verdict}</td><td className="r num">{l.model_probability.toFixed(2)}</td><td className="font-medium">{l.human_verdict}</td><td className="text-muted">{l.reason ?? '—'}</td><td className="text-muted">{fmtDateTime(l.created_at)}</td></tr>)}</tbody>
          </table>
        )}
      </Section>
      <p className="text-[12.5px] text-muted"><Link href={`/sites/${id}/inbox`} className="underline">Back to the decision inbox</Link></p>
    </div>
  );
}
