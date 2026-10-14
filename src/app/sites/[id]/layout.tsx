import Link from 'next/link';
import { CommandBar } from '@/components/CommandBar';
import { Sidebar } from '@/components/Sidebar';
import { db } from '@/lib/db';
import { providerInfo } from '@/lib/provider';
import { requireSite } from '@/lib/auth';
import { latestVerdictJob } from '@/lib/repo';

export default async function SiteLayout({ children, params }: LayoutProps<'/sites/[id]'>) {
  const { id } = await params;
  const { site, viewer } = await requireSite(id);
  const job = latestVerdictJob(id);
  const d = db();
  const review = job ? (d.prepare(`select count(*) n from verdicts where job_id = ? and status = 'proposed' and skipped is null and coalesce(final_verdict, verdict) != 'leave'`).get(job.id) as { n: number }).n : 0;
  const pairs = job ? (d.prepare('select count(*) n from cannibal_pairs where job_id = ?').get(job.id) as { n: number }).n : 0;
  const tasks = (d.prepare(`select count(*) n from tasks where site_id = ? and status in ('todo', 'in_progress')`).get(id) as { n: number }).n;
  const p = providerInfo();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar site={site} counts={{ review, pairs, tasks }} live={p.live} model={p.model}
        account={{ email: viewer.user.email, plan: viewer.status.label, trialDaysLeft: viewer.status.trialDaysLeft, onTrial: viewer.status.onTrial, active: viewer.status.active }} />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-5 py-7 md:px-8 lg:px-10">
        {!viewer.status.active && (
          <div className="mx-auto mb-5 flex max-w-[1180px] flex-wrap items-center justify-between gap-3 rounded-xl bg-bad-bg px-4 py-3 text-[13.5px] text-bad">
            <span>{viewer.status.onTrial ? 'Your free trial has ended.' : 'Your subscription is not active.'} You can still see everything, but scoring and crawling are paused.</span>
            <Link href="/billing" className="btn btn-sm">Choose a plan</Link>
          </div>
        )}
        <div className="mx-auto max-w-[1180px]">{children}</div>
        <CommandBar siteId={site.id} />
      </main>
    </div>
  );
}
