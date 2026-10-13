import { notFound } from "next/navigation";
import { Bar, Card, Chip, Empty, PageHeader, shortUrl } from "@/components/ui";
import { getSite, readCannibal } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Cannibalisation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) notFound();
  if (!site.latestRunId) return <><PageHeader title="Cannibalisation" /><div className="p-7"><Empty>Run the site first.</Empty></div></>;
  const pairs = await readCannibal(site.latestRunId);

  return (
    <>
      <PageHeader title="Cannibalisation" subtitle={`${pairs.length} pairs where Jev put same-intent above 0.8. The survivor is the page to keep; the other folds into it.`} />
      <div className="p-7">
        {pairs.length === 0 ? <Empty>No overlapping pairs in this run.</Empty> : (
          <Card>
            <div className="hidden md:grid grid-cols-[1.2fr_1.2fr_140px_1fr_120px] gap-3 px-4 py-2.5 border-b border-line text-xs text-muted">
              <div>Page A</div><div>Page B</div><div>Same intent</div><div>Survivor</div><div></div>
            </div>
            <div className="divide-y divide-line">
              {pairs.map((p) => (
                <div key={`${p.pageA}|${p.pageB}`} className="grid md:grid-cols-[1.2fr_1.2fr_140px_1fr_120px] gap-3 px-4 py-3 items-center text-[13px]">
                  <a href={p.pageA} target="_blank" rel="noreferrer" className="break-all hover:underline">{shortUrl(p.pageA)}</a>
                  <a href={p.pageB} target="_blank" rel="noreferrer" className="break-all hover:underline">{shortUrl(p.pageB)}</a>
                  <Bar value={p.sameIntent} />
                  <div className="break-all">{p.survivor ? <span className="font-medium">{shortUrl(p.survivor)}</span> : <span className="text-muted">undecided</span>}<div className="text-xs text-muted">{p.reasons.join("; ")}</div></div>
                  <div>{p.needsReview ? <Chip tone="amber">needs review</Chip> : <Chip tone="blue">merge</Chip>}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
