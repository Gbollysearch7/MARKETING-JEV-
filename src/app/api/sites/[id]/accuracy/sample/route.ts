import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importBenchmark } from '@/lib/accuracy';
import { siteForRequest } from '@/lib/auth';

/** Load the sample expert labels for the Sample Outdoors data. Stored as a benchmark run marked "sample". */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const text = readFileSync(path.join(process.cwd(), 'samples', 'accuracy-expert-labels.csv'), 'utf8');
  const res = importBenchmark(site.id, text, 'accuracy-expert-labels.csv (sample data)', 'sample');
  const q = res.ok ? `run=${res.id}&imported=${res.labelled}` : `err=${encodeURIComponent(`Sample labels: ${res.errors.join(' ')}`)}`;
  return Response.redirect(new URL(`/sites/${site.id}/accuracy?${q}#benchmark`, request.url), 303);
}
