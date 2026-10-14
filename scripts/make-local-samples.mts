/**
 * Writes the Module 7 sample exports for "Sample Outdoors", a fictional outdoor-gear retailer with six
 * shops. Phone numbers use Ofcom's drama range (01632 960xxx), the website is sample-outdoors.example,
 * and every person named is invented. Dates are relative to ANCHOR (2026-10-13); the app shifts them so
 * the sample always looks current when it is loaded.
 *
 * Run: npx tsx scripts/make-local-samples.mts
 */
import { writeFileSync } from 'node:fs';
import Papa from 'papaparse';

const ANCHOR = Date.parse('2026-10-13T00:00:00Z');
const ago = (d: number) => new Date(ANCHOR - d * 86_400_000).toISOString().slice(0, 10);
const write = (file: string, rows: Record<string, string | number>[]) => writeFileSync(`samples/${file}`, Papa.unparse(rows) + '\n');

const HOURS = 'Mon–Sat 09:00–17:30; Sun 10:00–16:00';
const DESC_LONG = (town: string, extra: string) => `Sample Outdoors ${town} is an independent outdoor shop for walkers, climbers and campers. We stock waterproofs, walking boots, rucksacks, tents and camping kit from trusted brands, with free boot fitting by our trained team. ${extra}`;

const locations = [
  { id: 'SO-KES', town: 'Keswick', address: '14 Lake Road, Keswick', postcode: 'CA12 5BX', phone: '01632 960101', cats: 'Camping store; Hiking equipment store; Clothing store', hours: HOURS, desc: DESC_LONG('Keswick', 'We are a short walk from the lake and Market Square, and happy to talk through routes on the fells.'), photos: 26, post: 3, rating: 4.7, reviews: 212, prevRating: 4.6, prevReviews: 201 },
  { id: 'SO-AMB', town: 'Ambleside', address: '3 Rydal Road, Ambleside', postcode: 'LA22 9AN', phone: '01632 960102', cats: 'Camping store; Shoe store', hours: HOURS, desc: 'Outdoor clothing, boots and camping kit in the centre of Ambleside, with friendly advice for every kind of walk.', photos: 8, post: 12, rating: 4.4, reviews: 138, prevRating: 4.5, prevReviews: 131 },
  { id: 'SO-FTW', town: 'Fort William', address: '88 High Street, Fort William', postcode: 'PH33 6AD', phone: '01632 960103', cats: '', hours: '', desc: DESC_LONG('Fort William', 'At the foot of Ben Nevis, we can help you get kitted out for the mountain or the West Highland Way.'), photos: 4, post: 45, rating: 3.9, reviews: 97, prevRating: 4.1, prevReviews: 90 },
  { id: 'SO-BYC', town: 'Betws-y-Coed', address: 'Holyhead Road, Betws-y-Coed', postcode: 'LL24 0BW', phone: '01632 960104', cats: 'Camping store; Hiking equipment store; Map store', hours: HOURS, desc: DESC_LONG('Betws-y-Coed', 'In the heart of Eryri (Snowdonia), next to the railway station and handy for the Ogwen and Llanberis valleys.'), photos: 18, post: 6, rating: 4.6, reviews: 176, prevRating: 4.6, prevReviews: 170 },
  { id: 'SO-HAT', town: 'Hathersage', address: '5 Main Road, Hathersage', postcode: 'S32 1BB', phone: '01632 960105', cats: 'Camping store; Climbing equipment store', hours: 'Mon–Sun 09:30–17:00', desc: '', photos: 12, post: null, rating: 4.5, reviews: 84, prevRating: 4.5, prevReviews: 81 },
  { id: 'SO-AVI', town: 'Aviemore', address: '102 Grampian Road, Aviemore', postcode: 'PH22 1RH', phone: '01632 960106', cats: 'Ski shop; Camping store; Bicycle store', hours: HOURS, desc: DESC_LONG('Aviemore', 'Gateway to the Cairngorms, with winter kit, ski touring gear and bike hire advice through the seasons.'), photos: 15, post: 20, rating: 4.1, reviews: 121, prevRating: 4.2, prevReviews: 112 },
];

