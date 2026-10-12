import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createClient } from '../src/jev/client.js';
import { createSink } from '../src/log/decision-log.js';
import { runCompliance, type Channel, type CopyPiece } from '../src/modules/compliance.js';
import { loadEnv } from '../src/util/env.js';
import { parseArgs, str } from './_args.js';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const channel = str(args.channel, 'ad') as Channel;
const pieces: CopyPiece[] = [];
if (typeof args.file === 'string') pieces.push({ id: args.file, channel, text: await readFile(args.file, 'utf8') });
else if (typeof args.dir === 'string') {
  for (const f of (await readdir(args.dir)).filter((x) => ['.txt', '.md', '.html'].includes(extname(x))).sort()) {
    pieces.push({ id: f, channel, text: await readFile(join(args.dir, f), 'utf8') });
  }
} else if (typeof args.text === 'string') pieces.push({ id: 'inline', channel, text: args.text });
else throw new Error('Provide --file <path>, --dir <folder> or --text "<copy>"');

const client = createClient({ mock: args.mock === true });
const sink = createSink(str(args.out, 'out/compliance') + '/decisions.jsonl');
const rows = await runCompliance(pieces, client, { workspaceId: process.env.WORKSPACE_ID ?? 'local', sink, config: args['no-risk-warning'] === true ? { requireRiskWarning: false, blockThreshold: 0.8, flagThreshold: 0.6, reviewBand: [0.4, 0.6] } : undefined });
await sink.close?.();

for (const r of rows) {
  console.log(`${r.status.toUpperCase().padEnd(6)} ${r.id}  (risk warning score ${r.riskWarning?.score ?? 'n/a'})`);
  for (const f of r.flags) console.log(`   ${f.action.padEnd(6)} ${f.rule.padEnd(36)} ${f.probability}  [${f.family}]`);
}
if (args.strict === true && rows.some((r) => r.status === 'block')) process.exit(1);
