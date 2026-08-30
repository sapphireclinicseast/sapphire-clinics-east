'use client'

import { useState } from 'react'
import { computeSplit } from '@/lib/earnings'

interface Init {
  consultFee: string; teleconsultEnabled: boolean; inPersonEnabled: boolean
  clinicName: string; clinicAddress: string; clinicCity: string
  postNominals: string; specialization: string; prcNumber: string; phone: string
  bankName: string; bankAccountNo: string; bankAccountName: string; gcashNumber: string
}
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DoctorSettingsForm({ init }: { init: Init }) {
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Init>(k: K, v: Init[K]) => setF((s) => ({ ...s, [k]: v }))

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/doctor/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, consultFee: f.consultFee === '' ? null : Number(f.consultFee) }) })
      setMsg(res.ok ? 'Saved.' : ((await res.json()).error ?? 'Save failed'))
    } catch { setMsg('Save failed') } finally { setBusy(false) }
  }

  const fee = Number(f.consultFee || 0)
  const net = fee > 0 ? computeSplit(fee, { method: 'gcash' }).net : 0

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="text-[16px] font-semibold">Consult fee & type</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label">Consult fee (₱)</div><input className="input" inputMode="numeric" value={f.consultFee} onChange={(e) => set('consultFee', e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 800" /></div>
          <div className="flex flex-col justify-end gap-2 pb-1 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={f.teleconsultEnabled} onChange={(e) => set('teleconsultEnabled', e.target.checked)} /> Offer teleconsults (video)</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={f.inPersonEnabled} onChange={(e) => set('inPersonEnabled', e.target.checked)} /> Offer in-person clinic consults</label>
          </div>
        </div>
        {fee > 0 && <p className="text-[12px] text-[color:var(--muted)]">Nickel keeps a flat ₱20 per consult; you receive the rest net of PayMongo fees. Example (GCash): you receive <b className="text-[color:var(--ink)]">{peso(net)}</b>.</p>}
      </section>

      {f.inPersonEnabled && (
        <section className="card space-y-3">
          <h2 className="text-[16px] font-semibold">Clinic (for in-person consults)</h2>
          <div><div className="label">Clinic name</div><input className="input" value={f.clinicName} onChange={(e) => set('clinicName', e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="label">City</div><input className="input" value={f.clinicCity} onChange={(e) => set('clinicCity', e.target.value)} placeholder="e.g. Pasig" /></div>
            <div><div className="label">Address</div><input className="input" value={f.clinicAddress} onChange={(e) => set('clinicAddress', e.target.value)} /></div>
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="text-[16px] font-semibold">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label">Post-nominals</div><input className="input" value={f.postNominals} onChange={(e) => set('postNominals', e.target.value)} placeholder="e.g. MD, FPARM" /></div>
          <div><div className="label">PRC number</div><input className="input" value={f.prcNumber} onChange={(e) => set('prcNumber', e.target.value)} /></div>
          <div className="sm:col-span-2"><div className="label">Specialization</div><input className="input" value={f.specialization} onChange={(e) => set('specialization', e.target.value)} /></div>
          <div><div className="label">Phone</div><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-[16px] font-semibold">Payout details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label">Bank name</div><input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
          <div><div className="label">Bank account no.</div><input className="input" value={f.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} /></div>
          <div><div className="label">Account name</div><input className="input" value={f.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} /></div>
          <div><div className="label">GCash number</div><input className="input" value={f.gcashNumber} onChange={(e) => set('gcashNumber', e.target.value)} /></div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        {msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}
      </div>
    </div>
  )
}
