/** Live Jev run over the sample site, printing the verdict mix and the pages that test each verdict. Needs .env.local. */
import { readFileSync } from 'node:fs';
import { TypeSafeProvider } from '../src/engine/jev/client';
import { importGsc } from '../src/engine/ingest/gsc';
import { importGa4 } from '../src/engine/ingest/ga4';
import { importCrawlCsv } from '../src/engine/ingest/crawl-csv';
import { importBacklinks } from '../src/engine/ingest/backlinks';
import { buildSiteData } from '../src/engine/site';
import { runVerdicts } from '../src/engine/verdict/run';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const f = (n: string) => new Uint8Array(readFileSync(`samples/${n}`));
const site = buildSiteData({ gsc: importGsc('z', f('search-console-performance.zip')), gscQueries: importGsc('q', f('search-console-page-queries.csv')), ga4: importGa4(f('ga4-landing-pages.csv')), crawl: importCrawlCsv(f('screaming-frog-internal-html.csv')), backlinks: importBacklinks(f('ahrefs-best-by-links.csv')), today: '2026-10-13' });
const res = await runVerdicts(site.urls, site.ctx, new TypeSafeProvider({ apiKey: env.TYPESAFE_API_KEY, model: env.JEV_MODEL }), { concurrency: 8 });
const mix: Record<string, number> = {};
for (const v of res.verdicts) mix[v.verdict ?? 'skip'] = (mix[v.verdict ?? 'skip'] ?? 0) + 1;
console.log('mix', JSON.stringify(mix), 'tokens', res.inputTokens);
const router: Record<string, number> = {};
for (const v of res.verdicts) if (v.router) router[v.router] = (router[v.router] ?? 0) + 1;
console.log('router', JSON.stringify(router));
for (const v of res.verdicts.filter((x) => /spring-sale|store-update-2019-0|new-route|trailmaster-0$|best-via|how-to-choose-hiking/.test(x.path)))
  console.log(String(v.verdict).padEnd(8), v.probability.toFixed(2), String(v.router).padEnd(9), v.path.padEnd(44), '->', v.target ?? '', '|', v.rulesApplied.join('; ').slice(0, 90));
const agg: Record<string, { n: number; lo: number; hi: number }> = {};
for (const v of res.verdicts) if (v.verdict) { const a = (agg[v.verdict] ??= { n: 0, lo: 0, hi: 0 }); a.n++; a.lo += v.impact.low; a.hi += v.impact.high; }
console.log('impact', JSON.stringify(agg));
const top = res.verdicts.filter((v) => v.verdict && v.verdict !== 'leave' && !(v.router === 'auto' && v.verdict !== 'prune' && v.verdict !== 'redirect')).sort((a, b) => b.impact.high - a.impact.high).slice(0, 6);
for (const v of top) console.log('TOP', v.verdict, v.probability.toFixed(2), v.router, v.path, v.impact.low, v.impact.high, v.target ?? '');
console.log("site monthly clicks", Math.round(res.verdicts.reduce((s, v) => s + v.monthlyClicks, 0)));
