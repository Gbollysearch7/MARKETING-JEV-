/**
 * Builds the Module 6 sample files for the fictional "Sample Outdoors" shop (sample-outdoors.example).
 * Every domain is a made-up .example domain. Run: npx tsx scripts/make-links-samples.mts
 */
import { writeFileSync } from 'node:fs';
import Papa from 'papaparse';

type Row = { url: string; title: string; snippet: string; dr: number | ''; traffic: number | ''; link_type: string; anchor: string };
const rows: Row[] = [];
const add = (url: string, title: string, snippet: string, dr: number | '', traffic: number | '', link_type = 'dofollow', anchor = '') =>
  rows.push({ url: `https://${url}`, title, snippet, dr, traffic, link_type, anchor });

// Outdoor blogs and magazines (editorial)
add('trailnotes-journal.example/2026/best-day-hikes-lake-district', 'The 12 best day hikes in the Lake District', 'Our favourite fell walks, with route maps, parking tips and what to pack for changeable weather.', 48, 8200, 'dofollow', 'what to pack');
add('wildcampingweekly.example/wild-camping-checklist', 'Wild camping checklist: everything you need for a night out', 'A practical kit list for your first wild camp, from tents and sleeping bags to stoves.', 41, 5100);
add('peakandvalley.example/blog/winter-layering-system', 'How to layer for winter hillwalking', 'Base layers, mid layers and shells explained by a mountain leader.', 55, 14800, 'dofollow', 'merino base layer');
add('thefellrunner.example/trail-shoes-for-mud', 'Trail running shoes for mud: what actually grips', 'We tested lug depth and rubber compounds on boggy Pennine trails.', 37, 3900);
add('bothybound.example/stories/a-night-in-the-cairngorms', 'A night in the Cairngorms', 'Trip report from a two-day walk with a bothy stop and a cold sunrise.', 22, 900);
add('coastpathdiaries.example/south-west-coast-path-planning', 'Planning the South West Coast Path', 'Stages, accommodation and kit for the 630-mile path.', 33, 2600);
add('outdoorfamilies.example/hiking-with-kids-gear', 'Hiking with kids: the gear that made it easier', 'Child carriers, waterproofs and snacks that kept our walks fun.', 29, 2100);
add('alpineascent.example/guides/via-ferrata-beginners', 'Via ferrata for beginners', 'What a via ferrata is, the kit you need and how to choose a first route.', 52, 11000);
add('gritstonelines.example/climbing-shoes-sizing', 'How climbing shoes should fit', 'Sizing advice for downturned and flat shoes, with brand comparisons.', 31, 1800);
add('wildswimlog.example/cold-water-swimming-kit', 'Cold water swimming kit list', 'Tow floats, neoprene gloves and changing robes for year-round swims.', 26, 1500);
add('backpackinglight.example/ultralight-tent-review-roundup', 'Ultralight tent roundup', 'Seven one-person tents under 1.2 kg compared on weight, space and price.', 58, 21000, 'dofollow', 'tent comparison');
add('hillwalkerhandbook.example/navigation/map-and-compass-basics', 'Map and compass basics', 'Taking a bearing, pacing and handrails, for walkers new to navigation.', 44, 6700);
add('mountainmornings.example/sunrise-camps-snowdonia', 'Five sunrise camp spots in Snowdonia', 'Where to pitch for sunrise, how to stay low impact and what to bring.', 19, 700);
add('ridgelinemag.example/features/the-rise-of-fastpacking', 'The rise of fastpacking', 'Why runners are carrying overnight kit and how the gear has changed.', 61, 26000);
add('dalesrambler.example/walks/malham-cove-circular', 'Malham Cove circular walk', 'A 7-mile loop with limestone pavement, waterfalls and a tea stop.', 18, 1200);
add('greenlaneexplorer.example/bikepacking-bags-explained', 'Bikepacking bags explained', 'Frame, seat and bar bags compared for a first overnight ride.', 35, 3300);
add('campfirecooking.example/backpacking-stove-guide', 'Choosing a backpacking stove', 'Gas, meths and multi-fuel stoves compared on weight and boil time.', 27, 2400);
add('trekkingtales.example/kilimanjaro-packing-list', 'Kilimanjaro packing list', 'Everything we took up the Machame route, and what we would leave behind.', 46, 9800);
add('outdoorwomenuk.example/waterproof-jacket-test', 'Waterproof jackets tested on a wet weekend', 'Five women\'s shells tested in two days of Welsh rain.', 39, 4600);

