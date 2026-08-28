'use client'

import { useState } from 'react'

const PROFESSIONS: [string, string][] = [
  ['PT', 'Physical Therapy'], ['OT', 'Occupational Therapy'], ['SLP', 'Speech-Language Pathology'],
  ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychology'], ['MD', 'Medical Doctor'], ['ORTHOSIS', 'Orthosis / Prosthesis'],
]

interface Init { firstName: string; lastName: string; phone: string; profession: string; photo: string; citiesCovered: string }

export default function ProfileForm({ email, init }: { email: string; init: Init }) {
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Init>(k: K, v: Init[K]) => setF((s) => ({ ...s, [k]: v }))

  function onPhoto(file: File | undefined) {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setMsg('Photo must be under 3 MB.'); return }
    const r = new FileReader(); r.onload = () => set('photo', String(r.result)); r.readAsDataURL(file)
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provider/update', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: f.firstName, lastName: f.lastName, phone: f.phone, profession: f.profession, photo: f.photo,
          citiesCovered: f.citiesCovered.split(',').map((c) => c.trim()).filter(Boolean),
        }),
      })
      const d = await res.json()
      setMsg(res.ok ? 'Saved.' : (d.error ?? 'Save failed'))
    } catch { setMsg('Save failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--mist-2)] text-[color:var(--slate)]">
            {f.photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.photo} alt="" className="h-full w-full object-cover" />
              : <span className="text-[22px] font-semibold">{(f.firstName[0] ?? '') + (f.lastName[0] ?? '')}</span>}
          </div>
          <div>
            <div className="label">Profile photo</div>
            <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} className="block text-[13px]" />
          </div>
        </div>
      </section>

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
          <div className="sm:col-span-2">
            <div className="label">Cities covered (comma-separated)</div>
            <input className="input" value={f.citiesCovered} onChange={(e) => set('citiesCovered', e.target.value)} placeholder="Quezon City, Marikina, Pasig" />
            <p className="mt-1 text-[11px] text-[color:var(--slate)]">Clients in these cities can find and book you.</p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
        {msg && <span className="text-[13px] text-[color:var(--slate)]">{msg}</span>}
      </div>
    </div>
  )
}
