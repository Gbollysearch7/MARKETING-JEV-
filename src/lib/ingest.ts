import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importBacklinks } from '@/engine/ingest/backlinks';
import { importCrawlCsv } from '@/engine/ingest/crawl-csv';
import { importGa4 } from '@/engine/ingest/ga4';
import { importGsc } from '@/engine/ingest/gsc';
import { saveUpload, type Upload } from './repo';
import { measureOutcomes } from './tasks';

export type Slot = 'gsc' | 'ga4' | 'crawl' | 'backlinks';

/** Parse one uploaded file for a slot and store it. Search Console files are sorted into pages or page-and-query data. */
export function ingestFile(siteId: string, slot: Slot, filename: string, bytes: Uint8Array, source = 'file'): Upload {
  switch (slot) {
    case 'gsc': {
      const g = importGsc(filename, bytes);
      if (!g.pages.length) throw new Error('No pages found in this file.');
      const kind = g.pageQueries.length ? 'gsc_queries' : 'gsc_pages';
      const u = saveUpload(siteId, kind, source, filename, g, g.period, g.pageQueries.length || g.pages.length, g.notes);
      measureOutcomes(siteId);
      return u;
    }
    case 'ga4': {
      const g = importGa4(bytes);
      if (!g.pages.length) throw new Error('No landing pages found in this file.');
      return saveUpload(siteId, 'ga4', source, filename, g, g.period, g.pages.length, g.notes);
    }
    case 'crawl': {
      const c = importCrawlCsv(bytes);
      if (!c.pages.length) throw new Error('No HTML pages found in this file.');
      return saveUpload(siteId, 'crawl', source, filename, { pages: c.pages }, null, c.pages.length, c.notes);
    }
    case 'backlinks': {
      const b = importBacklinks(bytes);
      if (!b.pages.length) throw new Error('No URLs found in this file.');
      return saveUpload(siteId, 'backlinks', source, filename, { pages: b.pages }, null, b.pages.length, b.notes);
    }
  }
}

export const SAMPLE_FILES: [Slot, string][] = [
  ['gsc', 'search-console-performance.zip'],
  ['gsc', 'search-console-page-queries.csv'],
  ['ga4', 'ga4-landing-pages.csv'],
  ['crawl', 'screaming-frog-internal-html.csv'],
  ['backlinks', 'ahrefs-best-by-links.csv'],
];

export function loadSamples(siteId: string) {
  for (const [slot, file] of SAMPLE_FILES) {
    ingestFile(siteId, slot, file, new Uint8Array(readFileSync(path.join(process.cwd(), 'samples', file))), 'sample');
  }
}
