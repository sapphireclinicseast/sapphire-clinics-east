import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname } = request.nextUrl

  // Always pass through Next.js internals + favicon
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  // ── schedules.* subdomain ─────────────────────────────────────────────
  // Path → /schedules mapping is handled by `rewrites()` in next.config.ts
  // (so the Next.js client router knows the matched-path and doesn't fight
  // the URL bar). Middleware only handles:
  //   • bypassing the global NextAuth gate for this host
  //   • cookie-gating branch/dept pages, redirecting to / when missing
  if (host.startsWith('schedules.')) {
    if (pathname.startsWith('/api/')) return NextResponse.next()

    // Branch/dept page (e.g. /sbea/ot) requires the sched_access cookie.
    // We detect them as exactly /<branch>/<dept> at the URL-bar level —
    // anything deeper or shallower is left alone (gate or static).
    const isBranchDept = /^\/[^/]+\/[^/]+\/?$/.test(pathname)
    if (isBranchDept) {
      const cookie = request.cookies.get('sched_access')?.value
      if (cookie !== 'scei') {
        const gateUrl = request.nextUrl.clone()
        gateUrl.pathname = '/'
        gateUrl.search = `?next=${encodeURIComponent(pathname)}`
        return NextResponse.redirect(gateUrl)
      }
    }

    return NextResponse.next()
  }

  // ── queue.* subdomain — public, no cookie gate ─────────────────────────
  if (host.startsWith('queue.')) {
    return NextResponse.next()
  }

  // ── Default: NextAuth-gated app on the main host ──────────────────────
  const publicPaths = ['/login', '/forgot-password', '/reset-password', '/api/', '/capture']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const sessionToken =
    request.cookies.get('authjs.session-token')?.value ||
    request.cookies.get('__Secure-authjs.session-token')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
