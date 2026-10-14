import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockProvider } from '../src/engine/jev/client';
import type { Answers } from '../src/engine/jev/types';
import { buildQuestions } from '../src/modules/links/battery';
import { disavowFile } from '../src/modules/links/disavow';
import { authorityBand, featuresOf, siteTopics, trafficBand } from '../src/modules/links/features';
import { mockLinksAnswer } from '../src/modules/links/mock';
import { linkAttrOf, MAX_PER_UPLOAD, parseProspects, urlKeyOf } from '../src/modules/links/parse';
import { assess, likelihoodOf, priorityOf } from '../src/modules/links/rules';
import { scoreProspect } from '../src/modules/links/score';
import type { Features } from '../src/modules/links/types';
import { findLinksTo } from '../src/modules/links/verify';

const sample = (n: string) => new Uint8Array(readFileSync(`samples/${n}`));
const site = { name: 'Sample Outdoors', domain: 'sample-outdoors.example', topics: siteTopics(['How to choose hiking boots', 'Best tents for wild camping', 'Waterproof jackets guide', 'Sleeping bags for camping', 'Trail running shoes', 'Hiking kit list'], 'Sample Outdoors') };
const f0: Features = { authority: 'medium', traffic: 'medium', linkAttr: 'dofollow', spamTerms: [], footprints: [], mentionsBrand: false, alreadyLinking: false };

describe('links: parsing', () => {
  it('reads the generic sample list, one row per page', () => {
    const r = parseProspects(sample('links-prospects.csv'));
    expect(r.kind).toBe('generic');
    expect(r.rows.length).toBeGreaterThanOrEqual(75);
    const row = r.rows.find((x) => x.domain === 'kitlab.example')!;
    expect(row.dr).toBe(57);
    expect(row.urlKey.startsWith('kitlab.example/')).toBe(true);
  });

  it('reads an Ahrefs backlinks export, collapsing the own profile to domains', () => {
    const r = parseProspects(sample('links-own-profile.csv'), 'own_profile');
    expect(r.kind).toBe('ahrefs');
    expect(r.rows.map((x) => x.urlKey)).toContain('lucky-spins-casino-bonus.example');
    expect(r.rows.find((x) => x.domain === 'ukhillsforum.example')!.linkAttr).toBe('ugc');
  });

  it('reads a Semrush export with TRUE/FALSE flags and dedupes repeated pages', () => {
    const csv = 'Page ascore,Source title,Source url,Target url,Anchor,Nofollow,Sponsored,Ugc\n'
      + '40,Best tents,https://www.blog.example/best-tents/,https://rival.example,tents,FALSE,FALSE,FALSE\n'
      + '40,Best tents,https://blog.example/best-tents?utm=x,https://rival.example/a,tent,TRUE,FALSE,FALSE\n'
      + '12,Deals,https://deals.example/p,https://rival.example,deal,FALSE,TRUE,FALSE\n';
    const r = parseProspects(csv);
    expect(r.kind).toBe('semrush');
    expect(r.rows).toHaveLength(2);
    expect(r.duplicatesInFile).toBe(1);
    expect(r.rows[0].linkAttr).toBe('dofollow');
    expect(r.rows[1].linkAttr).toBe('sponsored');
  });

  it('caps an upload and normalises URL keys and link types', () => {
    const lines = ['url'];
    for (let i = 0; i < MAX_PER_UPLOAD + 5; i++) lines.push(`https://s${i}.example/p`);
    const r = parseProspects(lines.join('\n'));
    expect(r.rows).toHaveLength(MAX_PER_UPLOAD);
    expect(r.overCap).toBe(5);
    expect(urlKeyOf('HTTPS://WWW.Blog.Example/Path/')?.urlKey).toBe('blog.example/path');
    expect(urlKeyOf('not a url')).toBeNull();
    expect(linkAttrOf('Nofollow')).toBe('nofollow');
    expect(linkAttrOf('UGC, nofollow')).toBe('ugc');
    expect(linkAttrOf('')).toBe('unknown');
  });

  it('rejects a file with no URL column', () => {
    expect(() => parseProspects('name,score\nfoo,1')).toThrow(/header row|URL/);
  });
});

