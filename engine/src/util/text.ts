export const STOPWORDS = new Set((
  'a an the and or but if then else of to in on at by for with from as is are was were be been being it its this that these those ' +
  'you your we our they their he she his her i me my what which who whom how when where why can could should would will shall may might ' +
  'do does did done not no yes so than too very just also into onto over under about after before between through during without within ' +
  'up down out off again further here there all any both each few more most other some such only own same up vs via per etc'
).split(/\s+/));

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Code-side check: template placeholders and scaffolding that must never publish. */
export function hasPlaceholder(s: string): boolean {
  return /\{\{[^}]*\}\}|\[(INSERT|TODO|PLACEHOLDER|TBD)[^\]]*\]|lorem ipsum|\bTODO:/i.test(s);
}

/**
 * Candidate anchor phrases from the source page for a link to the target page.
 * Extraction is code; choosing among candidates is Jev's job.
 */
export function anchorCandidates(sourceParagraphs: string[], targetTitle: string, max = 6): string[] {
  const targetTokens = new Set(tokenize(targetTitle));
  if (!targetTokens.size) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const para of sourceParagraphs) {
    for (const sent of sentences(para)) {
      const words = sent.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        const w = words[i].toLowerCase().replace(/[^a-z0-9'-]/g, '');
        if (!targetTokens.has(w)) continue;
        const start = Math.max(0, i - 1);
        const end = Math.min(words.length, i + 3);
        const phrase = words.slice(start, end).join(' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '');
        const key = phrase.toLowerCase();
        if (phrase.split(' ').length < 2 || seen.has(key)) continue;
        seen.add(key);
        out.push(phrase);
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}
