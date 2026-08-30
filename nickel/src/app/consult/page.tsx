'use client'

import { useEffect, useState, type FormEvent } from 'react'

interface Slot { date: string; startTime: string; endTime: string }
interface Doc { id: string; name: string; photo: string | null; specialization: string | null; consultFee: number | null; teleconsult: boolean; inPerson: boolean; clinicName: string | null; clinicAddress: string | null; clinicCity: string | null; slots: Slot[] }
interface Me { id: string; firstName: string }

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

export default function ConsultPage() {
  const [mode, setMode] = useState<'TELECONSULT' | 'IN_PERSON' | null>(null)
  const [city, setCity] = useState('')
  const [cities, setCities] = useState<string[]>([])
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [reason, setReason] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [amode, setAmode] = useState<'signup' | 'login'>('signup')
  const [af, setAf] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', password: '', confirm: '' })
  const setA = (k: keyof typeof af, v: string) => setAf((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    fetch('/api/patient/me').then((r) => r.json()).then((d) => setMe(d.patient)).catch(() => {})
    fetch('/api/cities').then((r) => r.json()).then((d) => setCities(d.cities ?? [])).catch(() => {})
  }, [])

  async function loadDocs(m: string, c?: string) {
    setDocs(null)
    const q = new URLSearchParams({ mode: m }); if (c) q.set('city', c)
    const d = await fetch(`/api/doctors?${q}`).then((r) => r.json())
    setDocs(d.doctors ?? [])
  }
  function chooseMode(m: 'TELECONSULT' | 'IN_PERSON') { setErr(null); setMode(m); if (m === 'TELECONSULT') loadDocs(m); }

  async function doAuth(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (amode === 'signup') { if (af.password.length < 8) return setErr('Password must be at least 8 characters.'); if (af.password !== af.confirm) return setErr('Passwords do not match.') }
    setBusy(true)
    try {
      const url = amode === 'signup' ? '/api/patient/signup' : '/api/patient/login'
      const body = amode === 'signup' ? { firstName: af.firstName, lastName: af.lastName, email: af.email, phone: af.phone, address: af.address, city: city || undefined, password: af.password } : { email: af.email, password: af.password }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      const meRes = await fetch('/api/patient/me').then((x) => x.json()); setMe(meRes.patient)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  async function pay() {
    if (!doc || !slot || !mode) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/consult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId: doc.id, mode, date: slot.date, startTime: slot.startTime, reason }) })
      const d = await r.json(); if (!r.ok || !d.checkoutUrl) throw new Error(d.error ?? 'Could not start payment.')
      window.location.href = d.checkoutUrl
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  const byDate: [string, Slot[]][] = doc ? Object.entries(doc.slots.reduce((a, s) => { (a[s.date] ??= []).push(s); return a }, {} as Record<string, Slot[]>)) : []

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <div className="card">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Rehab doctor consult</div>
        <h1 className="mt-1 text-[24px] font-semibold">See a rehab doctor</h1>
        <p className="mb-5 mt-1 text-[13px] text-[color:var(--slate)]">A doctor’s referral is required for home PT in the Philippines. Book a rehab-medicine consult — online or in person — and get your referral.</p>
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

        {/* MODE */}
        {!mode && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => chooseMode('TELECONSULT')} className="rounded-xl border border-[color:var(--line-2)] bg-white p-4 text-left hover:border-[color:var(--sky)]">
              <div className="text-[15px] font-semibold text-[color:var(--ink)]">Teleconsult (video)</div>
              <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">Meet the doctor over video, right here in Nickel. Fastest way to get a referral.</p>
            </button>
            <button onClick={() => chooseMode('IN_PERSON')} className="rounded-xl border border-[color:var(--line-2)] bg-white p-4 text-left hover:border-[color:var(--sky)]">
              <div className="text-[15px] font-semibold text-[color:var(--ink)]">In-person clinic visit</div>
              <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">Visit the doctor’s clinic for your consult.</p>
            </button>
          </div>
        )}

        {/* CITY (in-person) */}
        {mode === 'IN_PERSON' && !city && (
          <div>
            <button onClick={() => setMode(null)} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← Back</button>
            <div className="label">Which city?</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {cities.map((c) => <button key={c} onClick={() => { setCity(c); loadDocs('IN_PERSON', c) }} className="rounded-xl border border-[color:var(--line-2)] bg-white p-3.5 text-left text-[15px] font-medium hover:border-[color:var(--sky)]">{c}</button>)}
            </div>
          </div>
        )}

        {/* DOCTORS */}
        {mode && (mode === 'TELECONSULT' || city) && !doc && (
          <div>
            <button onClick={() => { setMode(null); setCity(''); setDocs(null) }} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← Back</button>
            <div className="label">Choose a rehab doctor</div>
            {!docs && <p className="text-[13px] text-[color:var(--slate)]">Loading doctors…</p>}
            {docs && docs.length === 0 && <p className="text-[13px] text-[color:var(--slate)]">No doctors available for this option yet. Please check back soon.</p>}
            <div className="space-y-2">
              {docs?.map((p) => (
                <button key={p.id} onClick={() => setDoc(p)} className="flex w-full items-start gap-3 rounded-xl border border-[color:var(--line-2)] bg-white p-3.5 text-left hover:border-[color:var(--sky)]">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[color:var(--mist-2)] text-[13px] font-semibold text-[color:var(--slate)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : `Dr`}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[color:var(--ink)]">Dr. {p.name}</span>
                    <span className="block text-[12px] text-[color:var(--slate)]">{p.specialization}</span>
                    {mode === 'IN_PERSON' && p.clinicName && <span className="block text-[11.5px] text-[color:var(--muted)]">{p.clinicName}{p.clinicAddress ? ` · ${p.clinicAddress}` : ''}</span>}
                    <span className="mt-0.5 block text-[11px] font-medium text-[color:var(--steel)]">{p.slots.length} open slot{p.slots.length === 1 ? '' : 's'} →</span>
                  </span>
                  <span className="shrink-0 text-[15px] font-bold text-[color:var(--steel-deep)]">{p.consultFee != null ? peso(p.consultFee) : ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TIME */}
        {doc && !slot && (
          <div>
            <button onClick={() => setDoc(null)} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← Dr. {doc.name}</button>
            <div className="label">Pick a time</div>
            <div className="space-y-3">
              {byDate.map(([date, slots]) => (
                <div key={date}>
                  <div className="mb-1.5 text-[13px] font-semibold text-[color:var(--ink)]">{fmtDate(date)}</div>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => <button key={s.startTime} onClick={() => setSlot(s)} className="rounded-lg border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-[13px] font-medium hover:border-[color:var(--sky)]">{fmtTime(s.startTime)}</button>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONFIRM + AUTH */}
        {doc && slot && (
          <div>
            <button onClick={() => setSlot(null)} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← Change time</button>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-4">
              <div className="text-[13px] text-[color:var(--slate)]">Dr. {doc.name} · {mode === 'TELECONSULT' ? 'Teleconsult (video)' : 'In-person consult'}</div>
              <div className="mt-1 text-[16px] font-semibold text-[color:var(--ink)]">{fmtDate(slot.date)} · {fmtTime(slot.startTime)}</div>
              {mode === 'IN_PERSON' && doc.clinicAddress && <div className="text-[12.5px] text-[color:var(--slate)]">{doc.clinicName} · {doc.clinicAddress}</div>}
              <div className="my-3 h-px bg-[color:var(--line)]" />
              <div className="flex items-center justify-between text-[14px]"><span className="font-semibold text-[color:var(--slate)]">Consult fee</span><span className="text-[18px] font-bold text-[color:var(--steel-deep)]">{doc.consultFee != null ? peso(doc.consultFee) : ''}</span></div>
            </div>
            <div className="mt-3"><div className="label">Reason for the consult (optional)</div><textarea className="input min-h-[64px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. lower back pain, need a referral for home PT" /></div>

            {!me ? (
              <div className="mt-4">
                <div className="text-[14px] font-semibold text-[color:var(--ink)]">{amode === 'signup' ? 'Create your account to confirm' : 'Sign in to confirm'}</div>
                <div className="my-3 flex rounded-xl border border-[color:var(--line)] p-1 text-[13px]">
                  <button type="button" onClick={() => setAmode('signup')} className={`flex-1 rounded-lg py-2 font-medium ${amode === 'signup' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>New patient</button>
                  <button type="button" onClick={() => setAmode('login')} className={`flex-1 rounded-lg py-2 font-medium ${amode === 'login' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Sign in</button>
                </div>
                <form onSubmit={doAuth} className="space-y-3">
                  {amode === 'signup' && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2"><input className="input" placeholder="First name" required value={af.firstName} onChange={(e) => setA('firstName', e.target.value)} /><input className="input" placeholder="Last name" required value={af.lastName} onChange={(e) => setA('lastName', e.target.value)} /></div>
                      <input className="input" placeholder="Cellphone no." value={af.phone} onChange={(e) => setA('phone', e.target.value)} />
                    </>
                  )}
                  <input className="input" type="email" placeholder="Email" required value={af.email} onChange={(e) => setA('email', e.target.value)} />
                  <input className="input" type="password" placeholder="Password" required value={af.password} onChange={(e) => setA('password', e.target.value)} />
                  {amode === 'signup' && <input className="input" type="password" placeholder="Confirm password" required value={af.confirm} onChange={(e) => setA('confirm', e.target.value)} />}
                  <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}</button>
                </form>
              </div>
            ) : (
              <>
                <p className="mt-3 text-[12px] text-[color:var(--slate)]">You’ll be redirected to pay securely. Your consult is confirmed once payment is received.</p>
                <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={busy} onClick={pay}>{busy ? 'Starting payment…' : `Pay ${doc.consultFee != null ? peso(doc.consultFee) : ''} →`}</button></div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
