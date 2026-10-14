import { handleListProperties, handleSaveProperties } from '@/lib/google/flow';
import { realDeps } from '@/lib/google/server';

export async function GET(request: Request) {
  return handleListProperties(request, realDeps());
}

export async function POST(request: Request) {
  return handleSaveProperties(request, realDeps());
}
