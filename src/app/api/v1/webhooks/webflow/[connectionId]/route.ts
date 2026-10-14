import { handleWebflowWebhook } from '@/lib/apikeys';
import { startWebhookBatch } from '@/lib/modules/gate';

/**
 * POST /api/v1/webhooks/webflow/<connectionId>
 * Webflow site webhooks (collection_item_created / _changed / _published), signed with x-webflow-signature.
 * The CMS item is scored in the background as a "Webflow · <collection>" gate batch. Webflow cannot hold a
 * publish, so the verdict is recorded in Rankcall rather than returned to Webflow.
 */
export async function POST(request: Request, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  return handleWebflowWebhook(request, connectionId, (siteId, name, page, notes) => startWebhookBatch(siteId, name, 'webflow', page, notes));
}
