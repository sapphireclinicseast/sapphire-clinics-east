import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { SessionProvider } from 'next-auth/react'
import DashboardShell from '@/components/layout/DashboardShell'
import { BrandProvider } from '@/contexts/BrandContext'

// Investor accounts are read-only and restricted to two pages. There is no
// middleware/route-level auth elsewhere in this app (every other page relies
// on its own, inconsistent client/API checks — see the many ALLOWED_ROLES
// allow-lists scattered through src/app/api/**), so this is the ONE hard
// gate that stops an investor session from reaching anything else by typing
// or bookmarking a URL directly.
const INVESTOR_ALLOWED_PREFIXES = ['/scheduling-dashboard', '/patients/dashboard']

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
    const isAllowed = INVESTOR_ALLOWED_PREFIXES.some(
      p => pathname === p || pathname.startsWith(p + '/')
    )
    if (!isAllowed) redirect('/scheduling-dashboard')
  }

  return (
    <SessionProvider session={session}>
      <BrandProvider>
        <DashboardShell user={session.user}>{children}</DashboardShell>
      </BrandProvider>
    </SessionProvider>
  )
}
