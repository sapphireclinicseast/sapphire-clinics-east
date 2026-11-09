'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getUsers, hydrateUsers, getWaivers, saveWaiver,
  hydrateWaiverForStudent, syncLocalWaiversToServer,
  teacherAssignedPairs, hydrateAssignments,
  paymentStatusFor, currentPeriodPaymentStatusFor, inferPaymentPlanFor,
  hydrateFrontDeskPayments,
  uploadDocumentBlob,
  levelLabel, branchShortLabel, getHeadshotFor,
  type StoredUser, type EnrollmentLevel, type Branch, type WaiverRecord,
  type PaymentPlan,
} from '@/lib/session'
import { downloadWaiverPdf, generateWaiverPdf } from '@/lib/waiver-pdf'
import StudentDetail from './StudentDetail'
import SignaturePad from './SignaturePad'
import {
  Avatar, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CONTROL, CONTROL_STYLE, DashCard, EmptyState, Icon,
  LABEL, LABEL_STYLE, MODAL_BACKDROP, PRIMARY_STYLE, RowsSkeleton, SECONDARY_STYLE, StatusPill, Tag,
  TH_STYLE, displayName, initials, type Tone,
} from '@/components/hub/ui'

interface Props {
  viewer: { role: 'TEACHER' | 'ADMIN'; userId?: string; email: string; name?: string }
  /** Optional branch scope. When set (BRANCH_ADMIN viewer), the student
   *  list is filtered to only that branch's students. */
  viewerBranch?: Branch
}

/**
 * Used by /admin > Students and /profile > Students (teacher). Lists students,
 * lets the viewer click into a detail drawer. Teachers can also sign waivers
 * as witness directly from the drawer; regenerating the PDF afterwards.
 */
