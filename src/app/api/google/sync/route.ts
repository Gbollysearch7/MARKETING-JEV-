import { handleSync } from '@/lib/google/flow';
import { realDeps } from '@/lib/google/server';

export async function POST(request: Request) {
  return handleSync(request, realDeps());
}
