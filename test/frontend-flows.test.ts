import { describe, expect, it } from 'vitest';
import { isCalendarDate, reviewInputError, taskInputError } from '../src/lib/form-validation';
import { reportBoundary, reportMonth, reportUpload } from '../src/lib/report-period';

describe('decision review safeguards', () => {
  const input = { decision: 'change', verdict: 'redirect', path: '/old', target: '/new' };
  it('requires a usable destination before an approval can create a redirect task', () => {
    for (const target of ['', '/old', '//other.example/page', 'https://other.example/page', '/new?x=1', '/new\\path']) {
      expect(reviewInputError({ ...input, target })).not.toBeNull();
    }
    expect(reviewInputError(input)).toBeNull();
  });
  it('does not require a destination when rejecting or choosing a content update', () => {
    expect(reviewInputError({ ...input, decision: 'reject', target: '' })).toBeNull();
    expect(reviewInputError({ ...input, verdict: 'refresh', target: '' })).toBeNull();
  });
});

describe('task dates that start outcome measurements', () => {
  const input = { status: 'done', dueDate: '', doneAt: '2026-10-13', today: '2026-10-13' };
  it('rejects missing, impossible and future completion dates', () => {
    for (const doneAt of ['', '2026-02-30', '2026-10-14']) expect(taskInputError({ ...input, doneAt })).not.toBeNull();
    expect(taskInputError(input)).toBeNull();
  });
  it('accepts leap days only in leap years and validates optional due dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(taskInputError({ ...input, status: 'todo', doneAt: '', dueDate: '2026-02-30' })).not.toBeNull();
  });
});

describe('monthly report data boundaries', () => {
  const before = reportBoundary('2026-10');
  const upload = (id: string, created_at: string, period_end: string | null, kind = 'gsc_pages') => ({ id, kind, created_at, period_end });
  it('does not use a newer upload or a future traffic period in an older report', () => {
    const available = upload('available', '2026-10-10T00:00:00Z', '2026-09-30');
    const rows = [available, upload('late import', '2026-11-01T00:00:00Z', '2026-09-30'), upload('future traffic', '2026-10-30T00:00:00Z', '2026-11-10'), upload('queries', '2026-10-31T00:00:00Z', '2026-10-30', 'gsc_queries')];
    expect(reportUpload(rows, before)?.id).toBe('available');
    expect(rows[0]).toBe(available);
    expect(reportUpload([rows[1]], before)).toBeUndefined();
  });
  it('handles December rollover, leap-year February, and invalid month parameters', () => {
    expect(reportBoundary('2026-12')).toBe('2027-01-01T00:00:00.000Z');
    expect(reportBoundary('2024-02')).toBe('2024-03-01T00:00:00.000Z');
    expect(reportMonth('2026-13', new Date('2026-10-13T00:00:00Z'))).toBe('2026-10');
  });
});
