/**
 * Builds samples/visibility-answers.csv: 60 captured AI answers for the fictional "Sample Outdoors" shop
 * (10 prompts x 3 engines x 2 run dates). Every brand, competitor and source domain is fictional
 * (.example), apart from reddit.com used as a forum type. Run: npx tsx scripts/make-visibility-samples.mts
 */
import { writeFileSync } from 'node:fs';

const BRAND = 'Sample Outdoors';
const SITE = 'https://www.sample-outdoors.example';
const C = {
  ridge: { name: 'Ridgeline Outfitters', site: 'https://ridgeline-outfitters.example' },
  fell: { name: 'Fellwalker Supply', site: 'https://fellwalker-supply.example' },
  cairn: { name: 'Cairn & Crag', site: 'https://cairnandcrag.example' },
  north: { name: 'Northpeak Gear Co', site: 'https://northpeak-gear.example' },
};
type CK = keyof typeof C;
const REVIEW = 'https://www.trailgear-reviews.example';
const FORUM = 'https://forum.fellfolk.example';
const NEWS = 'https://www.outdoor-news.example';
const DIR = 'https://www.outdoor-directory.example';
const REDDIT = 'https://www.reddit.com/r/UKhiking/comments';

const ENGINES = ['chatgpt', 'claude', 'perplexity'] as const;
const DATES = ['2026-09-29', '2026-10-06'];

interface P {
  prompt: string;
  topic: string;
  comps: CK[];
  sources: string[];
  /** Brand mentioned? [date][engine index] */
  win: [boolean[], boolean[]];
  brandCited?: boolean;
  tone?: 'positive' | 'neutral' | 'negative';
}

const PROMPTS: P[] = [
  { prompt: 'best hiking boots for beginners', topic: 'hiking boots', comps: ['ridge', 'north'], sources: [`${SITE}/guides/best-hiking-boots`, `${REVIEW}/hiking-boots`], win: [[true, false, true], [true, true, true]], brandCited: true, tone: 'positive' },
  { prompt: 'how to choose a sleeping bag for UK camping', topic: 'sleeping bags', comps: ['cairn'], sources: [`${SITE}/guides/how-to-choose-sleeping-bag`, `${NEWS}/camping/sleeping-bag-ratings`], win: [[true, true, false], [true, true, true]], brandCited: true, tone: 'neutral' },
  { prompt: 'best waterproof jackets uk', topic: 'waterproof jackets', comps: ['ridge', 'cairn', 'north'], sources: [`${REVIEW}/waterproof-jackets-tested`, `${REDDIT}/abc123/best_waterproof_for_scottish_weather`, `${C.ridge.site}/waterproofs`], win: [[false, false, false], [false, false, true]] },
  { prompt: 'via ferrata kit list for the dolomites', topic: 'via ferrata kit', comps: ['ridge', 'fell'], sources: [`${FORUM}/threads/via-ferrata-kit`, `${C.fell.site}/via-ferrata`, `${REVIEW}/via-ferrata-sets`], win: [[false, false, false], [false, false, false]] },
  { prompt: 'where to buy walking poles in the UK', topic: 'walking poles', comps: ['fell', 'ridge'], sources: [`${DIR}/shops/walking-poles`, `${C.fell.site}/walking-poles`, `${C.ridge.site}/poles`], win: [[false, false, false], [true, false, true]], tone: 'neutral' },
  { prompt: 'best down jacket for winter hillwalking', topic: 'down jackets', comps: ['north', 'cairn'], sources: [`${REVIEW}/down-jackets`, `${SITE}/guides/best-down-jacket`], win: [[true, false, false], [true, true, false]], brandCited: true, tone: 'negative' },
  { prompt: 'Sample Outdoors vs Ridgeline Outfitters', topic: 'the two shops', comps: ['ridge'], sources: [`${REVIEW}/retailers/compared`, `${REDDIT}/def456/sample_outdoors_or_ridgeline`], win: [[true, true, true], [true, true, true]], tone: 'neutral' },
  { prompt: 'best wild camping gear for scotland', topic: 'wild camping gear', comps: ['ridge', 'fell', 'north'], sources: [`${REDDIT}/ghi789/wild_camping_kit_scotland`, `${FORUM}/threads/wild-camping-scotland`, `${REVIEW}/wild-camping`], win: [[false, false, false], [false, true, false]], tone: 'positive' },
  { prompt: 'bothy etiquette and what to bring', topic: 'bothy trips', comps: ['cairn'], sources: [`${NEWS}/features/bothy-guide`, `${FORUM}/threads/bothy-first-time`], win: [[false, false, false], [false, false, false]] },
  { prompt: 'best head torch for trail running', topic: 'head torches', comps: ['north', 'ridge'], sources: [`${SITE}/guides/best-head-torch`, `${REVIEW}/head-torches`], win: [[false, true, true], [true, true, true]], brandCited: true, tone: 'positive' },
];

