'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}
function Doc({ label, required, value, onFile }: { label: string; required?: boolean; value: boolean; onFile: (f: File) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-[color:var(--line-2)] bg-white px-4 py-3 hover:border-[color:var(--sky)]">
      <span className="text-[13px] font-medium text-[color:var(--ink)]">{label}{required ? ' *' : ' (if applicable)'}</span>
      <span className="text-[12px] font-semibold text-[color:var(--steel)]">{value ? 'Uploaded ✓ — replace' : 'Upload'}</span>
      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </label>
  )
}

interface Has { secDti: boolean; bir: boolean; aoi: boolean; byLaws: boolean; permit: boolean }

export default function ClinicVerifyForm({ status, businessType, tin, rejection, has }: { status: string; businessType: string; tin: string; rejection: string; has: Has }) {
  const router = useRouter()
  const [bType, setBType] = useState(businessType)
  const [tinNo, setTinNo] = useState(tin)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const setFile = async (k: string, f: File) => { if (f.size > 8_000_000) { setMsg('File too large (max ~6 MB).'); return } const data = await readFile(f); setFiles((s) => ({ ...s, [k]: data })) }
  const FIELD: Record<keyof Has, string> = { secDti: 'secDtiFile', bir: 'bir2303File', aoi: 'aoiFile', byLaws: 'byLawsFile', permit: 'businessPermitFile' }
  const uploaded = (k: keyof Has) => has[k] || !!files[FIELD[k]]

  async function submit() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/clinic/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessType: bType, tin: tinNo, ...files }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      router.refresh(); setMsg('Submitted — SCEI will review your documents shortly.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (status === 'VERIFIED') return (
    <div className="card text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
      <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Your clinic is verified</h2>
      <p className="mt-1 text-[13px] text-[color:var(--slate)]">You can onboard patients and therapists and arrange home visits.</p>
    </div>
  )

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Business documents</h2>
        <p className="mt-1 text-[13px] text-[color:var(--slate)]">Upload your registration documents so SCEI can verify your clinic partnership.</p>
      </div>
      {status === 'PENDING' && <div className="rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900">Under review (usually 1–2 business days). You can resubmit if anything changed.</div>}
      {status === 'REJECTED' && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">{rejection || 'Your submission needs another look.'} Please resubmit.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className="label">Business type</div>
          <select className="select" value={bType} onChange={(e) => setBType(e.target.value)}>
            <option value="SOLE_PROP">Sole proprietorship</option>
            <option value="PARTNERSHIP">Partnership</option>
            <option value="CORPORATION">Corporation</option>
          </select>
        </div>
        <div><div className="label">TIN</div><input className="input" value={tinNo} onChange={(e) => setTinNo(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Doc label="SEC / DTI registration" required value={uploaded('secDti')} onFile={(f) => setFile('secDtiFile', f)} />
        <Doc label="BIR Form 2303 (Certificate of Registration)" required value={uploaded('bir')} onFile={(f) => setFile('bir2303File', f)} />
        <Doc label="Mayor's / Business permit" required value={uploaded('permit')} onFile={(f) => setFile('businessPermitFile', f)} />
        <Doc label="Articles of Incorporation (corporations)" value={uploaded('aoi')} onFile={(f) => setFile('aoiFile', f)} />
        <Doc label="By-Laws (corporations)" value={uploaded('byLaws')} onFile={(f) => setFile('byLawsFile', f)} />
      </div>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : status === 'PENDING' ? 'Resubmit' : 'Submit for verification'}</button>{msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}</div>
    </div>
  )
}
