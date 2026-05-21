'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers,
  getPaymentsForStudent,
  getGradeForStudent,
  getFile,
  type StoredUser, type PaymentRecord, type GradeRecord,
  type EnrollmentLevel, type PaymentMethod,
  levelLabel,
} from '@/lib/session'
import StudentDetail from '@/components/StudentDetail'
import NotificationPanel from '@/components/NotificationPanel'
import CurriculumPanel from '@/components/CurriculumPanel'
import TemplatesPanel from '@/components/TemplatesPanel'
import GradesPanel from '@/components/GradesPanel'
import StudentListPanel from '@/components/StudentListPanel'

type StudentTab = 'PROFILE' | 'PAYMENT' | 'GRADES' | 'NOTIFICATIONS'
type TeacherTab = 'STUDENTS' | 'CURRICULUM' | 'TEMPLATES' | 'GRADES' | 'NOTIFICATIONS'

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<StoredUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role === 'ADMIN') { router.replace('/admin'); return }
    if (!auth.userId) { router.replace('/sign-in'); return }
    let cancelled = false
    ;(async () => {
      // Pull the canonical user list from the API so the teacher dashboard
      // sees students enrolled from other devices.
      const users = await hydrateUsers().catch(() => getUsers())
      if (cancelled) return
      // Find the viewer's own record. The API scopes results so a TEACHER
      // viewer only gets STUDENT rows back — their own row won't be in the
      // list. Fall back to a synthetic StoredUser built from the auth token
      // so the dashboard still renders.
      const found = users.find(x => x.id === auth.userId)
      const synthetic: StoredUser = {
        id: auth.userId!,
        role: (auth.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'),
        email: auth.email,
        password: '',
        firstName: auth.firstName,
        createdAt: new Date().toISOString(),
      }
      setUser(found ?? synthetic)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  if (!ready || !user) return null
  return user.role === 'STUDENT' ? <StudentView user={user} /> : <TeacherView user={user} />
}

/* ────────────────────── STUDENT VIEW ────────────────────── */

function StudentView({ user }: { user: StoredUser }) {
  const [tab, setTab] = useState<StudentTab>('PROFILE')
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [grade, setGrade] = useState<GradeRecord | null>(null)

  useEffect(() => {
    setPayments(getPaymentsForStudent(user.id))
    setGrade(getGradeForStudent(user.id))
  }, [user.id])

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-6">
      <TabBar tabs={[
        { value: 'PROFILE',       label: 'Profile' },
        { value: 'PAYMENT',       label: 'Payment' },
        { value: 'GRADES',        label: 'Grades' },
        { value: 'NOTIFICATIONS', label: 'Notifications' },
      ]} active={tab} onChange={v => setTab(v as StudentTab)} />

      {tab === 'PROFILE' && <StudentDetail student={user} viewerRole="STUDENT" />}

      {tab === 'PAYMENT' && (
        <PaymentTab payments={payments} />
      )}

      {tab === 'GRADES' && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Grades</h2>
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
      )}

      {tab === 'NOTIFICATIONS' && (
        <NotificationPanel viewer={{
          role: 'STUDENT',
          level: user.level as EnrollmentLevel | undefined,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          userId: user.id,
        }} />
      )}
    </div>
  )
}

/* ────────────────────── TEACHER VIEW ────────────────────── */

function TeacherView({ user }: { user: StoredUser }) {
  const [tab, setTab] = useState<TeacherTab>('STUDENTS')

  const viewerName = useMemo(() => [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email, [user])

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>SCEI teacher account</div>
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">{viewerName}</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">{user.email}</p>
      </div>

      <TabBar tabs={[
        { value: 'STUDENTS',      label: 'Students' },
        { value: 'CURRICULUM',    label: 'Curriculum' },
        { value: 'TEMPLATES',     label: 'Templates' },
        { value: 'GRADES',        label: 'Grades' },
        { value: 'NOTIFICATIONS', label: 'Notifications' },
      ]} active={tab} onChange={v => setTab(v as TeacherTab)} />

      {tab === 'STUDENTS' && (
        <StudentListPanel viewer={{ role: 'TEACHER', userId: user.id, email: user.email, name: viewerName }} />
      )}

      {tab === 'CURRICULUM' && (
        <CurriculumPanel viewer={{ role: 'TEACHER', email: user.email }} />
      )}

      {tab === 'TEMPLATES' && (
        <TemplatesPanel viewer={{ role: 'TEACHER', email: user.email }} />
      )}

      {tab === 'GRADES' && (
        <GradesPanel viewer={{ role: 'TEACHER', userId: user.id }} />
      )}

      {tab === 'NOTIFICATIONS' && (
        <NotificationPanel viewer={{ role: 'TEACHER', email: user.email, name: viewerName, userId: user.id }} />
      )}
    </div>
  )
}

