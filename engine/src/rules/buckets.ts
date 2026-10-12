/**
 * Everything numeric lives here, in code. Jev only ever sees the named buckets.
 */

export type ClickTrend = 'growing' | 'flat' | 'declining' | 'declining_sharply' | 'unknown';
export type Band = 'none' | 'low' | 'medium' | 'high';
export type PositionBand = 'top_three' | 'page_one_lower_half' | 'page_two' | 'beyond_page_two' | 'unknown';
export type CtrBand = 'above_expected_for_position' | 'as_expected_for_position' | 'below_expected_for_position' | 'unknown';

/** Compare the last three months with the first three of a 12-month series. */
export function clickTrend(monthlyClicks: number[]): ClickTrend {
  if (monthlyClicks.length < 6) return 'unknown';
  const head = monthlyClicks.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const tail = monthlyClicks.slice(-3).reduce((a, b) => a + b, 0) / 3;
  if (head === 0 && tail === 0) return 'flat';
  if (head === 0) return 'growing';
  const ratio = tail / head;
  if (ratio < 0.5) return 'declining_sharply';
  if (ratio < 0.8) return 'declining';
  if (ratio > 1.2) return 'growing';
  return 'flat';
}

export function impressionsBand(impressions12m: number): Band {
  if (impressions12m <= 0) return 'none';
  if (impressions12m < 500) return 'low';
  if (impressions12m < 10_000) return 'medium';
  return 'high';
}

export function positionBand(position: number | null | undefined): PositionBand {
  if (position == null || !Number.isFinite(position)) return 'unknown';
  if (position <= 3) return 'top_three';
  if (position <= 10) return 'page_one_lower_half';
  if (position <= 20) return 'page_two';
  return 'beyond_page_two';
}

/** Rough expected CTR by position for non-brand queries. Replace with your own curve from GSC. */
export function expectedCtr(position: number): number {
  const table = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  if (position <= 1) return table[0];
  if (position >= 10) return Math.max(0.005, 0.018 * (10 / position));
  const i = Math.floor(position) - 1;
  const frac = position - Math.floor(position);
  return table[i] + (table[i + 1] - table[i]) * frac;
}

export function ctrBand(ctr: number | null | undefined, position: number | null | undefined): CtrBand {
  if (ctr == null || position == null || !Number.isFinite(ctr) || !Number.isFinite(position)) return 'unknown';
  const exp = expectedCtr(position);
  if (ctr < exp * 0.6) return 'below_expected_for_position';
  if (ctr > exp * 1.4) return 'above_expected_for_position';
  return 'as_expected_for_position';
}
