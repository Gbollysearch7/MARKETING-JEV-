/** Pure link check used by "Verify link": does this HTML link to the site's domain? */
export interface LinkCheck {
  found: boolean;
  /** The first few matching links, with their rel attribute. */
  links: { href: string; rel: string; anchor: string }[];
}

const ATTR = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};

export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase().replace(/^www\./, '');
  return h === d || h.endsWith(`.${d}`);
}

export function findLinksTo(html: string, siteDomain: string, pageUrl: string): LinkCheck {
  const links: LinkCheck['links'] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.length < 5) {
    const href = ATTR(m[1], 'href');
    if (!href) continue;
    let u: URL;
    try { u = new URL(href, pageUrl); } catch { continue; }
    if (!['http:', 'https:'].includes(u.protocol) || !hostMatches(u.hostname, siteDomain)) continue;
    links.push({ href: u.toString(), rel: ATTR(m[1], 'rel').toLowerCase(), anchor: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) });
  }
  return { found: links.length > 0, links };
}
