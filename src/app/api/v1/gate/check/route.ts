import { handleV1GateCheck } from '@/lib/apikeys';
import { checkPagesForApi } from '@/lib/modules/gate';

/**
 * POST /api/v1/gate/check
 * Authorization: Bearer rk_live_… (scope gate:check)
 * { "site": "<site id>", "name"?: "…", "source"?: "wordpress", "pages": [ { url | slug, title, h1, meta_description, body | html, target_query, template } ] }
 * Errors: { "error": "…", "code": "<stable code>" }. See docs/API.md.
 */
export async function POST(request: Request) {
  return handleV1GateCheck(request, checkPagesForApi);
}