describe('links: features and rules', () => {
  it('bands authority and traffic, missing is unknown', () => {
    expect([authorityBand(null), authorityBand(5), authorityBand(20), authorityBand(45), authorityBand(80)]).toEqual(['unknown', 'none', 'low', 'medium', 'high']);
    expect([trafficBand(null), trafficBand(0), trafficBand(500), trafficBand(5000), trafficBand(50000)]).toEqual(['unknown', 'none', 'low', 'medium', 'high']);
  });

  it('finds spam terms and paid footprints without deciding', () => {
    const f = featuresOf({ url: 'https://best-seo-guest-posts-network.example/write-for-us', urlKey: 'x', domain: 'best-seo-guest-posts-network.example', title: 'Write for us - casino', snippet: '$50 per post', anchor: '', dr: 30, traffic: 100, linkAttr: 'sponsored' }, site, false);
    expect(f.spamTerms).toContain('gambling');
    expect(f.footprints).toEqual(expect.arrayContaining(['many_hyphens_in_domain', 'write_for_us_page', 'paid_placement_terms', 'paid_write_for_us']));
    const m = featuresOf({ url: 'https://b.example/x', urlKey: 'x', domain: 'b.example', title: 'Kit', snippet: 'Bought from Sample Outdoors', anchor: '', dr: null, traffic: null, linkAttr: 'unknown' }, site, true);
    expect(m.mentionsBrand).toBe(true);
    expect(m.alreadyLinking).toBe(true);
    expect(m.authority).toBe('unknown');
  });

  const ans = (o: Partial<Record<string, number | string>>): Answers => ({
    relevant: { type: 'noul', noul: Number(o.relevant ?? 0.9) },
    site_type: { type: 'choice', choice: String(o.site_type ?? 'editorial'), probabilities: { [String(o.site_type ?? 'editorial')]: Number(o.st_p ?? 0.8) }, confidence: Number(o.st_c ?? 0.8) },
    quality: { type: 'score', score: Number(o.quality ?? 1.6), legend: {}, probabilities: { 0: 0.1, 1: 0.3, 2: 0.6 }, confidence: 0.6 },
    sells_links: { type: 'noul', noul: Number(o.sells ?? 0.05) },
    pbn_footprint: { type: 'noul', noul: Number(o.pbn ?? 0.05) },
    spam_content: { type: 'noul', noul: Number(o.spam ?? 0.05) },
    prospect_type: { type: 'choice', choice: 'resource_page', probabilities: { resource_page: 0.7 }, confidence: 0.6 },
    angle: { type: 'choice', choice: 'resource_suggestion', probabilities: { resource_suggestion: 0.7 }, confidence: 0.6 },
  });

  it('toxic beats everything at 0.7, link farm needs confidence', () => {
    expect(assess(ans({ sells: 0.7 }), f0).verdict).toBe('toxic');
    expect(assess(ans({ sells: 0.69 }), f0).verdict).toBe('pursue');
    expect(assess(ans({ site_type: 'link_farm', st_c: 0.7 }), f0).verdict).toBe('toxic');
    expect(assess(ans({ site_type: 'link_farm', st_c: 0.4 }), f0).verdict).toBe('pursue');
    expect(assess(ans({ spam: 0.9 }), { ...f0, alreadyLinking: true }).verdict).toBe('toxic');
  });

  it('skips irrelevant, low quality and already-linking prospects', () => {
    expect(assess(ans({ relevant: 0.3 }), f0).rules).toContain('not_relevant');
    expect(assess(ans({ quality: 0.4 }), f0).rules).toContain('low_quality');
    expect(assess(ans({}), { ...f0, alreadyLinking: true }).verdict).toBe('skip');
  });

  it('likelihood blends the ledger with a starting rate; priority multiplies the weights', () => {
    expect(likelihoodOf('resource_page', {}).level).toBe('medium');
    expect(likelihoodOf('news', {}).level).toBe('low');
    const lots = likelihoodOf('news', { news: { contacted: 20, replied: 12, won: 10, lost: 2 } });
    expect(lots.level).toBe('high');
    expect(lots.closed).toBe(12);
    expect(priorityOf('pursue', 1, 'high', 'high')).toBe(100);
    expect(priorityOf('pursue', 0.8, 'medium', 'medium')).toBe(48);
    expect(priorityOf('pursue', 0.01, 'none', 'low')).toBe(1);
    expect(priorityOf('toxic', 1, 'high', 'high')).toBeNull();
  });
});

