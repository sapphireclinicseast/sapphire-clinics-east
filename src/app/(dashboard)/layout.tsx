import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { SessionProvider } from 'next-auth/react'
import DashboardShell from '@/components/layout/DashboardShell'
import { BrandProvider } from '@/contexts/BrandContext'
import { scopeFor, pathAllowedForRole } from '@/lib/scoped-roles'

// Some roles see a deliberately small slice of the Hub — Investor, and now
// Medical Representative. There is no middleware/route-level auth elsewhere in
// this app (every other page relies on its own, inconsistent client/API checks
// — see the many ALLOWED_ROLES allow-lists scattered through src/app/api/**),
// so this is the ONE hard gate that stops a scoped session from reaching
// anything else by typing or bookmarking a URL directly.
//
// Which paths each role may reach now lives in lib/scoped-roles, because the
// sidebar, the login redirect and the /dashboard bounce all need the same
// answer and a second copy would eventually drift into a permissions hole.

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as { role?: string })?.role ?? ''
  const scope = scopeFor(role)
  if (scope) {
    const pathname = (await headers()).get('x-pathname') ?? ''
    // pathAllowedForRole fails OPEN on an empty pathname — see the note there;
    // an unknown path used to send scoped accounts into a redirect loop that
    // rendered as a permanently blank page.
    if (!pathAllowedForRole(role, pathname)) redirect(scope.home)
  }

  return (
    <SessionProvider session={session}>
      <BrandProvider>
        <DashboardShell user={session.user}>{children}</DashboardShell>
      </BrandProvider>
    </SessionProvider>
  )
}
