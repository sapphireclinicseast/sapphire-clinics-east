'use client'

import { useState } from 'react'
import SignatureField from '@/components/SignatureField'
import NetCalculator from '@/components/NetCalculator'
import { PH_BANKS } from '@/lib/banks'

interface Init {
  rate: string; transpoIncluded: boolean; dob: string
  priceInitialEval: string; priceTreatmentSpecialized: string; priceProgressReport: string; priceHEP: string
  specialization: string; specializedRate: string; specializedRateApproved: boolean
  treatsAdults: boolean; treatsPedia: boolean; caseCategories: string[]; commonCases: string[]
  awards: string[]; pptaNumber: string; pptaMember: boolean
  prcNumber: string; ptrNumber: string; signature: string
  bankName: string; bankAccountNo: string; bankAccountName: string; gcashNumber: string; gcashName: string
  payoutMethod: string
}

const CASE_CATEGORIES = ['Musculoskeletal', 'Neurological', 'Cardiopulmonary', 'Pediatric / Developmental', 'Geriatric', 'Sports', 'Women’s Health', 'Post-surgical / Ortho', 'Pain management']

// Type-to-add tag input: type a case/award, press Enter (or comma) to add a chip.
function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('')
  const add = () => { const t = text.trim(); if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]); setText('') }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-[color:var(--mist-2)] px-2.5 py-1 text-[12.5px] font-medium text-[color:var(--steel)]">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-[color:var(--slate)] hover:text-red-600">×</button>
          </span>
        ))}
      </div>
      <input
        className="input mt-2" value={text} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
      />
    </div>
  )
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
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">This is your <b>Treatment (Basic)</b> rate — the price clients pay for a standard home visit.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">Treatment session rate — Basic (₱)</div>
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

      {/* Itemized service prices */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Service prices</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Set what you charge for these services. Progress Report and Home Exercise Program are paid, patient-requested documents. Leave blank if you don’t offer one.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><div className="label">Initial Evaluation (₱)</div><input className="input" inputMode="numeric" value={f.priceInitialEval} onChange={(e) => set('priceInitialEval', e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 2000" /></div>
          <div><div className="label">Progress Report (₱)</div><input className="input" inputMode="numeric" value={f.priceProgressReport} onChange={(e) => set('priceProgressReport', e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 500" /></div>
          <div><div className="label">Home Exercise Program (₱)</div><input className="input" inputMode="numeric" value={f.priceHEP} onChange={(e) => set('priceHEP', e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 500" /></div>
        </div>
      </section>

      {/* Treatment (Specialized) — only editable once SCEI verifies the certification */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Treatment (Specialized) price</h2>
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

      {/* Practice profile — shown to patients on your provider-network card */}
      <section className="card space-y-4">
        <div>
          <h2 className="text-[16px] font-semibold">Practice profile</h2>
          <p className="mt-1 text-[12px] text-[color:var(--slate)]">Helps patients find the right fit. Shown on your card in the provider network.</p>
        </div>

        <div>
          <div className="label">Who do you treat?</div>
          <div className="flex flex-wrap gap-4 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={f.treatsAdults} onChange={(e) => set('treatsAdults', e.target.checked)} /> Adults</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={f.treatsPedia} onChange={(e) => set('treatsPedia', e.target.checked)} /> Pediatric</label>
          </div>
        </div>

        <div>
          <div className="label">Case categories you handle</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {CASE_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-[13px] text-[color:var(--slate)]">
                <input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }}
                  checked={f.caseCategories.includes(c)}
                  onChange={(e) => set('caseCategories', e.target.checked ? [...f.caseCategories, c] : f.caseCategories.filter((x) => x !== c))} />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Common cases you treat</div>
          <p className="mb-1.5 text-[12px] text-[color:var(--muted)]">Type a case and press Enter to add it (e.g. “Stroke rehab”, “ACL reconstruction”, “Cerebral palsy”).</p>
          <TagInput value={f.commonCases} onChange={(v) => set('commonCases', v)} placeholder="Add a case…" />
        </div>

        <div>
          <div className="label">Professional awards & recognitions</div>
          <TagInput value={f.awards} onChange={(v) => set('awards', v)} placeholder="Add an award…" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">PPTA membership number</div>
            <input className="input" value={f.pptaNumber} onChange={(e) => set('pptaNumber', e.target.value)} placeholder="e.g. 12345" />
          </div>
          <label className="flex items-end gap-2.5 pb-2.5 text-[13px]">
            <input type="checkbox" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={f.pptaMember} onChange={(e) => set('pptaMember', e.target.checked)} />
            <span>I’m an active PPTA member (shows a verified badge on your card)</span>
          </label>
        </div>
      </section>

      {/* Credentials */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Credentials</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><div className="label">Date of birth</div><input className="input" type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></div>
          <div className="hidden sm:block" />
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

        <div className="mb-3">
          <div className="label">Where do you want your earnings settled?</div>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${f.payoutMethod === 'bank' ? 'border-[color:var(--steel)] bg-[color:var(--mist)]' : 'border-[color:var(--line-2)]'}`}>
              <input type="radio" name="payoutMethod" checked={f.payoutMethod === 'bank'} onChange={() => set('payoutMethod', 'bank')} style={{ accentColor: 'var(--steel)' }} /> Bank account
            </label>
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${f.payoutMethod === 'gcash' ? 'border-[color:var(--steel)] bg-[color:var(--mist)]' : 'border-[color:var(--line-2)]'}`}>
              <input type="radio" name="payoutMethod" checked={f.payoutMethod === 'gcash'} onChange={() => set('payoutMethod', 'gcash')} style={{ accentColor: 'var(--steel)' }} /> GCash
            </label>
          </div>
        </div>

        <datalist id="ph-banks">{PH_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label">Bank name</div><input className="input" list="ph-banks" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Start typing to search…" /></div>
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
