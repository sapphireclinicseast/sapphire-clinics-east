'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

function DocField({ label, value, onFile }: { label: string; value: string | null; onFile: (f: File) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[color:var(--line-2)] bg-white px-4 py-6 text-center hover:border-[color:var(--sky)]">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--steel)]"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
      <span className="text-[13px] font-semibold text-[color:var(--ink)]">{value ? `${label} ✓` : `Upload ${label}`}</span>
      <span className="text-[11px] text-[color:var(--muted)]">Photo or PDF</span>
      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </label>
  )
}

export default function DoctorVerifyForm({ status, prcNumber, hasPrc, hasId, rejection }: { status: string; prcNumber: string; hasPrc: boolean; hasId: boolean; rejection: string }) {
  const router = useRouter()
  const [prc, setPrc] = useState(prcNumber)
  const [prcFile, setPrcFile] = useState<string | null>(hasPrc ? 'kept' : null)
  const [idFile, setIdFile] = useState<string | null>(hasId ? 'kept' : null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setMsg(null)
    try {
      const body: Record<string, unknown> = { prcNumber: prc }
      if (prcFile && prcFile !== 'kept') body.prcLicenseFile = prcFile
      if (idFile && idFile !== 'kept') body.governmentIdFile = idFile
      const r = await fetch('/api/doctor/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed')
      router.refresh(); setMsg('Submitted — SCEI will review your documents shortly.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (status === 'VERIFIED') return (
    <div className="card text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
      <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">You’re verified</h2>
      <p className="mt-1 text-[13px] text-[color:var(--slate)]">Your account is live. Set your fee and availability on the Consults tab.</p>
    </div>
  )

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Verify your identity &amp; licence</h2>
        <p className="mt-1 text-[13px] text-[color:var(--slate)]">Upload your PRC licence and a government ID so SCEI can verify you before you go live.</p>
      </div>
      {status === 'PENDING' && <div className="rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900">Your documents are under review (usually 24–48 hours). You can resubmit if anything changed.</div>}
      {status === 'REJECTED' && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">{rejection || 'Your submission needs another look.'} Please resubmit.</div>}
      <div>
        <div className="label">PRC licence number</div>
        <input className="input max-w-xs" value={prc} onChange={(e) => setPrc(e.target.value)} placeholder="e.g. 0123456" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DocField label="PRC licence" value={prcFile} onFile={async (f) => setPrcFile(await readFile(f))} />
        <DocField label="Government ID" value={idFile} onFile={async (f) => setIdFile(await readFile(f))} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !prcFile || !idFile} onClick={submit}>{busy ? 'Submitting…' : status === 'PENDING' ? 'Resubmit' : 'Submit for verification'}</button>
        {msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}
      </div>
    </div>
  )
}
