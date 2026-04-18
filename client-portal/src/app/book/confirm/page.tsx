'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createBooking } from '@/lib/api'

export default function BookConfirmPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
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
  const date = sp.get('date') ?? ''
  const startTime = sp.get('startTime') ?? ''
  const endTime = sp.get('endTime') ?? ''

  const [isTele, setIsTele] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!getSession()) router.push('/')
  }, [router])

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
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Confirm your booking</h1>
        <div className="text-xs text-slate-500">Step 3 of 3</div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4 text-sm space-y-1">
        <div><span className="text-slate-500">Branch:</span> {branch === 'SBEA' ? 'Sandbox East' : 'Sandbox Greenhills'}</div>
        <div><span className="text-slate-500">Service:</span> {department}</div>
        <div><span className="text-slate-500">Therapist:</span> {initials}</div>
        <div><span className="text-slate-500">Date:</span> {date}</div>
        <div><span className="text-slate-500">Time:</span> {startTime} – {endTime}</div>
      </div>

      <label className="flex items-center gap-2 text-sm mb-3">
        <input type="checkbox" checked={isTele} onChange={(e) => setIsTele(e.target.checked)} />
        <span>I&apos;d like this to be a teletherapy session</span>
      </label>

      <label className="block text-sm mb-4">
        <span className="text-slate-700">Notes for the clinic (optional)</span>
        <textarea
          className="mt-1 w-full border rounded-lg p-2"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </label>

      {err && <div className="text-rose-600 text-sm mb-2">{err}</div>}

      <div className="flex gap-2">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg border text-sm"
        >Back</button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-5 py-2 rounded-lg bg-[color:var(--scei-orange)] text-white font-medium disabled:opacity-50"
        >{busy ? 'Submitting…' : 'Request appointment'}</button>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Your request will be reviewed by our front desk. You&apos;ll receive an email with the payment link once approved.
      </p>
    </div>
  )
}
