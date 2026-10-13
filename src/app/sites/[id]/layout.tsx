import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { db } from '@/lib/db';
import { providerInfo } from '@/lib/provider';
import { getSite, latestVerdictJob } from '@/lib/repo';

export default async function SiteLayout({ children, params }: LayoutProps<'/sites/[id]'>) {
  const { id } = await params;
  const site = getSite(id);
  if (!site) notFound();
  const job = latestVerdictJob(id);
  const d = db();
  const review = job ? (d.prepare(`select count(*) n from verdicts where job_id = ? and status = 'proposed' and skipped is null and coalesce(final_verdict, verdict) != 'leave'`).get(job.id) as { n: number }).n : 0;
  const pairs = job ? (d.prepare('select count(*) n from cannibal_pairs where job_id = ?').get(job.id) as { n: number }).n : 0;
  const tasks = (d.prepare(`select count(*) n from tasks where site_id = ? and status in ('todo', 'in_progress')`).get(id) as { n: number }).n;
  const p = providerInfo();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar site={site} counts={{ review, pairs, tasks }} live={p.live} model={p.model} />
      <main className="min-w-0 flex-1 px-5 py-7 md:px-8 lg:px-10">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