export default function StudentListPanel({ viewer, viewerBranch }: Props) {
  const [students, setStudents] = useState<StoredUser[]>([])
  const [selected, setSelected] = useState<StoredUser | null>(null)
  const [filter, setFilter] = useState('')
  const [witnessOpen, setWitnessOpen] = useState(false)
  const witnessFormRef = useRef<HTMLDivElement | null>(null)
  const [sceiAckOpen, setSceiAckOpen] = useState(false)
  const sceiAckFormRef = useRef<HTMLDivElement | null>(null)

  // When the teacher clicks "Sign as witness" or the admin clicks "Sign
  // as SCEI", the form mounts after the (long) StudentDetail block — so
  // it lands off-screen and looks like the button did nothing. Scroll it
  // into view on mount.
  useEffect(() => {
    if (!witnessOpen) return
    const t = window.setTimeout(() => {
      witnessFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [witnessOpen])
  useEffect(() => {
    if (!sceiAckOpen) return
    const t = window.setTimeout(() => {
      sceiAckFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [sceiAckOpen])
  const [waiver, setWaiver] = useState<WaiverRecord | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Lock body scroll while the modal is open so the page behind doesn't move.
  useEffect(() => {
    if (!selected) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selected])

  // Bumps every time hydrateFrontDeskPayments completes so the
  // PaymentStatusBadge column re-reads from the freshly-materialized
  // local cache. The value itself isn't used directly — it's the
  // setState that triggers the re-render which re-runs the inline
  // paymentStatusFor(s.id) call in the row map.
  const [paymentsRev, setPaymentsRev] = useState(0)
  void paymentsRev
  // Display only: true once the first server hydrate below has finished,
  // so an empty list shows a skeleton instead of "No students yet" while
  // a fresh device is still loading.
  const [loaded, setLoaded] = useState(false)

  function refresh() {
    // Disabled accounts (the main admin marked the student as no longer
    // attending) are hidden from this list across every viewer role.
    // The row is preserved in the Users tab so the admin can re-enable
    // it later, but for the active Students view we treat them as gone.
    let pool = getUsers().filter(u => u.role === 'STUDENT' && !u.disabledAt)
    if (viewer.role === 'TEACHER' && viewer.userId) {
      // Fail-CLOSED branch scoping. We restrict to the teacher's own
      // `branch` field FIRST, regardless of whether their per-grade
      // assignment cache has loaded. The previous version only filtered
      // when `teacherAssignedPairs()` returned non-empty results — so a
      // teacher whose localStorage hadn't hydrated yet (e.g. fresh
      // sign-in on a new device) saw EVERY student in the school,
      // leaking students from the other branch. The teacher's own
      // `branch` field is set at account creation and never null, so
      // this guard always applies.
      const me = getUsers().find(u => u.id === viewer.userId)
      if (me?.branch) {
        pool = pool.filter(u => u.branch === me.branch)
      }
      // Additional per-grade narrowing layered on top — only applies
      // when assignments are loaded. If assignments are still loading
      // we already have the branch filter as a safety net.
      const pairs = teacherAssignedPairs(viewer.userId)
      if (pairs.length > 0) {
        const allowed = new Set(pairs.map(p => `${p.branch}|${p.level}`))
        pool = pool.filter(u =>
          !!u.level && !!u.branch && allowed.has(`${u.branch as Branch}|${u.level as EnrollmentLevel}`),
        )
      }
    }
    // Branch admin scope — only show students enrolled in this branch.
    if (viewerBranch) {
      pool = pool.filter(u => u.branch === viewerBranch)
    }
    setStudents(pool)
  }
  useEffect(refresh, [viewer.role, viewer.userId, viewerBranch])

  // Hydrate users + assignments from the server so the very first
  // refresh() above doesn't run against a stale or empty cache. Without
  // this, a teacher signing in on a fresh device would briefly see no
  // students (or, if `viewer.userId` is null because their own record
  // hasn't loaded, would fall back to viewerBranch-only filtering).
  //
  // Also fire syncLocalWaiversToServer here so any WaiverRecord still
  // sitting in this device's localStorage gets pushed to the server
  // even when the admin / teacher has been signed in continuously
  // and hasn't bounced through signIn() since PR #174 deployed. This
  // is what lets the "Sign as SCEI" / "Sign as witness" buttons
  // appear for students whose original signing predated PR #169 (the
  // server-JSON persistence rollout).
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      hydrateUsers().catch(() => null),
      hydrateAssignments().catch(() => null),
      syncLocalWaiversToServer().catch(() => null),
    ]).then(() => { if (!cancelled) { refresh(); setLoaded(true) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.role, viewer.userId, viewerBranch])

  // Pull the latest server-side payment statuses on mount so the per-row
  // "Paid / Pending / No payment" badge reflects what the front desk has
  // actually confirmed, even if the local cache on this device had no
  // PaymentRecord for the student (e.g. they paid on a different device
  // or the front desk confirmed cash). hydrateFrontDeskPayments now
  // materializes missing local rows in addition to flipping statuses.
  useEffect(() => {
    void hydrateFrontDeskPayments().then(() => setPaymentsRev(r => r + 1))
  }, [])

  // When a student is selected, look up their waiver. First paint
  // from this device's local cache (instant), then hydrate from the
  // server's `waiver_record` blob (post PR #169). Without the server
  // hop, a main admin opening a student profile on a fresh device
  // sees a null waiver and the "Sign as SCEI" button never appears —
  // even when the parent + witness have already signed.
  useEffect(() => {
    if (!selected) { setWaiver(null); return }
    const local = getWaivers().find(x => x.studentEmail.toLowerCase() === selected.email.toLowerCase())
    setWaiver(local ?? null)
    let cancelled = false
    void hydrateWaiverForStudent(selected.id).then(remote => {
      if (cancelled || !remote) return
      setWaiver(remote)
    })
    return () => { cancelled = true }
  }, [selected])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return students
    return students.filter(s => {
      const hay = `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.email}`.toLowerCase()
      return hay.includes(q)
    })
  }, [students, filter])

  async function handleWitness(printedName: string, sig: string) {
    if (!waiver || !viewer.userId) return
    if (!printedName.trim()) { alert("Please type the witness's printed name."); return }
    if (!sig) { alert('Please sign before submitting.'); return }
    const now = new Date().toISOString()
    const updated: WaiverRecord = {
      ...waiver,
      witnessSig: {
        printedName,
        signatureDataUrl: sig,
        signedAt: now,
        teacherId: viewer.userId,
        teacherEmail: viewer.email,
      },
      updatedAt: now,
    }
    // Await so we can catch a sync failure and warn the signer — the
    // old fire-and-forget path let signatures die silently on the
    // teacher's device, so the main admin's view kept showing the
    // witness slot blank even though the teacher believed she'd signed.
    const res = await saveWaiver(updated)
    setWaiver(updated)
    setWitnessOpen(false)
    if (!res.ok) {
      alert(`Signed on this device, but the sync to the main admin failed:\n\n${res.error}\n\nTry signing in again from this device — your signature is safe locally and will retry pushing automatically.`)
    }
    try { downloadWaiverPdf(updated) } catch (e) { console.warn('PDF download failed', e) }
  }

  // Admin / branch admin signs the "Sapphire Clinics East, Inc. —
  // Acknowledged & Received" block. Only one signature is required
  // (main admin OR branch admin — whoever gets to it first). After
  // signing we regenerate the PDF and push it to the server blob
  // store so /admission shows the fully-countersigned copy.
  async function handleSceiAck(printedName: string, sig: string) {
    if (!waiver || !selected) return
    if (!printedName.trim()) { alert('Please type your printed name.'); return }
    if (!sig) { alert('Please sign before submitting.'); return }
    const now = new Date().toISOString()
    const updated: WaiverRecord = {
      ...waiver,
      sceiAckSig: {
        printedName,
        signatureDataUrl: sig,
        signedAt: now,
        signerEmail: viewer.email,
        signerRole: viewer.role === 'ADMIN' ? 'ADMIN' : undefined,
      },
      updatedAt: now,
    }
    const res = await saveWaiver(updated)
    setWaiver(updated)
    setSceiAckOpen(false)
    if (!res.ok) {
      alert(`Signed on this device, but the sync failed:\n\n${res.error}\n\nSign in again from this device to retry — your signature is safe locally.`)
    }
    // Regenerate the PDF + push to the server so the admission tracker
    // shows the fully-signed copy. Failure here is non-fatal — the
    // local record is still updated.
    try {
      const doc = generateWaiverPdf(updated)
      const blob = doc.output('blob')
      const file = new File([blob], 'parent-guardian-waiver.pdf', { type: 'application/pdf' })
      await uploadDocumentBlob(selected.id, 'parent_waiver', file)
    } catch (e) {
      console.warn('SCEI ACK PDF re-upload failed', e)
    }
  }

  const query = filter.trim()
  const selectedName = selected
    ? (displayName([selected.firstName, selected.lastName].filter(Boolean).join(' ')) || selected.email)
    : ''

  return (
    <>
      <DashCard
        flush
        title="Students"
        icon={<Icon name="student" size={15} />}
        description={viewer.role === 'TEACHER' ? 'Students assigned to your grade level(s).' : 'All enrolled students.'}
        action={(loaded || students.length > 0) ? (
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
            {query ? `${filtered.length} of ${students.length} students` : `${students.length} student${students.length === 1 ? '' : 's'}`}
          </span>
        ) : undefined}
      >
        {/* Toolbar: the panel's one filter is the name / email search. */}
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <label className="relative block w-full sm:max-w-[360px]">
            <span className="sr-only">Search students by name or email</span>
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              className={`${CONTROL} w-full pl-8`}
              style={CONTROL_STYLE}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search by name or email"
            />
          </label>
        </div>

        {!loaded && students.length === 0 ? (
          <RowsSkeleton rows={5} label="Loading students" />
        ) : filtered.length === 0 ? (
          students.length === 0
            ? <EmptyState icon="student" title="No students yet." hint={viewer.role === 'TEACHER' ? 'Students enrolled in your grade level(s) will show here.' : 'Enrolled students will show here.'} />
            : <EmptyState icon="search" title="No students match this search." hint="Try part of a first name, last name or email." />
        ) : (
          <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: 480 }}>
            {/* Column heads, wide screens only; phones get a stacked list. */}
            <div aria-hidden className={`hidden md:grid ${ROW_GRID} px-4 sm:px-5 py-2.5 sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wider`} style={TH_STYLE}>
              <span>Student</span>
              <span>Level · Branch · Plan</span>
              <span>Enrolled</span>
              <span>Payment</span>
              <span />
            </div>
            <ul>
              {filtered.map((s, n) => {
                // Current-period-aware: PAID only when the student's
                // current installment is settled. DUE = plan on file
                // but this month's / this half's payment hasn't landed
                // yet. Front-desk should be actively charging DUE rows.
                const ps = currentPeriodPaymentStatusFor(s.id)
                const branchLabel = branchShortLabel(s.branch)
                // Inferred from the student's latest PaymentRecord.
                // Undefined for students who have never had a payment
                // recorded (fresh enrolees) — front desk sees "—" as
                // a cue to ask the parent which cadence they picked.
                const plan: PaymentPlan | undefined = inferPaymentPlanFor(s.id)
                const planLabel = plan === 'ANNUAL' ? 'Annual' : plan === 'BIANNUAL' ? 'Bi-annual' : plan === 'MONTHLY' ? 'Monthly' : '—'
                const planTitle =
                  plan === 'MONTHLY'  ? 'Monthly — charge every 5th of the month' :
                  plan === 'BIANNUAL' ? 'Bi-annual — charge every 5th of June + 5th of December' :
                  plan === 'ANNUAL'   ? 'Annual — one lump sum, due 5th of June' :
                                        'No plan on file yet — parent hasn\'t recorded a payment. Ask which plan they picked.'
                const name = displayName([s.firstName, s.lastName].filter(Boolean).join(' ')) || '—'
                const enrolled = new Date(s.createdAt).toLocaleDateString()
                return (
                  <li key={s.id} style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                    <button
                      type="button"
                      onClick={() => setSelected(s)}
                      className={`w-full text-left grid grid-cols-[minmax(0,1fr)_auto] ${ROW_GRID} gap-x-3 gap-y-2 items-center px-4 sm:px-5 py-3 transition-colors hover:bg-[#FBF9F5] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]`}
                    >
                      {/* Who */}
                      <span className="flex items-center gap-3 min-w-0">
                        <StudentAvatar student={s} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-snug [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{name}</span>
                          <span className="block text-xs leading-snug [overflow-wrap:anywhere]" style={{ color: 'var(--mid-gray)' }}>{s.email}</span>
                        </span>
                      </span>
                      {/* Level / branch / plan. On phones this row also carries the enrolled date. */}
                      <span className="order-3 md:order-none col-span-2 md:col-span-1 flex flex-wrap items-center gap-1.5 min-w-0">
                        <Tag tone="brand">{s.level ? levelLabel(s.level) : '—'}</Tag>
                        <Tag tone="info">{branchLabel}</Tag>
                        <Tag tone="neutral" title={planTitle}>{plan ? planLabel : 'No plan'}</Tag>
                        <span className="md:hidden text-[11px]" style={{ color: 'var(--mid-gray)' }}>Enrolled {enrolled}</span>
                      </span>
                      <span className="hidden md:block text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>{enrolled}</span>
                      <span className="order-2 md:order-none justify-self-end md:justify-self-start">
                        <PaymentStatusBadge status={ps} />
                      </span>
                      <Icon name="chevronRight" size={16} className="hidden md:block" style={{ color: 'var(--mid-gray)' }} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </DashCard>

      {/* Detail popup — portaled to body so animate-fade-up ancestors don't trap fixed positioning */}
      {selected && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in"
          style={MODAL_BACKDROP}
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-detail-title"
            className="rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden min-w-0"
            style={{ background: 'var(--paper)' }}
            onClick={e => e.stopPropagation()}
          >
            <header
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-5 py-3"
              style={{ background: '#fff', borderBottom: '1px solid var(--light-gray)' }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => setSelected(null)}>
                  <Icon name="arrowLeft" size={13} /> Back to list
                </button>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-widest leading-none mb-1 hidden sm:block" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Student profile</p>
                  <h2 id="student-detail-title" className="text-[14px] font-bold leading-tight truncate tracking-normal" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                    {selectedName}
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {viewer.role === 'TEACHER' && waiver && !waiver.witnessSig && (
                  <button type="button" className={`${BTN_SM} text-white hover:opacity-90`} style={PRIMARY_STYLE} onClick={() => setWitnessOpen(true)}>
                    <Icon name="edit" size={13} /> Sign as witness
                  </button>
                )}
                {viewer.role === 'TEACHER' && waiver?.witnessSig && (
                  <StatusPill tone="success">Waiver witness signed</StatusPill>
                )}
                {viewer.role === 'ADMIN' && waiver && !waiver.sceiAckSig && (
                  <button
                    type="button"
                    className={`${BTN_SM} text-white hover:opacity-90`}
                    style={PRIMARY_STYLE}
                    onClick={() => setSceiAckOpen(true)}
                    title="Sign the 'Sapphire Clinics East, Inc. — Acknowledged & Received' block. Either main admin or a branch admin can sign — one signature is enough."
                  ><Icon name="edit" size={13} /> Sign as SCEI</button>
                )}
                {viewer.role === 'ADMIN' && waiver?.sceiAckSig && (
                  <StatusPill tone="success" title={`Signed by ${waiver.sceiAckSig.signerEmail ?? 'admin'} on ${new Date(waiver.sceiAckSig.signedAt).toLocaleDateString()}`}>SCEI countersigned</StatusPill>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                  className="w-8 h-8 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teal)]"
                  style={{ color: 'var(--mid-gray)' }}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-4 min-w-0">
              <StudentDetail
                student={selected}
                viewerRole={viewer.role}
                onChange={() => {
                  refresh()
                  // Also re-pick the now-fresh student record so the popup shows the new data.
                  const fresh = getUsers().find(u => u.id === selected.id)
                  if (fresh) setSelected(fresh)
                }}
              />

              {witnessOpen && waiver && (
                <div ref={witnessFormRef}>
                  <WitnessForm onCancel={() => setWitnessOpen(false)} onSign={handleWitness} defaultName={viewer.name} />
                </div>
              )}
              {sceiAckOpen && waiver && (
                <div ref={sceiAckFormRef}>
                  <SceiAckForm onCancel={() => setSceiAckOpen(false)} onSign={handleSceiAck} defaultName={viewer.name} />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Student / Level · Branch · Plan / Enrolled / Payment / chevron, from md up. */
const ROW_GRID = 'md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_6.5rem_8.5rem_1rem] md:gap-x-4'

/** The 1x1 headshot cached on this device, else initials. */
function StudentAvatar({ student }: { student: StoredUser }) {
  const shot = getHeadshotFor(student.id)
  if (shot?.dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={shot.dataUrl} alt="" aria-hidden className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid var(--light-gray)' }} />
    )
  }
  const text = (student.firstName || student.lastName)
    ? initials(student.firstName, student.lastName)
    : (student.email.trim()[0] ?? '?').toUpperCase()
  return <Avatar text={text} size={36} />
}

const PAYMENT_STATUS: Record<'PAID' | 'DUE' | 'PENDING' | 'NONE', { tone: Tone; label: string; title?: string }> = {
  PAID:    { tone: 'success', label: 'Paid' },
  DUE:     { tone: 'warn',    label: 'Due', title: 'Current installment not yet paid — charge this student.' },
  PENDING: { tone: 'info',    label: 'Pending' },
  NONE:    { tone: 'neutral', label: 'No payment yet' },
}

function PaymentStatusBadge({ status }: { status: 'PAID' | 'DUE' | 'PENDING' | 'NONE' }) {
  const p = PAYMENT_STATUS[status]
  return <StatusPill tone={p.tone} title={p.title}>{p.label}</StatusPill>
}

function SignatureFields({ idPrefix, name, setName, setSig }: { idPrefix: string; name: string; setName: (v: string) => void; setSig: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-name`} className={LABEL} style={LABEL_STYLE}>Printed name</label>
        <input id={`${idPrefix}-name`} className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <span className={LABEL} style={LABEL_STYLE}>Signature</span>
        <SignaturePad onChange={setSig} height={150} />
      </div>
    </div>
  )
}

function SignFooter({ onCancel, onSign }: { onCancel: () => void; onSign: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onCancel}>Cancel</button>
      <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={onSign}>Sign &amp; regenerate PDF</button>
    </div>
  )
}

function WitnessForm({ onCancel, onSign, defaultName }: { onCancel: () => void; onSign: (name: string, sig: string) => void; defaultName?: string }) {
  const [name, setName] = useState(defaultName ?? '')
  const [sig, setSig] = useState('')
  return (
    <DashCard
      title="Witness signature (assigned SCEI teacher)"
      icon={<Icon name="edit" size={15} />}
      footer={<SignFooter onCancel={onCancel} onSign={() => onSign(name, sig)} />}
    >
      <SignatureFields idPrefix="witness" name={name} setName={setName} setSig={setSig} />
    </DashCard>
  )
}

function SceiAckForm({ onCancel, onSign, defaultName }: { onCancel: () => void; onSign: (name: string, sig: string) => void; defaultName?: string }) {
  const [name, setName] = useState(defaultName ?? '')
  const [sig, setSig] = useState('')
  return (
    <DashCard
      title={<>Sapphire Clinics East, Inc. — Acknowledged &amp; Received</>}
      icon={<Icon name="shield" size={15} />}
      description="Either the main admin or a branch admin can sign — one signature is enough. The PDF is regenerated and pushed to the admission tracker."
      footer={<SignFooter onCancel={onCancel} onSign={() => onSign(name, sig)} />}
    >
      <SignatureFields idPrefix="scei-ack" name={name} setName={setName} setSig={setSig} />
    </DashCard>
  )
}
