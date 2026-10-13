import Link from "next/link";
import { notFound } from "next/navigation";
import { btn, Card, Empty, field, label, PageHeader } from "@/components/ui";
import { getSite, readDecisions } from "@/lib/store";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function answerText(a: { type: string; noul?: number; choice?: string; score?: number }): string {
  if (a.type === "noul") return `noul ${a.noul?.toFixed(3)}`;
  if (a.type === "choice") return `choice ${a.choice}`;
  return `score ${a.score?.toFixed(2)}`;
}

export default async function Decisions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getSite(id);
  if (!site) notFound();
  if (!site.latestRunId) return <><PageHeader title="Decisions" /><div className="p-7"><Empty>Run the site first.</Empty></div></>;

  const question = one(sp.q);
  const min = Number(one(sp.min)) || 0;
  const entity = one(sp.e);
  const page = Math.max(1, Number(one(sp.p)) || 1);
  const limit = 100;
  const { rows, total, questions } = await readDecisions(site.latestRunId, { question: question || undefined, minConfidence: min || undefined, entity: entity || undefined, offset: (page - 1) * limit, limit });
  const pages = Math.max(1, Math.ceil(total / limit));
  const qs = (p: number) => `/sites/${site.id}/decisions?q=${encodeURIComponent(question)}&min=${min}&e=${encodeURIComponent(entity)}&p=${p}`;

  return (
    <>
      <PageHeader title="Decision log" subtitle={`${total.toLocaleString()} answers match. One row per question, per entity. Every row carries the model version and a hash of the state that was sent.`} />
      <div className="p-7 flex flex-col gap-4">
        <Card className="p-4">
          <form method="get" className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto] items-end">
            <div>
              <label className={label} htmlFor="q">Question</label>
              <select id="q" name="q" defaultValue={question} className={field}>
                <option value="">All questions</option>
                {questions.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="min">Min confidence</label>
              <input id="min" name="min" type="number" step="0.05" min={0} max={1} defaultValue={min || ""} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="e">Entity contains</label>
              <input id="e" name="e" defaultValue={entity} className={field} placeholder="/prop-firm" />
            </div>
            <button type="submit" className={btn.secondary}>Filter</button>
          </form>
        </Card>
        {rows.length === 0 ? <Empty>No decisions match.</Empty> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[12px] font-mono">
              <thead className="text-muted text-left">
                <tr className="border-b border-line"><th className="px-3 py-2 font-normal">Time</th><th className="px-3 py-2 font-normal">Entity</th><th className="px-3 py-2 font-normal">Question</th><th className="px-3 py-2 font-normal">Answer</th><th className="px-3 py-2 font-normal">Confidence</th><th className="px-3 py-2 font-normal">Model</th><th className="px-3 py-2 font-normal">Criteria</th><th className="px-3 py-2 font-normal">State</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={`${r.entity_id}-${r.question_key}-${i}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted">{r.created_at.slice(11, 19)}</td>
                    <td className="px-3 py-1.5 max-w-[360px] truncate" title={r.entity_id}>{r.entity_id.replace(/https?:\/\/[^/]+/g, "")}</td>
                    <td className="px-3 py-1.5">{r.question_key}</td>
                    <td className="px-3 py-1.5">{answerText(r.answer as { type: string; noul?: number; choice?: string; score?: number })}</td>
                    <td className="px-3 py-1.5">{r.confidence.toFixed(3)}</td>
                    <td className="px-3 py-1.5">{r.model_version}</td>
                    <td className="px-3 py-1.5">{r.criteria_set_version}</td>
                    <td className="px-3 py-1.5 text-muted">{r.state_hash.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {pages > 1 ? (
          <div className="flex items-center gap-2 text-[13px]">
            {page > 1 ? <Link href={qs(page - 1)} className={btn.small}>Previous</Link> : null}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages ? <Link href={qs(page + 1)} className={btn.small}>Next</Link> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
