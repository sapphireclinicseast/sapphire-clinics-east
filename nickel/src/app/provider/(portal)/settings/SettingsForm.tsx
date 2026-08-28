'use client'

import { useState } from 'react'

interface Init {
  rate: string; transpoIncluded: boolean; prcNumber: string; ptrNumber: string; signature: string
  bankName: string; bankAccountNo: string; bankAccountName: string; gcashNumber: string; gcashName: string
}

export default function SettingsForm({ init }: { init: Init }) {
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Init>(k: K, v: Init[K]) => setF((s) => ({ ...s, [k]: v }))

  async function onSig(file: File | undefined) {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setMsg('Signature image must be under 3 MB.'); return }
    const r = new FileReader()
    r.onload = () => set('signature', String(r.result))
    r.readAsDataURL(file)
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provider/update', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, rate: f.rate === '' ? null : Number(f.rate) }),
      })
      const d = await res.json()
      setMsg(res.ok ? 'Saved.' : (d.error ?? 'Save failed'))
    } catch { setMsg('Save failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Rate */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Your homecare rate</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Clients see this rate when they book you.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">Session rate (₱)</div>
            <input className="input" inputMode="numeric" value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="e.g. 1500" />
          </div>
          <label className="flex items-end gap-2.5 pb-2.5 text-[13px]">
            <input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={f.transpoIncluded} onChange={(e) => set('transpoIncluded', e.target.checked)} />
            <span>Transportation included in this rate</span>
          </label>
        </div>
      </section>

      {/* Credentials */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Credentials</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><div className="label">PRC number</div><input className="input" value={f.prcNumber} onChange={(e) => set('prcNumber', e.target.value)} /></div>
          <div><div className="label">PTR number</div><input className="input" value={f.ptrNumber} onChange={(e) => set('ptrNumber', e.target.value)} /></div>
        </div>
        <div className="mt-3">
          <div className="label">E-signature</div>
          {f.signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="mb-2 inline-block rounded-lg border border-[color:var(--line)] bg-white p-2"><img src={f.signature} alt="signature" className="h-16 w-auto" /></div>
          ) : null}
          <input type="file" accept="image/*" onChange={(e) => onSig(e.target.files?.[0])} className="block text-[13px]" />
        </div>
      </section>

      {/* Payout */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Payout details</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Where SCEI sends your earnings after clients pay.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label">Bank name</div><input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
          <div><div className="label">Bank account no.</div><input className="input" value={f.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} /></div>
          <div><div className="label">Account name</div><input className="input" value={f.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} /></div>
          <div className="hidden sm:block" />
          <div><div className="label">GCash number</div><input className="input" value={f.gcashNumber} onChange={(e) => set('gcashNumber', e.target.value)} /></div>
          <div><div className="label">GCash name</div><input className="input" value={f.gcashName} onChange={(e) => set('gcashName', e.target.value)} /></div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button>
        {msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}
      </div>
    </div>
  )
}
