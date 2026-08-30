'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface P { id: string; firstName: string; lastName: string }
interface Pr extends P { rate: number | null }
interface Bk { id: string; date: string; startTime: string; status: string; patientName: string; providerName: string; amount: number; routing: string | null; collection: string | null; therapistCut: number | null; payoutStatus: string; checkoutUrl: string | null }

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const STATUS: Record<string, [string, string]> = { PENDING: ['Awaiting payment', 'bg-amber-100 text-amber-800'], PAID: ['Paid · to confirm', 'bg-sky-100 text-sky-800'], CONFIRMED: ['Confirmed', 'bg-emerald-50 text-emerald-700'], COMPLETED: ['Completed', 'bg-emerald-50 text-emerald-700'], CANCELLED: ['Cancelled', 'bg-red-50 text-red-700'] }

export default function VisitsManager({ verified, city, patients, providers, bookings }: { verified: boolean; city: string; patients: P[]; providers: Pr[]; bookings: Bk[] }) {
  const router = useRouter()
  const [f, setF] = useState({ patientId: '', providerId: '', date: '', startTime: '', routing: 'THERAPIST_DIRECT', collection: 'ONLINE', price: '', therapistCut: '', notes: '' })
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }))
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [checkout, setCheckout] = useState<string | null>(null)

  async function arrange() {
    setBusy(true); setErr(null); setCheckout(null)
    try {
      const r = await fetch('/api/clinic/arrange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, price: f.price === '' ? undefined : Number(f.price), therapistCut: f.therapistCut === '' ? undefined : Number(f.therapistCut) }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setF({ ...f, date: '', startTime: '', price: '', therapistCut: '', notes: '' })
      if (d.checkoutUrl) setCheckout(d.checkoutUrl)
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }
  async function payTherapist(bookingId: string) {
    setActing(bookingId)
    try { const r = await fetch('/api/clinic/pay-therapist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId }) }); if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); router.refresh() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setActing(null) }
  }

  return (
    <div className="space-y-4">
      {!verified && <div className="card text-[13px] text-[color:var(--slate)]">Your clinic must be verified before you can arrange visits.</div>}

      {verified && (
        <section className="card space-y-3">
          <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Arrange a home visit</h2>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}
          {checkout && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">Visit created. Payment link: <a href={checkout} target="_blank" rel="noopener" className="font-semibold underline">open / send to patient</a></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="label">Patient</div>
              <select className="select" value={f.patientId} onChange={(e) => set('patientId', e.target.value)}><option value="">Choose…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select>
            </div>
            <div><div className="label">Therapist</div>
              <select className="select" value={f.providerId} onChange={(e) => set('providerId', e.target.value)}><option value="">Choose…</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.rate != null ? ` · ${peso(p.rate)}` : ''}</option>)}</select>
            </div>
            <div><div className="label">Date</div><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
            <div><div className="label">Start time</div><input className="input" type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="label">Payment goes to</div>
              <select className="select" value={f.routing} onChange={(e) => set('routing', e.target.value)}>
                <option value="THERAPIST_DIRECT">Therapist directly (their rate)</option>
                <option value="CLINIC_WALLET">Our clinic wallet (we pay the therapist)</option>
              </select>
            </div>
            <div><div className="label">Collection</div>
              <select className="select" value={f.collection} onChange={(e) => set('collection', e.target.value)}>
                <option value="ONLINE">Patient pays online (Nickel)</option>
                <option value="OFFLINE">We collect (settle ₱20 fee with Nickel)</option>
              </select>
            </div>
            {f.routing === 'CLINIC_WALLET' && (
              <>
                <div><div className="label">Price patient pays (₱)</div><input className="input" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/[^0-9]/g, ''))} /></div>
                <div><div className="label">Therapist&apos;s cut (₱)</div><input className="input" inputMode="numeric" value={f.therapistCut} onChange={(e) => set('therapistCut', e.target.value.replace(/[^0-9]/g, ''))} /></div>
              </>
            )}
          </div>
          <div><div className="label">Notes (optional)</div><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. post-op knee, 2nd floor unit" /></div>
          <p className="text-[12px] text-[color:var(--muted)]">Nickel keeps a flat ₱20 per visit{f.collection === 'OFFLINE' ? ' (billed to your clinic for offline-collected visits)' : ''}. {f.routing === 'CLINIC_WALLET' ? 'The net lands in your clinic wallet; pay the therapist’s cut from the visit list once completed.' : 'The therapist receives their rate net of the ₱20 and payment fees.'}</p>
          <div className="flex justify-end"><button className="btn-primary" disabled={busy} onClick={arrange}>{busy ? 'Arranging…' : 'Arrange visit'}</button></div>
        </section>
      )}

      <div className="card p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Arranged visits</b></div>
        {bookings.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No visits yet.</p> : (
          <div className="divide-y divide-[color:var(--line)]">
            {bookings.map((b) => (
              <div key={b.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{b.patientName} <span className="font-normal text-[color:var(--slate)]">with</span> {b.providerName}</div>
                    <div className="text-[12px] text-[color:var(--slate)]">{fmtDate(b.date)} · {fmtTime(b.startTime)} · {peso(b.amount)} · {b.routing === 'CLINIC_WALLET' ? 'clinic wallet' : 'therapist-direct'} · {b.collection === 'OFFLINE' ? 'offline' : 'online'}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${(STATUS[b.status] ?? ['', ''])[1]}`}>{(STATUS[b.status] ?? [b.status])[0]}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {b.checkoutUrl && b.status === 'PENDING' && <a href={b.checkoutUrl} target="_blank" rel="noopener" className="text-[12.5px] font-semibold text-[color:var(--steel)] hover:underline">Payment link →</a>}
                  {b.routing === 'CLINIC_WALLET' && b.status === 'COMPLETED' && b.payoutStatus !== 'PAID' && b.therapistCut ? (
                    <button onClick={() => payTherapist(b.id)} disabled={acting === b.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700">{acting === b.id ? '…' : `Pay therapist ${peso(b.therapistCut)}`}</button>
                  ) : null}
                  {b.routing === 'CLINIC_WALLET' && b.payoutStatus === 'PAID' && <span className="text-[12px] font-semibold text-emerald-700">Therapist paid</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
