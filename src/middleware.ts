import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname, search } = request.nextUrl

  // Always pass through Next.js internals + favicon
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  // ── schedules.* subdomain ─────────────────────────────────────────────
  // The Scheduling Hub lives under `/schedules/...` in the file system.
  // Redirect any non-/schedules URL on this host into that prefix so the
  // browser URL and the rendered route always agree (otherwise the
  // Next.js client router renders the global notFound boundary on top
  // of the gate page after hydration).
  if (host.startsWith('schedules.')) {
    if (pathname.startsWith('/api/')) return NextResponse.next()

    // Already under /schedules — handle cookie gate, then continue.
    if (pathname === '/schedules' || pathname.startsWith('/schedules/')) {
      const isBranchDept = /^\/schedules\/[^/]+\/[^/]+\/?$/.test(pathname)
      if (isBranchDept) {
        const cookie = request.cookies.get('sched_access')?.value
        if (cookie !== 'scei') {
          const gateUrl = request.nextUrl.clone()
          gateUrl.pathname = '/schedules'
          gateUrl.search = `?next=${encodeURIComponent(pathname)}`
          return NextResponse.redirect(gateUrl)
        }
      }
      return NextResponse.next()
    }

    // Anything else on this host (including '/' and '/sbea/ot' style URLs)
    // gets redirected into the /schedules/* tree.
    const target = request.nextUrl.clone()
    target.pathname = pathname === '/' ? '/schedules' : `/schedules${pathname}`
    target.search = search
    return NextResponse.redirect(target)
  }

  // ── queue.* subdomain — public, no cookie gate ─────────────────────────
  if (host.startsWith('queue.')) {
    if (pathname === '/queue' || pathname.startsWith('/queue/')) return NextResponse.next()
    if (pathname.startsWith('/api/')) return NextResponse.next()
    const target = request.nextUrl.clone()
    target.pathname = pathname === '/' ? '/queue' : `/queue${pathname}`
    target.search = search
    return NextResponse.redirect(target)
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
