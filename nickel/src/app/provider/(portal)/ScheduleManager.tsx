'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
interface Slot { id: string; dayOfWeek: number; startTime: string; endTime: string }
interface Booking { id: string; date: string; startTime: string; endTime: string; city: string; status: string; patientName: string }

export default function ScheduleManager({ slots, bookings }: { slots: Slot[]; bookings: Booking[] }) {
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

      <section className="card">
        <h2 className="text-[16px] font-semibold">Upcoming visits</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-[13px] text-[color:var(--slate)]">No upcoming visits yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--line)] px-3 py-2 text-[13px]">
                <span className="font-medium text-[color:var(--ink)]">{new Date(b.date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span className="text-[color:var(--slate)]">{b.startTime}</span>
                <span className="text-[color:var(--ink)]">{b.patientName}</span>
                <span className="text-[color:var(--slate)]">· {b.city}</span>
                <span className="ml-auto rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--mist-2)', color: 'var(--steel-deep)' }}>{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
