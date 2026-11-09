'use client'

import { SessionProvider } from 'next-auth/react'
import { BranchProvider } from '@/components/BranchSwitcher'
import StaffShell from '@/components/StaffShell'

// Providers + the signed-in frame. The sidebar, top bar and nav gating live
// in components/StaffShell (the Staff Portal's counterpart of the Ops Hub's
// components/layout/DashboardShell).
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <BranchProvider>
        <StaffShell>{children}</StaffShell>
      </BranchProvider>
    </SessionProvider>
  )
}
