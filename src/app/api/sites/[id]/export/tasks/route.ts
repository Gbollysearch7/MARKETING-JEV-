import { tasksCsv } from '@/lib/exports';
import { siteForRequest } from '@/lib/auth';
import { listTasks } from '@/lib/repo';

export async function GET(_req: Request, ctx: RouteContext<'/api/sites/[id]/export/tasks'>) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return new Response('Not found', { status: 404 });
  return new Response(tasksCsv(listTasks(id)), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-tasks.csv"` },
  });
}
