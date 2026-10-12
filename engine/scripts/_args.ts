export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}
export const str = (v: string | boolean | undefined, d = ''): string => (typeof v === 'string' ? v : d);
export const num = (v: string | boolean | undefined, d: number): number => (typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : d);
