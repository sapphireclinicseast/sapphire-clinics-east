'use client'

import { useEffect, useRef, useState } from 'react'

const BANKS = [
  'BDO Unibank', 'Bank of the Philippine Islands (BPI)', 'Metrobank', 'Land Bank of the Philippines',
  'Philippine National Bank (PNB)', 'Security Bank', 'UnionBank', 'RCBC', 'China Bank', 'EastWest Bank',
  'Development Bank of the Philippines (DBP)', 'PSBank', 'Asia United Bank (AUB)', 'Maybank Philippines',
  'CIMB Bank', 'Robinsons Bank', 'Sterling Bank of Asia', 'BDO Network Bank', 'Philtrust Bank',
  'GCash', 'Maya', 'Other',
]

interface Init { prcNumber: string; bankName: string; bankAccountNo: string; bankAccountName: string }

// Downscale an image file to a JPEG data URL (max edge px) to keep uploads small.
function resizeImage(file: File, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d'); if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    const r = new FileReader(); r.onload = () => (img.src = String(r.result)); r.onerror = reject; r.readAsDataURL(file)
  })
}

// Read any file (e.g. PDF) to a data URL as-is.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file) })
}

function PhotoCapture({ label, hint, value, onChange, facing }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; facing: 'user' | 'environment'
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setLive(false) }
  useEffect(() => () => stop(), [])

  async function open() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      streamRef.current = stream; setLive(true)
      // wait a tick for the <video> to mount
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) } }, 0)
    } catch { setErr('Could not open the camera. You can upload a photo instead.') }
  }

  function capture() {
    const v = videoRef.current; if (!v) return
    const max = 1280, scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.drawImage(v, 0, 0, c.width, c.height)
    onChange(c.toDataURL('image/jpeg', 0.85)); stop()
  }

  return (
    <div>
      <div className="label">{label} *</div>
      <p className="mb-1.5 text-[11.5px] text-[color:var(--muted)]">{hint}</p>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="h-24 w-24 rounded-lg border border-[color:var(--line)] object-cover" />
          <button type="button" onClick={() => onChange('')} className="text-[12.5px] font-medium text-[color:var(--steel)] hover:underline">Retake</button>
        </div>
      ) : live ? (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted className="w-full max-w-[280px] rounded-lg border border-[color:var(--line)] bg-black" />
          <div className="flex gap-2">
            <button type="button" onClick={capture} className="btn-primary !py-2">Capture</button>
            <button type="button" onClick={stop} className="btn-outline !py-2">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={open} className="btn-outline !py-2">📷 Open camera</button>
          <label className="btn-outline !py-2 cursor-pointer">
            Upload
            <input type="file" accept="image/*" capture={facing} className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await resizeImage(f)) }} />
          </label>
        </div>
      )}
      {err && <p className="mt-1 text-[12px] text-red-600">{err}</p>}
    </div>
  )
}

function DocField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div>
      <div className="label">{label} *</div>
      <p className="mb-1.5 text-[11.5px] text-[color:var(--muted)]">{hint}</p>
      <input
        type="file" accept="image/*,application/pdf" className="block text-[13px]"
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return
          if (f.size > 8 * 1024 * 1024) return alert('File must be under 8 MB.')
          setName(f.name)
          onChange(f.type === 'application/pdf' ? await fileToDataUrl(f) : await resizeImage(f, 1600))
        }}
      />
      {value && <p className="mt-1 text-[12px] text-[color:var(--slate)]">✓ {name || 'file attached'}</p>}
    </div>
  )
}

export default function VerifyForm({ rejected, rejectionReason, init }: { rejected: boolean; rejectionReason: string; init: Init }) {
  const [face, setFace] = useState('')
  const [prcPhoto, setPrcPhoto] = useState('')
  const [prcNumber, setPrcNumber] = useState(init.prcNumber)
  const [school, setSchool] = useState('')
  const [year, setYear] = useState('')
  const [diploma, setDiploma] = useState('')
  const [tor, setTor] = useState('')
  const [bankName, setBankName] = useState(init.bankName)
  const [bankAccountNo, setBankAccountNo] = useState(init.bankAccountNo)
  const [bankAccountName, setBankAccountName] = useState(init.bankAccountName)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null); setBusy(true)
    try {
      const res = await fetch('/api/provider/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facePhoto: face, prcHoldingPhoto: prcPhoto, prcNumber, school, yearGraduated: year, diplomaScan: diploma, torScan: tor, bankName, bankAccountNo, bankAccountName }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Submission failed')
      window.location.href = '/provider/verify' // re-renders into the "under review" state
    } catch (e) { setErr(e instanceof Error ? e.message : 'Submission failed'); setBusy(false) }
  }

  return (
    <div className="card space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Verify your identity</h1>
        <p className="mt-1 text-[13px] text-[color:var(--slate)]">Nickel therapists are PRC-licensed and identity-verified. Complete this once — SCEI reviews it within 24–48 hours, then your account goes live.</p>
      </div>
      {rejected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Your previous submission needs another look{rejectionReason ? `: ${rejectionReason}` : '.'} Please review and resubmit below.
        </div>
      )}
      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      <section className="space-y-4">
        <PhotoCapture label="Face scan" hint="Take a clear selfie in good lighting, looking straight at the camera." value={face} onChange={setFace} facing="user" />
        <PhotoCapture label="Photo holding your PRC ID" hint="Hold your PRC ID beside your face so both are clearly visible." value={prcPhoto} onChange={setPrcPhoto} facing="environment" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div><div className="label">PRC licence number *</div><input className="input" value={prcNumber} onChange={(e) => setPrcNumber(e.target.value)} /></div>
        <div><div className="label">School graduated from *</div><input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. University of Santo Tomas" /></div>
        <div><div className="label">Year graduated *</div><input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2019" /></div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <DocField label="Diploma scan" hint="A photo or PDF of your diploma." value={diploma} onChange={setDiploma} />
        <DocField label="Transcript of Records (TOR) scan" hint="A photo or PDF of your TOR." value={tor} onChange={setTor} />
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Bank account for payouts</h2>
        <p className="mb-2 mt-0.5 text-[12px] text-[color:var(--slate)]">Where SCEI sends your earnings after clients pay.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">Bank *</div>
            <select className="select" value={bankName} onChange={(e) => setBankName(e.target.value)}>
              <option value="">Select your bank…</option>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <div className="label">Account number *</div>
            {/* text (not number) input so a leading 0 is never dropped */}
            <input className="input" type="text" inputMode="numeric" value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value.replace(/[^0-9]/g, ''))} placeholder="keep leading zeros" />
          </div>
          <div className="sm:col-span-2"><div className="label">Account name *</div><input className="input" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} /></div>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-[color:var(--line)] pt-4">
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
        <span className="text-[12px] text-[color:var(--muted)]">Review takes 24–48 hours.</span>
      </div>
    </div>
  )
}
