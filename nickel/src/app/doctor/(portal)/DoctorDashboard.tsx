'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Slot { id: string; dayOfWeek: number; startTime: string; endTime: string }
interface C { id: string; date: string; startTime: string; status: string; mode: string; amount: number; reason: string | null; referralIssued: boolean; patientName: string }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

export default function DoctorDashboard({ slots, consults, past, walletBalance, hasFee, availableCount }: { slots: Slot[]; consults: C[]; past: C[]; walletBalance: number; hasFee: boolean; availableCount: number }) {
  const router = useRouter()
  const [nd, setNd] = useState({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' })
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function addSlot() {
    setBusy(true); setErr(null)
    try { const r = await fetch('/api/doctor/slots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nd) }); if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); router.refresh() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }
  async function delSlot(id: string) { await fetch(`/api/doctor/slots?id=${id}`, { method: 'DELETE' }); router.refresh() }

  async function act(consultId: string, action: string, extra?: Record<string, unknown>) {
    setActing(consultId); setErr(null)
    try { const r = await fetch('/api/doctor/consult-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consultId, action, ...extra }) }); if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); router.refresh() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setActing(null) }
  }
  async function completeWithReferral(consultId: string, withReferral: boolean) {
    if (!withReferral) { if (confirm('Mark this consult completed? Your earnings will be released to your wallet.')) act(consultId, 'complete'); return }
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf'
    input.onchange = async () => { const f = input.files?.[0]; if (!f) return; if (f.size > 8_000_000) { setErr('File too large (max ~6 MB).'); return } const data = await readFile(f); act(consultId, 'complete', { referralFile: data }) }
    input.click()
  }
  async function issueReferral(consultId: string) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf'
    input.onchange = async () => { const f = input.files?.[0]; if (!f) return; if (f.size > 8_000_000) { setErr('File too large (max ~6 MB).'); return } const data = await readFile(f); act(consultId, 'issue-referral', { referralFile: data }) }
    input.click()
  }

  const toConfirm = consults.filter((c) => c.status === 'PAID')
  const confirmed = consults.filter((c) => c.status === 'CONFIRMED')

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Wallet balance</div><div className="mt-1 text-[24px] font-bold text-[color:var(--steel)]">{peso(walletBalance)}</div><div className="text-[12px] text-[color:var(--slate)]">earned from completed consults</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Open slots (next 14 days)</div><div className="mt-1 text-[24px] font-bold text-[color:var(--ink)]">{availableCount}</div><div className="text-[12px] text-[color:var(--slate)]">{hasFee ? 'patients can book these' : 'set your consult fee in Settings'}</div></div>
      </div>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

      <section className="card">
        <h2 className="text-[16px] font-semibold">Weekly availability</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Set the times you’re open for consults. Patients book within these windows (1-hour slots).</p>
        <div className="mb-3 flex flex-wrap items-end gap-2 text-[13px]">
          <select className="select !w-36" value={nd.dayOfWeek} onChange={(e) => setNd({ ...nd, dayOfWeek: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          <input className="input !w-24" value={nd.startTime} onChange={(e) => setNd({ ...nd, startTime: e.target.value })} placeholder="09:00" />
          <span className="text-[color:var(--slate)]">to</span>
          <input className="input !w-24" value={nd.endTime} onChange={(e) => setNd({ ...nd, endTime: e.target.value })} placeholder="17:00" />
          <button className="btn-primary !px-4 !py-2 !text-[13px]" disabled={busy} onClick={addSlot}>Add window</button>
        </div>
        <div className="space-y-1.5">
          {slots.length === 0 && <p className="text-[13px] text-[color:var(--slate)]">No availability yet.</p>}
          {slots.map((s) => (
            <div key={s.id} className="flex items-center gap-3 text-[13px]">
              <span className="w-24 font-medium text-[color:var(--ink)]">{DAYS[s.dayOfWeek]}</span>
              <span className="text-[color:var(--slate)]">{s.startTime}–{s.endTime}</span>
              <button className="ml-auto text-[color:var(--slate)] hover:text-red-600" onClick={() => delSlot(s.id)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      {toConfirm.length > 0 && (
        <section className="card">
          <h2 className="text-[16px] font-semibold">Consults to confirm</h2>
          <div className="mt-3 space-y-2">
            {toConfirm.map((c) => (
              <div key={c.id} className="rounded-lg border border-[color:var(--line)] px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-[color:var(--ink)]">{fmtDate(c.date)} · {fmtTime(c.startTime)}</span>
                  <span className="text-[color:var(--ink)]">{c.patientName}</span>
                  <span className="rounded-full bg-[color:var(--mist-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--steel)]">{c.mode === 'TELECONSULT' ? 'Teleconsult' : 'In-person'}</span>
                  <div className="ml-auto flex gap-2">
                    <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]" disabled={acting === c.id} onClick={() => { if (confirm('Decline & refund the patient?')) act(c.id, 'decline') }}>Decline</button>
                    <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700" disabled={acting === c.id} onClick={() => act(c.id, 'confirm')}>{acting === c.id ? '…' : 'Confirm'}</button>
                  </div>
                </div>
                {c.reason && <p className="mt-1 text-[12px] text-[color:var(--slate)]">“{c.reason}”</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-[16px] font-semibold">Confirmed consults</h2>
        {confirmed.length === 0 ? <p className="mt-2 text-[13px] text-[color:var(--slate)]">No confirmed consults yet.</p> : (
          <div className="mt-3 space-y-2">
            {confirmed.map((c) => (
              <div key={c.id} className="rounded-lg border border-[color:var(--line)] px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-[color:var(--ink)]">{fmtDate(c.date)} · {fmtTime(c.startTime)}</span>
                  <span className="text-[color:var(--ink)]">{c.patientName}</span>
                  <span className="rounded-full bg-[color:var(--mist-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--steel)]">{c.mode === 'TELECONSULT' ? 'Teleconsult' : 'In-person'}</span>
                  {c.referralIssued && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Referral issued</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.mode === 'TELECONSULT' && <a href={`/consult/${c.id}/room`} className="rounded-lg bg-[color:var(--steel)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[color:var(--steel-deep)]">Join teleconsult</a>}
                  {!c.referralIssued && <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]" disabled={acting === c.id} onClick={() => issueReferral(c.id)}>Issue referral</button>}
                  <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700" disabled={acting === c.id} onClick={() => completeWithReferral(c.id, false)}>Mark completed</button>
                  <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]" disabled={acting === c.id} onClick={() => completeWithReferral(c.id, true)}>Complete + attach referral</button>
                  <a href={`/doctor/notes/${c.id}`} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]">Notes / documents</a>
                </div>
                {c.reason && <p className="mt-1.5 text-[12px] text-[color:var(--slate)]">“{c.reason}”</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="card">
          <h2 className="text-[16px] font-semibold">History</h2>
          <div className="mt-3 space-y-1.5">
            {past.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] pb-1.5 text-[13px] last:border-0">
                <span className="tabular-nums text-[color:var(--slate)]">{fmtDate(c.date)}</span>
                <span className="text-[color:var(--ink)]">{c.patientName}</span>
                <span className="text-[color:var(--slate)]">· {c.mode === 'TELECONSULT' ? 'Teleconsult' : 'In-person'}</span>
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{c.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}</span>
                {c.status !== 'CANCELLED' && <a href={`/doctor/notes/${c.id}`} className="text-[12px] font-medium text-[color:var(--steel)] hover:underline">Notes / documents</a>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
