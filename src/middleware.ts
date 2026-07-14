import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const { pathname } = req.nextUrl

  // Let Next.js internals and API routes pass through unchanged
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // ── schedules.* subdomain → /schedules/* ─────────────────────────────────
  if (host.startsWith('schedules.')) {
    // Legacy Sandbox branch slugs → Aura slugs. Redirect old shared links
    // (schedules.*/sbea/… , /sbgh/…) to the new branded URLs instead of 404ing.
    const LEGACY_SLUGS: Record<string, string> = { sbea: 'ahea', sbgh: 'ahgh' }
    const legacy = pathname.match(/^\/(sbea|sbgh)(\/.*)?$/i)
    if (legacy) {
      const newSlug = LEGACY_SLUGS[legacy[1].toLowerCase()]
      const url = req.nextUrl.clone()
      url.pathname = `/${newSlug}${legacy[2] ?? ''}`
      return NextResponse.redirect(url, 308)
    }

    const internalPath = pathname === '/' ? '/schedules' : `/schedules${pathname}`

    // Cookie gate: protect branch/dept pages
    const isBranchDept = /^\/schedules\/[^/]+\/[^/]+/.test(internalPath)
    if (isBranchDept) {
      const cookie = req.cookies.get('sched_access')?.value
      if (cookie !== 'scei') {
        const gateUrl = req.nextUrl.clone()
        gateUrl.pathname = '/schedules'
        gateUrl.search   = `?next=${encodeURIComponent(pathname)}`
        return NextResponse.rewrite(gateUrl)
      }
    }

    const url = req.nextUrl.clone()
    url.pathname = internalPath
    return NextResponse.rewrite(url)
  }

  // ── queue.* subdomain → /queue/* ─────────────────────────────────────────
  if (host.startsWith('queue.')) {
    const internalPath = pathname === '/' ? '/queue' : `/queue${pathname}`
    const url = req.nextUrl.clone()
    url.pathname = internalPath
    return NextResponse.rewrite(url)
  }

  // ── fellowship.* subdomain → the UGAT Fellowship hub at its own root ──────
  // Renamed off scholarship.*/ugatfellow so the program doesn't read as a
  // "scholarship" (it is a student loan). Only the root maps to the app page;
  // /ugat/* assets, /_next, and /api pass straight through to their real paths.
  if (host.startsWith('fellowship.')) {
    if (pathname === '/') {
      const url = req.nextUrl.clone()
      url.pathname = '/ugatfellow'
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  // ── scholarship.*/ugatfellow → fellowship.* (301, once the new domain is
  // live). Gated on UGAT_APP_URL pointing at fellowship.* so this never sends
  // visitors to a domain that isn't serving yet.
  if (host.startsWith('scholarship.') && (pathname === '/ugatfellow' || pathname.startsWith('/ugatfellow/'))) {
    const appUrl = process.env.UGAT_APP_URL || ''
    if (appUrl.includes('fellowship.')) {
      return NextResponse.redirect(appUrl.replace(/\/$/, '') + (req.nextUrl.search || ''), 301)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
