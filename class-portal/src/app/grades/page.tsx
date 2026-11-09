'use client'

// Standalone Grades page for a student (and admins viewing-as a
// student). Lifted from the Grades tab that used to sit on /profile.
// Teachers/admins still get the editable GradesPanel through their
// own hubs; this page is the read-only parent/student view.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getGradeForStudent,
  type GradeRecord,
} from '@/lib/session'
import { getImpersonationMeta } from '@/lib/backend'
import { DashCard, PageHeader, EmptyState, StatusPill, Icon, TH, TH_STYLE, TD, TR_STYLE } from '@/components/hub/ui'

/** One row of the report: period, the average as typed by the teacher, and a
 *  text status so "nothing posted yet" never rests on a dash or colour alone. */
function Quarter({ label, value, highlight }: { label: string; value?: string | number; highlight?: boolean }) {
  const display = value === null || value === undefined || value === '' ? '—' : value
  const posted = display !== '—'
  return (
    <tr style={{ ...TR_STYLE, background: highlight ? 'var(--sage-tint)' : undefined }}>
      <th scope="row" className={`${TD} text-left text-sm ${highlight ? 'font-bold' : 'font-semibold'}`} style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
        {label}
      </th>
      <td className={`${TD} text-right`}>
        <span className={`tabular-nums leading-none ${highlight ? 'text-[26px] font-bold' : 'text-[22px] font-semibold'}`} style={{ color: posted ? 'var(--deep-teal)' : 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
          {display}
        </span>
      </td>
      <td className={`${TD} text-right w-[1%] whitespace-nowrap`}>
        {posted
          ? <StatusPill tone={highlight ? 'success' : 'info'}>Posted</StatusPill>
          : <StatusPill tone="neutral">Not yet posted</StatusPill>}
      </td>
    </tr>
  )
}

export default function GradesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [grade, setGrade] = useState<GradeRecord | null>(null)

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    const imp = getImpersonationMeta()
    const impersonatingStudent = !!imp && imp.targetRole === 'STUDENT'
    if (!impersonatingStudent && auth.role !== 'STUDENT') {
      router.replace(auth.role === 'ADMIN' || auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    const uid = impersonatingStudent ? (imp!.targetUserId || auth.userId) : auth.userId
    if (!uid) { router.replace('/sign-in'); return }
    setGrade(getGradeForStudent(uid))
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="max-w-[720px] mx-auto space-y-5 min-w-0 animate-fade-up">
      <PageHeader
        eyebrow="Aura Academy · Report card"
        title="Grades"
        description="Quarterly averages as posted by the teacher."
      />
      {!grade ? (
        <DashCard title="Quarterly averages" icon={<Icon name="award" size={15} />} flush>
          <EmptyState icon="award" title="No grades have been recorded yet by the teacher." hint="They appear here as soon as the teacher posts a quarter." />
        </DashCard>
      ) : (
        <DashCard
          flush
          title="Quarterly averages"
          icon={<Icon name="award" size={15} />}
          footer={<>Updated {new Date(grade.updatedAt).toLocaleString()}.</>}
        >
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <caption className="sr-only">Quarterly averages and year average</caption>
            <thead>
              <tr>
                <th scope="col" className={TH} style={TH_STYLE}>Period</th>
                <th scope="col" className={`${TH} text-right`} style={TH_STYLE}>Average</th>
                <th scope="col" className={`${TH} text-right`} style={TH_STYLE}>Status</th>
              </tr>
            </thead>
            <tbody>
              <Quarter label="Q1" value={grade.q1} />
              <Quarter label="Q2" value={grade.q2} />
              <Quarter label="Q3" value={grade.q3} />
              <Quarter label="Q4" value={grade.q4} />
              <Quarter label="Year Avg" value={grade.yearAvg} highlight />
            </tbody>
          </table>
        </DashCard>
      )}
    </div>
  )
}
