'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Chat from '@/components/Chat'

interface B {
  id: string; date: string; startTime: string; city: string; status: string; amount: number
  providerName: string; profession: string; proposedDate: string | null; proposedStartTime: string | null
}
interface WalletTxn { id: string; amount: number; type: string; note: string | null; createdAt: string }
interface Wallet { balance: number; txns: WalletTxn[] }
const LEDGER_LABEL: Record<string, string> = { REFUND: 'Refund', REDEEM: 'Applied to booking', ADJUSTMENT: 'Adjustment' }
const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const STATUS: Record<string, [string, string]> = {
  PENDING: ['Awaiting payment', 'bg-amber-100 text-amber-800'], PAID: ['Paid · awaiting therapist', 'bg-sky-100 text-sky-800'],
  CONFIRMED: ['Confirmed', 'bg-emerald-50 text-emerald-700'], COMPLETED: ['Completed', 'bg-emerald-50 text-emerald-700'], CANCELLED: ['Cancelled', 'bg-red-50 text-red-700'],
}

export default function PatientBookings({ bookings, wallet }: { bookings: B[]; wallet: Wallet }) {
  const router = useRouter()
  const [openChat, setOpenChat] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showLedger, setShowLedger] = useState(false)

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

      {(wallet.balance > 0 || wallet.txns.length > 0) && (
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v1"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 12v-2a1 1 0 0 0-1-1h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1Z"/></svg>
                Nickel wallet
              </div>
              <div className="mt-1 text-[26px] font-bold text-[color:var(--steel)]">₱{Math.round(wallet.balance).toLocaleString('en-PH')}</div>
              <div className="text-[12px] text-[color:var(--slate)]">store credit — applied automatically at checkout</div>
            </div>
            <a href="/book" className="btn-primary !px-4 !py-2 !text-[13px]">Book a visit</a>
          </div>
          {wallet.txns.length > 0 && (
            <>
              <button onClick={() => setShowLedger((s) => !s)} className="mt-3 text-[12.5px] font-semibold text-[color:var(--steel)] hover:underline">{showLedger ? 'Hide activity' : 'View activity'}</button>
              {showLedger && (
                <div className="mt-2 divide-y divide-[color:var(--line)] border-t border-[color:var(--line)]">
                  {wallet.txns.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 text-[13px]">
                      <span className="text-[color:var(--slate)]">{t.note || LEDGER_LABEL[t.type] || t.type} <span className="text-[11px] text-[color:var(--muted)]">· {fmtDate(t.createdAt.slice(0, 10))}</span></span>
                      <span className={`font-semibold tabular-nums ${t.amount < 0 ? 'text-[color:var(--slate)]' : 'text-emerald-700'}`}>{t.amount < 0 ? '−' : '+'}{peso(Math.abs(t.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
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
                    <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-white" disabled={busy === b.id} onClick={() => { if (confirm('Decline the new time? This cancels the visit and refunds the fee to your Nickel wallet.')) respond(b.id, false) }}>Decline &amp; refund</button>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-amber-700">Declining cancels the visit and refunds the fee to your Nickel wallet.</p>
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
