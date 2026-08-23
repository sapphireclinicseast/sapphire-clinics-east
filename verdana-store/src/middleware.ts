import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Password gate for the admin dashboard and its API routes.
// Override the password by setting ADMIN_PASSWORD in the environment.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'scei'

export function middleware(req: NextRequest) {
  const auth = req.headers.get('authorization')

  if (auth) {
    const [scheme, encoded] = auth.split(' ')
    if (scheme === 'Basic' && encoded) {
      // Edge runtime: use atob (Buffer is unavailable here).
      let decoded = ''
      try {
        decoded = atob(encoded)
      } catch {
        decoded = ''
      }
      const password = decoded.slice(decoded.indexOf(':') + 1)
      if (password === ADMIN_PASSWORD) {
        return NextResponse.next()
      }
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Verdana Admin", charset="UTF-8"',
    },
  })
}

export const config = {
  // Guards the admin UI and all admin API routes. Public routes
  // (store pages, /api/uploads, checkout, webhooks) are untouched.
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
}
