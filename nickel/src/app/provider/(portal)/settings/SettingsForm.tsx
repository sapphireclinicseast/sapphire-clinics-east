'use client'

import { useState } from 'react'
import SignatureField from '@/components/SignatureField'
import NetCalculator from '@/components/NetCalculator'

interface Init {
  rate: string; transpoIncluded: boolean
  specialization: string; specializedRate: string; specializedRateApproved: boolean
  prcNumber: string; ptrNumber: string; signature: string
  bankName: string; bankAccountNo: string; bankAccountName: string; gcashNumber: string; gcashName: string
}

export default function SettingsForm({ init }: { init: Init }) {
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Init>(k: K, v: Init[K]) => setF((s) => ({ ...s, [k]: v }))


  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provider/update', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, rate: f.rate === '' ? null : Number(f.rate), specializedRate: f.specializedRate === '' ? null : Number(f.specializedRate) }),
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
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] px-3 py-2.5 text-[12px] text-[color:var(--slate)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
          <span>You&apos;ll receive this rate <b className="text-[color:var(--ink)]">net of a flat ₱20 app fee and PayMongo&apos;s payment fees</b> (our payment channel partner). The exact fee depends on how the patient pays — see the breakdown below.</span>
        </div>
      </section>

      {/* Flat-₱20 disclaimer + net-by-method calculator */}
      <NetCalculator defaultAmount={f.rate} />

      {/* Specialized rate — only editable once SCEI verifies the certification */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Specialized rate</h2>
          {f.specializedRateApproved
            ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">Approved{f.specialization ? ` · ${f.specialization}` : ''}</span>
            : <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-semibold text-amber-800">Pending verification</span>}
        </div>
        {f.specializedRateApproved ? (
          <>
            <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Charged for bookings under your verified specialization{f.specialization ? ` (${f.specialization})` : ''}.</p>
            <div className="max-w-[220px]"><div className="label">Specialized session rate (₱)</div>
              <input className="input" inputMode="numeric" value={f.specializedRate} onChange={(e) => set('specializedRate', e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 2400" /></div>
          </>
        ) : (
          <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">
            {f.specialization
              ? <>Your specialization <b>{f.specialization}</b> is awaiting SCEI review. Once your certification is verified, you can set a specialized rate here.</>
              : <>Add a specialization and upload its certification in <b>Verification</b>. After SCEI verifies it, a specialized rate unlocks here.</>}
          </p>
        )}
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
          <SignatureField value={f.signature} onChange={(v) => set('signature', v)} />
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
