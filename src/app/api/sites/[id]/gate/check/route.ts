import { siteForApiRequest } from '@/lib/auth';
import { apiError } from '@/lib/apikeys';
import { checkPagesForApi } from '@/lib/modules/gate';

/**
 * POST { pages: [{ url | slug, title, h1, meta_description, body | html, target_query, template }], name? }
 * Scores the pages and answers with one verdict per page.
 * Authenticated by the signed-in session, or by `Authorization: Bearer rk_live_…` (scope gate:check).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await siteForApiRequest(request, id, 'gate:check');
  if (auth instanceof Response) return auth;
  const send = (res: Response) => { auth.done(res.status); return res; };
  if (!auth.active) return send(apiError(402, 'account_inactive', 'Your plan is not active. Choose a plan to keep scoring pages.'));

  let body: unknown;
  try { body = await request.json(); } catch { return send(apiError(400, 'invalid_json', 'Send a JSON body: { "pages": [...] }')); }
  const res = await checkPagesForApi(auth.site.id, body, 'api');
  return send(Response.json(res.json, { status: res.status }));
}
