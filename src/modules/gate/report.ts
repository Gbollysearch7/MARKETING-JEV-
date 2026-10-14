import { FAILURE_LABEL, type Failure, type GateVerdict } from './types';

/** A template with more than this share of Kill should be paused before any page ships. */
export const PAUSE_KILL_SHARE = 0.4;
/** Too few pages to judge a template as a whole. */
export const PAUSE_MIN_PAGES = 3;

export interface TemplateRow {
  template: string;
  pages: number;
  counts: Record<GateVerdict, number>;
  share: Record<GateVerdict, number>;
  topFailure: Failure | null;
  topFailureLabel: string | null;
  topFailurePages: number;
  pause: boolean;
}

/** Per-template summary: verdict split, most common failure among Improve and Kill pages, and the pause flag. */
export function templateReport(items: { template: string; verdict: GateVerdict | null; failures: Failure[] }[]): TemplateRow[] {
  const by = new Map<string, typeof items>();
  for (const it of items) by.set(it.template, [...(by.get(it.template) ?? []), it]);
  const rows: TemplateRow[] = [];
  for (const [template, list] of by) {
    const scored = list.filter((x) => x.verdict);
    const counts: Record<GateVerdict, number> = { index: 0, improve: 0, kill: 0 };
    for (const x of scored) counts[x.verdict!]++;
    const total = scored.length || 1;
    const fc = new Map<Failure, number>();
    for (const x of scored) if (x.verdict !== 'index') for (const f of new Set(x.failures)) fc.set(f, (fc.get(f) ?? 0) + 1);
    const top = [...fc].sort((a, b) => b[1] - a[1])[0];
    rows.push({
      template,
      pages: list.length,
      counts,
      share: { index: counts.index / total, improve: counts.improve / total, kill: counts.kill / total },
      topFailure: top?.[0] ?? null,
      topFailureLabel: top ? FAILURE_LABEL[top[0]] : null,
      topFailurePages: top?.[1] ?? 0,
      pause: scored.length >= PAUSE_MIN_PAGES && counts.kill / total > PAUSE_KILL_SHARE,
    });
  }
  return rows.sort((a, b) => Number(b.pause) - Number(a.pause) || b.pages - a.pages);
}
