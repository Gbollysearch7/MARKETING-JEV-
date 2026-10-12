import { PAGE_VERDICT_VERSION, pageVerdictQuestions } from '../criteria/page-verdict.v1.js';
import type { PageDoc } from '../crawl/extract.js';
import type { DecisionClient } from '../jev/client.js';
import type { State } from '../jev/types.js';
import { explode, type DecisionSink } from '../log/decision-log.js';
import { clickTrend, ctrBand, impressionsBand, positionBand } from '../rules/buckets.js';
import { decideVerdict, type VerdictResult, type VerdictThresholds } from '../rules/verdict.js';
import { sha256 } from '../util/hash.js';
import { mapPool } from '../util/pool.js';
import { truncate } from '../util/text.js';
import { topCandidates, type Candidate } from './candidates.js';

/** Raw numbers from Search Console and your backlink source. Bucketed in code before Jev sees anything. */
export interface PageMetricsRaw {
  monthlyClicks: number[];
  impressions12m: number;
  ctr: number | null;
  position: number | null;
  referringDomains: number;
  topQueries: string[];
}

export interface VerdictRow extends VerdictResult {
  url: string;
  title: string;
  inputTokens: number;
}

export interface PageVerdictOptions {
  siblingsK?: number;
  concurrency?: number;
  workspaceId?: string;
  sink?: DecisionSink;
  thresholds?: VerdictThresholds;
}

export async function runPageVerdicts(
  pages: PageDoc[],
  metrics: Map<string, PageMetricsRaw>,
  client: DecisionClient,
  opts: PageVerdictOptions = {},
): Promise<VerdictRow[]> {
  const k = Math.min(opts.siblingsK ?? 5, Math.max(0, pages.length - 1));
  const byUrl = new Map(pages.map((pg) => [pg.url, pg]));
  const candidates: Map<string, Candidate[]> = k > 0 ? topCandidates(pages.map((pg) => ({ id: pg.url, text: `${pg.title} ${pg.headings.join(' ')} ${pg.intro}` })), k) : new Map();

  return mapPool(pages, opts.concurrency ?? 8, async (page): Promise<VerdictRow> => {
    const raw = metrics.get(page.url) ?? { monthlyClicks: [], impressions12m: 0, ctr: null, position: null, referringDomains: 0, topQueries: [] };
    const clicks12m = raw.monthlyClicks.reduce((a, b) => a + b, 0);
    const sibs = (candidates.get(page.url) ?? []).map((c, i) => ({ key: `s${i}`, doc: byUrl.get(c.id)! }));
    const state: State = {
      page: {
        url: page.url,
        title: page.title || page.h1,
        h1: page.h1,
        meta_description: page.metaDescription,
        headings: page.headings.slice(0, 20),
        intro: truncate(page.intro, 1200),
      },
      search: {
        top_queries: raw.topQueries.slice(0, 10),
        ctr_band: ctrBand(raw.ctr, raw.position),
        position_band: positionBand(raw.position),
        click_trend_12m: clickTrend(raw.monthlyClicks),
        impressions_band: impressionsBand(raw.impressions12m),
      },
      sibling_pages: sibs.map((s) => ({ key: s.key, url: s.doc.url, title: s.doc.title || s.doc.h1 })),
    };
    const res = await client.decide({ state, questions: pageVerdictQuestions(sibs.map((s) => ({ key: s.key, title: s.doc.title || s.doc.h1 }))) });
    if (opts.sink) {
      await opts.sink.write(explode(res, {
        workspaceId: opts.workspaceId ?? 'local',
        entityType: 'page',
        entityId: page.url,
        criteriaVersion: PAGE_VERDICT_VERSION,
        stateHash: sha256(JSON.stringify(state)),
      }));
    }
    const verdict = decideVerdict(
      res.answers,
      { clicks12m, impressions12m: raw.impressions12m, clickTrend12m: clickTrend(raw.monthlyClicks), referringDomains: raw.referringDomains },
      sibs.map((s) => {
        const sm = metrics.get(s.doc.url);
        return { key: s.key, url: s.doc.url, clicks12m: sm ? sm.monthlyClicks.reduce((a, b) => a + b, 0) : 0 };
      }),
      opts.thresholds,
    );
    return { url: page.url, title: page.title || page.h1, inputTokens: res.usage.input_tokens, ...verdict };
  });
}
