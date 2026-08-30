'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Chat from '@/components/Chat'
import Stars from '@/components/Stars'

interface B {
  id: string; date: string; startTime: string; city: string; status: string; amount: number
  providerName: string; profession: string; proposedDate: string | null; proposedStartTime: string | null
  rating: number | null; rated: boolean
}
interface WalletTxn { id: string; amount: number; type: string; note: string | null; createdAt: string }
interface Wallet { balance: number; txns: WalletTxn[] }
interface Consult { id: string; date: string; startTime: string; status: string; mode: string; doctorName: string; clinic: string | null; referralIssued: boolean }
const LEDGER_LABEL: Record<string, string> = { REFUND: 'Refund', REDEEM: 'Applied to booking', ADJUSTMENT: 'Adjustment' }
const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const STATUS: Record<string, [string, string]> = {
  PENDING: ['Awaiting payment', 'bg-amber-100 text-amber-800'], PAID: ['Paid · awaiting therapist', 'bg-sky-100 text-sky-800'],
  CONFIRMED: ['Confirmed', 'bg-emerald-50 text-emerald-700'], COMPLETED: ['Completed', 'bg-emerald-50 text-emerald-700'], CANCELLED: ['Cancelled', 'bg-red-50 text-red-700'],
}

export default function PatientBookings({ bookings, wallet, consults = [] }: { bookings: B[]; wallet: Wallet; consults?: Consult[] }) {
  const router = useRouter()
  const [openChat, setOpenChat] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showLedger, setShowLedger] = useState(false)
  const [rateFor, setRateFor] = useState<string | null>(null)
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [reviewText, setReviewText] = useState('')

  async function cancelBooking(id: string) {
    if (!confirm('Cancel this booking? Any amount paid is refunded to your Nickel wallet.')) return
    setBusy(id)
    try { const r = await fetch('/api/patient/cancel-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id }) }); if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); router.refresh() }
    catch { /* noop */ } finally { setBusy(null) }
  }
  async function cancelConsult(id: string) {
    if (!confirm('Cancel this consult? Any amount paid is refunded to your Nickel wallet.')) return
    setBusy(id)
    try { const r = await fetch('/api/patient/cancel-consult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consultId: id }) }); if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); router.refresh() }
    catch { /* noop */ } finally { setBusy(null) }
  }

  async function submitRating(id: string) {
    setBusy(id)
    try {
      const r = await fetch('/api/patient/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, rating: stars, review: reviewText }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Failed')
      setRateFor(null); setStars(0); setHover(0); setReviewText(''); router.refresh()
    } catch { /* noop */ } finally { setBusy(null) }
  }

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
      {consults.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-[15px] font-semibold text-[color:var(--ink)]">Doctor consults</h2>
          <div className="space-y-2">
            {consults.map((c) => (
              <div key={c.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-[color:var(--ink)]">{c.doctorName}</div>
                    <div className="text-[12px] text-[color:var(--slate)]">{c.mode === 'TELECONSULT' ? 'Teleconsult (video)' : 'In-person consult'}</div>
                    <div className="mt-1 text-[13.5px] text-[color:var(--ink)]">{fmtDate(c.date)} · {fmtTime(c.startTime)}</div>
                    {c.mode === 'IN_PERSON' && c.clinic && <div className="text-[12px] text-[color:var(--slate)]">{c.clinic}</div>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${(STATUS[c.status] ?? ['', ''])[1]}`}>{(STATUS[c.status] ?? [c.status])[0]}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {c.mode === 'TELECONSULT' && (c.status === 'CONFIRMED' || c.status === 'PAID') && (
                    <a href={`/consult/${c.id}/room`} className="rounded-lg bg-[color:var(--steel)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[color:var(--steel-deep)]">Join teleconsult</a>
                  )}
                  {c.referralIssued && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Referral issued — use it when booking PT</span>}
                  {['PAID', 'CONFIRMED'].includes(c.status) && <button onClick={() => cancelConsult(c.id)} disabled={busy === c.id} className="text-[12.5px] font-medium text-[color:var(--slate)] hover:text-red-600">Cancel</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookings.length === 0 && consults.length === 0 ? (
        <div className="card text-center"><p className="text-[13px] text-[color:var(--slate)]">You have no bookings yet.</p><a href="/book" className="btn-primary mt-3 inline-block">Book a visit</a></div>
      ) : bookings.length === 0 ? null : (
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
                <div className="mt-3 flex items-center gap-4">
                  <button onClick={() => setOpenChat(openChat === b.id ? null : b.id)} className="text-[13px] font-semibold text-[color:var(--steel)] hover:underline">
                    {openChat === b.id ? 'Hide messages' : 'Message therapist'}
                  </button>
                  {['PENDING', 'PAID', 'CONFIRMED'].includes(b.status) && (
                    <button onClick={() => cancelBooking(b.id)} disabled={busy === b.id} className="text-[13px] font-medium text-[color:var(--slate)] hover:text-red-600">Cancel booking</button>
                  )}
                </div>
              )}
              {openChat === b.id && <div className="mt-2"><Chat bookingId={b.id} meRole="PATIENT" otherName={b.providerName} /></div>}

              {/* Rate your therapist — after a completed visit */}
              {b.status === 'COMPLETED' && (
                <div className="mt-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-3">
                  {b.rated ? (
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold text-[color:var(--ink)]">Your rating</span>
                      <Stars value={b.rating ?? 0} />
                      <span className="text-[color:var(--slate)]">{b.rating}/5</span>
                    </div>
                  ) : rateFor === b.id ? (
                    <div>
                      <div className="text-[13px] font-semibold text-[color:var(--ink)]">Rate your therapist</div>
                      <div className="mt-1.5 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} type="button" aria-label={`${n} star${n === 1 ? '' : 's'}`}
                            onMouseEnter={() => setHover(n)} onClick={() => setStars(stars === n ? 0 : n)}
                            className="p-0.5">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill={(hover || stars) >= n ? '#F5A623' : 'none'} stroke={(hover || stars) >= n ? '#F5A623' : 'var(--line-2)'} strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.81 3.06 1.11-6.47L2.6 9.35l6.5-.95L12 2.5Z" /></svg>
                          </button>
                        ))}
                        <span className="ml-2 text-[13px] font-semibold text-[color:var(--slate)]">{stars}/5</span>
                      </div>
                      <textarea className="input mt-2 min-h-[56px] !text-[13px]" value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Add a comment (optional)" />
                      <div className="mt-2 flex gap-2">
                        <button className="btn-primary !px-3 !py-1.5 !text-[12.5px]" disabled={busy === b.id} onClick={() => submitRating(b.id)}>{busy === b.id ? 'Saving…' : 'Submit rating'}</button>
                        <button className="text-[12.5px] font-medium text-[color:var(--slate)] hover:underline" onClick={() => { setRateFor(null); setStars(0); setReviewText('') }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setRateFor(b.id); setStars(0); setHover(0); setReviewText('') }} className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--steel)] hover:underline">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.81 3.06 1.11-6.47L2.6 9.35l6.5-.95L12 2.5Z" /></svg>
                      Rate your therapist
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
