'use client'

// Homecare admin console (client.sapphireclinicseast.org/homecare/admin).
// Gated by the same Aurora admin session as /admin. Everything here writes to
// the operations app via the token-injecting /api/homecare-admin proxy:
//   • Clinics  — the PT origin lat/long per branch
//   • Fare     — session fee, per-km tiers, surge windows
//   • Cities   — served cities + their open travel dates

import { useCallback, useEffect, useState } from 'react'

const A = '/api/homecare-admin'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Short = 'SBEA' | 'SBGH'
interface Clinic { id: Short; name: string; address: string | null; latitude: number; longitude: number; active: boolean }
interface City { id: string; name: string; province: string | null; active: boolean; _count?: { openDays: number } }
interface OpenDay { id: string; cityId: string; branch: Short; date: string; startTime: string; endTime: string; capacity: number; disabled: boolean; used: number; notes: string | null }
interface SurgeWin { label?: string; days: number[]; startHour: number; endHour: number; multiplier: number }
interface Settings {
  sessionFee: number; baseFare: number; baseKm: number; shortRatePerKm: number; shortMaxKm: number
  longRatePerKm: number; surge: SurgeWin[]; surgeCap: number; defaultTransportFee: number | null; orsEnabled: boolean
}

export default function HomecareAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => { fetch('/api/admin/login').then((r) => r.json()).then((d) => setAuthed(!!d.authed)).catch(() => setAuthed(false)) }, [])
  if (authed === null) return <div className="p-8 text-sm text-[color:var(--mid-gray)]">Loading…</div>
  if (!authed) return <LoginGate onIn={() => setAuthed(true)} />
  return <Console />
}

function LoginGate({ onIn }: { onIn: () => void }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Login failed')
      onIn()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Login failed') } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="card-static">
        <h1 className="text-[22px] text-[color:var(--deep-teal)]">Homecare Admin</h1>
        <p className="mb-4 mt-1 text-sm text-[color:var(--mid-gray)]">Sign in with your Aurora admin credentials.</p>
        {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={p} onChange={(e) => setP(e.target.value)} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  )
}

function Console() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="text-[26px] text-[color:var(--deep-teal)]">Homecare configuration</h1>
      <ClinicsSection />
      <FareSection />
      <CitiesSection />
    </div>
  )
}

