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

function PhotoCapture({ label, hint, value, onChange, facing, guide }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; facing: 'user' | 'environment'; guide?: 'face'
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setLive(false) }
  useEffect(() => () => stop(), [])

  // Attach the stream once the <video> is actually in the DOM (setting srcObject
  // before mount was leaving the preview black).
  useEffect(() => {
    if (!live) return
    const v = videoRef.current, s = streamRef.current
    if (v && s) { v.srcObject = s; v.play().catch(() => {}) }
  }, [live])

  async function open() {
    setErr(null)
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      setLive(true)
    } catch { setErr('Could not open the camera — check camera permission, or upload a photo instead.') }
  }

  function capture() {
    const v = videoRef.current
    if (!v || !v.videoWidth || !v.videoHeight) { setErr('The camera is still starting — wait a second, then tap Capture.'); return }
    const max = 1280, scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.drawImage(v, 0, 0, c.width, c.height)
    const url = c.toDataURL('image/jpeg', 0.85)
    if (url.length < 100) { setErr('Could not capture — try again.'); return }
    onChange(url); stop()
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
          <div className="relative w-full max-w-[280px]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border border-[color:var(--line)] bg-black" style={{ minHeight: 200, objectFit: 'cover', ...(guide === 'face' ? { transform: 'scaleX(-1)' } : {}) }} />
            {guide === 'face' && (
              <>
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: '58%', height: '82%', border: '2px dashed rgba(255,255,255,0.9)', borderRadius: '50% / 50%' }} />
                <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] font-medium text-white/90" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>Align your face within the oval</div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={capture} className="btn-primary !py-2">Capture</button>
            <button type="button" onClick={stop} className="btn-outline !py-2">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={open} className="btn-outline !py-2 inline-flex items-center gap-2">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8Z"/><circle cx="12" cy="13" r="3.2"/></svg>
            Open camera
          </button>
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
  const [yearsExp, setYearsExp] = useState('')
  const [postgrad, setPostgrad] = useState('')
  const [postNominals, setPostNominals] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [specializedRate, setSpecializedRate] = useState('')
  const [certs, setCerts] = useState<{ name: string; file: string }[]>([])
  const [certName, setCertName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function addCert(file: File | undefined) {
    if (!file) return
    if (!certName.trim()) { setErr('Name the certification before uploading its file.'); return }
    if (file.size > 8 * 1024 * 1024) { setErr('Certification file must be under 8 MB.'); return }
    setErr(null)
    const dataUrl = file.type === 'application/pdf' ? await fileToDataUrl(file) : await resizeImage(file, 1600)
    setCerts((c) => [...c, { name: certName.trim(), file: dataUrl }]); setCertName('')
  }

  async function submit() {
    setErr(null); setBusy(true)
    try {
      const res = await fetch('/api/provider/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facePhoto: face, prcHoldingPhoto: prcPhoto, prcNumber, school, yearGraduated: year,
          yearsExperience: yearsExp, postgraduate: postgrad, postNominals,
          diplomaScan: diploma, torScan: tor, bankName, bankAccountNo, bankAccountName,
          specialization, specializedRate, certifications: certs }),
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
        <PhotoCapture label="Face scan" hint="Open the camera and line your face up inside the oval, then capture." value={face} onChange={setFace} facing="user" guide="face" />
        <PhotoCapture label="Photo holding your PRC ID" hint="Hold your PRC ID beside your face so both are clearly visible." value={prcPhoto} onChange={setPrcPhoto} facing="environment" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div><div className="label">PRC licence number *</div><input className="input" value={prcNumber} onChange={(e) => setPrcNumber(e.target.value)} /></div>
        <div><div className="label">School graduated from *</div><input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. University of Santo Tomas" /></div>
        <div><div className="label">Year graduated *</div><input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2019" /></div>
        <div><div className="label">Years of experience *</div><input className="input" inputMode="numeric" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} placeholder="e.g. 8" /></div>
        <div><div className="label">Postgraduate degree(s)</div><input className="input" value={postgrad} onChange={(e) => setPostgrad(e.target.value)} placeholder="e.g. MS Physical Therapy" /></div>
        <div><div className="label">Post-nominals <span className="text-[color:var(--muted)]">(shown after your name)</span></div><input className="input" value={postNominals} onChange={(e) => setPostNominals(e.target.value)} placeholder="e.g. PTRP, DPT" /></div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <DocField label="Diploma scan" hint="A photo or PDF of your diploma." value={diploma} onChange={setDiploma} />
        <DocField label="Transcript of Records (TOR) scan" hint="A photo or PDF of your TOR." value={tor} onChange={setTor} />
      </section>

      <section className="rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-4">
        <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Specialization <span className="text-[12px] font-normal text-[color:var(--slate)]">— optional</span></h2>
        <p className="mb-3 mt-0.5 text-[12px] text-[color:var(--slate)]">Have a certification or specialization? Add it and upload the certificate. Once SCEI verifies it, you can charge a <b>specialized rate</b> for that service.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label">Specialization</div><input className="input" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g. Pediatric NDT" /></div>
          <div><div className="label">Specialized rate (₱)</div><input className="input" inputMode="numeric" value={specializedRate} onChange={(e) => setSpecializedRate(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 2400" /></div>
        </div>
        {certs.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {certs.map((c, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-[color:var(--line-2)] bg-white px-3 py-2 text-[13px]">
                <span>🏅 {c.name}</span>
                <button type="button" onClick={() => setCerts((cc) => cc.filter((_, j) => j !== i))} className="text-[color:var(--muted)] hover:text-[color:var(--ink)]">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]"><div className="label">Certification name</div><input className="input" value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="e.g. NDT Certification" /></div>
          <label className="btn-outline cursor-pointer !py-2">Upload certificate<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => addCert(e.target.files?.[0])} /></label>
        </div>
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
