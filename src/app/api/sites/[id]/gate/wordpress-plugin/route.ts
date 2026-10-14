import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { zipSync, type Zippable } from 'fflate';
import { siteForRequest } from '@/lib/auth';

const PLUGIN = 'rankcall-gate';

/** GET: the WordPress plugin as an installable zip (Plugins → Add New → Upload Plugin). Signed-in users only. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found', code: 'site_not_found' }, { status: 404 });
  const root = path.join(process.cwd(), 'integrations', 'wordpress', PLUGIN);
  const files: Zippable = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const r = `${rel}/${name}`;
      if (statSync(full).isDirectory()) walk(full, r);
      else files[r] = new Uint8Array(readFileSync(full));
    }
  };
  try { walk(root, PLUGIN); } catch {
    return Response.json({ error: 'The plugin files are missing from this server build.', code: 'not_found' }, { status: 500 });
  }
  const zip = zipSync(files, { level: 9 });
  return new Response(Buffer.from(zip), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${PLUGIN}.zip"`, 'Cache-Control': 'no-store' },
  });
}
