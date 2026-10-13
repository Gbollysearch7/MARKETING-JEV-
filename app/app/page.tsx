import Link from "next/link";
import { addSiteAction } from "@/lib/actions";
import { hasLiveKey } from "@/lib/engine";
import { getRun, listSites } from "@/lib/store";
import { btn, Card, Chip, Empty, field, label, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sites = await listSites();
  const latest = await Promise.all(sites.map((s) => (s.latestRunId ? getRun(s.latestRunId) : Promise.resolve(null))));
  const live = hasLiveKey();

  return (
    <>
      <PageHeader title="Sites" subtitle={live ? "Live key configured. Runs use Jev unless a site is set to mock." : "No TYPESAFE_API_KEY set. Runs use the deterministic mock until you add one in Settings."} />
      <div className="p-7 grid gap-5 lg:grid-cols-[1fr_380px] items-start">
        <div className="flex flex-col gap-3">
          {sites.length === 0 ? <Empty>No sites yet. Add one on the right, then run it.</Empty> : null}
          {sites.map((s, i) => {
            const run = latest[i];
            return (
              <Card key={s.id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                <div className="grow min-w-[200px]">
                  <Link href={`/sites/${s.id}`} className="font-semibold text-[15px] hover:underline">{s.name}</Link>
                  <div className="text-[13px] text-muted break-all">{s.sitemapUrl ?? `${s.urls?.length ?? 0} URLs`}{s.filter ? ` · filter ${s.filter}` : ""} · up to {s.limit} pages</div>
                </div>
                {run?.summary ? (
                  <div className="flex gap-4 text-[13px] font-mono">
                    <span>{run.summary.pages} pages</span>
                    <span>{run.summary.links} links</span>
                    <span>{run.summary.cannibalPairs} overlaps</span>
                    <span>{run.summary.gate.kill} kill</span>
                  </div>
                ) : null}
                {run ? <Chip tone={run.status === "done" ? "teal" : run.status === "failed" ? "red" : "amber"}>{run.status === "done" ? `run ${run.mode}` : run.status}</Chip> : <Chip>never run</Chip>}
                <Link href={`/sites/${s.id}`} className={btn.small}>Open</Link>
              </Card>
            );
          })}
        </div>

        <Card className="p-5">
          <h2 className="font-semibold text-[15px] m-0 mb-3">Add a site</h2>
          <form action={addSiteAction} className="flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="name">Name</label>
              <input id="name" name="name" required className={field} placeholder="TradersYard blog" />
            </div>
            <div>
              <label className={label} htmlFor="sitemapUrl">Sitemap URL</label>
              <input id="sitemapUrl" name="sitemapUrl" type="url" className={field} placeholder="https://blog.example.com/sitemap.xml" />
            </div>
            <div>
              <label className={label} htmlFor="urls">Or page URLs, one per line</label>
              <textarea id="urls" name="urls" rows={3} className={`${field} py-2`} placeholder="https://blog.example.com/post-one" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={label} htmlFor="filter">Path filter</label>
                <input id="filter" name="filter" className={field} placeholder="/blog-posts/" />
              </div>
              <div>
                <label className={label} htmlFor="limit">Max pages</label>
                <input id="limit" name="limit" type="number" defaultValue={40} min={1} max={2000} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="topK">Candidates per page</label>
                <input id="topK" name="topK" type="number" defaultValue={10} min={1} max={50} className={field} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="mode">Decisions</label>
              <select id="mode" name="mode" className={field} defaultValue="auto">
                <option value="auto">Live Jev when a key is set, otherwise mock</option>
                <option value="mock">Always mock (free, deterministic, not meaningful)</option>
              </select>
            </div>
            <button type="submit" className={btn.primary}>Add site</button>
          </form>
        </Card>
      </div>
    </>
  );
}
