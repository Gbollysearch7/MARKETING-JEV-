import { siteForRequest } from '@/lib/auth';
import { disavowText } from '@/lib/modules/links';

/** Draft disavow file. The header says to review it before uploading it to Google. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  return new Response(disavowText(site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-disavow-REVIEW-FIRST.txt"` },
  });
}
