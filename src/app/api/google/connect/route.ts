import { handleConnect } from '@/lib/google/flow';
import { realDeps } from '@/lib/google/server';

export async function GET(request: Request) {
  return handleConnect(request, realDeps());
}
