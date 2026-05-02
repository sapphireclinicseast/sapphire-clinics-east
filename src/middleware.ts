import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname } = request.nextUrl

  // Always pass through Next.js internals + favicon
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  // ── schedules.* subdomain → /schedules/* ──────────────────────────────
  // The Scheduling Hub is gated by the `sched_access` cookie set on the
  // /schedules gate page — bypass NextAuth entirely.
  if (host.startsWith('schedules.')) {
    if (pathname.startsWith('/api/')) return NextResponse.next()

    const internalPath = pathname === '/' ? '/schedules' : `/schedules${pathname}`

    // Cookie gate for branch/dept pages (e.g. /sbea/ot → gate at /).
    // Use a *redirect* (not rewrite) so the browser URL ends up at "/" and the
    // Next.js client router stops trying to resolve /sbea/ot against the
    // file-system routes (which would trigger the root notFound boundary).
    const isBranchDept = /^\/schedules\/[^/]+\/[^/]+/.test(internalPath)
    if (isBranchDept) {
      const cookie = request.cookies.get('sched_access')?.value
      if (cookie !== 'scei') {
        const gateUrl = request.nextUrl.clone()
        gateUrl.pathname = '/'
        gateUrl.search = `?next=${encodeURIComponent(pathname)}`
        return NextResponse.redirect(gateUrl)
      }
    }

    // Authenticated branch/dept render: rewrite the request internally to
    // /schedules/<branch>/<dept> while keeping the browser URL on
    // schedules.sapphireclinicseast.org/<branch>/<dept>. Set a header so
    // the client router treats the matched-path as authoritative.
    const url = request.nextUrl.clone()
    url.pathname = internalPath
    const res = NextResponse.rewrite(url)
    res.headers.set('x-middleware-rewrite', url.toString())
    return res
  }

  // ── queue.* subdomain → /queue/* ──────────────────────────────────────
  if (host.startsWith('queue.')) {
    if (pathname.startsWith('/api/')) return NextResponse.next()
    const internalPath = pathname === '/' ? '/queue' : `/queue${pathname}`
    const url = request.nextUrl.clone()
    url.pathname = internalPath
    return NextResponse.rewrite(url)
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
