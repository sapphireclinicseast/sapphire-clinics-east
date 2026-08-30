'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

export default function AddSpecialization() {
  const router = useRouter()
  const [specialization, setSpecialization] = useState('')
  const [certName, setCertName] = useState('')
  const [certFile, setCertFile] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/provider/specialization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ specialization, certName, certFile }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setMsg({ ok: true, text: 'Submitted. An admin will review your certificate; once approved you can set a specialized rate.' })
      setSpecialization(''); setCertName(''); setCertFile(''); setFileName(''); router.refresh()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed' }) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className="label">Specialization</div><input className="input" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g. Pediatric NDT" /></div>
        <div><div className="label">Certificate title (optional)</div><input className="input" value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="e.g. NDT Certification 2024" /></div>
      </div>
      <div className="flex items-center gap-3">
        <label className="btn-outline cursor-pointer !py-2">
          {certFile ? 'Change certificate' : 'Upload certificate'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 12_000_000) { setMsg({ ok: false, text: 'File too large (max ~9 MB).' }); return } setCertFile(await readFile(f)); setFileName(f.name) }} />
        </label>
        {fileName && <span className="text-[12.5px] text-[color:var(--slate)]">{fileName}</span>}
      </div>
      {msg && <div className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <button className="btn-primary" disabled={busy || !specialization || !certFile} onClick={submit}>{busy ? 'Submitting…' : 'Submit specialization for review'}</button>
    </div>
  )
}
