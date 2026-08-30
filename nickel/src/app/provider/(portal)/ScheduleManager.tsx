'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Chat from '@/components/Chat'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
interface Slot { id: string; dayOfWeek: number; startTime: string; endTime: string }
interface AvailSlot { date: string; startTime: string; endTime: string }
interface Booking { id: string; date: string; startTime: string; endTime: string; city: string; status: string; patientName: string; proposedDate?: string | null; proposedStartTime?: string | null }

export default function ScheduleManager({ slots, bookings, past, availableSlots, travelBuffer }: { slots: Slot[]; bookings: Booking[]; past: Booking[]; availableSlots: AvailSlot[]; travelBuffer: boolean }) {
  const router = useRouter()
  const [chatFor, setChatFor] = useState<string | null>(null)
  const [proposeFor, setProposeFor] = useState<string | null>(null)
  const [proposeSlot, setProposeSlot] = useState('')
  const [buffer, setBuffer] = useState(travelBuffer)
  const [bufBusy, setBufBusy] = useState(false)
  async function toggleBuffer(v: boolean) {
    setBuffer(v); setBufBusy(true)
    try {
      const r = await fetch('/api/provider/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ travelBuffer: v }) })
      if (!r.ok) throw new Error()
      router.refresh()
    } catch { setBuffer(!v) } finally { setBufBusy(false) }
  }
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

  async function propose(id: string) {
    if (!proposeSlot) return
    const [date, startTime] = proposeSlot.split('|')
    setActing(id)
    try {
      const r = await fetch('/api/provider/propose-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, date, startTime }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Could not propose')
      setProposeFor(null); setProposeSlot(''); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not propose') } finally { setActing(null) }
  }

  // Message + Propose-new-time controls shared by to-confirm and confirmed rows.
  function actions(b: Booking) {
    return (
      <div className="mt-2 w-full">
        {b.proposedStartTime
          ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-800">Reschedule proposed — waiting for patient</span>
          : (
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              <button className="font-semibold text-[color:var(--steel)] hover:underline" onClick={() => { setChatFor(chatFor === b.id ? null : b.id); setProposeFor(null) }}>{chatFor === b.id ? 'Hide messages' : 'Message'}</button>
              <button className="font-semibold text-[color:var(--steel)] hover:underline" onClick={() => { setProposeFor(proposeFor === b.id ? null : b.id); setChatFor(null) }}>{proposeFor === b.id ? 'Cancel' : 'Propose new time'}</button>
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
    )
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="text-[16px] font-semibold">Weekly availability</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Set the days and times you&apos;re open for home visits. Clients book within these windows.</p>
        <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] px-3 py-2.5 text-[13px]">
          <input type="checkbox" checked={buffer} disabled={bufBusy} onChange={(e) => toggleBuffer(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: 'var(--steel)' }} />
          <span><b className="text-[color:var(--ink)]">Leave 1 hour between visits</b> <span className="text-[color:var(--slate)]">— bookable slots are spaced 2 hours apart so you have travel time between homes.</span></span>
        </label>
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
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg><span><b>Check your travel time before you accept.</b> Make sure you can reach each address from your previous visit in time.</span>
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
                {actions(b)}
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
                {actions(b)}
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
