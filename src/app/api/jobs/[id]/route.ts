import { siteForRequest } from '@/lib/auth';
import { getJob } from '@/lib/repo';

export async function GET(_req: Request, ctx: RouteContext<'/api/jobs/[id]'>) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job || !(await siteForRequest(job.site_id))) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ status: job.status, progress: job.progress, total: job.total, message: job.message, error: job.error });
}
