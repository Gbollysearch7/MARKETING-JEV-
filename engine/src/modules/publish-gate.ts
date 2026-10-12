import { PUBLISH_GATE_VERSION, publishGateQuestions } from '../criteria/publish-gate.v1.js';
import type { PageDoc } from '../crawl/extract.js';
import type { DecisionClient } from '../jev/client.js';
import type { State } from '../jev/types.js';
import { explode, type DecisionSink } from '../log/decision-log.js';
import { decidePublishGate, type GateDecision, type GateThresholds } from '../rules/publish-gate.js';
import { sha256 } from '../util/hash.js';
import { mapPool } from '../util/pool.js';
import { hasPlaceholder, truncate } from '../util/text.js';
import { topCandidates, type Candidate } from './candidates.js';

export interface PublishGateOptions {
  siblingsK?: number;
  bannedTerms?: string[];
  concurrency?: number;
  workspaceId?: string;
  sink?: DecisionSink;
  thresholds?: GateThresholds;
}

export interface GateRow extends GateDecision {
  url: string;
  title: string;
  wordCount: number;
  inputTokens: number;
}

function shingles(text: string, n = 5): Set<string> {
  const w = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

function shingleOverlap(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const s of sa) if (sb.has(s)) shared++;
  return shared / Math.min(sa.size, sb.size);
}

export async function runPublishGate(pages: PageDoc[], client: DecisionClient, opts: PublishGateOptions = {}): Promise<GateRow[]> {
  const k = Math.min(opts.siblingsK ?? 5, Math.max(0, pages.length - 1));
  const byUrl = new Map(pages.map((pg) => [pg.url, pg]));
  const candidates: Map<string, Candidate[]> = k > 0 ? topCandidates(pages.map((pg) => ({ id: pg.url, text: `${pg.title} ${pg.intro}` })), k) : new Map();
  const banned = (opts.bannedTerms ?? []).map((b) => b.toLowerCase());

  return mapPool(pages, opts.concurrency ?? 8, async (page): Promise<GateRow> => {
    const sibs = (candidates.get(page.url) ?? []).map((c, i) => ({ key: `s${i}`, doc: byUrl.get(c.id)! }));
    const state: State = {
      page: {
        title: page.title || page.h1,
        h1: page.h1,
        meta_description: page.metaDescription,
        headings: page.headings.slice(0, 20),
        intro: truncate(page.intro, 800),
        body_excerpt: truncate(page.text, 2500),
      },
      siblings: sibs.map((s) => ({ key: s.key, title: s.doc.title || s.doc.h1, intro: truncate(s.doc.intro, 300) })),
    };
    const res = await client.decide({ state, questions: publishGateQuestions(sibs.map((s) => s.key)) });
    if (opts.sink) {
      await opts.sink.write(explode(res, {
        workspaceId: opts.workspaceId ?? 'local',
        entityType: 'page',
        entityId: page.url,
        criteriaVersion: PUBLISH_GATE_VERSION,
        stateHash: sha256(JSON.stringify(state)),
      }));
    }
    const lower = page.text.toLowerCase();
    const decision = decidePublishGate(res.answers, {
      wordCount: page.wordCount,
      placeholderFound: hasPlaceholder(page.text) || hasPlaceholder(page.title),
      bannedTermsFound: banned.filter((b) => lower.includes(b)),
      duplicateRatio: sibs.length ? Math.max(...sibs.map((s) => shingleOverlap(page.text, s.doc.text))) : undefined,
    }, opts.thresholds);
    return { url: page.url, title: page.title || page.h1, wordCount: page.wordCount, inputTokens: res.usage.input_tokens, ...decision };
  });
}