const locRow = (l: (typeof locations)[number], prev: boolean) => ({
  'Location ID': l.id,
  'Business name': `Sample Outdoors ${l.town}`,
  Address: l.address,
  Postcode: l.postcode,
  'Primary phone': l.phone,
  Website: `https://sample-outdoors.example/stores/${l.town.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  'Primary category': 'Outdoor sports store',
  'Additional categories': l.cats,
  'Opening hours': l.hours,
  Description: l.desc,
  'Photo count': l.photos,
  'Last post date': l.post == null ? '' : ago(l.post + (prev ? 30 : 0)),
  'Average rating': prev ? l.prevRating : l.rating,
  'Review count': prev ? l.prevReviews : l.reviews,
});
write('local-locations.csv', locations.map((l) => locRow(l, false)));
write('local-locations-previous.csv', locations.map((l) => locRow(l, true)));

// [location, author, stars, text, days ago, replied]
type R = [string, string, number, string, number, boolean];
const reviews: R[] = [
  ['SO-KES', 'Hannah W.', 5, 'Brilliant shop. Got my boots fitted properly for the first time and they are so comfortable on the fells.', 2, false],
  ['SO-KES', 'Martin P.', 5, 'Great range of waterproofs and very friendly staff.', 4, false],
  ['SO-KES', 'Eleanor', 5, '', 6, false],
  ['SO-KES', 'Joe R.', 4, 'Good selection of tents. A bit busy on Saturday but worth the wait.', 9, false],
  ['SO-KES', 'Priya S.', 5, 'Tom in the boot department really knew his stuff and spent ages helping me choose. Will be back for a rucksack.', 11, false],
  ['SO-KES', 'Gareth L.', 5, 'Lovely shop, clean and well laid out.', 25, true],
  ['SO-KES', 'Anna B.', 3, 'Nice kit but prices are higher than online.', 33, true],
  ['SO-KES', 'Chris D.', 5, 'Always helpful advice before a trip up Skiddaw.', 48, true],
  ['SO-KES', 'Sue M.', 4, 'Good shop, found the socks I needed.', 62, true],
  ['SO-KES', 'Rob T.', 5, 'Excellent service as ever.', 80, true],

  ['SO-AMB', 'Fiona G.', 5, 'Friendly team and a great selection of walking poles.', 1, false],
  ['SO-AMB', 'Dan K.', 2, 'Waited twenty minutes to be served and nobody acknowledged us. Disappointing.', 3, false],
  ['SO-AMB', 'Lucy H.', 4, 'Good value fleeces in the sale rail.', 8, false],
  ['SO-AMB', 'Ian F.', 5, 'Sorted me out with a new jacket in ten minutes. Top service.', 14, false],
  ['SO-AMB', 'Kate O.', 1, 'My boots split at the seam after three weeks and the shop would not give me a refund. I want to speak to a manager.', 5, false],
  ['SO-AMB', 'Ahmed R.', 5, 'Helpful advice for our first wild camp.', 22, true],
  ['SO-AMB', 'Beth C.', 4, 'Nice shop, a bit cramped.', 40, true],
  ['SO-AMB', 'Neil W.', 5, '', 55, true],
  ['SO-AMB', 'Tash P.', 3, 'Okay range but my size was out of stock.', 70, true],
  ['SO-AMB', 'Graham S.', 5, 'Always my first stop in Ambleside.', 90, true],

  ['SO-FTW', 'Callum M.', 2, 'Shop was messy and the fitting room floor was dirty. Expected better.', 2, false],
  ['SO-FTW', 'Isla R.', 1, 'Staff member was rude when I asked about the price of a tent. Never again.', 4, false],
  ['SO-FTW', 'Pete A.', 3, 'Decent kit but the queue at the till was long and only one person working.', 6, false],
  ['SO-FTW', 'Morag D.', 5, 'Got everything we needed for Ben Nevis. Thanks!', 7, false],
  ['SO-FTW', 'Steve J.', 4, 'Good maps and advice on the weather up top.', 10, false],
  ['SO-FTW', 'Lena V.', 2, 'Booked a crampon hire online but it was not ready when I came to collect.', 13, false],
  ['SO-FTW', 'Ross B.', 1, 'Check out www.cheap-followers.example for 1000 followers today!!! Best SEO services', 9, false],
  ['SO-FTW', 'Ewan T.', 4, 'Helpful staff, slightly expensive.', 35, true],
  ['SO-FTW', 'Jen L.', 3, 'Average.', 52, true],
  ['SO-FTW', 'Ali N.', 5, 'Great last-minute waterproofs before the West Highland Way.', 75, true],

  ['SO-BYC', 'Rhys E.', 5, 'Fantastic little shop with really knowledgeable staff. Emma helped me pick a rucksack for the Snowdon horseshoe.', 3, false],
  ['SO-BYC', 'Megan P.', 5, 'Great range and fair prices.', 5, false],
  ['SO-BYC', 'Owen G.', 4, 'Good shop, would be five stars if it opened a bit earlier.', 10, false],
  ['SO-BYC', 'Sian T.', 5, '', 12, false],
  ['SO-BYC', 'Paul H.', 5, 'Quick and easy click and collect.', 20, true],
  ['SO-BYC', 'Carys W.', 4, 'Lovely staff.', 31, true],
  ['SO-BYC', 'Tom F.', 5, 'Best outdoor shop in the area.', 44, true],
  ['SO-BYC', 'Nia J.', 3, 'Fine, but the map section was a bit thin.', 60, true],
  ['SO-BYC', 'Dewi L.', 5, 'Good boots, good advice.', 77, true],
  ['SO-BYC', 'Alys M.', 5, 'Always friendly.', 95, true],

  ['SO-HAT', 'Sam K.', 5, 'Climbing shoes fitted perfectly. Really helpful lad behind the counter.', 2, false],
  ['SO-HAT', 'Laura B.', 4, 'Nice small shop, good chalk and rope selection.', 6, false],
  ['SO-HAT', 'Mike D.', 3, 'Had to wait a while for someone to help with harness sizing.', 9, false],
  ['SO-HAT', 'Zoe A.', 5, 'Great advice on Stanage routes and kit.', 15, false],
  ['SO-HAT', 'Olly C.', 5, 'Proper climbing shop, staff know what they are talking about.', 28, true],
  ['SO-HAT', 'Deb R.', 4, 'Good range of maps.', 46, true],
  ['SO-HAT', 'Harry S.', 5, '', 58, true],
  ['SO-HAT', 'Jess T.', 4, 'Friendly and helpful.', 72, true],
  ['SO-HAT', 'Karen W.', 5, 'Lovely shop in a lovely village.', 88, true],

  ['SO-AVI', 'Euan F.', 5, 'Sorted my ski touring bindings the same day. Brilliant service.', 1, false],
  ['SO-AVI', 'Mairi C.', 2, 'The jacket I bought leaks at the shoulders after one wet walk. Want to know what you will do about it.', 3, false],
  ['SO-AVI', 'Daniel O.', 4, 'Good stock of winter kit already.', 7, false],
  ['SO-AVI', 'Grace L.', 1, 'Terrible place. The owners are crooks and idiots, do not go here, go to the café down the road instead, their scones are better.', 8, false],
  ['SO-AVI', 'Jamie H.', 3, 'Prices are on the high side for what you get.', 11, false],
  ['SO-AVI', 'Ruth P.', 5, 'Friendly staff and good bike advice.', 18, false],
  ['SO-AVI', 'Andy M.', 4, 'Good shop, parking can be tricky.', 38, true],
  ['SO-AVI', 'Holly N.', 5, 'Great for last-minute Cairngorms kit.', 50, true],
  ['SO-AVI', 'Fraser K.', 3, 'Okay.', 66, true],
  ['SO-AVI', 'Iona S.', 5, 'Helpful and knowledgeable as always.', 84, true],
];
write('local-reviews.csv', reviews.map(([loc, author, stars, text, d, replied]) => ({
  'Location ID': loc, Author: author, Rating: stars, Text: text, Date: ago(d), Replied: replied ? 'yes' : 'no',
  'Reply text': replied ? `Thank you for your review, ${author.split(' ')[0]}. The team at Sample Outdoors` : '',
})));

const questions: [string, string, number, boolean][] = [
  ['SO-KES', 'Do you do boot fitting?', 20, true],
  ['SO-KES', 'Are you open on Sundays?', 4, false],
  ['SO-AMB', 'Is there parking near the shop?', 6, false],
  ['SO-AMB', 'Can I order online and collect in store?', 15, false],
  ['SO-FTW', 'What time do you close on bank holidays?', 3, false],
  ['SO-FTW', 'Do you hire crampons and ice axes?', 9, false],
  ['SO-FTW', 'Buy followers cheap at www.cheap-followers.example', 5, false],
  ['SO-BYC', 'Do you sell OS maps of Snowdonia?', 12, false],
  ['SO-HAT', 'Do you sell climbing shoes?', 7, false],
  ['SO-HAT', 'Can I rent bouldering mats?', 2, false],
  ['SO-AVI', 'What is your phone number?', 10, true],
  ['SO-AVI', 'Do you service skis?', 4, false],
];
write('local-questions.csv', questions.map(([loc, q, d, answered]) => ({ 'Location ID': loc, Question: q, Date: ago(d), Answered: answered ? 'yes' : 'no' })));

// Citations: format-only differences that must NOT be flagged, plus deliberate real mismatches.
const L = Object.fromEntries(locations.map((l) => [l.id, l]));
const name = (id: string) => `Sample Outdoors ${L[id].town}`;
const full = (id: string) => `${L[id].address}, ${L[id].postcode}`;
const url = (id: string) => `https://sample-outdoors.example/stores/${L[id].town.toLowerCase().replace(/[^a-z]+/g, '-')}`;
type C = [string, string, string, string, string, string];
const std = (id: string, dirs: string[]): C[] => dirs.map((d) => [id, d, name(id), full(id), L[id].phone, url(id)]);
const DIRS = ['Google', 'Apple Maps', 'Bing Places', 'Facebook', 'Yelp', 'Yell', 'Thomson Local', 'FreeIndex'];
const citations: C[] = [
  // Keswick: all match, one minor directory with an old phone number.
  ...std('SO-KES', DIRS.slice(0, 7)),
  ['SO-KES', 'FreeIndex', 'Sample Outdoors Keswick', '14 Lake Rd, Keswick, CA12 5BX', '01632 960199', url('SO-KES')],
  // Ambleside: formatting differences only on Apple and Yell (must match); Bing has an old phone number.
  ['SO-AMB', 'Google', name('SO-AMB'), full('SO-AMB'), L['SO-AMB'].phone, url('SO-AMB')],
  ['SO-AMB', 'Apple Maps', 'SAMPLE OUTDOORS AMBLESIDE', '3 Rydal Rd., Ambleside, la229an', '+44 1632 960102', 'http://www.sample-outdoors.example/stores/ambleside/'],
  ['SO-AMB', 'Bing Places', name('SO-AMB'), full('SO-AMB'), '01632 960177', url('SO-AMB')],
  ['SO-AMB', 'Facebook', name('SO-AMB'), full('SO-AMB'), L['SO-AMB'].phone, url('SO-AMB')],
  ['SO-AMB', 'Yell', 'Sample Outdoors Ambleside Ltd', '3 Rydal Road, Ambleside, Cumbria, LA22 9AN', '+44 (0)1632 960102', url('SO-AMB')],
  ['SO-AMB', 'Thomson Local', name('SO-AMB'), full('SO-AMB'), L['SO-AMB'].phone, url('SO-AMB')],
  // Fort William: Google name wrong, Facebook on the old address, Yelp wrong website.
  ['SO-FTW', 'Google', 'Sample Outdoor Store Fort William', full('SO-FTW'), L['SO-FTW'].phone, url('SO-FTW')],
  ['SO-FTW', 'Apple Maps', name('SO-FTW'), full('SO-FTW'), L['SO-FTW'].phone, url('SO-FTW')],
  ['SO-FTW', 'Bing Places', name('SO-FTW'), full('SO-FTW'), L['SO-FTW'].phone, url('SO-FTW')],
  ['SO-FTW', 'Facebook', name('SO-FTW'), '12 Station Square, Fort William, PH33 6AN', L['SO-FTW'].phone, url('SO-FTW')],
  ['SO-FTW', 'Yelp', name('SO-FTW'), full('SO-FTW'), L['SO-FTW'].phone, 'https://old-sample-outdoors.example'],
  ['SO-FTW', 'Yell', name('SO-FTW'), full('SO-FTW'), L['SO-FTW'].phone, url('SO-FTW')],
  // Betws-y-Coed: Apple has the wrong postcode, Yelp has a duplicate listing.
  ['SO-BYC', 'Google', name('SO-BYC'), full('SO-BYC'), L['SO-BYC'].phone, url('SO-BYC')],
  ['SO-BYC', 'Apple Maps', name('SO-BYC'), 'Holyhead Road, Betws-y-Coed, LL24 0WB', L['SO-BYC'].phone, url('SO-BYC')],
  ['SO-BYC', 'Bing Places', name('SO-BYC'), full('SO-BYC'), L['SO-BYC'].phone, url('SO-BYC')],
  ['SO-BYC', 'Yelp', name('SO-BYC'), full('SO-BYC'), L['SO-BYC'].phone, url('SO-BYC')],
  ['SO-BYC', 'Yelp', 'Sample Outdoors Betws y Coed', full('SO-BYC'), L['SO-BYC'].phone, ''],
  ['SO-BYC', 'Thomson Local', name('SO-BYC'), full('SO-BYC'), L['SO-BYC'].phone, url('SO-BYC')],
  // Hathersage: all match.
  ...std('SO-HAT', ['Google', 'Apple Maps', 'Bing Places', 'Facebook', 'Yell']),
  // Aviemore: Google phone wrong, Thomson Local wrong street number.
  ['SO-AVI', 'Google', name('SO-AVI'), full('SO-AVI'), '01632 960160', url('SO-AVI')],
  ['SO-AVI', 'Apple Maps', name('SO-AVI'), full('SO-AVI'), L['SO-AVI'].phone, url('SO-AVI')],
  ['SO-AVI', 'Bing Places', name('SO-AVI'), full('SO-AVI'), L['SO-AVI'].phone, url('SO-AVI')],
  ['SO-AVI', 'Facebook', name('SO-AVI'), full('SO-AVI'), L['SO-AVI'].phone, url('SO-AVI')],
  ['SO-AVI', 'Thomson Local', name('SO-AVI'), '120 Grampian Road, Aviemore, PH22 1RH', L['SO-AVI'].phone, url('SO-AVI')],
];
write('local-citations.csv', citations.map(([loc, dir, n, addr, phone, u]) => ({ 'Location ID': loc, Directory: dir, 'Listed name': n, Address: addr, Phone: phone, URL: u })));

console.log(`Wrote ${locations.length} locations, ${reviews.length} reviews, ${questions.length} questions, ${citations.length} citations.`);
