import { notFound } from "next/navigation";
import { SiteTabs } from "@/components/SiteTabs";
import { getRun, getSite, readCannibal, readGate, readLinks } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) notFound();
  const run = site.latestRunId ? await getRun(site.latestRunId) : null;
  const counts = run?.status === "done"
    ? { links: (await readLinks(run.id)).length, cannibal: (await readCannibal(run.id)).length, gate: (await readGate(run.id)).length }
    : undefined;
  return (
    <>
      <SiteTabs siteId={site.id} counts={counts} />
      {children}
    </>
  );
}