// Gear review sites
add('gearverdict.example/reviews/best-hiking-boots', 'Best hiking boots 2026', 'Our pick of leather and synthetic boots after 400 miles of testing. Brands include Trailmaster and others.', 63, 34000, 'dofollow', 'Trailmaster boots');
add('kitlab.example/sleeping-bags/three-season-guide', 'Three-season sleeping bags: the buyer\'s guide', 'Comfort ratings, fill power and shapes explained, with ten bags tested.', 57, 18500);
add('honestgearreviews.example/rucksacks/best-daypacks', 'The best daypacks for hillwalking', 'Twenty to thirty litre packs compared for comfort, pockets and rain covers.', 45, 7400);
add('testedoutdoors.example/headtorches-compared', 'Head torches compared', 'Beam patterns, battery life and weight for winter walking.', 42, 6100);
add('gearverdict.example/reviews/best-trekking-poles', 'Best trekking poles', 'Folding and telescopic poles tested on steep descents.', 63, 34000);
add('packweightpro.example/reviews/stove-and-pot-sets', 'Stove and pot sets reviewed', 'Integrated canister systems tested at altitude.', 34, 2900);

// Resource pages
add('ramblersclub-york.example/resources/useful-links', 'Useful links for walkers', 'Recommended reading: weather sites, kit guides, route planners and outdoor shops we like.', 28, 1400);
add('scoutgroup-ridgeway.example/parents/kit-resources', 'Kit resources for parents', 'Links to kit lists and guides to help you prepare for camp.', 21, 400);
add('duke-award-centre.example/expedition-resources', 'Expedition resources', 'Recommended guides on navigation, camp craft and kit for expedition groups.', 47, 5200);
add('mountainsafety.example/resources/winter-walking', 'Winter walking resources', 'A list of trusted guides on avalanche awareness, layering and winter kit.', 59, 15500);
add('universityhillwalking.example/links', 'Club links and resources', 'Recommended shops, kit guides, weather and route resources for members.', 32, 800);
add('countrysidetrust.example/visit/plan-your-walk/resources', 'Plan your walk: resources', 'Useful links for planning a walk, from maps and transport to kit advice.', 66, 41000);

// Guest post opportunities
add('outdoorvoices-blog.example/write-for-us', 'Write for us', 'We welcome guest posts from hikers, campers and gear experts. Read our contributor guidelines.', 24, 1100);
add('adventureblogcollective.example/contribute', 'Contribute to the collective', 'Share your trip reports and gear guides with our readers. Contributor guidelines inside.', 31, 2300);
add('campsitecritic.example/guest-posts', 'Guest posts: submit your campsite story', 'We publish reader stories about campsites and camping kit.', 17, 600);

// Directories
add('ukoutdoorshops.example/directory/yorkshire', 'Outdoor shops directory: Yorkshire', 'Find outdoor gear shops by county. Add your business listing for free.', 23, 900);
add('localbusinessfinder.example/category/sports-shops', 'Sports shops near me', 'Business listings for sports and outdoor retailers across the UK.', 38, 12000);
add('greenbizdirectory.example/listings/outdoor-equipment', 'Sustainable outdoor equipment listings', 'A directory of eco-minded outdoor brands and retailers.', 14, 300);
add('free-web-directory-4u.example/submit', 'Free web directory: submit your site', 'Add your URL to 50 categories. Instant approval.', 6, 20);

// Forums and community
add('ukhillsforum.example/t/recommend-a-shop-for-boot-fitting', 'Recommend a shop for boot fitting?', 'Thread: members share where they had boots fitted and which shops gave good advice.', 52, 16000, 'ugc');
add('campingcommunity.example/board/kit-talk/first-tent', 'Kit talk: buying my first tent', 'Forum thread with advice on tents for beginners.', 36, 4800, 'ugc');
add('reddit-like-outdoors.example/r/ukhiking/comments/gear-thread', 'Monthly gear thread', 'Community gear recommendations thread for UK hikers.', 71, 90000, 'ugc');

// News
add('northernnewsdaily.example/news/2026/09/national-park-visitor-numbers', 'National park visitor numbers hit record high', 'Report on visitor trends in UK national parks this summer.', 74, 120000);
add('outdoortradetimes.example/news/retail-report-autumn', 'Outdoor retail report: autumn 2026', 'Trade news on outdoor retail trends, sales and new brands.', 49, 7300);

// Unlinked mentions of the brand
add('trailnotes-journal.example/2026/kit-i-used-on-the-pennine-way', 'The kit I used on the Pennine Way', 'I picked up my stove and gaiters from Sample Outdoors before the trip and both were brilliant.', 48, 8200);
add('wildcampingweekly.example/news/autumn-gear-sales-roundup', 'Autumn gear sales roundup', 'Sample Outdoors has 20% off tents this month, alongside deals from other shops.', 41, 5100);
add('hikingwithdogs.example/blog/dog-friendly-walking-kit', 'Dog-friendly walking kit', 'Our dog harness came from Sample Outdoors, and their guide on boots was useful too.', 25, 1700);
add('budgetbackpacker.example/cheap-camping-kit-uk', 'Cheap camping kit in the UK', 'We found good-value sleeping mats at Sample Outdoors and a couple of other retailers.', 30, 3500);
add('ridgelinemag.example/news/new-shops-to-know', 'New outdoor shops to know', 'Independent retailers including Sample Outdoors are winning customers with expert guides.', 61, 26000);

