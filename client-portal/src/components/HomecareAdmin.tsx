'use client'

// Homecare configuration — rendered as the "Homecare" tab inside the /admin
// console (shares the Aurora admin session). Writes to the operations app via
// the token-injecting /api/homecare-admin proxy. Branches are shown with their
// Aura Health codes (AHEA / AHGH); the underlying branch id stays SBEA / SBGH.

import { useCallback, useEffect, useState } from 'react'

const A = '/api/homecare-admin'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Short = 'SBEA' | 'SBGH'
// Display label for each internal branch code.
const BR: Record<Short, string> = { SBEA: 'AHEA', SBGH: 'AHGH' }
const BR_NAME: Record<Short, string> = { SBEA: 'Aura Health East', SBGH: 'Aura Health Greenhills' }

// Shared control styles matching the admin console.
const input = 'w-full px-3 py-2 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20'
const btnPrimary = 'px-4 py-2 rounded-xl text-white text-sm font-medium'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }
const btnAdd = 'text-sm px-3 py-2 rounded-lg text-[color:var(--deep-teal)] bg-[color:var(--pale-teal)] hover:opacity-80 font-medium'
const sectionCls = 'bg-white rounded-2xl border border-[color:var(--light-gray)] p-5'
const h2Cls = 'font-semibold text-[color:var(--charcoal)]'
const h2Style = { fontFamily: 'var(--font-display)' as const }

interface Clinic { id: Short; name: string; address: string | null; latitude: number; longitude: number; active: boolean }
interface City { id: string; name: string; province: string | null; active: boolean; _count?: { openDays: number } }
interface OpenDay { id: string; cityId: string; branch: Short; dayOfWeek: number; startTime: string; endTime: string; capacity: number; disabled: boolean; used: number; notes: string | null }
interface SurgeWin { label?: string; days: number[]; startHour: number; endHour: number; multiplier: number }
interface Settings {
  sessionFee: number; baseFare: number; baseKm: number; shortRatePerKm: number; shortMaxKm: number
  longRatePerKm: number; surge: SurgeWin[]; surgeCap: number; defaultTransportFee: number | null; orsEnabled: boolean
}

