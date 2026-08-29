'use client'

import { useState } from 'react'
import CityCoveragePicker, { type CoverageArea } from './CityCoveragePicker'

const PROFESSIONS: [string, string][] = [
  ['PT', 'Physical Therapy'], ['OT', 'Occupational Therapy'], ['SLP', 'Speech-Language Pathology'],
  ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychology'], ['MD', 'Medical Doctor'], ['ORTHOSIS', 'Orthosis / Prosthesis'],
]

interface Init { firstName: string; lastName: string; phone: string; profession: string; photo: string; coverageAreas: CoverageArea[] }

// Downscale a photo to a square-ish JPEG so patient-facing photos stay light.
function resizePhoto(file: File, max = 800): Promise<string> {
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

export default function ProfileForm({ email, init }: { email: string; init: Init }) {
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Init>(k: K, v: Init[K]) => setF((s) => ({ ...s, [k]: v }))

  async function onPhoto(file: File | undefined) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setMsg('Photo must be under 8 MB.'); return }
    try { set('photo', await resizePhoto(file)) } catch { setMsg('Could not read that image.') }
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provider/update', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: f.firstName, lastName: f.lastName, phone: f.phone, profession: f.profession, photo: f.photo,
          coverageAreas: f.coverageAreas,
        }),
      })
      const d = await res.json()
      setMsg(res.ok ? 'Saved.' : (d.error ?? 'Save failed'))
    } catch { setMsg('Save failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Photo — patient-facing */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Profile photo</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">This is what clients see when they choose a therapist. Use a clear, professional-looking headshot — good lighting, plain background, and a friendly, approachable look.</p>
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--mist-2)] text-[color:var(--slate)]">
            {f.photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.photo} alt="" className="h-full w-full object-cover" />
              : <span className="text-[24px] font-semibold">{(f.firstName[0] ?? '') + (f.lastName[0] ?? '')}</span>}
          </div>
          <div>
            <label className="btn-outline cursor-pointer !py-2">
              {f.photo ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            {f.photo && <button type="button" onClick={() => set('photo', '')} className="ml-3 text-[12.5px] text-[color:var(--slate)] hover:underline">Remove</button>}
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Your details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><div className="label">First name</div><input className="input" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
          <div><div className="label">Last name</div><input className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
          <div><div className="label">Email</div><input className="input" value={email} disabled style={{ opacity: 0.7 }} /></div>
          <div><div className="label">Cellphone no.</div><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div>
            <div className="label">Profession</div>
            <select className="select" value={f.profession} onChange={(e) => set('profession', e.target.value)}>
              {PROFESSIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* City coverage */}
      <section className="card">
        <h2 className="text-[16px] font-semibold">Cities &amp; areas you cover</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Add every city or municipality you&apos;re willing to travel to for home visits.</p>
        <CityCoveragePicker value={f.coverageAreas} onChange={(v) => set('coverageAreas', v)} />
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
        {msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}
      </div>
    </div>
  )
}
