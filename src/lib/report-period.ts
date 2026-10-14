export function reportMonth(value: string | undefined, now = new Date()): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : now.toISOString().slice(0, 7);
}

/** Exclusive end boundary avoids including records from the following month. */
export function reportBoundary(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

export function reportUpload<T extends { kind: string; created_at: string; period_end: string | null }>(uploads: T[], before: string): T | undefined {
  return uploads.filter((u) => u.kind === 'gsc_pages' && u.created_at < before && (!u.period_end || u.period_end < before.slice(0, 10)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
