/**
 * Writes a fictional site's exports in the real file formats, so the app can be tried and tested
 * without a client's data. Site: sample-outdoors.example (not a real business).
 * Run: npx tsx scripts/make-samples.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const HOST = 'https://www.sample-outdoors.example';

type Kind = 'top' | 'decay' | 'striking' | 'cannibal_weak' | 'cannibal_strong' | 'dead_links' | 'dead_thin' | 'steady' | 'legal' | 'nav' | 'new' | 'noindex' | 'converting_dead';
interface P { path: string; title: string; kind: Kind; topic: string; words: number; lastmod: string; rd: number; inlinks: number }

const topics = ['hiking boots', 'waterproof jackets', 'tent', 'sleeping bag', 'trail running shoes', 'camping stove', 'rucksack', 'walking poles', 'base layers', 'head torch', 'water filter', 'down jacket', 'gaiters', 'bivvy bag', 'compass', 'map reading', 'wild camping', 'scrambling', 'via ferrata', 'bothy'];
const pages: P[] = [];
const add = (p: Omit<P, 'lastmod' | 'rd' | 'inlinks'> & Partial<P>) => pages.push({ lastmod: '2025-03-14', rd: 0, inlinks: 6, ...p });

add({ path: '/', title: 'Sample Outdoors | Kit, guides and routes', kind: 'top', topic: 'outdoor gear', words: 900, lastmod: '2026-09-30', rd: 140, inlinks: 120 });
for (const l of ['privacy-policy', 'terms', 'cookie-policy']) add({ path: `/${l}`, title: l.replace(/-/g, ' '), kind: 'legal', topic: l, words: 1800 });
for (const n of ['contact', 'about', 'basket']) add({ path: `/${n}`, title: n, kind: 'nav', topic: n, words: 250, inlinks: 120 });

topics.forEach((t, i) => {
  const slug = t.replace(/ /g, '-');
  const kinds: Kind[] = ['top', 'decay', 'striking', 'steady'];
  add({ path: `/guides/best-${slug}`, title: `Best ${t} in 2024: tested and reviewed`, kind: kinds[i % 4], topic: t, words: kinds[i % 4] === 'striking' ? 650 : 2400, lastmod: i % 4 === 1 ? '2024-02-10' : '2026-05-02', rd: 3 + (i % 7), inlinks: 14 });
  add({ path: `/guides/how-to-choose-${slug}`, title: `How to choose ${t}`, kind: i % 3 === 0 ? 'cannibal_weak' : 'steady', topic: t, words: 1100, lastmod: '2025-06-20', rd: i % 3, inlinks: 5 });
  add({ path: `/products/${slug}/trailmaster-${i}`, title: `Trailmaster ${t} ${i}`, kind: i % 5 === 0 ? 'converting_dead' : 'steady', topic: t, words: 420, lastmod: '2026-08-01', rd: 0, inlinks: 9 });
});
for (let i = 0; i < 14; i++) add({ path: `/news/store-update-${2019 + (i % 4)}-${i}`, title: `Store update ${i}: opening hours`, kind: 'dead_thin', topic: 'store update', words: 140 + i * 9, lastmod: '2021-01-12', rd: 0, inlinks: 0 });
for (let i = 0; i < 6; i++) add({ path: `/blog/spring-sale-${topics[i].replace(/ /g, '-')}`, title: `Spring sale: ${topics[i]} deals`, kind: 'dead_links', topic: topics[i], words: 600, lastmod: '2021-04-02', rd: 4 + i * 3, inlinks: 1 });
for (let i = 0; i < 3; i++) add({ path: `/guides/new-route-${i}`, title: `New route guide ${i}: ${topics[i + 10]}`, kind: 'new', topic: topics[i + 10], words: 300, lastmod: '2026-10-05', inlinks: 2 });
add({ path: '/search', title: 'Search', kind: 'noindex', topic: 'search', words: 50 });

// Cannibal pairs: "how-to-choose-x" (weak) competes with "best-x" (strong) for the same queries.
const queriesFor = (p: P) => {
  const base = p.topic;
  if (p.path.startsWith('/products/')) return [`trailmaster ${base}`, `trailmaster ${base} review`, `${p.title.toLowerCase()}`, `trailmaster ${base} price`];
  return [base, `best ${base}`, `${base} uk`, `${base} review`, `cheap ${base}`, `${base} for beginners`, `how to choose ${base}`, `${base} guide`];
};

const rows: { page: string; query: string; clicks: number; imps: number; pos: number; prevPos: number; prevClicks: number; prevImps: number }[] = [];
for (const p of pages) {
  if (['dead_thin', 'noindex', 'dead_links', 'converting_dead'].includes(p.kind)) continue;
  for (const q of queriesFor(p)) {
    let pos = 0, imps = 0, decay = 1;
    switch (p.kind) {
      case 'top': pos = 1 + rnd() * 3; imps = 2000 + rnd() * 9000; break;
      case 'decay': pos = 4 + rnd() * 5; imps = 1500 + rnd() * 4000; decay = 0.45; break;
      case 'striking': pos = 9 + rnd() * 9; imps = 3000 + rnd() * 9000; break;
      case 'steady': pos = 3 + rnd() * 8; imps = 200 + rnd() * 1500; break;
      case 'cannibal_weak': pos = 9 + rnd() * 8; imps = 400 + rnd() * 1200; decay = 0.8; break;
      case 'legal': case 'nav': pos = 2 + rnd() * 6; imps = 50 + rnd() * 200; break;
      case 'new': pos = 25 + rnd() * 20; imps = 20 + rnd() * 80; break;
    }
    if (p.kind === 'cannibal_weak' && !q.includes('choose') && !q.includes('guide')) {
      // also competes on the strong page's head terms
    }
    const ctr = pos < 2 ? 0.27 : pos < 3 ? 0.15 : pos < 5 ? 0.08 : pos < 10 ? 0.03 : pos < 20 ? 0.012 : 0.003;
    const clicks = Math.round(imps * ctr * (0.8 + rnd() * 0.4));
    rows.push({ page: HOST + p.path, query: q, clicks, imps: Math.round(imps), pos, prevPos: p.kind === 'decay' ? pos * 0.7 : pos * (0.97 + rnd() * 0.06), prevClicks: Math.round(clicks / decay * (0.9 + rnd() * 0.2)), prevImps: Math.round(imps * (decay < 1 ? 1.05 : 0.95 + rnd() * 0.1)) });
  }
}
// Dead pages with links still get a trickle of impressions.
for (const p of pages.filter((x) => x.kind === 'dead_links')) rows.push({ page: HOST + p.path, query: `${p.topic} sale`, clicks: 0, imps: 12, pos: 48, prevPos: 47, prevClicks: 2, prevImps: 40 });

const byPage = new Map<string, { clicks: number; imps: number; posImp: number; prevPosImp: number; prevClicks: number; prevImps: number }>();
for (const r of rows) {
  const e = byPage.get(r.page) ?? { clicks: 0, imps: 0, posImp: 0, prevPosImp: 0, prevClicks: 0, prevImps: 0 };
  e.clicks += r.clicks; e.imps += r.imps; e.posImp += r.pos * r.imps; e.prevPosImp += r.prevPos * r.prevImps; e.prevClicks += r.prevClicks; e.prevImps += r.prevImps;
  byPage.set(r.page, e);
}
const pct = (c: number, i: number) => `${i ? ((c / i) * 100).toFixed(2) : '0'}%`;
const pagesCsv = ['Top pages,Last 3 months Clicks,Previous 3 months Clicks,Last 3 months Impressions,Previous 3 months Impressions,Last 3 months CTR,Previous 3 months CTR,Last 3 months Position,Previous 3 months Position']
  .concat([...byPage.entries()].sort((a, b) => b[1].clicks - a[1].clicks).map(([u, e]) => [u, e.clicks, e.prevClicks, e.imps, e.prevImps, pct(e.clicks, e.imps), pct(e.prevClicks, e.prevImps), (e.posImp / e.imps).toFixed(1), (e.prevPosImp / e.prevImps).toFixed(1)].join(','))).join('\n');
const dates: string[] = ['Date,Clicks,Impressions,CTR,Position'];
for (let d = new Date('2026-07-01'); d <= new Date('2026-09-30'); d.setDate(d.getDate() + 1)) dates.push(`${d.toISOString().slice(0, 10)},${Math.round(400 + rnd() * 100)},${Math.round(30000 + rnd() * 5000)},1.3%,9.4`);
const queriesCsv = 'Top queries,Clicks,Impressions,CTR,Position\n' + rows.slice(0, 50).map((r) => `${r.query},${r.clicks},${r.imps},${pct(r.clicks, r.imps)},${r.pos.toFixed(1)}`).join('\n');

mkdirSync('samples', { recursive: true });
writeFileSync('samples/search-console-performance.zip', zipSync({
  'Pages.csv': strToU8(pagesCsv), 'Queries.csv': strToU8(queriesCsv), 'Dates.csv': strToU8(dates.join('\n')),
  'Filters.csv': strToU8('Filter,Value\nSearch type,Web\nDate,Compare last 3 months to previous period'),
}));

// Page and query export (Looker Studio / Search Analytics for Sheets style), current period only.
// Weak "how to choose" pages also rank for the strong page's head terms, which is the cannibalisation.
const pq: string[] = ['Page,Query,Clicks,Impressions,CTR,Position'];
for (const r of rows) pq.push(`${r.page},${r.query},${r.clicks},${r.imps},${pct(r.clicks, r.imps)},${r.pos.toFixed(1)}`);
for (const p of pages.filter((x) => x.kind === 'cannibal_weak')) {
  for (const q of [p.topic, `best ${p.topic}`, `${p.topic} uk`, `${p.topic} review`]) pq.push(`${HOST}${p.path},${q},${Math.round(rnd() * 8)},${Math.round(600 + rnd() * 900)},0.5%,${(11 + rnd() * 6).toFixed(1)}`);
}
writeFileSync('samples/search-console-page-queries.csv', pq.join('\n'));

// GA4 landing page report.
const ga = ['# ----------------------------------------', '# Landing page', '# Account: Sample Outdoors', '# Property: sample-outdoors.example', '# ----------------------------------------', '#', '# Start date: 20260701', '# End date: 20260930', 'Landing page + query string,Sessions,Active users,Engaged sessions,Average engagement time per session,Key events,Total revenue'];
for (const p of pages) {
  const e = byPage.get(HOST + p.path);
  const sessions = Math.round((e?.clicks ?? 0) * 1.3 + (p.kind === 'converting_dead' ? 40 : 0));
  const conv = p.kind === 'converting_dead' ? 6 : p.path.startsWith('/products') ? Math.round(sessions * 0.02) : 0;
  if (sessions || conv) ga.push(`${p.path},${sessions},${Math.round(sessions * 0.9)},${Math.round(sessions * 0.6)},52.1,${conv},${(conv * 89).toFixed(2)}`);
}
ga.push(',,,,,,'); // GA4 sometimes writes a trailing totals row with an empty key
writeFileSync('samples/ga4-landing-pages.csv', ga.join('\n'));

// Screaming Frog Internal: HTML export.
const sf = ['"Address","Content Type","Status Code","Status","Indexability","Indexability Status","Title 1","Meta Description 1","H1-1","Canonical Link Element 1","Word Count","Unique Inlinks","Last Modified"'];
for (const p of pages) {
  const idx = p.kind === 'noindex' ? 'Non-Indexable' : 'Indexable';
  sf.push([HOST + p.path, 'text/html; charset=UTF-8', '200', 'OK', idx, p.kind === 'noindex' ? 'noindex' : '', p.title, `Everything about ${p.topic}.`, p.title, HOST + p.path, String(p.words), String(p.inlinks), p.lastmod].map((x) => `"${x}"`).join(','));
}
writeFileSync('samples/screaming-frog-internal-html.csv', sf.join('\n'));

// Ahrefs Best by links (UTF-8 here; real Ahrefs exports are UTF-16 and also supported).
const ah = ['URL\tReferring domains\tBacklinks\tLast crawled'];
for (const p of pages.filter((x) => x.rd > 0)) ah.push(`${HOST}${p.path}\t${p.rd}\t${p.rd * 3}\t2026-10-01`);
writeFileSync('samples/ahrefs-best-by-links.csv', ah.join('\n'));
console.log(`Wrote samples for ${pages.length} pages, ${rows.length} page-query rows.`);
