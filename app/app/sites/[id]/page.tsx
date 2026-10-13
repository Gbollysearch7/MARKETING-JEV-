import { notFound } from "next/navigation";
import { RunProgress } from "@/components/RunProgress";
import { btn, Card, Chip, Empty, PageHeader, Stat } from "@/components/ui";
import { deleteSiteAction, startRunAction } from "@/lib/actions";
import { getRun, getSite, listRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SiteOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) notFound();
  const runs = await listRuns(site.id);
  const current = runs[0] ?? null;
  const latestDone = site.latestRunId ? await getRun(site.latestRunId) : null;
  const busy = current?.status === "running" || current?.status === "queued";
  const s = latestDone?.summary;

  return (
    <>
      <PageHeader
        title={site.name}
        subtitle={<span className="break-all">{site.sitemapUrl ?? `${site.urls?.length ?? 0} URLs`}{site.filter ? ` · filter ${site.filter}` : ""} · up to {site.limit} pages · {site.topK} candidates per page</span>}
        actions={
          <>
            <form action={deleteSiteAction.bind(null, site.id)}><button type="submit" className={btn.secondary}>Delete site</button></form>
            <form action={startRunAction.bind(null, site.id)}><button type="submit" className={btn.primary} disabled={busy}>{busy ? "Running…" : "Run crawl, links and gate"}</button></form>
          </>
        }
      />
      <div className="p-7 flex flex-col gap-5">
        {current ? (
          <Card className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-[15px] m-0">{busy ? "Current run" : "Last run"} <span className="font-mono text-xs text-muted">{current.id}</span></h2>
              <Chip tone={current.status === "done" ? "teal" : current.status === "failed" ? "red" : "amber"}>{current.status}</Chip>
            </div>
            <RunProgress run={current} />
          </Card>
        ) : (
          <Empty>No runs yet. Click “Run crawl, links and gate”. A 40-page run takes about a minute.</Empty>
        )}

        {s ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Stat label="Pages crawled" value={s.pages} />
              <Stat label="Pairs evaluated" value={s.pairsEvaluated.toLocaleString()} note={`${site.topK} candidates per page`} />
              <Stat label="Links suggested" value={s.links} />
              <Stat label="Overlapping pairs" value={s.cannibalPairs} />
              <Stat label="Gate: kill / improve" value={`${s.gate.kill} / ${s.gate.improve}`} note={`${s.gate.index} indexable`} />
              <Stat label="Input tokens" value={s.inputTokens.toLocaleString()} note={latestDone?.mode === "live" ? `$${s.estimatedCostUsd} at list price` : "mock run, nothing billed"} />
            </div>
            {latestDone?.mode === "mock" ? (
              <Card className="px-5 py-3 text-[13px] text-amber-ink bg-amber-soft border-amber-soft">
                This run used the deterministic mock. The pipeline, crawl and counts are real; the judgments are placeholders. Add a TypeSafe key in Settings and run again for real decisions.
              </Card>
            ) : null}
          </>
        ) : null}

        {runs.length > 1 ? (
          <Card>
            <div className="px-4 py-3 border-b border-line font-semibold text-[15px]">Run history</div>
            <div className="divide-y divide-line">
              {runs.map((r) => (
                <div key={r.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto_auto] gap-4 text-[13px] items-center">
                  <span className="font-mono">{r.id}</span>
                  <span className="text-muted">{new Date(r.startedAt).toLocaleString()}</span>
                  <span className="font-mono text-muted">{r.summary ? `${r.summary.pages} pages, ${r.summary.links} links` : r.stage}</span>
                  <Chip tone={r.status === "done" ? "teal" : r.status === "failed" ? "red" : "amber"}>{r.status} · {r.mode}</Chip>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