// Pages with outdated info or broken links (correction / broken link openings)
add('oldfellsguide.example/kit/gps-devices-2019', 'Best GPS devices (2019)', 'An older guide to handheld GPS units. Several product links are now broken.', 27, 1300);
add('campingtipsarchive.example/tents/tent-care', 'Tent care tips', 'How to clean and reproof a tent. Some links on this page no longer work.', 22, 800);

// Off-topic sites
add('urbanrecipes.example/quick-weeknight-pasta', 'Quick weeknight pasta recipes', 'Ten pasta dinners in under thirty minutes.', 44, 9000);
add('fintechdaily.example/payments/open-banking-trends', 'Open banking trends', 'What the next year holds for payments and open banking.', 53, 15000);
add('celebgossiphub.example/stars-at-the-awards', 'Stars at the awards', 'Red carpet photos from last night.', 40, 30000);
add('petinsurancecompare.example/blog/cat-insurance', 'Cat insurance explained', 'How pet insurance works for cats.', 35, 6000);
add('gamingrigreviews.example/best-gaming-chairs', 'Best gaming chairs', 'Ergonomic gaming chairs ranked.', 33, 5500);
add('weddingplanner-tips.example/venue-checklist', 'Wedding venue checklist', 'Questions to ask before booking a venue.', 29, 3000);

// Low quality / thin outdoor-ish sites
add('outdoor-gear-best-deals-123.example/hiking-boots-cheap', 'cheap hiking boots best deals hiking boots buy', 'hiking boots cheap best hiking boots deals buy now.', 4, 30);
add('campingblog2011.example/hello-world', 'Hello world', 'Welcome to WordPress. This is your first post.', 2, 0);
add('tentsandmore-shop-blog.example/post-17', 'Post 17', 'Tents tents tents. Click here.', 3, 10);

// Link farms and paid placement
add('best-seo-guest-posts-network.example/write-for-us-outdoor', 'Write for us - outdoor, travel, casino, crypto', 'Sponsored post price list: $50 per post, do-follow links for sale, link insertion available.', 32, 400, 'sponsored');
add('mega-link-hub-2024.example/outdoor/hiking-tips-and-loans', 'Hiking tips and quick loans', 'Top 10 hiking tips. Need cash fast? Payday loans approved today.', 12, 150);
add('travel-news-24-7-blog.example/guest-post-sale', 'Guest posts for sale - 200 sites', 'Buy a guest post on our network of 200 blogs. Backlink packages from £30.', 28, 600, 'sponsored');
add('all-niche-articles-hub.example/category/outdoor', 'Outdoor | All Niche Articles Hub', 'Articles on outdoor, casino, essay writing and pharmacy topics. Link exchange welcome.', 15, 200);
add('seo-power-links-555.example/outdoor-backlinks', 'Outdoor backlinks package', 'Get 100 do-follow backlinks from outdoor sites. Link building service.', 9, 40);

// Casino / essay / pharma spam
add('lucky-spins-casino-bonus.example/blog/hiking-and-slots', 'Hiking and slots: win big', 'Online casino bonuses for outdoor lovers. Play slots and roulette.', 21, 1200);
add('cheap-essay-writers-uk.example/blog/outdoor-essays', 'Buy outdoor essays', 'Essay writing service: we write your essay on any topic.', 18, 800);
add('discount-pharmacy-pills.example/hiking-supplements', 'Hiking supplements and pills', 'Buy cheap pills online pharmacy, no prescription.', 11, 300);

