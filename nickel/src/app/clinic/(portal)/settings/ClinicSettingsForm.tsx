'use client'

import { useState } from 'react'

interface Init { name: string; contactPerson: string; phone: string; businessType: string; tin: string; address: string; city: string }

export default function ClinicSettingsForm({ init }: { init: Init }) {
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Init>(k: K, v: Init[K]) => setF((s) => ({ ...s, [k]: v }))

  async function save() {
    setBusy(true); setMsg(null)
    try { const r = await fetch('/api/clinic/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); setMsg(r.ok ? 'Saved.' : ((await r.json()).error ?? 'Failed')) }
    catch { setMsg('Failed') } finally { setBusy(false) }
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Business details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><div className="label">Clinic / hospital name</div><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><div className="label">Contact person</div><input className="input" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></div>
        <div><div className="label">Phone</div><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div><div className="label">Business type</div>
          <select className="select" value={f.businessType} onChange={(e) => set('businessType', e.target.value)}>
            <option value="SOLE_PROP">Sole proprietorship</option>
            <option value="PARTNERSHIP">Partnership</option>
            <option value="CORPORATION">Corporation</option>
          </select>
        </div>
        <div><div className="label">TIN</div><input className="input" value={f.tin} onChange={(e) => set('tin', e.target.value)} /></div>
        <div><div className="label">City</div><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Pasig" /></div>
        <div><div className="label">Address</div><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>{msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}</div>
    </section>
  )
}
