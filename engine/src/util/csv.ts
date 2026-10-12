function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return (columns ?? []).join(',') + '\n';
  const cols = columns ?? Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  return lines.join('\n') + '\n';
}
