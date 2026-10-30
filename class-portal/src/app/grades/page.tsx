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

function Quarter({ label, value, highlight }: { label: string; value?: string | number; highlight?: boolean }) {
  const display = value === null || value === undefined || value === '' ? '—' : value
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: 'var(--paper-3)',
        background: highlight ? 'var(--sage-tint)' : 'var(--paper-2)',
      }}
    >
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--mid-gray)]">{label}</div>
      <div className="text-[22px] font-semibold text-[color:var(--deep-teal)]">{display}</div>
    </div>
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
    <div className="max-w-4xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <h1 className="text-[22px] leading-tight mb-3">Grades</h1>
        {!grade ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No grades have been recorded yet by the teacher.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-2 text-center">
              <Quarter label="Q1" value={grade.q1} />
              <Quarter label="Q2" value={grade.q2} />
              <Quarter label="Q3" value={grade.q3} />
              <Quarter label="Q4" value={grade.q4} />
              <Quarter label="Year Avg" value={grade.yearAvg} highlight />
            </div>
            <p className="text-[11.5px] text-[color:var(--mid-gray)]">Updated {new Date(grade.updatedAt).toLocaleString()}.</p>
          </div>
        )}
      </div>
    </div>
  )
}
