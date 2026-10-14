import { siteForRequest } from '@/lib/auth';
import { lossesCsv } from '@/lib/modules/visibility';

/** The loss register as CSV. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  return new Response(lossesCsv(site), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="ai-visibility-losses-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