// More editorial outdoor content, to reach a realistic list size
add('scottishhillsblog.example/munro-bagging-for-beginners', 'Munro bagging for beginners', 'How to start climbing Scotland\'s 3,000 ft peaks, with kit and safety tips.', 43, 7900);
add('trailtravels.example/europe/tour-du-mont-blanc-guide', 'Tour du Mont Blanc guide', 'Stages, huts and packing list for the TMB.', 50, 12500);
add('thecampingdad.example/family-tent-buying-guide', 'Family tent buying guide', 'Sizes, layouts and pitching tips for family tents.', 36, 4100);
add('runwild.example/blog/hydration-vests-tested', 'Hydration vests tested', 'Eight running vests tested on long trail runs.', 40, 5600);
add('peakandvalley.example/blog/gaiters-do-you-need-them', 'Gaiters: do you need them?', 'When gaiters help and which type suits your walking.', 55, 14800);
add('lowimpacthiking.example/leave-no-trace-kit', 'Leave no trace kit', 'Trowels, waste bags and reusable kit for responsible camping.', 20, 600);
add('girlsonthehill.example/blog/first-solo-hike', 'My first solo hike', 'Tips on planning, safety and kit from my first solo walk.', 23, 1000);
add('winterwalksuk.example/crampons-vs-microspikes', 'Crampons vs microspikes', 'When to use each, and how to fit them to your boots.', 38, 3700);
add('stormproofblog.example/how-to-reproof-a-jacket', 'How to reproof a waterproof jacket', 'Washing and reproofing step by step.', 30, 2200);
add('hikelog.example/peak-district-edges-walk', 'Peak District edges walk', 'A classic gritstone edge walk with views over the Derwent Valley.', 16, 500);
add('wildernessfirstaid.example/what-to-carry', 'What to carry in a hiking first aid kit', 'A first aider\'s list of essentials for day walks.', 45, 6900);
add('nightskycamping.example/dark-sky-campsites', 'Dark sky campsites in the UK', 'Where to camp for stargazing, with kit tips for cold nights.', 27, 1900);
add('canoetrails.example/wild-camping-by-canoe', 'Wild camping by canoe', 'Packing a canoe for a two-night river trip.', 24, 1400);
add('kitlab.example/waterproofs/hardshell-jackets-tested', 'Hardshell jackets tested', 'Breathability and durability results for twelve jackets.', 57, 18500);
add('trailnotes-journal.example/2026/budget-hiking-kit', 'Hiking on a budget: kit that lasts', 'Where to save and where to spend on hiking kit.', 48, 8200);
add('mountainmornings.example/review-of-a-year-of-gear', 'A year of gear: what lasted', 'Long-term notes on boots, packs and jackets after a year of use.', 19, 700);

const csv = Papa.unparse(rows, { columns: ['url', 'title', 'snippet', 'dr', 'traffic', 'link_type', 'anchor'] });
writeFileSync('samples/links-prospects.csv', csv + '\n');

// The site's own link profile, as an Ahrefs "Backlinks" export of sample-outdoors.example.
const own = [
  ['Fell Friends: spring kit list', 'https://fellfriends.example/2026/spring-kit-list', 34, 2600, 'Sample Outdoors', 'dofollow'],
  ['Hillwalker handbook: where to buy maps', 'https://hillwalkerhandbook.example/maps/where-to-buy', 44, 6700, 'maps and compasses', 'dofollow'],
  ['Packing for the Hills: sleeping mat guide', 'https://packingforthehills.example/sleeping-mats/guide', 39, 4400, 'Sample Outdoors mats', 'dofollow'],
  ['UK Hills forum: good shops', 'https://ukhillsforum.example/t/good-shops-north', 52, 16000, 'sample-outdoors.example', 'ugc'],
  ['Countryside Trust: kit advice', 'https://countrysidetrust.example/advice/kit', 66, 41000, 'kit advice', 'dofollow'],
  ['Outdoor shops directory: North Yorkshire', 'https://ukoutdoorshops.example/directory/north-yorkshire', 23, 900, 'Sample Outdoors', 'dofollow'],
  ['Hiking tips and quick loans', 'https://mega-link-hub-2024.example/outdoor/best-outdoor-shops', 12, 150, 'outdoor shop', 'dofollow'],
  ['Hiking and slots: win big', 'https://lucky-spins-casino-bonus.example/blog/outdoor-shops', 21, 1200, 'cheap outdoor gear', 'dofollow'],
  ['Outdoor backlinks package', 'https://seo-power-links-555.example/outdoor/links-page-4', 9, 40, 'hiking boots', 'dofollow'],
  ['Free web directory: outdoor', 'https://free-web-directory-4u.example/outdoor', 6, 20, 'Sample Outdoors', 'dofollow'],
  ['Bothy Bound: thanks to our kit sponsors', 'https://bothybound.example/about/thanks', 22, 900, 'Sample Outdoors', 'sponsored'],
  ['Wild Swim Log: changing robes', 'https://wildswimlog.example/changing-robes', 26, 1500, 'changing robes', 'nofollow'],
];
const ownCsv = Papa.unparse({ fields: ['Referring page title', 'Referring page URL', 'Domain rating', 'Domain traffic', 'Anchor', 'Link type'], data: own });
writeFileSync('samples/links-own-profile.csv', ownCsv + '\n');
console.log(`${rows.length} prospects, ${own.length} existing links`);