export default function HomecareView() {
  return (
    <div className="space-y-6">
      <ClinicsSection />
      <FareSection />
      <CitiesSection />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-2"><label className="block text-xs font-medium uppercase tracking-wide text-[color:var(--mid-gray)] mb-1">{label}</label>{children}</div>
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
    setMsg(null)
    const r = await fetch(`${A}/clinics`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clinics[id]) })
    const d = await r.json()
    setMsg(r.ok ? `${BR[id]} saved.` : (d.error ?? 'Save failed'))
    if (r.ok) load()
  }
  const upd = (id: Short, k: keyof Clinic, v: unknown) => setClinics((s) => ({ ...s, [id]: { ...s[id], [k]: v } }))

  return (
    <section className={sectionCls}>
      <h2 className={h2Cls} style={h2Style}>Clinic origins</h2>
      <p className="mb-4 mt-1 text-sm text-[color:var(--mid-gray)]">Where each branch&apos;s PT travels from. Enter the exact latitude &amp; longitude (from Google Maps).</p>
      {msg && <div className="mb-3 text-sm text-[color:var(--teal)]">{msg}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        {(['SBEA', 'SBGH'] as Short[]).map((id) => (
          <div key={id} className="rounded-xl border border-[color:var(--light-gray)] p-4">
            <div className="mb-2 font-semibold text-[color:var(--charcoal)]">{BR_NAME[id]} ({BR[id]})</div>
            <Field label="Name"><input className={input} value={clinics[id].name ?? ''} onChange={(e) => upd(id, 'name', e.target.value)} /></Field>
            <Field label="Address"><input className={input} value={clinics[id].address ?? ''} onChange={(e) => upd(id, 'address', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude"><input className={input} value={clinics[id].latitude ?? ''} onChange={(e) => upd(id, 'latitude', e.target.value)} placeholder="14.60" /></Field>
              <Field label="Longitude"><input className={input} value={clinics[id].longitude ?? ''} onChange={(e) => upd(id, 'longitude', e.target.value)} placeholder="121.03" /></Field>
            </div>
            <button className={`${btnPrimary} mt-2`} style={btnPrimaryStyle} onClick={() => save(id)}>Save {BR[id]}</button>
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
  if (!s) return <section className={sectionCls}><p className="text-sm text-[color:var(--mid-gray)]">Loading fare settings…</p></section>
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
    <section className={sectionCls}>
      <h2 className={h2Cls} style={h2Style}>Fare &amp; surge</h2>
      <p className="mb-4 mt-1 text-sm text-[color:var(--mid-gray)]">All amounts in ₱. Transport = base fare (first {s.baseKm} km) + per-km rates, from the clinic to the client&apos;s address.</p>
      {msg && <div className="mb-3 text-sm text-[color:var(--teal)]">{msg}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Session fee"><input className={input} value={s.sessionFee} onChange={(e) => upd('sessionFee', e.target.value)} /></Field>
        <Field label="Base fare"><input className={input} value={s.baseFare} onChange={(e) => upd('baseFare', e.target.value)} /></Field>
        <Field label="Base km"><input className={input} value={s.baseKm} onChange={(e) => upd('baseKm', e.target.value)} /></Field>
        <Field label="Short rate /km"><input className={input} value={s.shortRatePerKm} onChange={(e) => upd('shortRatePerKm', e.target.value)} /></Field>
        <Field label="Short band max km"><input className={input} value={s.shortMaxKm} onChange={(e) => upd('shortMaxKm', e.target.value)} /></Field>
        <Field label="Long rate /km"><input className={input} value={s.longRatePerKm} onChange={(e) => upd('longRatePerKm', e.target.value)} /></Field>
        <Field label="Surge cap (×)"><input className={input} value={s.surgeCap} onChange={(e) => upd('surgeCap', e.target.value)} /></Field>
        <Field label="Fallback transport ₱"><input className={input} value={s.defaultTransportFee ?? ''} onChange={(e) => upd('defaultTransportFee', e.target.value)} /></Field>
        <Field label="ORS road distance"><select className={input} value={s.orsEnabled ? 'y' : 'n'} onChange={(e) => upd('orsEnabled', e.target.value === 'y')}><option value="y">Yes</option><option value="n">No (straight-line)</option></select></Field>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold text-[color:var(--charcoal)]">Peak surge windows</div>
          <button className={btnAdd} onClick={addSurge}>+ Add window</button>
        </div>
        {s.surge.length === 0 && <p className="text-sm text-[color:var(--mid-gray)]">No surge — transport charged at base rate all day.</p>}
        <div className="space-y-2">
          {s.surge.map((w, i) => (
            <div key={i} className="rounded-lg border border-[color:var(--light-gray)] p-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input className={`${input} !w-32`} placeholder="Label" value={w.label ?? ''} onChange={(e) => updSurge(i, { label: e.target.value })} />
                <span>from</span><input className={`${input} !w-16`} value={w.startHour} onChange={(e) => updSurge(i, { startHour: Number(e.target.value) })} /><span>h</span>
                <span>to</span><input className={`${input} !w-16`} value={w.endHour} onChange={(e) => updSurge(i, { endHour: Number(e.target.value) })} /><span>h</span>
                <span>×</span><input className={`${input} !w-16`} value={w.multiplier} onChange={(e) => updSurge(i, { multiplier: Number(e.target.value) })} />
                <button className="ml-auto text-sm text-red-600 hover:underline" onClick={() => rmSurge(i)}>Remove</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {DAYS.map((d, di) => (
                  <button key={di} onClick={() => updSurge(i, { days: w.days.includes(di) ? w.days.filter((x) => x !== di) : [...w.days, di] })}
                    className={`rounded px-2 py-0.5 text-xs ${w.days.includes(di) ? 'bg-[color:var(--teal)] text-white' : 'bg-[color:var(--off-white)] text-[color:var(--mid-gray)]'}`}>{d}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className={`${btnPrimary} mt-4`} style={btnPrimaryStyle} onClick={save}>Save fare settings</button>
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
    if (r.ok) { setName(''); setProv(''); load() } else alert((await r.json()).error)
  }
  async function toggle(c: City) { await fetch(`${A}/cities`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, active: !c.active }) }); load() }
  async function del(c: City) { if (!confirm(`Delete ${c.name}? This removes its open dates too.`)) return; const r = await fetch(`${A}/cities?id=${c.id}`, { method: 'DELETE' }); if (r.ok) load(); else alert((await r.json()).error) }

  return (
    <section className={sectionCls}>
      <h2 className={h2Cls} style={h2Style}>Cities &amp; open dates</h2>
      <p className="mb-3 mt-1 text-sm text-[color:var(--mid-gray)]">Add a city, then set the weekly day(s) the serving branch visits it (e.g. every Monday). All clients in a city are batched onto the same day.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${input} !w-48`} placeholder="City name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${input} !w-40`} placeholder="Province (optional)" value={prov} onChange={(e) => setProv(e.target.value)} />
        <button className={btnAdd} onClick={add}>Add city</button>
      </div>
      <div className="space-y-2">
        {cities.map((c) => (
          <div key={c.id} className="rounded-xl border border-[color:var(--light-gray)] p-3">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-[color:var(--charcoal)]">{c.name}{c.province ? `, ${c.province}` : ''}</div>
              {!c.active && <span className="rounded bg-[color:var(--off-white)] px-2 py-0.5 text-[10px] uppercase text-[color:var(--mid-gray)]">hidden</span>}
              <span className="text-xs text-[color:var(--mid-gray)]">{c._count?.openDays ?? 0} weekly slot(s)</span>
              <div className="ml-auto flex gap-3 text-sm">
                <button className="text-[color:var(--deep-teal)] hover:underline" onClick={() => setOpenFor(openFor === c.id ? null : c.id)}>{openFor === c.id ? 'Close' : 'Dates'}</button>
                <button className="text-[color:var(--deep-teal)] hover:underline" onClick={() => toggle(c)}>{c.active ? 'Hide' : 'Show'}</button>
                <button className="text-red-600 hover:underline" onClick={() => del(c)}>Delete</button>
              </div>
            </div>
            {openFor === c.id && <OpenDays cityId={c.id} onChange={load} />}
          </div>
        ))}
        {cities.length === 0 && <p className="text-sm text-[color:var(--mid-gray)]">No cities yet — add one above.</p>}
      </div>
    </section>
  )
}

function OpenDays({ cityId, onChange }: { cityId: string; onChange: () => void }) {
  const [days, setDays] = useState<OpenDay[]>([])
  const [nd, setNd] = useState({ branch: 'SBEA' as Short, dayOfWeek: 1, startTime: '09:00', endTime: '17:00', capacity: 6 })
  const load = useCallback(async () => { const d = await fetch(`${A}/open-days?cityId=${cityId}`).then((r) => r.json()); setDays(d.openDays ?? []) }, [cityId])
  useEffect(() => { load() }, [load])

  async function add() {
    const r = await fetch(`${A}/open-days`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cityId, ...nd }) })
    if (r.ok) { load(); onChange() } else alert((await r.json()).error)
  }
  async function toggle(d: OpenDay) { await fetch(`${A}/open-days`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, disabled: !d.disabled }) }); load() }
  async function del(d: OpenDay) { const r = await fetch(`${A}/open-days?id=${d.id}`, { method: 'DELETE' }); if (r.ok) { load(); onChange() } else alert((await r.json()).error) }

  return (
    <div className="mt-3 border-t border-[color:var(--light-gray)] pt-3">
      <div className="mb-2 flex flex-wrap items-end gap-2 text-sm">
        <select className={`${input} !w-28`} value={nd.branch} onChange={(e) => setNd({ ...nd, branch: e.target.value as Short })}><option value="SBEA">AHEA</option><option value="SBGH">AHGH</option></select>
        <select className={`${input} !w-36`} value={nd.dayOfWeek} onChange={(e) => setNd({ ...nd, dayOfWeek: Number(e.target.value) })} title="weekday">
          {DAYS_FULL.map((d, i) => <option key={i} value={i}>Every {d}</option>)}
        </select>
        <input className={`${input} !w-20`} value={nd.startTime} onChange={(e) => setNd({ ...nd, startTime: e.target.value })} title="start" />
        <input className={`${input} !w-20`} value={nd.endTime} onChange={(e) => setNd({ ...nd, endTime: e.target.value })} title="end" />
        <input className={`${input} !w-16`} value={nd.capacity} onChange={(e) => setNd({ ...nd, capacity: Number(e.target.value) })} title="capacity" />
        <button className={btnAdd} onClick={add}>Add weekly slot</button>
      </div>
      <div className="space-y-1">
        {days.map((d) => (
          <div key={d.id} className={`flex items-center gap-2 text-sm ${d.disabled ? 'opacity-50' : ''}`}>
            <span className="w-16 font-semibold text-[color:var(--charcoal)]">{BR[d.branch]}</span>
            <span className="w-44">Every {DAYS_FULL[d.dayOfWeek]}</span>
            <span className="w-24 text-[color:var(--mid-gray)]">{d.startTime}–{d.endTime}</span>
            <span className="text-[color:var(--mid-gray)]">cap {d.capacity}/day</span>
            <div className="ml-auto flex gap-3">
              <button className="text-[color:var(--deep-teal)] hover:underline" onClick={() => toggle(d)}>{d.disabled ? 'Enable' : 'Disable'}</button>
              <button className="text-red-600 hover:underline" onClick={() => del(d)}>Delete</button>
            </div>
          </div>
        ))}
        {days.length === 0 && <p className="text-sm text-[color:var(--mid-gray)]">No dates yet.</p>}
      </div>
    </div>
  )
}
