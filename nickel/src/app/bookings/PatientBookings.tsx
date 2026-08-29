'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Chat from '@/components/Chat'

interface B {
  id: string; date: string; startTime: string; city: string; status: string; amount: number
  providerName: string; profession: string; proposedDate: string | null; proposedStartTime: string | null
}
const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const STATUS: Record<string, [string, string]> = {
  PENDING: ['Awaiting payment', 'bg-amber-100 text-amber-800'], PAID: ['Paid · awaiting therapist', 'bg-sky-100 text-sky-800'],
  CONFIRMED: ['Confirmed', 'bg-emerald-50 text-emerald-700'], COMPLETED: ['Completed', 'bg-emerald-50 text-emerald-700'], CANCELLED: ['Cancelled', 'bg-red-50 text-red-700'],
}

export default function PatientBookings({ bookings }: { bookings: B[] }) {
  const router = useRouter()
  const [openChat, setOpenChat] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function respond(id: string, accept: boolean) {
    setBusy(id)
    try {
      const r = await fetch('/api/patient/respond-proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, accept }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Failed')
      router.refresh()
    } catch { /* noop */ } finally { setBusy(null) }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <h1 className="mb-1 text-[24px] font-semibold text-[color:var(--ink)]">My bookings</h1>
      <p className="mb-4 text-[13px] text-[color:var(--slate)]">Your home therapy visits, messages with your therapist, and any rescheduling requests.</p>
      {bookings.length === 0 ? (
        <div className="card text-center"><p className="text-[13px] text-[color:var(--slate)]">You have no bookings yet.</p><a href="/book" className="btn-primary mt-3 inline-block">Book a visit</a></div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-[color:var(--ink)]">{b.providerName}</div>
                  <div className="text-[12px] text-[color:var(--slate)]">{PROF[b.profession] ?? b.profession}</div>
                  <div className="mt-1 text-[13.5px] text-[color:var(--ink)]">{fmtDate(b.date)} · {fmtTime(b.startTime)} · {b.city}</div>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${(STATUS[b.status] ?? ['', ''])[1]}`}>{(STATUS[b.status] ?? [b.status])[0]}</span>
                  <div className="mt-1 text-[13px] font-bold text-[color:var(--steel-deep)]">{peso(b.amount)}</div>
                </div>
              </div>

              {b.proposedDate && b.proposedStartTime && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[13px] font-semibold text-amber-900">Your therapist proposed a new time</p>
                  <p className="mt-0.5 text-[13.5px] text-amber-900">{fmtDate(b.proposedDate)} · {fmtTime(b.proposedStartTime)} <span className="text-[12px] text-amber-700">(was {fmtDate(b.date)} · {fmtTime(b.startTime)})</span></p>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700" disabled={busy === b.id} onClick={() => respond(b.id, true)}>Accept new time</button>
                    <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-white" disabled={busy === b.id} onClick={() => respond(b.id, false)}>Keep original</button>
                  </div>
                </div>
              )}

              {b.status !== 'CANCELLED' && (
                <div className="mt-3">
                  <button onClick={() => setOpenChat(openChat === b.id ? null : b.id)} className="text-[13px] font-semibold text-[color:var(--steel)] hover:underline">
                    {openChat === b.id ? 'Hide messages' : 'Message therapist'}
                  </button>
                  {openChat === b.id && <div className="mt-2"><Chat bookingId={b.id} meRole="PATIENT" otherName={b.providerName} /></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
