import { REDIRECT_FORMATS, redirectFile, type RedirectFormat } from '@/lib/exports';
import { getSite, listTasks } from '@/lib/repo';

export async function GET(req: Request, ctx: RouteContext<'/api/sites/[id]/export/redirects'>) {
  const { id } = await ctx.params;
  const site = getSite(id);
  if (!site) return new Response('Not found', { status: 404 });
  const format = (new URL(req.url).searchParams.get('format') ?? 'csv') as RedirectFormat;
  const spec = REDIRECT_FORMATS[format];
  if (!spec) return new Response('Unknown format', { status: 400 });
  return new Response(redirectFile(format, listTasks(id)), {
    headers: { 'Content-Type': `${spec.type}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${spec.file}"` },
  });
}
