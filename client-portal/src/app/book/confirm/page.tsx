'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { clearSession, getSession } from '@/lib/session'
import { createBooking, InvalidTokenError, type SlotChoice } from '@/lib/api'
import { branchLabel } from '@/lib/branch-label'
import { BookingSteps } from '@/components/booking/BookingSteps'
import {
  PageHeader, DashCard, Banner, Icon,
  BTN_PRIMARY, BTN_SECONDARY, PRIMARY_STYLE, SECONDARY_STYLE, CONTROL_STYLE, TEXTAREA, LABEL, LABEL_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

export default function BookConfirmPage() {
  return (
    <Suspense fallback={<div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>}>
      <BookConfirmInner />
    </Suspense>
  )
}

function BookConfirmInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const branch = sp.get('branch') ?? ''
  const department = sp.get('department') ?? ''
  const therapistInitials = sp.get('therapistInitials') ?? ''
  const therapistSex = sp.get('therapistSex') ?? ''
  const picksRaw = sp.get('picks') ?? '[]'

  // OT & SLP are offered online as teletherapy only.
  const teleOnly = department === 'OT' || department === 'SLP'
  const [picks, setPicks] = useState<SlotChoice[]>([])
  const [isTele, setIsTele] = useState(teleOnly)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (!getSession()) router.push('/') }, [router])
  useEffect(() => {
    try { setPicks(JSON.parse(picksRaw) as SlotChoice[]) } catch { setPicks([]) }
  }, [picksRaw])

  async function submit() {
    const session = getSession()
    if (!session) { router.push('/'); return }
    if (picks.length === 0) { setErr('Please go back and pick at least one slot.'); return }
    setBusy(true); setErr(null)
    try {
      const res = await createBooking({
        token: session.token,
        branch, department,
        isTeletherapy: teleOnly || isTele,
        notes: notes.trim() || undefined,
        choices: picks,
      })
      // New flow: backend already created the PayMongo Link. Bounce straight
      // to checkout. For zero-downpayment services (Orthosis at SBEA) we
      // skip checkout and route the patient to their confirmed bookings.
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl
        return
      }
      router.push('/bookings?new=1')
    } catch (e) {
      if (e instanceof InvalidTokenError) {
        clearSession()
        router.push('/?expired=1')
        return
      }
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  const branchName = branchLabel(branch)
  const sexIcon = therapistSex === 'M' ? <span style={{ color: 'var(--mid-gray)' }}>♂ Male</span> : therapistSex === 'F' ? <span style={{ color: 'var(--mid-gray)' }}>♀ Female</span> : null

  function fmtDate(d: string) {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 min-w-0 animate-fade-up">
      <BookingSteps steps={['Service', 'Slot', 'Confirm']} active={3} />

      <PageHeader
        eyebrow="Book an appointment"
        title="Confirm your request"
        description={`Review your ${picks.length} choice${picks.length === 1 ? '' : 's'}. Front desk will pick one to confirm and email you a payment link.`}
      />

      <DashCard title="Request summary" icon={<Icon name="file" size={16} />}>
        <dl className="space-y-2.5 text-sm">
          <Row label="Branch" value={branchName} />
          <Row label="Service" value={department.replace(/_/g, ' ')} />
          <Row label="Therapist" value={<span className="inline-flex items-center gap-1.5">{therapistInitials} {sexIcon}</span>} />
        </dl>
      </DashCard>

      <DashCard title="Preferred slots (in order)" icon={<Icon name="clock" size={16} />}>
        <ul className="space-y-2">
          {picks.map((p, i) => (
            <li key={`${p.date}-${p.startTime}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[11px] font-bold text-white shrink-0"
                style={{ fontFamily: 'var(--font-display)', background: i === 0 ? 'var(--deep-teal)' : i === 1 ? 'var(--teal)' : 'var(--mid-gray)' }}>
                {i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>
                  {p.startTime} – {p.endTime}
                </div>
                <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {fmtDate(p.date)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </DashCard>

      <DashCard title="Details for the clinic" icon={<Icon name="edit" size={16} />}>
        <label
          className={`flex items-start gap-3 p-3.5 rounded-xl mb-4 transition-colors ${teleOnly ? 'cursor-default' : 'cursor-pointer hover:bg-[color:var(--paper)]'}`}
          style={teleOnly || isTele
            ? { background: 'var(--moss-tint)', border: '1.5px solid var(--teal)' }
            : { background: '#fff', border: '1.5px solid var(--light-gray)' }}
        >
          <input
            type="checkbox"
            checked={teleOnly ? true : isTele}
            disabled={teleOnly}
            onChange={(e) => setIsTele(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[color:var(--teal)]"
          />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>
              {teleOnly ? 'Teletherapy session' : 'Request teletherapy'}
            </span>
            <span className="block text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
              {teleOnly
                ? 'This service is offered online as teletherapy. You’ll receive a secure meeting link once the front desk approves and the downpayment is received.'
                : 'You’ll receive a secure meeting link once the front desk approves and downpayment is received.'}
            </span>
          </span>
        </label>

        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Notes for the clinic (optional)</span>
          <textarea
            className={`${TEXTAREA} min-h-[100px] resize-y`}
            style={CONTROL_STYLE}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="Anything the therapist should know? E.g., referral doctor, main concerns, prior diagnoses…"
          />
        </label>
      </DashCard>

      {err && <div className="animate-fade-in"><Banner tone="error">{err}</Banner></div>}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
        <button type="button" onClick={() => router.back()} className={`${BTN_SECONDARY} max-sm:h-11`} style={SECONDARY_STYLE}>← Back</button>
        <button type="button" onClick={submit} disabled={busy || picks.length === 0} className={`${BTN_PRIMARY} max-sm:h-11`} style={PRIMARY_STYLE}>
          {busy ? 'Submitting…' : <>Submit request <Icon name="chevronRight" size={16} /></>}
        </button>
      </div>
      <p className="text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
        Your slot is reserved only after the front desk confirms and downpayment is received.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className={`${LABEL} !mb-0 pt-0.5`} style={LABEL_STYLE}>{label}</dt>
      <dd className="font-medium text-right min-w-0 break-words" style={{ color: 'var(--charcoal)' }}>{value}</dd>
    </div>
  )
}
