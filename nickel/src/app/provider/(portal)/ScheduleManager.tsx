'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
interface Slot { id: string; dayOfWeek: number; startTime: string; endTime: string }
interface Booking { id: string; date: string; startTime: string; endTime: string; city: string; status: string; patientName: string }

export default function ScheduleManager({ slots, bookings, past }: { slots: Slot[]; bookings: Booking[]; past: Booking[] }) {
  const router = useRouter()
  const [nd, setNd] = useState({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/provider/slots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nd) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Could not add')
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add') } finally { setBusy(false) }
  }
  async function remove(id: string) {
    await fetch(`/api/provider/slots?id=${id}`, { method: 'DELETE' }); router.refresh()
  }
  const [acting, setActing] = useState<string | null>(null)
  async function act(id: string, action: 'confirm' | 'decline') {
    if (action === 'decline' && !confirm('Decline this visit? The patient will be refunded.')) return
    setActing(id)
    try {
      const r = await fetch('/api/provider/booking-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, action }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Action failed')
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Action failed') } finally { setActing(null) }
  }
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
  const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
  const toConfirm = bookings.filter((b) => b.status === 'PAID')
  const confirmed = bookings.filter((b) => b.status === 'CONFIRMED')

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="text-[16px] font-semibold">Weekly availability</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Set the days and times you&apos;re open for home visits. Clients book within these windows.</p>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}
        <div className="mb-3 flex flex-wrap items-end gap-2 text-[13px]">
          <select className="select !w-36" value={nd.dayOfWeek} onChange={(e) => setNd({ ...nd, dayOfWeek: Number(e.target.value) })}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input className="input !w-24" value={nd.startTime} onChange={(e) => setNd({ ...nd, startTime: e.target.value })} placeholder="09:00" />
          <span className="text-[color:var(--slate)]">to</span>
          <input className="input !w-24" value={nd.endTime} onChange={(e) => setNd({ ...nd, endTime: e.target.value })} placeholder="17:00" />
          <button className="btn-primary !px-4 !py-2 !text-[13px]" disabled={busy} onClick={add}>Add window</button>
        </div>
        <div className="space-y-1.5">
          {slots.length === 0 && <p className="text-[13px] text-[color:var(--slate)]">No availability yet.</p>}
          {slots.map((s) => (
            <div key={s.id} className="flex items-center gap-3 text-[13px]">
              <span className="w-24 font-medium text-[color:var(--ink)]">{DAYS[s.dayOfWeek]}</span>
              <span className="text-[color:var(--slate)]">{s.startTime}–{s.endTime}</span>
              <button className="ml-auto text-[color:var(--slate)] hover:text-red-600" onClick={() => remove(s.id)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      {toConfirm.length > 0 && (
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Requests to confirm</h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-semibold text-amber-800">{toConfirm.length} waiting</span>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
            <span>⏱️</span><span><b>Check your travel time before you accept.</b> Make sure you can reach each address from your previous visit in time.</span>
          </div>
          <div className="mt-3 space-y-2">
            {toConfirm.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-[color:var(--line)] px-3 py-2.5 text-[13px]">
                <span className="font-semibold text-[color:var(--ink)]">{fmtDate(b.date)} · {fmtTime(b.startTime)}</span>
                <span className="text-[color:var(--ink)]">{b.patientName}</span>
                <span className="text-[color:var(--slate)]">· {b.city}</span>
                <div className="ml-auto flex gap-2">
                  <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]" disabled={acting === b.id} onClick={() => act(b.id, 'decline')}>Decline</button>
                  <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700" disabled={acting === b.id} onClick={() => act(b.id, 'confirm')}>{acting === b.id ? '…' : 'Confirm visit'}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-[16px] font-semibold">Confirmed visits</h2>
        {confirmed.length === 0 ? (
          <p className="mt-2 text-[13px] text-[color:var(--slate)]">No confirmed visits yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {confirmed.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--line)] px-3 py-2 text-[13px]">
                <span className="font-semibold text-[color:var(--ink)]">{fmtDate(b.date)} · {fmtTime(b.startTime)}</span>
                <span className="text-[color:var(--ink)]">{b.patientName}</span>
                <span className="text-[color:var(--slate)]">· {b.city}</span>
                <span className="ml-auto rounded-full bg-[color:var(--steel-soft,#eaf1fa)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--steel)]">Confirmed</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="card">
          <h2 className="text-[16px] font-semibold">Session history</h2>
          <div className="mt-3 space-y-1.5">
            {past.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] pb-1.5 text-[13px] last:border-0">
                <span className="tabular-nums text-[color:var(--slate)]">{fmtDate(b.date)}</span>
                <span className="text-[color:var(--ink)]">{b.patientName}</span>
                <span className="text-[color:var(--slate)]">· {b.city}</span>
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${b.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{b.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
