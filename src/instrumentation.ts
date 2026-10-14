/**
 * Runs once when a Next.js server instance starts. The weekly re-scoring scheduler lives in
 * instrumentation-node.ts so the SQLite driver is only ever loaded in the Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
