import * as cheerio from 'cheerio';
import { truncate, wordCount } from '../util/text.js';

export interface PageDoc {
  url: string;
  title: string;
  h1: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
  /** First ~1,200 characters of body text. */
  intro: string;
  text: string;
  wordCount: number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function extractFromHtml(url: string, html: string): PageDoc {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header, aside, form, iframe, svg').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');

  const title = clean($('title').first().text()) || clean($('meta[property="og:title"]').attr('content') ?? '');
  const h1 = clean(root.find('h1').first().text()) || clean($('h1').first().text());
  const metaDescription = clean($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '');
  const headings = root
    .find('h2, h3')
    .map((_i, el) => clean($(el).text()))
    .get()
    .filter((h) => h.length > 2 && h.length < 160);
  const paragraphs = root
    .find('p, li')
    .map((_i, el) => clean($(el).text()))
    .get()
    .filter((t) => t.length >= 40);
  const text = paragraphs.join('\n');
  return {
    url, title, h1, metaDescription, headings, paragraphs,
    intro: truncate(text, 1200),
    text,
    wordCount: wordCount(text),
  };
}

export function extractFromMarkdown(url: string, md: string): PageDoc {
  let body = md.replace(/^---[\s\S]*?---\s*/, '');
  const fm = md.match(/^---([\s\S]*?)---/);
  const fmTitle = fm?.[1].match(/^\s*title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  const fmDesc = fm?.[1].match(/^\s*description:\s*["']?(.+?)["']?\s*$/m)?.[1];
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const headings = [...body.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim());
  body = body.replace(/^#{1,6}\s+.+$/gm, '');
  body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`>]/g, '');
  const paragraphs = body.split(/\n\s*\n/).map(clean).filter((t) => t.length >= 40);
  const text = paragraphs.join('\n');
  return {
    url,
    title: fmTitle ?? h1,
    h1,
    metaDescription: fmDesc ?? '',
    headings,
    paragraphs,
    intro: truncate(text, 1200),
    text,
    wordCount: wordCount(text),
  };
}
