/** Live smoke test of the visibility.v1 Jev battery on the sample answers. Needs .env.local. Never prints the key. */
import { readFileSync } from 'node:fs';
import { TypeSafeProvider } from '../src/engine/jev/client';
import { importCrawlCsv } from '../src/engine/ingest/crawl-csv';
import { analyseAnswer, mentionExcerpt, parseAnswersCsv } from '../src/modules/visibility/parse';
import { lostPrompts, rates, runDates, type AnswerFacts } from '../src/modules/visibility/aggregate';
import { lossQuestions, lossState, sentimentQuestions, sentimentState } from '../src/modules/visibility/battery';
import { fixFor, readLoss, readSentiment, routerFor } from '../src/modules/visibility/rules';
import { coverageFor } from '../src/modules/visibility/prompts';
import type { BrandConfig } from '../src/modules/visibility/types';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const provider = new TypeSafeProvider({ apiKey: env.TYPESAFE_API_KEY, model: env.JEV_MODEL || undefined });
const brand: BrandConfig = {
  name: 'Sample Outdoors', aliases: ['SampleOutdoors'], domain: 'sample-outdoors.example',
  competitors: [
    { name: 'Ridgeline Outfitters', domain: 'ridgeline-outfitters.example' }, { name: 'Fellwalker Supply', domain: 'fellwalker-supply.example' },
    { name: 'Cairn & Crag', domain: 'cairnandcrag.example' }, { name: 'Northpeak Gear Co', domain: 'northpeak-gear.example' },
  ],
};
const pages = importCrawlCsv(new Uint8Array(readFileSync('samples/screaming-frog-internal-html.csv'))).pages;
const { rows } = parseAnswersCsv(readFileSync('samples/visibility-answers.csv', 'utf8'), '2026-10-13');
const ids = new Map<string, string>();
const parsed = rows.map((r) => ({ r, p: analyseAnswer(r.answer, r.citedUrls, brand) }));
const facts: AnswerFacts[] = parsed.map(({ r, p }) => {
  if (!ids.has(r.prompt)) ids.set(r.prompt, `p${ids.size}`);
  return { promptId: ids.get(r.prompt)!, prompt: r.prompt, engine: r.engine, runDate: r.runDate, mentioned: p.mentioned, brandCited: p.brandCited, competitors: p.competitors, sourceTypes: p.cited.map((c) => c.type) };
});
const last = runDates(facts).pop();
const overall = rates(facts.filter((f) => f.runDate === last), brand.name, []).visibility;
let calls = 0;
console.log('--- loss reasons');
for (const l of lostPrompts(facts)) {
  const coverage = coverageFor(l.prompt, pages, [brand.name]);
  const page = pages.find((p) => p.path === coverage.path);
  const state = lossState({ brand: brand.name, domain: brand.domain, lost: l, coverage, pageStatus: page ? (page.indexable ? 'indexable' : 'not_indexable') : 'unknown', overallVisibility: overall });
  if (process.env.DUMP && l.prompt.includes(process.env.DUMP)) console.log(JSON.stringify(state, null, 1));
  if (process.env.DRY) continue;
  const res = await provider.decide({ state, questions: lossQuestions() }); calls++;
  const r = readLoss(res.answers.loss_reason);
  if (!r) { console.log('UNUSABLE', l.prompt, JSON.stringify(res.answers)); continue; }
  console.log(`${l.prompt.padEnd(44)} page=${coverage.match.padEnd(7)} winner=${String(l.winner).padEnd(20)} -> ${r.reason} p=${r.confidence.toFixed(2)} ${routerFor(r.confidence)} | ${fixFor(r.reason, { prompt: l.prompt, winner: l.winner, pagePath: coverage.path }).owner}`);
}
console.log('--- sentiment');
for (const { r, p } of parsed.filter((x) => x.p.mentioned).filter((_x, i) => i % 3 === 0).slice(0, Number(process.env.SENT ?? 8))) {
  const res = await provider.decide({ state: sentimentState(brand.name, r.prompt, mentionExcerpt(r.answer, p.firstIndex)), questions: sentimentQuestions() }); calls++;
  const s = readSentiment(res.answers.sentiment);
  const line = r.answer.split('\n').find((x) => x.includes('Sample Outdoors')) ?? '';
  console.log(`${String(s?.sentiment).padEnd(8)} p=${s?.confidence.toFixed(2)} | ${line.slice(0, 110)}`);
}
console.log('calls', calls, 'model', provider.model);
