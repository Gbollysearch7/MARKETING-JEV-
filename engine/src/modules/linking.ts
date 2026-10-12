import { PAIR_LINK_VERSION, pairLinkQuestions } from '../criteria/pair-link.v1.js';
import type { PageDoc } from '../crawl/extract.js';
import { isChoice, p } from '../jev/confidence.js';
import type { DecisionClient } from '../jev/client.js';
import type { State } from '../jev/types.js';
import { explode, type DecisionSink } from '../log/decision-log.js';
import { sha256 } from '../util/hash.js';
import { mapPool } from '../util/pool.js';
import { anchorCandidates, truncate } from '../util/text.js';
import { topCandidates } from './candidates.js';

export interface LinkingThresholds {
  readerBenefit: number;
  sameIntentForLink: number;
  cannibal: number;
  placementConfidence: number;
}

export interface LinkingOptions {
  topK?: number;
  concurrency?: number;
  workspaceId?: string;
  sink?: DecisionSink;
  thresholds?: Partial<LinkingThresholds>;
  maxParagraphs?: number;
  onProgress?: (done: number, total: number) => void;
}

export const DEFAULT_LINKING_THRESHOLDS: LinkingThresholds = {
  readerBenefit: 0.7,
  sameIntentForLink: 0.5,
  cannibal: 0.8,
  placementConfidence: 0.5,
};

export interface LinkSuggestion {
  sourceUrl: string;
  targetUrl: string;
  priority: number;
  readerBenefit: number;
  sameIntent: number;
  prerequisite: number;
  paragraphKey: string | null;
  paragraphText: string | null;
  anchor: string;
  anchorConfidence: number | null;
  needsReview: boolean;
}

export interface CannibalPair {
  pageA: string;
  pageB: string;
  sameIntent: number;
  survivor: string | null;
  needsReview: boolean;
  reasons: string[];
}