/* ─────────── tab bar ─────────── */

function TabBar({ tabs, active, onChange }: { tabs: Array<{ value: string; label: string }>; active: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl overflow-x-auto" style={{ fontFamily: 'var(--font-display)' }}>
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${active === t.value ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
        >{t.label}</button>
      ))}
    </div>
  )
}

/**
 * Student Payment tab. Branches on whether any payment record is in the
 * PAID state — abandoned PENDING checkouts shouldn't make the student
 * feel like they've paid. When nothing is paid, surface a prominent
 * "you still need to pay tuition" card with a CTA into /pay.
 */
function PaymentTab({ payments }: { payments: PaymentRecord[] }) {
  const hasPaid = payments.some(p => p.status === 'PAID')
  const pending = payments.filter(p => p.status === 'PENDING')

  if (!hasPaid) {
    return (
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-1">Tuition not yet paid</h2>
        <p className="text-sm text-[color:var(--mid-gray)] mb-5">
          {pending.length === 0
            ? 'You have not started a tuition payment yet. Choose your plan and pay securely through PayMongo.'
            : `You have ${pending.length} unfinished checkout${pending.length === 1 ? '' : 's'}. Tuition is still outstanding — please complete your payment via PayMongo.`}
        </p>
        <div className="rounded-xl p-5 border text-center" style={{ borderColor: '#fda4af', background: '#fff1f2' }}>
          <p className="text-[15px] text-[color:var(--narra)] font-semibold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            You still need to pay tuition.
          </p>
          <a href="/pay" className="btn-cta">Pay tuition fee →</a>
        </div>
        {pending.length > 0 && (
          <details className="mt-4">
            <summary className="text-[12.5px] text-[color:var(--mid-gray)] cursor-pointer select-none">Show unfinished checkout attempts ({pending.length})</summary>
            <PaymentTable payments={pending} />
          </details>
        )}
      </div>
    )
  }

  return (
    <div className="card-static">
      <h2 className="text-[18px] leading-tight mb-3">Payment history</h2>
      <PaymentTable payments={payments} />
      <div className="mt-4">
        <a href="/pay" className="btn-secondary">Make another payment</a>
      </div>
    </div>
  )
}

function PaymentTable({ payments }: { payments: PaymentRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
      <table className="w-full text-sm">
        <thead style={{ background: 'var(--paper-2)' }}>
          <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
            <th className="py-2 px-3">Date</th>
            <th className="py-2 px-3">Plan</th>
            <th className="py-2 px-3">Period</th>
            <th className="py-2 px-3 text-right">Total</th>
            <th className="py-2 px-3">Method</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Proof</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
              <td className="py-2.5 px-3 text-[12.5px]">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}</td>
              <td className="py-2.5 px-3">{p.plan}</td>
              <td className="py-2.5 px-3 text-[12.5px]">{p.period}</td>
              <td className="py-2.5 px-3 text-right font-mono">{fmt(p.tuitionAmount + p.miscAmount)}</td>
              <td className="py-2.5 px-3 text-[12.5px]">{paymentMethodLabel(p.method)}</td>
              <td className="py-2.5 px-3"><span className={`badge ${p.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{p.status}</span></td>
              <td className="py-2.5 px-3"><ProofCell payment={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function paymentMethodLabel(m: PaymentMethod | undefined): string {
  switch (m) {
    case 'PAYMONGO':        return 'PayMongo'
    case 'FRONT_DESK_CASH': return 'Front desk (cash)'
    case 'BANK_DEPOSIT':    return 'Bank deposit'
    default:                return '—'
  }
}

/** Bank-deposit proof file cell. Shows a View button that opens the
 *  stored blob in a new tab, or "—" when the row has no proof. */
function ProofCell({ payment }: { payment: PaymentRecord }) {
  async function open() {
    if (!payment.proofFileId) return
    const blob = await getFile(payment.proofFileId)
    if (!blob) { alert('Proof file not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  if (!payment.proofFileId) {
    return <span className="text-[11.5px] text-[color:var(--mid-gray)]">—</span>
  }
  return (
    <button type="button" className="btn-secondary text-xs" onClick={open} title={payment.proofFileName ?? 'Proof of payment'}>
      View proof
    </button>
  )
}

function Quarter({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--paper-3)', background: highlight ? 'var(--sage-tint)' : 'var(--paper-2)' }}>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
      <div className={`text-[22px] font-bold mt-1 ${highlight ? 'text-[color:var(--narra)]' : 'text-[color:var(--ink)]'}`} style={{ fontFamily: 'var(--font-display)' }}>{value ?? '—'}</div>
    </div>
  )
}

// (Silenced) ensures levelLabel is referenced even though it's only used in some import paths above.
void levelLabel
