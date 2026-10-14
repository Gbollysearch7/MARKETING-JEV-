import { siteForRequest } from '@/lib/auth';
import { prospectsCsv } from '@/lib/modules/links';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  return new Response(prospectsCsv(site.id), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-link-prospects.csv"` },
  });
}
