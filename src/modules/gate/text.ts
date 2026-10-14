/** Text helpers for the quality gate. Pure functions, no Next or server imports. */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', pound: '£' };

/** HTML or plain text in, plain text out: drops scripts, styles and tags, decodes common entities, collapses spaces. */
export function stripHtml(input: string): string {
  if (!input) return '';
  if (!/[<&]/.test(input)) return input.replace(/\s+/g, ' ').trim();
  return input
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercased word tokens (letters, digits, apostrophes), used for shingles and counts. */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []);
}

/** Word n-grams as strings. A page shorter than n words gives one shingle of all its words. */
export function shingleList(ws: string[], n = 5): string[] {
  if (!ws.length) return [];
  if (ws.length < n) return [ws.join(' ')];
  const out: string[] = [];
  for (let i = 0; i + n <= ws.length; i++) out.push(ws.slice(i, i + n).join(' '));
  return out;
}

export const shingleSet = (ws: string[], n = 5) => new Set(shingleList(ws, n));

/** |A ∩ B| / |A ∪ B|. Two empty sets are not duplicates (0). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const s of small) if (big.has(s)) shared++;
  return shared / (a.size + b.size - shared);
}

const PLACEHOLDERS: { re: RegExp; label: string }[] = [
  { re: /lorem ipsum|dolor sit amet/i, label: 'lorem ipsum' },
  { re: /\{\{[^}]*\}\}|\{\{|\}\}/, label: '{{ }} template tag' },
  { re: /\{%|%\}|\$\{[^}]*\}/, label: 'unrendered template code' },
  { re: /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b/, label: 'TODO marker' },
  { re: /\[\s*(insert|add|placeholder|your|city|town|name|location|keyword)[^\]]*\]/i, label: '[INSERT] placeholder' },
  { re: /\bundefined\b/, label: '"undefined"' },
  { re: /\bnull\b/, label: '"null"' },
  { re: /\bNaN\b/, label: '"NaN"' },
  { re: /\[object Object\]/, label: '[object Object]' },
];

/** Placeholder and scaffold text left in a generated page. Returns the labels found, with the matched snippet. */
export function findPlaceholders(...texts: string[]): string[] {
  const found: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const p of PLACEHOLDERS) {
      const m = t.match(p.re);
      if (m && !found.some((f) => f.startsWith(p.label))) found.push(`${p.label}: “${m[0].slice(0, 40)}”`);
    }
  }
  return found;
}

export const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`);
