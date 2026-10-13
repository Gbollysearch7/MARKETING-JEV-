import Link from "next/link";
import { notFound } from "next/navigation";
import { Bar, btn, Card, Chip, Empty, PageHeader, pill, shortUrl } from "@/components/ui";
import { setLinkStatusAction } from "@/lib/actions";
import { getSite, readLinks, type LinkStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function LinkPlan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getSite(id);
  if (!site) notFound();
  const runId = site.latestRunId;
  if (!runId) return <><PageHeader title="Link plan" /><div className="p-7"><Empty>Run the site first.</Empty></div></>;

  const status = (one(sp.status) || "open") as LinkStatus | "all";
  const source = one(sp.source);
  const all = await readLinks(runId);
  const counts = { open: 0, accepted: 0, dismissed: 0 };
  for (const l of all) counts[l.status]++;
  const rows = all.filter((l) => (status === "all" || l.status === status) && (!source || l.sourceUrl === source));
  const bySource = new Map<string, typeof rows>();
  for (const l of rows) bySource.set(l.sourceUrl, [...(bySource.get(l.sourceUrl) ?? []), l]);

  const filterLink = (s: string) => `/sites/${site.id}/links?status=${s}${source ? `&source=${encodeURIComponent(source)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Link plan"
        subtitle={`${all.length} suggestions from run ${runId}. Each row is one Jev call: reader benefit, same intent, prerequisite, best paragraph and best anchor answered together.`}
        actions={<a href={`/api/runs/${runId}/links.csv?status=accepted`} className={btn.secondary}>Export accepted CSV ({counts.accepted})</a>}
      />
      <div className="px-7 pt-4 flex flex-wrap gap-2 items-center">
        {(["open", "accepted", "dismissed", "all"] as const).map((s) => (
          <Link key={s} href={filterLink(s)} className={pill(status === s)}>
            {s} <span className="font-mono ml-1 opacity-70">{s === "all" ? all.length : counts[s]}</span>
          </Link>
        ))}
        {source ? <Link href={`/sites/${site.id}/links?status=${status}`} className={btn.small}>Clear page filter: {shortUrl(source)}</Link> : null}
      </div>
      <div className="p-7 pt-4 flex flex-col gap-4">
        {rows.length === 0 ? <Empty>Nothing {status === "all" ? "" : status} here.</Empty> : null}
        {[...bySource.entries()].map(([src, links]) => (
          <Card key={src}>
            <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-3">
              <div className="grow min-w-0">
                <div className="text-xs text-muted">From</div>
                <a href={src} target="_blank" rel="noreferrer" className="font-semibold break-all hover:underline">{shortUrl(src)}</a>
              </div>
              <Link href={`/sites/${site.id}/links?status=${status}&source=${encodeURIComponent(src)}`} className={btn.small}>Only this page</Link>
            </div>
            <div className="divide-y divide-line">
              {links.map((l) => (
                <div key={l.id} className="px-4 py-3 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto] items-start">
                  <div className="min-w-0">
                    <div className="text-xs text-muted">Link to</div>
                    <a href={l.targetUrl} target="_blank" rel="noreferrer" className="font-medium break-all hover:underline">{shortUrl(l.targetUrl)}</a>
                    <div className="text-[13px] mt-1">
                      <span className="text-muted">Anchor </span>
                      <span className="bg-teal-soft text-teal-ink px-1 rounded">{l.anchor}</span>
                      {l.anchorConfidence !== null ? <span className="font-mono text-xs text-muted ml-1">{l.anchorConfidence}</span> : <span className="text-xs text-muted ml-1">(title fallback)</span>}
                    </div>
                    {l.paragraphText ? <div className="text-[13px] text-muted mt-1"><span className="font-mono text-xs">{l.paragraphKey}</span> {l.paragraphText}</div> : <div className="text-[13px] text-muted mt-1">No confident paragraph; place by hand.</div>}
                  </div>
                  <div className="text-xs text-muted flex flex-col gap-1.5">
                    <div>Reader benefit <Bar value={l.readerBenefit} /></div>
                    <div>Same intent <Bar value={l.sameIntent} /></div>
                    <div>Prerequisite <Bar value={l.prerequisite} /></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 content-start">
                    <Chip tone="teal">priority {l.priority}</Chip>
                    {l.needsReview ? <Chip tone="amber">needs review</Chip> : null}
                    {l.status !== "open" ? <Chip tone={l.status === "accepted" ? "blue" : "gray"}>{l.status}</Chip> : null}
                  </div>
                  <div className="flex gap-1.5">
                    {l.status !== "accepted" ? <form action={setLinkStatusAction.bind(null, site.id, runId, l.id, "accepted")}><button type="submit" className={btn.smallPrimary}>Accept</button></form> : null}
                    {l.status !== "dismissed" ? <form action={setLinkStatusAction.bind(null, site.id, runId, l.id, "dismissed")}><button type="submit" className={btn.small}>Dismiss</button></form> : null}
                    {l.status !== "open" ? <form action={setLinkStatusAction.bind(null, site.id, runId, l.id, "open")}><button type="submit" className={btn.small}>Reopen</button></form> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
