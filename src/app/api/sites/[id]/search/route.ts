import { siteForRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { latestVerdictJob } from '@/lib/repo';

/** URL search for the command bar: matching paths from the latest scoring run, with their verdict. */
export async function GET(req: Request, ctx: RouteContext<'/api/sites/[id]/search'>) {
  const { id } = await ctx.params;
  if (!(await siteForRequest(id))) return Response.json({ error: 'Not found' }, { status: 404 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 200);
  const job = latestVerdictJob(id);
  if (!q || !job) return Response.json({ results: [] });
  const rows = db().prepare(`select id, path, coalesce(final_verdict, verdict) verdict, status from verdicts where job_id = ? and path like ? escape '\\' order by monthly_clicks desc limit 8`)
    .all(job.id, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) as { id: string; path: string; verdict: string | null; status: string }[];
  return Response.json({ results: rows });
}