// ── Clinics ────────────────────────────────────────────────────────────────
function ClinicsSection() {
  const [clinics, setClinics] = useState<Record<Short, Partial<Clinic>>>({ SBEA: { id: 'SBEA' }, SBGH: { id: 'SBGH' } })
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => {
    const d = await fetch(`${A}/clinics`).then((r) => r.json())
    const next: Record<Short, Partial<Clinic>> = { SBEA: { id: 'SBEA' }, SBGH: { id: 'SBGH' } }
    for (const c of (d.clinics ?? []) as Clinic[]) next[c.id] = c
    setClinics(next)
  }, [])
  useEffect(() => { load() }, [load])

  async function save(id: Short) {
    const c = clinics[id]
    setMsg(null)
    const r = await fetch(`${A}/clinics`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
    const d = await r.json()
    setMsg(r.ok ? `${id} saved.` : (d.error ?? 'Save failed'))
    if (r.ok) load()
  }
  const upd = (id: Short, k: keyof Clinic, v: unknown) => setClinics((s) => ({ ...s, [id]: { ...s[id], [k]: v } }))

  return (
    <section className="card-static">
      <h2 className="text-[18px] font-semibold text-[color:var(--narra)]">Clinic origins</h2>
      <p className="mb-4 text-[13px] text-[color:var(--mid-gray)]">Where each branch's PT travels from. Enter the exact latitude & longitude (from Google Maps).</p>
      {msg && <div className="mb-3 text-[12px] text-[color:var(--moss)]">{msg}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        {(['SBEA', 'SBGH'] as Short[]).map((id) => (
          <div key={id} className="rounded-xl border border-[color:var(--paper-3)] p-3">
            <div className="mb-2 text-[13px] font-semibold text-[color:var(--narra)]">{id === 'SBEA' ? 'East' : 'Greenhills'} ({id})</div>
            <L label="Name"><input className="input" value={clinics[id].name ?? ''} onChange={(e) => upd(id, 'name', e.target.value)} /></L>
            <L label="Address"><input className="input" value={clinics[id].address ?? ''} onChange={(e) => upd(id, 'address', e.target.value)} /></L>
            <div className="grid grid-cols-2 gap-2">
              <L label="Latitude"><input className="input" value={clinics[id].latitude ?? ''} onChange={(e) => upd(id, 'latitude', e.target.value)} placeholder="14.60" /></L>
              <L label="Longitude"><input className="input" value={clinics[id].longitude ?? ''} onChange={(e) => upd(id, 'longitude', e.target.value)} placeholder="121.03" /></L>
            </div>
            <button className="btn-secondary mt-2 text-[13px]" onClick={() => save(id)}>Save {id}</button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Fare + surge ─────────────────────────────────────────────────────────────
function FareSection() {
  const [s, setS] = useState<Settings | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { fetch(`${A}/settings`).then((r) => r.json()).then((d) => setS(d.settings)).catch(() => {}) }, [])
  if (!s) return <section className="card-static text-sm text-[color:var(--mid-gray)]">Loading fare settings…</section>
  const upd = (k: keyof Settings, v: unknown) => setS((p) => (p ? { ...p, [k]: v } : p))

  async function save() {
    setMsg(null)
    const r = await fetch(`${A}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
    const d = await r.json(); setMsg(r.ok ? 'Saved.' : (d.error ?? 'Save failed')); if (r.ok) setS(d.settings)
  }
  const addSurge = () => upd('surge', [...s.surge, { label: '', days: [1, 2, 3, 4, 5], startHour: 7, endHour: 10, multiplier: 1.2 }])
  const updSurge = (i: number, patch: Partial<SurgeWin>) => upd('surge', s.surge.map((w, j) => (j === i ? { ...w, ...patch } : w)))
  const rmSurge = (i: number) => upd('surge', s.surge.filter((_, j) => j !== i))

  return (
    <section className="card-static">
      <h2 className="text-[18px] font-semibold text-[color:var(--narra)]">Fare & surge</h2>
      <p className="mb-4 text-[13px] text-[color:var(--mid-gray)]">All amounts in ₱. Transport = base fare (first {s.baseKm} km) + per-km rates, from the clinic to the client's address.</p>
      {msg && <div className="mb-3 text-[12px] text-[color:var(--moss)]">{msg}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <L label="Session fee"><input className="input" value={s.sessionFee} onChange={(e) => upd('sessionFee', e.target.value)} /></L>
        <L label="Base fare"><input className="input" value={s.baseFare} onChange={(e) => upd('baseFare', e.target.value)} /></L>
        <L label="Base km (covered by base)"><input className="input" value={s.baseKm} onChange={(e) => upd('baseKm', e.target.value)} /></L>
        <L label="Short rate /km"><input className="input" value={s.shortRatePerKm} onChange={(e) => upd('shortRatePerKm', e.target.value)} /></L>
        <L label="Short band max km"><input className="input" value={s.shortMaxKm} onChange={(e) => upd('shortMaxKm', e.target.value)} /></L>
        <L label="Long rate /km (beyond)"><input className="input" value={s.longRatePerKm} onChange={(e) => upd('longRatePerKm', e.target.value)} /></L>
        <L label="Surge cap (×)"><input className="input" value={s.surgeCap} onChange={(e) => upd('surgeCap', e.target.value)} /></L>
        <L label="Fallback transport ₱ (geocode fails)"><input className="input" value={s.defaultTransportFee ?? ''} onChange={(e) => upd('defaultTransportFee', e.target.value)} /></L>
        <L label="Use ORS road distance"><select className="select" value={s.orsEnabled ? 'y' : 'n'} onChange={(e) => upd('orsEnabled', e.target.value === 'y')}><option value="y">Yes</option><option value="n">No (straight-line)</option></select></L>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[color:var(--narra)]">Peak surge windows</div>
          <button className="text-[12px] text-[color:var(--moss)] hover:underline" onClick={addSurge}>+ Add window</button>
        </div>
        {s.surge.length === 0 && <p className="text-[12px] text-[color:var(--mid-gray)]">No surge — transport charged at base rate all day.</p>}
        <div className="space-y-2">
          {s.surge.map((w, i) => (
            <div key={i} className="rounded-lg border border-[color:var(--paper-3)] p-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <input className="input !w-28" placeholder="Label" value={w.label ?? ''} onChange={(e) => updSurge(i, { label: e.target.value })} />
                <span>from</span><input className="input !w-16" value={w.startHour} onChange={(e) => updSurge(i, { startHour: Number(e.target.value) })} /><span>h</span>
                <span>to</span><input className="input !w-16" value={w.endHour} onChange={(e) => updSurge(i, { endHour: Number(e.target.value) })} /><span>h</span>
                <span>×</span><input className="input !w-16" value={w.multiplier} onChange={(e) => updSurge(i, { multiplier: Number(e.target.value) })} />
                <button className="ml-auto text-rose-600 hover:underline" onClick={() => rmSurge(i)}>Remove</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {DAYS.map((d, di) => (
                  <button key={di} onClick={() => updSurge(i, { days: w.days.includes(di) ? w.days.filter((x) => x !== di) : [...w.days, di] })}
                    className={`rounded px-2 py-0.5 text-[11px] ${w.days.includes(di) ? 'bg-[color:var(--moss)] text-white' : 'bg-[color:var(--paper-2)] text-[color:var(--mid-gray)]'}`}>{d}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className="btn-primary mt-4" onClick={save}>Save fare settings</button>
    </section>
  )
}

// ── Cities + open days ───────────────────────────────────────────────────────
function CitiesSection() {
  const [cities, setCities] = useState<City[]>([])
  const [name, setName] = useState(''); const [prov, setProv] = useState('')
  const [openFor, setOpenFor] = useState<string | null>(null)
  const load = useCallback(async () => { const d = await fetch(`${A}/cities`).then((r) => r.json()); setCities(d.cities ?? []) }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!name.trim()) return
    const r = await fetch(`${A}/cities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, province: prov }) })
    if (r.ok) { setName(''); setProv(''); load() }
  }
  async function toggle(c: City) { await fetch(`${A}/cities`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, active: !c.active }) }); load() }
  async function del(c: City) { if (!confirm(`Delete ${c.name}? This removes its open dates too.`)) return; const r = await fetch(`${A}/cities?id=${c.id}`, { method: 'DELETE' }); if (r.ok) load(); else alert((await r.json()).error) }

  return (
    <section className="card-static">
      <h2 className="text-[18px] font-semibold text-[color:var(--narra)]">Cities & open dates</h2>
      <div className="mb-3 mt-2 flex flex-wrap gap-2">
        <input className="input !w-48" placeholder="City name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input !w-40" placeholder="Province (optional)" value={prov} onChange={(e) => setProv(e.target.value)} />
        <button className="btn-secondary text-[13px]" onClick={add}>Add city</button>
      </div>
      <div className="space-y-2">
        {cities.map((c) => (
          <div key={c.id} className="rounded-xl border border-[color:var(--paper-3)] p-3">
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-semibold text-[color:var(--narra)]">{c.name}{c.province ? `, ${c.province}` : ''}</div>
              {!c.active && <span className="rounded bg-[color:var(--paper-2)] px-2 py-0.5 text-[10px] uppercase text-[color:var(--mid-gray)]">hidden</span>}
              <span className="text-[11px] text-[color:var(--mid-gray)]">{c._count?.openDays ?? 0} date(s)</span>
              <div className="ml-auto flex gap-2 text-[12px]">
                <button className="text-[color:var(--moss)] hover:underline" onClick={() => setOpenFor(openFor === c.id ? null : c.id)}>{openFor === c.id ? 'Close' : 'Dates'}</button>
                <button className="text-[color:var(--moss)] hover:underline" onClick={() => toggle(c)}>{c.active ? 'Hide' : 'Show'}</button>
                <button className="text-rose-600 hover:underline" onClick={() => del(c)}>Delete</button>
              </div>
            </div>
            {openFor === c.id && <OpenDays cityId={c.id} onChange={load} />}
          </div>
        ))}
        {cities.length === 0 && <p className="text-[13px] text-[color:var(--mid-gray)]">No cities yet — add one above.</p>}
      </div>
    </section>
  )
}

