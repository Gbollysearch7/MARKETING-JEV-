import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '../src/jev/client.js';
import { createSink } from '../src/log/decision-log.js';
import { runPublishGate } from '../src/modules/publish-gate.js';
import { toCsv } from '../src/util/csv.js';
import { loadEnv } from '../src/util/env.js';
import { num, parseArgs, str } from './_args.js';
import { loadPages } from './_load.js';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const out = str(args.out, 'out/publish-gate');
const pages = await loadPages(args, num(args.limit, 500));
console.error(`loaded ${pages.length} pages`);
const client = createClient({ mock: args.mock === true });

await mkdir(out, { recursive: true });
const sink = createSink(join(out, 'decisions.jsonl'));
const rows = await runPublishGate(pages, client, {
  siblingsK: num(args.siblings, 5),
  bannedTerms: str(args.banned).split(',').map((s) => s.trim()).filter(Boolean),
  concurrency: num(args.concurrency, 8),
  workspaceId: process.env.WORKSPACE_ID ?? 'local',
  sink,
});
await sink.close?.();

await writeFile(join(out, 'gate.csv'), toCsv(rows.map((r) => ({ ...r, reasons: r.reasons.join('; ') })), [
  'url', 'title', 'disposition', 'needsReview', 'wordCount', 'reasons',
]));
const counts = { index: 0, improve: 0, kill: 0, needsReview: 0 };
for (const r of rows) { counts[r.disposition]++; if (r.needsReview) counts.needsReview++; }
const tokens = rows.reduce((s, r) => s + r.inputTokens, 0);
console.log(JSON.stringify({ model: client.model, pages: rows.length, ...counts, inputTokens: tokens, estimatedCostUsd: Math.round((tokens / 1e6) * 0.042 * 10000) / 10000 }, null, 2));
for (const r of rows.filter((x) => x.disposition !== 'index')) console.error(`${r.disposition.toUpperCase().padEnd(8)} ${r.url}\n         ${r.reasons.join('; ')}`);
console.error(`wrote ${out}/gate.csv`);
if (args.strict === true && counts.kill > 0) process.exit(1);
