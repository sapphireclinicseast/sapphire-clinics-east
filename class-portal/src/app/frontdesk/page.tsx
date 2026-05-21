'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'
import StudentListPanel from '@/components/StudentListPanel'
import PaymentsGrouped from '@/components/PaymentsGrouped'
import PaidStudentsSpreadsheet from '@/components/PaidStudentsSpreadsheet'
import CalendarPage from '@/app/calendar/page'

type FrontdeskTab = 'STUDENTS' | 'CALENDAR' | 'PAYMENTS' | 'SPREADSHEET'

export default function FrontdeskPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [tab, setTab] = useState<FrontdeskTab>('STUDENTS')

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'FRONTDESK') {
      // Bounce non-frontdesk users to their proper dashboard.
      router.replace(auth.role === 'ADMIN' ? '/admin' : '/profile')
      return
    }
    setEmail(auth.email)
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Aura Academy · Clinic front desk
        </div>
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">Front desk dashboard</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">{email}</p>
      </div>

      <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl overflow-x-auto" style={{ fontFamily: 'var(--font-display)' }}>
        {([
          ['STUDENTS',    'Students'],
          ['CALENDAR',    'Calendar'],
          ['PAYMENTS',    'Payments'],
          ['SPREADSHEET', 'Enrollment register'],
        ] as Array<[FrontdeskTab, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${tab === k ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'STUDENTS' && (
        // Front desk sees the same student list view admin does — full
        // student details, uploaded/generated documents, and assigned
        // teachers (via the existing detail popup).
        <StudentListPanel viewer={{ role: 'ADMIN', email, name: 'Front desk' }} />
      )}

      {tab === 'CALENDAR' && (
        // Render the Calendar page directly as a component instead of an
        // iframe — the iframe also pulled in the root layout's header +
        // footer, causing the duplicate brand block the front desk saw.
        <CalendarPage />
      )}

      {tab === 'PAYMENTS' && (
        <PaymentsGrouped canSendReminders senderEmail={email} senderName="Front desk" senderRole="ADMIN" />
      )}

      {tab === 'SPREADSHEET' && (
        <PaidStudentsSpreadsheet canEdit />
      )}
    </div>
  )
}
