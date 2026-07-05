'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Landmark } from 'lucide-react'

const ALLOWED = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export default function LoansAndAdvancesPage() {
  const { data: session, status } = useSession()
  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && !ALLOWED.includes(session?.user?.role as string)) {
    return <div className="p-8 text-center text-gray-500">Loans &amp; Advances is restricted to the admin, accountant, and bookkeeper.</div>
  }
  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Landmark size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Loans &amp; Advances</h1>
      </div>
      <div className="rounded-2xl border p-10 text-center" style={{ borderColor: 'var(--light-gray)' }}>
        <p className="text-sm text-gray-500">This section is set up and ready. The detailed layout will be built from the instructions you&apos;re sending next.</p>
      </div>
    </div>
  )
}
