import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** Deployment wiring: health route, env documentation, and the config files the host reads. */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => import('../src/lib/db'));

const root = path.resolve(__dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const dataDir = mkdtempSync(path.join(tmpdir(), 'rankcall-health-'));
let prevDataDir: string | undefined;

beforeAll(() => { prevDataDir = process.env.DATA_DIR; process.env.DATA_DIR = dataDir; });
afterAll(async () => {
  (await import('../src/lib/db')).db().close();
  if (prevDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prevDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

describe('/api/health', () => {
  it('answers 200 with ok, db and version only', async () => {
    const { GET } = await import('../src/app/api/health/route');
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['db', 'ok', 'version']);
    expect(body).toMatchObject({ ok: true, db: true });
    expect(typeof body.version).toBe('string');
  });
});

describe('.env.example', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts)$/.test(n) ? [p] : [];
  });
  const example = read('.env.example');
  const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  // Set by Next.js or the test runner, or only used by one-off dev scripts.
  const notConfig = new Set(['NODE_ENV', 'NEXT_PHASE', 'NEXT_RUNTIME', 'VITEST', 'DRY', 'DUMP', 'SENT']);

  it('documents every env var the app reads', () => {
    const used = new Set<string>();
    for (const f of [...files(path.join(root, 'src')), ...files(path.join(root, 'scripts'))]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:process\.)?env\.([A-Z][A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) used.add(m[1] ?? m[2]);
    }
    for (const k of ['OPENAI', 'ANTHROPIC', 'PERPLEXITY', 'GEMINI']) used.add(`${k}_API_KEY`).add(`${k}_MODEL`);
    const missing = [...used].filter((k) => !notConfig.has(k) && !documented.has(k));
    expect(missing).toEqual([]);
  });

  it('holds no real-looking secrets', () => {
    expect(example).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{12,}/);
  });
});

describe('hosting config', () => {
  it('fly.toml: London, one /data volume, health check, never auto-stopped', () => {
    const fly = read('fly.toml');
    expect(fly).toMatch(/primary_region = "lhr"/);
    expect(fly).toMatch(/destination = "\/data"/);
    expect(fly).toMatch(/path = "\/api\/health"/);
    expect(fly).toMatch(/auto_stop_machines = "off"/);
  });

  it('litestream replicates the database the app opens', () => {
    expect(read('litestream.yml')).toMatch(/path: \/data\/app\.db/);
    expect(read('Dockerfile')).toMatch(/DATA_DIR=\/data/);
    const start = read('scripts/start.sh');
    expect(start).toMatch(/litestream restore .*-if-replica-exists/);
    expect(start).toMatch(/litestream replicate .*-exec "node server\.js"/);
  });

  it('the database runs in WAL mode (required by Litestream)', () => {
    expect(read('src/lib/db.ts')).toMatch(/journal_mode = WAL/);
  });

  it('next.config sends the security headers and builds standalone', async () => {
    const cfg = (await import('../next.config')).default;
    expect(cfg.output).toBe('standalone');
    expect(cfg.serverExternalPackages).toContain('better-sqlite3');
    const rules = await cfg.headers!();
    const keys = rules[0].headers.map((h) => h.key);
    expect(rules[0].source).toBe('/:path*');
    expect(keys).toEqual(expect.arrayContaining(['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']));
    expect(rules[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value).toContain("frame-ancestors 'none'");
  });
});
