/**
 * Every data source is joined on one key: the URL path, lowercased, without query string,
 * fragment or trailing slash. GA4 only reports paths, so the path is the common denominator.
 * A site is one host, so the path is unique within it.
 */
export function pathKey(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  let path: string;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      return null;
    }
  } else if (raw.startsWith('/')) {
    path = raw.split(/[?#]/)[0];
  } else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) {
    // host without protocol, e.g. example.com/blog/post
    try {
      path = new URL(`https://${raw}`).pathname;
    } catch {
      return null;
    }
  } else {
    return null;
  }
  try {
    path = decodeURI(path);
  } catch {
    /* keep as is */
  }
  path = path.toLowerCase().replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

export function hostOf(input: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** URL pattern used as the "template" filter: /blog/my-post -> /blog/*, /p/123/red -> /p/*\/*. */
export function templateOf(path: string): string {
  if (path === '/') return 'home';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 1) return '/*';
  return '/' + parts[0] + '/' + parts.slice(1).map(() => '*').join('/');
}
