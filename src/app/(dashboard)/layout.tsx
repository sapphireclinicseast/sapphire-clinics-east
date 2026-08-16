import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { SessionProvider } from 'next-auth/react'
import DashboardShell from '@/components/layout/DashboardShell'
import { BrandProvider } from '@/contexts/BrandContext'

// Investor accounts are read-only and restricted to the Patient Dashboard
// only. There is no middleware/route-level auth elsewhere in this app (every
// other page relies on its own, inconsistent client/API checks — see the many
// ALLOWED_ROLES allow-lists scattered through src/app/api/**), so this is the
// ONE hard gate that stops an investor session from reaching anything else by
// typing or bookmarking a URL directly.
const INVESTOR_ALLOWED_PREFIXES = ['/patients/dashboard']
const INVESTOR_HOME = '/patients/dashboard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as { role?: string })?.role ?? ''
  if (role === 'INVESTOR') {
    const pathname = (await headers()).get('x-pathname') ?? ''
    // Fail OPEN, not into a loop: if middleware's x-pathname header is ever
    // missing (proxy/CDN stripped it, a request bypassed middleware, etc.),
    // pathname is '' — which matches NO allowed prefix, so every request
    // including INVESTOR_HOME itself would redirect to INVESTOR_HOME, which
    // re-renders this exact layout with the same missing header, redirecting
    // again. That self-redirect loop is what actually rendered as a
    // permanently blank page for investor accounts. Only redirect when we
    // have positive evidence of an out-of-scope path, never when we simply
    // don't know the path.
    const isAllowed = !pathname || INVESTOR_ALLOWED_PREFIXES.some(
      p => pathname === p || pathname.startsWith(p + '/')
    )
    if (!isAllowed) redirect(INVESTOR_HOME)
  }

  return (
    <SessionProvider session={session}>
      <BrandProvider>
        <DashboardShell user={session.user}>{children}</DashboardShell>
      </BrandProvider>
    </SessionProvider>
  )
}
