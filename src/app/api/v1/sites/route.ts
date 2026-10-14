import { handleV1Sites } from '@/lib/apikeys';

/** GET /api/v1/sites: the sites in the API key's account (id, name, domain). Any active key may call it. */
export async function GET(request: Request) {
  return handleV1Sites(request);
}
