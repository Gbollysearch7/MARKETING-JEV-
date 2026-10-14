/**
 * Builds samples/keywords-sample-outdoors.csv: a fictional keyword list for Sample Outdoors
 * (sample-outdoors.example), in an Ahrefs-style layout. Deterministic. Run: npx tsx scripts/make-keywords-samples.mts
 */
import { writeFileSync } from 'node:fs';

const HOST = 'https://www.sample-outdoors.example';
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const vol = (base: number) => Math.max(10, Math.round((base * (0.6 + rnd() * 0.8)) / 10) * 10);
const cpc = (hi: boolean) => (hi ? 0.6 + rnd() * 1.4 : 0.1 + rnd() * 0.5).toFixed(2);

type Row = [keyword: string, volume: number, cpc: string, url: string, position: string];
const rows: Row[] = [];
const add = (k: string, base: number, buying: boolean, url = '', pos?: number) => rows.push([k, vol(base), cpc(buying), url ? HOST + url : '', pos ? pos.toFixed(1) : '']);

const TOPICS: [string, number][] = [
  ['hiking boots', 9000], ['waterproof jackets', 7000], ['tent', 6000], ['sleeping bag', 4000], ['trail running shoes', 5000],
  ['camping stove', 2500], ['rucksack', 3000], ['walking poles', 1800], ['base layers', 1600], ['head torch', 1400],
  ['water filter', 900], ['down jacket', 3500], ['gaiters', 700], ['bivvy bag', 600],
];
for (const [t, base] of TOPICS) {
  add(t, base, true, `/products/${t.replace(/ /g, '-')}/trailmaster-${TOPICS.findIndex((x) => x[0] === t)}`, 6 + rnd() * 10);
  add(`best ${t}`, base * 0.7, true, `/guides/best-${t.replace(/ /g, '-')}`, 2 + rnd() * 6);
  add(`best ${t} uk`, base * 0.3, true);
  add(`${t} review`, base * 0.15, true, `/guides/best-${t.replace(/ /g, '-')}`, 4 + rnd() * 8);
  add(`how to choose ${t}`, base * 0.12, false, `/guides/how-to-choose-${t.replace(/ /g, '-')}`, 3 + rnd() * 5);
  add(`cheap ${t}`, base * 0.2, true);
  add(`${t} sale`, base * 0.18, true, ['hiking boots', 'waterproof jackets', 'tent', 'sleeping bag', 'trail running shoes', 'camping stove'].includes(t) ? `/blog/spring-sale-${t.replace(/ /g, '-')}` : '', 9 + rnd() * 10);
}
// Topic-specific extras, including keywords the site has no page for yet.
add('best hiking boots for women', 2100, true, '/blog/spring-sale-hiking-boots', 14.2);
add('hiking boots for wide feet', 900, true, '/guides/how-to-choose-hiking-boots', 11.5);
add('how to clean hiking boots', 1300, false);
add('how to break in hiking boots', 1100, false, '/guides/how-to-choose-hiking-boots', 18.4);
add('hiking boots vs trail shoes', 700, false, '/guides/best-trail-running-shoes', 16.1);
add('how to reproof a waterproof jacket', 1500, false);
add('how to wash a waterproof jacket', 1200, false);
add('waterproof jacket ratings explained', 500, false, '/guides/how-to-choose-waterproof-jackets', 9.8);
add('2 person tent', 3200, true, '/products/tent/trailmaster-2', 12.3);
add('4 season tent', 1400, true);
add('how to pitch a tent in wind', 600, false);
add('tent footprint', 800, true);
add('sleeping bag temperature ratings', 900, false, '/guides/how-to-choose-sleeping-bag', 7.5);
add('down vs synthetic sleeping bag', 600, false);
add('how to store a down jacket', 300, false);
add('wild camping', 6000, false, '/guides/best-wild-camping', 8.2);
add('wild camping uk rules', 2200, false, '/guides/how-to-choose-wild-camping', 13.9);
add('wild camping in scotland', 2600, false);
add('wild camping dartmoor map', 1900, false);
add('wild camping checklist', 900, false, '/guides/best-wild-camping', 15.4);
add('via ferrata', 4000, false, '/guides/best-via-ferrata', 6.3);
add('via ferrata lake district', 2400, false, '/guides/how-to-choose-via-ferrata', 9.1);
add('via ferrata kit', 500, true, '/products/via-ferrata/trailmaster-18', 11.0);
add('via ferrata for beginners', 700, false);
add('what is a via ferrata', 800, false, '/guides/how-to-choose-via-ferrata', 4.4);
add('scrambling routes lake district', 1300, false);
add('grade 1 scrambles snowdonia', 600, false, '/guides/best-scrambling', 17.7);
add('scrambling helmet', 400, true);
add('bothy', 2400, false, '/guides/best-bothy', 5.2);
add('bothies in scotland map', 1500, false, '/guides/how-to-choose-bothy', 12.0);
add('bothy etiquette', 300, false);
add('how to use a compass', 2000, false, '/guides/how-to-choose-compass', 6.6);
add('map reading for beginners', 900, false, '/guides/how-to-choose-map-reading', 8.0);
add('ordnance survey map symbols', 1200, false);
add('camping checklist', 3300, false);
add('hiking socks', 2400, true);
add('merino wool socks hiking', 800, true);
add('day hike packing list', 700, false);
add('how much water to carry hiking', 400, false, '/guides/how-to-choose-water-filter', 19.2);
// Navigational: the site's own brand and product line.
add('sample outdoors', 1600, false, '/', 1.1);
add('sample outdoors discount code', 400, true, '/', 3.0);
add('sample outdoors returns', 200, false, '/contact', 2.4);
add('trailmaster boots', 500, true, '/products/hiking-boots/trailmaster-0', 1.6);
add('trailmaster tent review', 200, true, '/products/tent/trailmaster-2', 2.2);
// Local: wants a physical shop or venue.
add('outdoor shop near me', 8100, true);
add('camping shop keswick', 700, true);
add('hiking boot fitting manchester', 300, true);
add('outdoor gear store edinburgh', 500, true);
add('climbing wall near me', 2900, true);
// Junk: misspellings, competitor brands, off-topic.
add('hikking boots', 300, true, '/products/hiking-boots/trailmaster-0', 22.0);
add('tnet 2 person', 150, true);
add('waterprof jacket mens', 200, true);
add('rab down jacket', 2700, true, '/guides/best-down-jacket', 24.5);
add('north face jacket sale', 5400, true);
add('salomon trail running shoes', 3600, true, '/guides/best-trail-running-shoes', 21.3);
add('decathlon tent', 2900, true);
add('football boots', 9900, true, '/guides/best-hiking-boots', 48.0);

const csv = ['Keyword,Volume,CPC,Current URL,Current position', ...rows.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))].join('\n');
writeFileSync('samples/keywords-sample-outdoors.csv', `${csv}\n`);
console.log(`${rows.length} keywords written to samples/keywords-sample-outdoors.csv`);
