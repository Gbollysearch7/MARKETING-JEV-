import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractFromHtml, extractFromMarkdown } from '../src/crawl/extract.js';
import { anchorCandidates, hasPlaceholder } from '../src/util/text.js';
import { topCandidates } from '../src/modules/candidates.js';

describe('extractFromHtml', () => {
  it('pulls title, h1, meta, headings and paragraphs and drops nav and footer', async () => {
    const html = await readFile(new URL('./fixtures/what-is-a-prop-firm.html', import.meta.url), 'utf8');
    const d = extractFromHtml('https://x/what-is-a-prop-firm', html);
    expect(d.title).toMatch(/What Is a Prop Firm/);
    expect(d.h1).toMatch(/What Is a Prop Firm/);
    expect(d.metaDescription).toMatch(/funded accounts/);
    expect(d.headings).toContain('Profit splits');
    expect(d.paragraphs.length).toBeGreaterThanOrEqual(5);
    expect(d.text).not.toMatch(/Footer text/);
    expect(d.text).not.toMatch(/Home Blog Pricing/);
    expect(d.wordCount).toBeGreaterThan(100);
  });
});

describe('extractFromMarkdown', () => {
  it('reads front matter and headings', () => {
    const d = extractFromMarkdown('file://a.md', '---\ntitle: "Hello World"\ndescription: desc\n---\n# Hello\n\nThis is a paragraph long enough to count as body text for the extractor.\n\n## Section\n\nAnother paragraph that is also long enough to be kept by the extractor here.');
    expect(d.title).toBe('Hello World');
    expect(d.metaDescription).toBe('desc');
    expect(d.headings).toEqual(['Section']);
    expect(d.paragraphs.length).toBe(2);
  });
});

describe('text helpers', () => {
  it('finds anchor candidates that mention target title tokens', () => {
    const c = anchorCandidates(['Understanding the evaluation is the first step for any new trader.'], 'Prop Firm Evaluation Rules');
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].toLowerCase()).toMatch(/evaluation/);
  });
  it('detects placeholders', () => {
    expect(hasPlaceholder('Hello {{city}}')).toBe(true);
    expect(hasPlaceholder('[INSERT STAT]')).toBe(true);
    expect(hasPlaceholder('Plain copy')).toBe(false);
  });
});

describe('topCandidates', () => {
  it('ranks the most similar page first', () => {
    const docs = [
      { id: 'a', text: 'prop firm evaluation drawdown profit split funded account' },
      { id: 'b', text: 'prop firm challenge tips drawdown daily loss funded' },
      { id: 'c', text: 'chocolate cake recipe butter sugar flour oven' },
    ];
    const c = topCandidates(docs, 2);
    expect(c.get('a')![0].id).toBe('b');
    expect(c.get('c')![0].score).toBeLessThan(c.get('a')![0].score);
  });
});
