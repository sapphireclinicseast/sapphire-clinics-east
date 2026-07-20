import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import DashboardShell from '@/components/layout/DashboardShell'
import { BrandProvider } from '@/contexts/BrandContext'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <BrandProvider>
        <DashboardShell user={session.user}>{children}</DashboardShell>
      </BrandProvider>
    </SessionProvider>
  )
}
