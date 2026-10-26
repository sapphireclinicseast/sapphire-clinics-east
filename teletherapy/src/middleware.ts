import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const publicPaths = ['/login', '/forgot-password', '/reset-password', '/provider-handoff', '/api/', '/capture', '/brand/', '/forms-qr/']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))

  if (isPublic) return NextResponse.next()

  // Check for session cookie (NextAuth sets this)
  const sessionToken =
    request.cookies.get('authjs.session-token')?.value ||
    request.cookies.get('__Secure-authjs.session-token')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.nextUrl.origin)
    // Only carry a callbackUrl when the visitor was heading somewhere
    // deeper than the home page. Landing on the root would otherwise
    // produce an ugly /login?callbackUrl=%2F — a bare /login is cleaner
    // and the login page already defaults to '/' after sign-in.
    if (pathname !== '/') {
      loginUrl.searchParams.set('callbackUrl', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Exclude ALL /api routes from middleware. Middleware is a no-op for them
  // anyway (every /api/ path is in publicPaths above), and when middleware
  // matches a route Next.js buffers the request body through it with a 10MB
  // cap (middlewareClientMaxBodySize) — which silently truncated every file
  // upload > 10MB and broke multipart parsing ("Failed to parse body as
  // FormData" → the client saw uploads fail at ~99%). Skipping /api lets
  // uploads stream straight to the route handlers, up to nginx's 20M limit.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/|Codepaca\\.svg).*)'],
}
