'use client'

// Force dynamic rendering — same SSG-cache fix applied to /admin and
// /documents. Without it Next.js serves a prerendered HTML shell that
// references older chunks for up to a year, hiding deploys from the
// front desk.
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, type Branch } from '@/lib/session'
import StudentListPanel from '@/components/StudentListPanel'
import FrontDeskPaymentConfirmations from '@/components/FrontDeskPaymentConfirmations'
import PaidStudentsSpreadsheet from '@/components/PaidStudentsSpreadsheet'
import CurriculumPanel from '@/components/CurriculumPanel'
import TemplatesPanel from '@/components/TemplatesPanel'
import CalendarPage from '@/app/calendar/page'

type FrontdeskTab = 'STUDENTS' | 'CALENDAR' | 'PAYMENTS' | 'SPREADSHEET' | 'CURRICULUM' | 'TEMPLATES'

export default function FrontdeskPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  // Branch this front-desk account is scoped to. Comes from the sign-in
  // token for DB-backed per-branch front desks (e.g. East / Greenhills);
  // legacy hardcoded shared-frontdesk credentials don't carry a branch,
  // in which case we leave it undefined and the server's branch filter
  // also short-circuits — preserving the old global view.
  const [viewerBranch, setViewerBranch] = useState<Branch | undefined>(undefined)
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
    setViewerBranch(auth.branch)
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
          ['CURRICULUM',  'Curriculum'],
          ['TEMPLATES',   'Templates'],
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
        <StudentListPanel viewer={{ role: 'ADMIN', email, name: 'Front desk' }} viewerBranch={viewerBranch} />
      )}

      {tab === 'CALENDAR' && (
        // Render the Calendar page directly as a component instead of an
        // iframe — the iframe also pulled in the root layout's header +
        // footer, causing the duplicate brand block the front desk saw.
        <CalendarPage />
      )}

      {tab === 'PAYMENTS' && (
        // FrontDeskPaymentConfirmations is the single source of truth for
        // the front desk: server-driven Pending + Confirmed Payments
        // sections that reflect what the front desk has actually
        // confirmed. The older PaymentsGrouped view (read from local
        // PaymentRecord) was showing stale "still pending" rows because
        // the local cache didn't have visibility into other devices'
        // PayMongo / front-desk confirmations.
        <FrontDeskPaymentConfirmations />
      )}

      {tab === 'SPREADSHEET' && (
        <PaidStudentsSpreadsheet canEdit />
      )}

      {tab === 'CURRICULUM' && (
        // Curriculum library — per-grade curriculum docs the admin/teacher
        // upload. Front desk needs read access to share with parents and
        // upload access for clerical attachments.
        <CurriculumPanel viewer={{ role: 'ADMIN', email }} />
      )}

      {tab === 'TEMPLATES' && (
        // Free-form template library (lesson plan templates, IEP forms,
        // parent forms, etc.). Front desk needs the same upload + download
        // access as teachers and admins.
        <TemplatesPanel viewer={{ role: 'ADMIN', email }} />
      )}
    </div>
  )
}
