import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const publicPaths = ['/login', '/forgot-password', '/reset-password', '/api/', '/capture', '/brand/', '/forms-qr/']
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/auth|Codepaca\\.svg).*)'],
}