const BLURB: Record<string, string[]> = {
  positive: [`${BRAND} is a reliable choice: its guides are genuinely helpful and the range is well-made for the price.`, `${BRAND} stands out for good value and a clear, tested buying guide.`],
  neutral: [`${BRAND} stocks a range of options across price points.`, `${BRAND} also carries several models and publishes a buying guide.`],
  negative: [`${BRAND} has a decent range, but some buyers report slow delivery and mixed reviews on returns.`, `${BRAND} is an option, though a few reviewers complain that sizing runs small.`],
};
const COMP_BLURB = [
  'is popular with experienced walkers and appears in most review round-ups.',
  'gets strong reviews for durability and is often recommended on forums.',
  'has a wide range and frequent discounts.',
  'is well regarded for specialist kit and expert advice in store.',
];

const h = (s: string) => { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };

const rows: string[][] = [['prompt', 'engine', 'answer text', 'cited urls', 'run date', 'run']];
for (const p of PROMPTS) {
  DATES.forEach((date, di) => {
    ENGINES.forEach((engine, ei) => {
      const seed = h(`${p.prompt}|${date}|${engine}`);
      const mentioned = p.win[di][ei];
      const comps = p.comps.filter((_c, i) => i === 0 || (seed >> i) % 3 !== 0).map((k) => C[k].name);
      const brandFirst = mentioned && (seed % 2 === 0 || p.prompt.startsWith(BRAND));
      const items: string[] = comps.map((c, i) => `**${c}** ${COMP_BLURB[(seed + i) % COMP_BLURB.length]}`);
      if (mentioned) {
        const b = BLURB[p.tone ?? 'neutral'][seed % 2].replace(`${BRAND} `, `**${BRAND}** `);
        if (brandFirst) items.unshift(b); else items.push(b);
      }
      const intro = engine === 'claude'
        ? `Good question. For ${p.topic}, a few retailers and brands come up again and again.`
        : engine === 'perplexity'
          ? `Based on current reviews and community discussion, here are the options most often recommended for ${p.topic}.`
          : `Here are some solid options to consider for ${p.topic}:`;
      const list = items.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const outro = 'Check fit and warmth ratings against your plans, and buy from a shop with easy returns.';
      const srcs = p.sources.filter((s) => (p.brandCited && mentioned) || !s.startsWith(SITE));
      const inText = engine === 'chatgpt' ? `\n\nSources: ${srcs.slice(0, 2).join(' ')}` : '';
      const cited = engine === 'chatgpt' ? '' : srcs.join(' ');
      rows.push([p.prompt, engine, `${intro}\n\n${list}\n\n${outro}${inText}`, cited, date, '1']);
    });
  });
}

const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
writeFileSync('samples/visibility-answers.csv', `${csv}\n`);
console.log(`wrote ${rows.length - 1} answers`);
