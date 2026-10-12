import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal .env loader so scripts work without a dotenv dependency. Does not override existing vars. */
export function loadEnv(dir = process.cwd()): void {
  const file = resolve(dir, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
