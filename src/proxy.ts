import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup', '/api/billing/webhook'];

/**
 * Optimistic check only: no session cookie means sign in first. The real check (valid session, site ownership)
 * runs in every page, action and route handler.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/' || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (request.cookies.has('sdp_session')) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = new URL('/login', request.url);
  url.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
