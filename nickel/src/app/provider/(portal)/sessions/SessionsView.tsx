'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Chat from '@/components/Chat'

interface AvailSlot { date: string; startTime: string; endTime: string }
interface Booking { id: string; date: string; startTime: string; endTime: string; city: string; status: string; patientName: string; proposedStartTime?: string | null }

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

export default function SessionsView({ confirmed, past, availableSlots }: { confirmed: Booking[]; past: Booking[]; availableSlots: AvailSlot[] }) {
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [chatFor, setChatFor] = useState<string | null>(null)
  const [proposeFor, setProposeFor] = useState<string | null>(null)
  const [proposeSlot, setProposeSlot] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to)
  const fConfirmed = useMemo(() => confirmed.filter((b) => inRange(b.date)), [confirmed, from, to])
  const fPast = useMemo(() => past.filter((b) => inRange(b.date)), [past, from, to])

  async function act(id: string, action: 'complete') {
    if (!confirm('Mark this visit completed? Your net earnings will be released to your Nickel wallet.')) return
    setActing(id)
    try {
      const r = await fetch('/api/provider/booking-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, action }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Action failed'); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Action failed') } finally { setActing(null) }
  }
  async function propose(id: string) {
    if (!proposeSlot) return
    const [date, startTime] = proposeSlot.split('|'); setActing(id)
    try {
      const r = await fetch('/api/provider/propose-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, date, startTime }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Could not propose'); setProposeFor(null); setProposeSlot(''); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not propose') } finally { setActing(null) }
  }

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <section className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div><div className="label">From</div><input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><div className="label">To</div><input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} className="rounded-lg border border-[color:var(--line-2)] px-3 py-2 text-[13px] font-medium text-[color:var(--slate)] hover:bg-[color:var(--mist)]">Clear</button>}
          <div className="ml-auto text-[12px] text-[color:var(--muted)]">{fConfirmed.length} upcoming · {fPast.length} past</div>
        </div>
      </section>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

      <section className="card">
        <h2 className="text-[16px] font-semibold">Confirmed visits</h2>
        {fConfirmed.length === 0 ? <p className="mt-2 text-[13px] text-[color:var(--slate)]">No confirmed visits in this range.</p> : (
          <div className="mt-3 space-y-2">
            {fConfirmed.map((b) => (
              <div key={b.id} className="rounded-lg border border-[color:var(--line)] px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[color:var(--ink)]">{fmtDate(b.date)} · {fmtTime(b.startTime)}</span>
                  <span className="text-[color:var(--ink)]">{b.patientName}</span>
                  <span className="text-[color:var(--slate)]">· {b.city}</span>
                  <button className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={acting === b.id} onClick={() => act(b.id, 'complete')}>{acting === b.id ? '…' : 'Mark completed'}</button>
                </div>
                {b.proposedStartTime
                  ? <span className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-800">Reschedule proposed — waiting for patient</span>
                  : (
                    <div className="mt-2 flex flex-wrap gap-3 text-[12.5px]">
                      <button className="font-semibold text-[color:var(--steel)] hover:underline" onClick={() => { setChatFor(chatFor === b.id ? null : b.id); setProposeFor(null) }}>{chatFor === b.id ? 'Hide messages' : 'Message'}</button>
                      <button className="font-semibold text-[color:var(--steel)] hover:underline" onClick={() => { setProposeFor(proposeFor === b.id ? null : b.id); setChatFor(null) }}>{proposeFor === b.id ? 'Cancel' : 'Propose new time'}</button>
                      <a className="font-semibold text-[color:var(--steel)] hover:underline" href={`/provider/notes/${b.id}`}>Notes / documents</a>
                    </div>
                  )}
                {proposeFor === b.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--mist)] p-2.5">
                    <select className="select !w-auto !py-1.5 !text-[13px]" value={proposeSlot} onChange={(e) => setProposeSlot(e.target.value)}>
                      <option value="">Pick an open slot…</option>
                      {availableSlots.map((s) => <option key={`${s.date}|${s.startTime}`} value={`${s.date}|${s.startTime}`}>{fmtDate(s.date)} · {fmtTime(s.startTime)}</option>)}
                    </select>
                    <button className="btn-primary !px-3 !py-1.5 !text-[12.5px]" disabled={!proposeSlot || acting === b.id} onClick={() => propose(b.id)}>Send proposal</button>
                    {availableSlots.length === 0 && <span className="text-[11.5px] text-[color:var(--muted)]">Add availability first.</span>}
                  </div>
                )}
                {chatFor === b.id && <div className="mt-2"><Chat bookingId={b.id} meRole="PROVIDER" otherName={b.patientName} /></div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="text-[16px] font-semibold">Past sessions</h2>
        {fPast.length === 0 ? <p className="mt-2 text-[13px] text-[color:var(--slate)]">No past sessions in this range.</p> : (
          <div className="mt-3 space-y-1.5">
            {fPast.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] pb-1.5 text-[13px] last:border-0">
                <span className="tabular-nums text-[color:var(--slate)]">{fmtDate(b.date)}</span>
                <span className="text-[color:var(--ink)]">{b.patientName}</span>
                <span className="text-[color:var(--slate)]">· {b.city}</span>
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${b.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{b.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}</span>
                {b.status !== 'CANCELLED' && <a href={`/provider/notes/${b.id}`} className="text-[12px] font-semibold text-[color:var(--steel)] hover:underline">Notes / documents</a>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
