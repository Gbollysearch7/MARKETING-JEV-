import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '../src/jev/client.js';
import { createSink } from '../src/log/decision-log.js';
import { runLinking } from '../src/modules/linking.js';
import { toCsv } from '../src/util/csv.js';
import { loadEnv } from '../src/util/env.js';
import { num, parseArgs, str } from './_args.js';
import { loadPages } from './_load.js';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const out = str(args.out, 'out/linking');
const limit = num(args.limit, 50);
const topK = num(args['top-k'], 10);

const pages = await loadPages(args, limit);
console.error(`loaded ${pages.length} pages`);
const client = createClient({ mock: args.mock === true });
console.error(`model: ${client.model}`);

await mkdir(out, { recursive: true });
const sink = createSink(join(out, 'decisions.jsonl'));
const started = Date.now();
const result = await runLinking(pages, client, {
  topK,
  concurrency: num(args.concurrency, 8),
  workspaceId: process.env.WORKSPACE_ID ?? 'local',
  sink,
  onProgress: (d, t) => { if (d % 25 === 0 || d === t) console.error(`  ${d}/${t} pairs`); },
});
await sink.close?.();

await writeFile(join(out, 'link-plan.csv'), toCsv(result.links.map((l) => ({ ...l })), [
  'sourceUrl', 'targetUrl', 'priority', 'readerBenefit', 'sameIntent', 'prerequisite', 'paragraphKey', 'anchor', 'anchorConfidence', 'needsReview', 'paragraphText',
]));
await writeFile(join(out, 'cannibalisation.csv'), toCsv(result.cannibalisation.map((c) => ({ ...c, reasons: c.reasons.join('; ') })), [
  'pageA', 'pageB', 'sameIntent', 'survivor', 'needsReview', 'reasons',
]));
const summary = {
  model: result.model,
  pages: pages.length,
  pairsEvaluated: result.pairsEvaluated,
  inputTokens: result.inputTokens,
  estimatedCostUsd: Math.round((result.inputTokens / 1_000_000) * 0.042 * 10000) / 10000,
  links: result.links.length,
  cannibalPairs: result.cannibalisation.length,
  seconds: Math.round((Date.now() - started) / 100) / 10,
};
await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.error(`wrote ${out}/link-plan.csv, cannibalisation.csv, decisions.jsonl, summary.json`);
