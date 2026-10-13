import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip, Empty, PageHeader, pill, shortUrl } from "@/components/ui";
import { getSite, readGate } from "@/lib/store";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const tone = { index: "teal", improve: "amber", kill: "red" } as const;

export default async function Gate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getSite(id);
  if (!site) notFound();
  if (!site.latestRunId) return <><PageHeader title="Publish gate" /><div className="p-7"><Empty>Run the site first.</Empty></div></>;
  const all = await readGate(site.latestRunId);
  const filter = one(sp.d) || "all";
  const rows = all.filter((r) => filter === "all" || r.disposition === filter).sort((a, b) => ["kill", "improve", "index"].indexOf(a.disposition) - ["kill", "improve", "index"].indexOf(b.disposition));
  const counts = { index: 0, improve: 0, kill: 0 };
  for (const r of all) counts[r.disposition]++;

  return (
    <>
      <PageHeader title="Publish gate" subtitle={`${all.length} pages checked. Code checks run first (placeholders, banned terms, duplicate shingles); then depth, title promise, usefulness, unverifiable claims, template feel and sibling overlap.`} />
      <div className="px-7 pt-4 flex gap-2">
        {(["all", "kill", "improve", "index"] as const).map((d) => (
          <Link key={d} href={`/sites/${site.id}/gate?d=${d}`} className={pill(filter === d)}>{d} <span className="font-mono ml-1 opacity-70">{d === "all" ? all.length : counts[d]}</span></Link>
        ))}
      </div>
      <div className="p-7 pt-4">
        {rows.length === 0 ? <Empty>Nothing here.</Empty> : (
          <Card>
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div key={r.url} className="px-4 py-3 grid gap-3 md:grid-cols-[110px_1fr_90px] items-start text-[13px]">
                  <div className="flex flex-col gap-1"><Chip tone={tone[r.disposition]}>{r.disposition}</Chip>{r.needsReview ? <Chip tone="amber">review</Chip> : null}</div>
                  <div className="min-w-0">
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-medium break-all hover:underline">{shortUrl(r.url)}</a>
                    <div className="text-muted">{r.title}</div>
                    {r.reasons.length ? <ul className="mt-1 flex flex-wrap gap-1.5">{r.reasons.map((x) => <li key={x} className="bg-soft rounded px-1.5 py-0.5 text-xs">{x}</li>)}</ul> : <div className="text-xs text-muted mt-1">All questions passed.</div>}
                  </div>
                  <div className="font-mono text-xs text-muted text-right">{r.wordCount.toLocaleString()} words</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