describe('links: battery and mock end to end', () => {
  it('asks the full battery with closed options', () => {
    const q = buildQuestions();
    expect(Object.keys(q)).toEqual(['relevant', 'site_type', 'quality', 'sells_links', 'pbn_footprint', 'spam_content', 'prospect_type', 'angle']);
    expect(q.site_type.type === 'choice' && Object.keys(q.site_type.criteria)).toContain('link_farm');
    expect(q.angle.type === 'choice' && Object.keys(q.angle.criteria)).toContain('ask_for_link');
  });

  it('scores the sample: spam is toxic, off-topic is skipped, mentions get an ask-for-link angle', async () => {
    const provider = new MockProvider(mockLinksAnswer);
    const { rows } = parseProspects(sample('links-prospects.csv'));
    const out = new Map<string, Awaited<ReturnType<typeof scoreProspect>>>();
    for (const r of rows) out.set(r.domain + r.urlKey, await scoreProspect((i) => provider.decide(i), r, site, { alreadyLinking: false, foundVia: 'a prospect list', stats: {} }));
    const by = (frag: string) => [...out.entries()].find(([k]) => k.includes(frag))![1];
    expect(by('lucky-spins-casino').assessment.verdict).toBe('toxic');
    expect(by('cheap-essay-writers').assessment.verdict).toBe('toxic');
    expect(by('best-seo-guest-posts-network').assessment.verdict).toBe('toxic');
    expect(by('urbanrecipes').assessment.verdict).toBe('skip');
    const mention = by('hikingwithdogs');
    expect(mention.assessment.verdict).toBe('pursue');
    expect(mention.assessment.angle).toBe('ask_for_link');
    expect(mention.priority).toBeGreaterThan(0);
    expect(mention.reasons.join(' ')).toMatch(/Reply chance/);
    const verdicts = [...out.values()].map((s) => s.assessment.verdict);
    expect(verdicts.filter((v) => v === 'pursue').length).toBeGreaterThan(20);
    expect(verdicts.filter((v) => v === 'toxic').length).toBeGreaterThanOrEqual(5);
  });
});

describe('links: verify and disavow', () => {
  it('finds links to the site domain, including subdomains and relative resolution', () => {
    const html = '<p><a href="https://www.sample-outdoors.example/boots" rel="nofollow">Sample <b>Outdoors</b></a> <a href="/local">x</a> <a href=\'https://shop.sample-outdoors.example/\'>shop</a></p>';
    const r = findLinksTo(html, 'sample-outdoors.example', 'https://blog.example/post');
    expect(r.found).toBe(true);
    expect(r.links).toHaveLength(2);
    expect(r.links[0].rel).toBe('nofollow');
    expect(r.links[0].anchor).toBe('Sample Outdoors');
    expect(findLinksTo('<a href="https://notsample-outdoors.example">x</a>', 'sample-outdoors.example', 'https://b.example').found).toBe(false);
  });

  it('writes a disavow file with a review header and domain lines', () => {
    const t = disavowFile(['www.Spam.example', 'spam.example', 'b.example'], { name: 'Sample Outdoors', domain: 'sample-outdoors.example' }, '2026-10-13');
    expect(t).toMatch(/^# Disavow file/);
    expect(t).toMatch(/REVIEW BEFORE UPLOADING TO GOOGLE/);
    expect(t.split('\n').filter((l) => l.startsWith('domain:'))).toEqual(['domain:b.example', 'domain:spam.example']);
  });
});
