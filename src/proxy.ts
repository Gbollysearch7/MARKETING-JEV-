import { NextResponse, type NextRequest } from 'next/server';

// Public pages, plus API routes that authenticate themselves (Stripe signatures, API keys, health checks).
const PUBLIC = ['/login', '/signup', '/privacy', '/terms', '/security', '/api/billing/webhook', '/api/health', '/api/v1'];

/**
 * Optimistic check only: no session cookie means sign in first. The real check (valid session, site ownership)
 * runs in every page, action and route handler.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/' || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (request.cookies.has('sdp_session')) {
    // Pass the requested page along, so an expired session can send the user back here after signing in.
    const headers = new Headers(request.headers);
    headers.set('x-rankcall-path', pathname + request.nextUrl.search);
    return NextResponse.next({ request: { headers } });
  }
  // API-key calls (Authorization: Bearer rk_live_...) are checked by the route itself.
  if (pathname.startsWith('/api/') && request.headers.get('authorization')?.startsWith('Bearer ')) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = new URL('/login', request.url);
  url.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