function OpenDays({ cityId, onChange }: { cityId: string; onChange: () => void }) {
  const [days, setDays] = useState<OpenDay[]>([])
  const [nd, setNd] = useState({ branch: 'SBEA' as Short, date: '', startTime: '09:00', endTime: '17:00', capacity: 6 })
  const load = useCallback(async () => { const d = await fetch(`${A}/open-days?cityId=${cityId}`).then((r) => r.json()); setDays(d.openDays ?? []) }, [cityId])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!nd.date) return
    const r = await fetch(`${A}/open-days`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cityId, ...nd }) })
    if (r.ok) { setNd({ ...nd, date: '' }); load(); onChange() } else alert((await r.json()).error)
  }
  async function toggle(d: OpenDay) { await fetch(`${A}/open-days`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, disabled: !d.disabled }) }); load() }
  async function del(d: OpenDay) { const r = await fetch(`${A}/open-days?id=${d.id}`, { method: 'DELETE' }); if (r.ok) { load(); onChange() } else alert((await r.json()).error) }

  return (
    <div className="mt-3 border-t border-[color:var(--paper-3)] pt-3">
      <div className="mb-2 flex flex-wrap items-end gap-2 text-[12px]">
        <select className="select !w-24" value={nd.branch} onChange={(e) => setNd({ ...nd, branch: e.target.value as Short })}><option value="SBEA">East</option><option value="SBGH">Greenhills</option></select>
        <input className="input !w-40" type="date" value={nd.date} onChange={(e) => setNd({ ...nd, date: e.target.value })} />
        <input className="input !w-20" value={nd.startTime} onChange={(e) => setNd({ ...nd, startTime: e.target.value })} />
        <input className="input !w-20" value={nd.endTime} onChange={(e) => setNd({ ...nd, endTime: e.target.value })} />
        <input className="input !w-16" value={nd.capacity} onChange={(e) => setNd({ ...nd, capacity: Number(e.target.value) })} title="capacity" />
        <button className="btn-secondary text-[12px]" onClick={add}>Add date</button>
      </div>
      <div className="space-y-1">
        {days.map((d) => (
          <div key={d.id} className={`flex items-center gap-2 text-[12px] ${d.disabled ? 'opacity-50' : ''}`}>
            <span className="w-16 font-semibold">{d.branch === 'SBEA' ? 'East' : 'GH'}</span>
            <span className="w-40">{new Date(d.date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="w-24">{d.startTime}–{d.endTime}</span>
            <span className="text-[color:var(--mid-gray)]">{d.used}/{d.capacity} booked</span>
            <div className="ml-auto flex gap-2">
              <button className="text-[color:var(--moss)] hover:underline" onClick={() => toggle(d)}>{d.disabled ? 'Enable' : 'Disable'}</button>
              <button className="text-rose-600 hover:underline" onClick={() => del(d)}>Delete</button>
            </div>
          </div>
        ))}
        {days.length === 0 && <p className="text-[12px] text-[color:var(--mid-gray)]">No dates yet.</p>}
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-2"><div className="label">{label}</div>{children}</div>
}
