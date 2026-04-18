'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createBooking } from '@/lib/api'

export default function BookConfirmPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[color:var(--mid-gray)]">Loading…</div>}>
      <BookConfirmInner />
    </Suspense>
  )
}

function BookConfirmInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const branch = sp.get('branch') ?? ''
  const department = sp.get('department') ?? ''
  const staffId = sp.get('staffId') ?? ''
  const initials = sp.get('initials') ?? ''
  const sex = sp.get('sex') ?? ''
  const date = sp.get('date') ?? ''
  const startTime = sp.get('startTime') ?? ''
  const endTime = sp.get('endTime') ?? ''

  const [isTele, setIsTele] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (!getSession()) router.push('/') }, [router])

  async function submit() {
    const session = getSession()
    if (!session) { router.push('/'); return }
    setBusy(true); setErr(null)
    try {
      await createBooking({
        token: session.token,
        staffId, branch, department, date, startTime, endTime,
        isTeletherapy: isTele,
        notes: notes.trim() || undefined,
      })
      router.push('/bookings?new=1')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const dateNice = date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''
  const branchName = branch === 'SBEA' ? 'Sandbox East' : 'Sandbox Greenhills'

  return (
    <div className="animate-fade-up max-w-2xl">
      <StepHeader active={3} />

      <div className="card-static">
        <h1 className="text-[28px] text-[color:var(--deep-teal)] leading-tight">Confirm your booking</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-6">Review the details, then submit your request. Front desk will approve and send you a payment link.</p>

        {/* Summary card */}
        <div className="rounded-2xl border border-[color:var(--light-gray)] bg-gradient-to-br from-[color:var(--pale-teal)] to-white p-5 mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[color:var(--bright-teal)]/10 blur-2xl -translate-y-8 translate-x-8 pointer-events-none"></div>
          <div className="relative space-y-3 text-sm">
            <Row label="Branch" value={branchName} />
            <Row label="Service" value={department} />
            <Row label="Therapist" value={<span className="inline-flex items-center gap-1.5">{initials}{sex === 'M' ? <span className="text-sky-600">♂</span> : sex === 'F' ? <span className="text-pink-600">♀</span> : null}</span>} />
            <Row label="Date" value={dateNice} />
            <Row label="Time" value={`${startTime} – ${endTime}`} />
          </div>
        </div>

        {/* Options */}
        <label className="flex items-start gap-3 p-4 rounded-2xl border border-[color:var(--light-gray)] hover:border-[color:var(--bright-teal)] cursor-pointer transition-colors mb-4">
          <input type="checkbox" checked={isTele} onChange={(e) => setIsTele(e.target.checked)} className="mt-1 w-4 h-4 accent-[color:var(--teal)]" />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-[color:var(--deep-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Request teletherapy</span>
            <span className="block text-xs text-[color:var(--mid-gray)] mt-0.5">You&apos;ll receive a secure meeting link once the front desk approves and downpayment is received.</span>
          </span>
        </label>

        <label className="block mb-6">
          <span className="label">Notes for the clinic (optional)</span>
          <textarea
            className="input min-h-[100px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="Anything the therapist should know? E.g., referral doctor, main concerns, prior diagnoses…"
          />
        </label>

        {err && <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">{err}</div>}

        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()} className="btn-secondary">← Back</button>
          <button onClick={submit} disabled={busy} className="btn-cta">
            {busy ? 'Submitting…' : 'Request appointment'}
          </button>
        </div>
        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-4 text-center" style={{ fontFamily: 'var(--font-display)' }}>
          Your slot is reserved only after downpayment is received.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[color:var(--mid-gray)] uppercase text-[11px] tracking-[0.08em] font-semibold pt-0.5" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
      <span className="text-[color:var(--charcoal)] font-medium text-right">{value}</span>
    </div>
  )
}

function StepHeader({ active }: { active: 1 | 2 | 3 }) {
  const steps = ['Service', 'Slot', 'Confirm']
  return (
    <div className="flex items-center gap-3 mb-6" style={{ fontFamily: 'var(--font-display)' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const state = n === active ? 'active' : n < active ? 'done' : 'todo'
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`step-dot ${state === 'active' ? 'step-dot-active' : state === 'done' ? 'step-dot-done' : ''}`}></span>
              <span className={`text-[11.5px] uppercase tracking-[0.12em] ${state === 'active' ? 'text-[color:var(--gold)] font-semibold' : state === 'done' ? 'text-[color:var(--teal)]' : 'text-[color:var(--mid-gray)]'}`}>
                {n}. {label}
              </span>
            </div>
            {i < steps.length - 1 && <span className="w-6 h-px bg-[color:var(--light-gray)]"></span>}
          </div>
        )
      })}
    </div>
  )
}
