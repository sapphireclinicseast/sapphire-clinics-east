'use client'

import { useState } from 'react'
import CameraCapture from '@/components/CameraCapture'

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

export default function ReqUpload({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)

  async function submit(dataUri: string) {
    if (dataUri.length > 12_000_000) { setErr('File too large (max ~9 MB).'); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/patient/requests/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, referralFile: dataUri }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setDone(true)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (done) return (
    <div className="card text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
      <h1 className="text-[17px] font-semibold text-[color:var(--ink)]">Referral attached ✓</h1>
      <p className="mt-1 text-[13px] text-[color:var(--slate)]">Your request is now live — therapists near you can see it and reach out. You can close this tab.</p>
    </div>
  )

  return (
    <div className="card">
      <h1 className="text-[17px] font-semibold text-[color:var(--ink)]">Attach your doctor’s referral</h1>
      <p className="mt-1 text-[13px] text-[color:var(--slate)]">Take a photo of your referral or upload a file. Once attached, your request goes live to therapists.</p>
      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" onClick={() => setCamera(true)} disabled={busy} className="btn-primary w-full">Take a photo</button>
        <label className="cursor-pointer rounded-xl border border-[color:var(--line-2)] px-4 py-2.5 text-center text-[14px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--mist)]">
          {busy ? 'Uploading…' : 'Upload file (photo / PDF)'}
          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; if (f) submit(await readFile(f)) }} />
        </label>
      </div>
      <CameraCapture open={camera} onClose={() => setCamera(false)} onCapture={(uri) => { setCamera(false); submit(uri) }} />
    </div>
  )
}
