/**
 * Whether this server process should run the weekly re-scoring scheduler.
 * On by default in production; off in development so a local dev server never spends live Jev calls on its own.
 * SCHEDULER_ENABLED=true forces it on; SCHEDULER_ENABLED=false forces it off (use that on any extra app instance).
 */
export function schedulerWanted(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VITEST || env.NODE_ENV === 'test') return false;
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  if (env.SCHEDULER_ENABLED === 'false') return false;
  if (env.SCHEDULER_ENABLED === 'true') return true;
  return env.NODE_ENV === 'production';
}
