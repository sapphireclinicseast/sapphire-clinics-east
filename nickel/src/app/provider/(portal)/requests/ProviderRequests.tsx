'use client'

import { useEffect, useState } from 'react'

interface Slot { date: string; startTime: string; endTime: string }
interface Req { id: string; city: string; profession: string | null; patientName: string; preferredDate: string | null; preferredTime: string | null; flexibility: string | null; note: string | null; createdAt: string; alreadyOffered: boolean }

const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist' }
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const ago = (iso: string) => { const d = Date.now() - new Date(iso).getTime(); if (d < 3600e3) return `${Math.max(1, Math.floor(d / 60e3))}m ago`; if (d < 864e5) return `${Math.floor(d / 3600e3)}h ago`; return `${Math.floor(d / 864e5)}d ago` }

export default function ProviderRequests({ availableSlots, eligible, hasRate, rate }: { availableSlots: Slot[]; eligible: boolean; hasRate: boolean; rate: number | null }) {
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [slot, setSlot] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const d = await fetch('/api/provider/requests').then((r) => r.json()).catch(() => ({ requests: [] }))
    setReqs(d.requests ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function offer(requestId: string) {
    if (!slot) return
    const [date, startTime] = slot.split('|')
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/provider/requests/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, date, startTime, message }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not send offer')
      setOpenFor(null); setSlot(''); setMessage(''); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-[color:var(--ink)]">Client requests</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">Patients near you who posted what they need. Offer a time from your availability at your rate{rate != null ? ` (${peso(rate)})` : ''} — if they accept, you get the booking.</p>
      </div>

      {!eligible && <div className="card text-[13px] text-[color:var(--slate)]">Your account needs to be verified and active before you can reach out to client requests.</div>}
      {eligible && !hasRate && <div className="card text-[13px] text-[color:var(--slate)]">Set your session rate in <a href="/provider/settings" className="font-semibold text-[color:var(--steel)] hover:underline">Settings</a> before making offers.</div>}
      {eligible && availableSlots.length === 0 && <div className="card text-[13px] text-[color:var(--slate)]">Add availability in <a href="/provider" className="font-semibold text-[color:var(--steel)] hover:underline">Schedule</a> so you have times to offer.</div>}

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

      {loading ? <p className="text-[13px] text-[color:var(--slate)]">Loading requests…</p>
        : reqs.length === 0 ? <div className="card text-center text-[13px] text-[color:var(--slate)]">No open requests in your cities right now. Check back soon.</div>
        : reqs.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-semibold text-[color:var(--ink)]">{r.patientName} · {r.city}</div>
                <div className="mt-0.5 text-[12.5px] text-[color:var(--slate)]">
                  {r.profession ? `Wants a ${PROF[r.profession] ?? r.profession}` : 'Any discipline'}
                  {r.preferredDate ? ` · prefers ${fmtDate(r.preferredDate)}${r.preferredTime ? ` ${fmtTime(r.preferredTime)}` : ''}` : ' · flexible on date'}
                </div>
                {r.flexibility && <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">{r.flexibility}</div>}
                {r.note && <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">“{r.note}”</p>}
              </div>
              <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{ago(r.createdAt)}</span>
            </div>

            <div className="mt-3 border-t border-[color:var(--line)] pt-3">
              {r.alreadyOffered
                ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">You’ve made an offer — waiting for the patient</span>
                : eligible && hasRate && availableSlots.length > 0 ? (
                  openFor === r.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select className="select !w-auto !py-1.5 !text-[13px]" value={slot} onChange={(e) => setSlot(e.target.value)}>
                          <option value="">Pick a time to offer…</option>
                          {availableSlots.map((s) => <option key={`${s.date}|${s.startTime}`} value={`${s.date}|${s.startTime}`}>{fmtDate(s.date)} · {fmtTime(s.startTime)}</option>)}
                        </select>
                        <button className="btn-primary !px-3 !py-1.5 !text-[12.5px]" disabled={!slot || busy} onClick={() => offer(r.id)}>Send offer{rate != null ? ` · ${peso(rate)}` : ''}</button>
                        <button className="text-[12.5px] font-medium text-[color:var(--slate)] hover:underline" onClick={() => { setOpenFor(null); setSlot('') }}>Cancel</button>
                      </div>
                      <input className="input !text-[13px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note to the patient (e.g. I specialize in pediatric care)" />
                    </div>
                  ) : (
                    <button className="btn-outline !px-3 !py-1.5 !text-[12.5px]" onClick={() => { setOpenFor(r.id); setSlot(''); setMessage('') }}>Reach out</button>
                  )
                ) : <span className="text-[12px] text-[color:var(--muted)]">Complete the steps above to make an offer.</span>}
            </div>
          </div>
        ))}
    </div>
  )
}