export interface LinkingResult {
  model: string;
  pairsEvaluated: number;
  inputTokens: number;
  links: LinkSuggestion[];
  cannibalisation: CannibalPair[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function buildPairState(a: PageDoc, b: PageDoc, maxParagraphs = 12): { state: State; paragraphs: Record<string, string>; anchors: string[] } {
  const paragraphs: Record<string, string> = {};
  a.paragraphs.slice(0, maxParagraphs).forEach((t, i) => (paragraphs[`p${i}`] = truncate(t, 280)));
  const anchors = anchorCandidates(a.paragraphs.slice(0, maxParagraphs), b.title || b.h1);
  const state: State = {
    page_a: { url: a.url, title: a.title || a.h1, intro: truncate(a.intro, 600), paragraphs },
    page_b: { url: b.url, title: b.title || b.h1, meta_description: b.metaDescription, intro: truncate(b.intro, 400) },
  };
  return { state, paragraphs, anchors };
}

interface PairOutcome {
  a: PageDoc;
  b: PageDoc;
  readerBenefit: number;
  sameIntent: number;
  prerequisite: number;
  survivorChoice: string | null;
  survivorConfidence: number;
  paragraphKey: string | null;
  paragraphText: string | null;
  anchor: string;
  anchorConfidence: number | null;
  placementConfident: boolean;
}

export async function runLinking(pages: PageDoc[], client: DecisionClient, opts: LinkingOptions = {}): Promise<LinkingResult> {
  const t = { ...DEFAULT_LINKING_THRESHOLDS, ...opts.thresholds };
  const topK = opts.topK ?? 30;
  const byUrl = new Map(pages.map((pg) => [pg.url, pg]));
  const candidates = topCandidates(
    pages.map((pg) => ({ id: pg.url, text: `${pg.title} ${pg.h1} ${pg.headings.join(' ')} ${pg.intro}` })),
    topK,
  );

  const pairs: [PageDoc, PageDoc][] = [];
  for (const a of pages) for (const c of candidates.get(a.url) ?? []) pairs.push([a, byUrl.get(c.id)!]);

  let inputTokens = 0;
  let done = 0;
  const outcomes = await mapPool(pairs, opts.concurrency ?? 8, async ([a, b]): Promise<PairOutcome> => {
    const { state, paragraphs, anchors } = buildPairState(a, b, opts.maxParagraphs);
    const questions = pairLinkQuestions(paragraphs, anchors);
    const res = await client.decide({ state, questions });
    inputTokens += res.usage.input_tokens;
    if (opts.sink) {
      await opts.sink.write(explode(res, {
        workspaceId: opts.workspaceId ?? 'local',
        entityType: 'pair',
        entityId: `${a.url} -> ${b.url}`,
        criteriaVersion: PAIR_LINK_VERSION,
        stateHash: sha256(JSON.stringify(state)),
      }));
    }
    const ans = res.answers;
    const para = ans.best_paragraph;
    const anchorAns = ans.best_anchor;
    const survivor = ans.survivor;
    const paragraphKey = isChoice(para) && para.choice !== 'none' && para.confidence >= t.placementConfidence ? para.choice : null;
    let anchor = b.title || b.h1;
    let anchorConfidence: number | null = null;
    if (isChoice(anchorAns) && anchorAns.choice !== 'none' && anchorAns.confidence >= t.placementConfidence) {
      const idx = Number(anchorAns.choice.replace('anchor_', ''));
      if (anchors[idx]) anchor = anchors[idx];
      anchorConfidence = r3(anchorAns.confidence);
    }
    done++;
    opts.onProgress?.(done, pairs.length);
    return {
      a, b,
      readerBenefit: p(ans, 'reader_benefit'),
      sameIntent: p(ans, 'same_primary_intent'),
      prerequisite: p(ans, 'b_is_prerequisite'),
      survivorChoice: isChoice(survivor) ? survivor.choice : null,
      survivorConfidence: isChoice(survivor) ? survivor.confidence : 0,
      paragraphKey,
      paragraphText: paragraphKey ? paragraphs[paragraphKey] : null,
      anchor,
      anchorConfidence,
      placementConfident: paragraphKey !== null,
    };
  });

  const links: LinkSuggestion[] = [];
  const cannibalByKey = new Map<string, { o: PairOutcome[]; }>();
  for (const o of outcomes) {
    if (o.readerBenefit > t.readerBenefit && o.sameIntent < t.sameIntentForLink) {
      links.push({
        sourceUrl: o.a.url,
        targetUrl: o.b.url,
        priority: r3(o.readerBenefit + 0.3 * o.prerequisite),
        readerBenefit: r3(o.readerBenefit),
        sameIntent: r3(o.sameIntent),
        prerequisite: r3(o.prerequisite),
        paragraphKey: o.paragraphKey,
        paragraphText: o.paragraphText,
        anchor: o.anchor,
        anchorConfidence: o.anchorConfidence,
        needsReview: !o.placementConfident,
      });
    }
    if (o.sameIntent > t.cannibal) {
      const key = [o.a.url, o.b.url].sort().join('||');
      const entry = cannibalByKey.get(key) ?? { o: [] };
      entry.o.push(o);
      cannibalByKey.set(key, entry);
    }
  }
  links.sort((x, y) => y.priority - x.priority);

  const cannibalisation: CannibalPair[] = [];
  for (const [key, { o }] of cannibalByKey) {
    const [pageA, pageB] = key.split('||');
    const sameIntent = r3(Math.max(...o.map((x) => x.sameIntent)));
    const votes = new Map<string, number>();
    const reasons: string[] = [];
    for (const x of o) {
      if (x.survivorChoice === 'a') votes.set(x.a.url, (votes.get(x.a.url) ?? 0) + x.survivorConfidence);
      else if (x.survivorChoice === 'b') votes.set(x.b.url, (votes.get(x.b.url) ?? 0) + x.survivorConfidence);
      else if (x.survivorChoice === 'keep_both') reasons.push(`one direction says keep both (${r3(x.survivorConfidence)})`);
    }
    let survivor: string | null = null;
    let needsReview = false;
    if (votes.size === 1) {
      survivor = [...votes.keys()][0];
    } else if (votes.size === 2) {
      const sorted = [...votes.entries()].sort((x, y) => y[1] - x[1]);
      survivor = sorted[0][0];
      needsReview = true;
      reasons.push('directions disagree on the survivor');
    } else {
      needsReview = true;
      reasons.push('no confident survivor');
    }
    if (o.length < 2) reasons.push('evaluated in one direction only');
    cannibalisation.push({ pageA, pageB, sameIntent, survivor, needsReview, reasons });
  }
  cannibalisation.sort((x, y) => y.sameIntent - x.sameIntent);

  return { model: client.model, pairsEvaluated: pairs.length, inputTokens, links, cannibalisation };
}
