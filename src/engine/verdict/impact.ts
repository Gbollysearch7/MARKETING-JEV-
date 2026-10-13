import { ctrAt, type Signals } from './signals';
import type { ImpactRange, Verdict } from './types';

/**
 * Expected change in monthly clicks 90 days after acting, as a range (never a single number).
 * Uses the site's own CTR curve and the page's current position and impressions.
 */
export function impactRange(v: Verdict, s: Signals, curve: number[], targetMonthlyClicks: number): ImpactRange {
  const m = s.monthlyClicks;
  const r = (x: number) => Math.round(x);
  const gainAt = (target: number) => (s.position ? Math.max(0, s.monthlyImpressions * (ctrAt(curve, Math.max(1, target)) - ctrAt(curve, s.position))) : 0);
  switch (v) {
    case 'refresh': {
      const lost = s.prevMonthlyClicks != null ? Math.max(0, s.prevMonthlyClicks - m) : 0;
      if (lost > 0) return { low: r(lost * 0.25), high: r(lost * 0.75) };
      if (!s.position) return { low: 0, high: 0 };
      return { low: r(gainAt(s.position - 1)), high: r(gainAt(s.position - 3)) };
    }
    case 'expand':
      if (!s.position) return { low: 0, high: 0 };
      return { low: r(gainAt(s.position - 3)), high: r(gainAt(s.position - 8)) };
    case 'merge':
      return { low: r(-0.2 * m), high: r(0.3 * m + 0.1 * targetMonthlyClicks) };
    case 'redirect':
      return { low: 0, high: r(0.5 * m + 0.03 * targetMonthlyClicks) };
    case 'prune':
      return { low: r(-m), high: 0 };
    case 'leave':
      return { low: 0, high: 0 };
  }
}
