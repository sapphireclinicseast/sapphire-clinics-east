'use client'

import { useEffect, useState, type FormEvent } from 'react'

type Step = 'city' | 'auth' | 'provider' | 'time' | 'confirm'
const STEPS: [Step, string][] = [['city', 'City'], ['auth', 'Account'], ['provider', 'Therapist'], ['time', 'Time'], ['confirm', 'Pay']]
const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }

interface Slot { date: string; startTime: string; endTime: string }
interface Provider {
  id: string; name: string; postNominals: string | null; profession: string; photo: string | null
  yearsExperience: string | null; school: string | null; postgraduate: string | null
  certifications: string[]; specialization: string | null; specializedRate: number | null
  rate: number | null; transpoIncluded: boolean; slots: Slot[]
}
interface Me { id: string; firstName: string; city: string | null }

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

export default function BookPage() {
  const [step, setStep] = useState<Step>('city')
  const [cities, setCities] = useState<string[] | null>(null)
  const [city, setCity] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // auth form
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [af, setAf] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', password: '', confirm: '' })
  const setA = (k: keyof typeof af, v: string) => setAf((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then((d) => setCities(d.cities ?? [])).catch(() => setErr('Could not load cities.'))
    fetch('/api/patient/me').then((r) => r.json()).then((d) => setMe(d.patient)).catch(() => {})
  }, [])

  async function loadProviders(c: string) {
    setProviders(null)
    const d = await fetch(`/api/providers?city=${encodeURIComponent(c)}`).then((r) => r.json())
    setProviders(d.providers ?? [])
  }

  function chooseCity(c: string) {
    setErr(null); setCity(c)
    if (me) { setStep('provider'); loadProviders(c) } else setStep('auth')
  }

  async function doAuth(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (mode === 'signup') {
      if (af.password.length < 8) return setErr('Password must be at least 8 characters.')
      if (af.password !== af.confirm) return setErr('Passwords do not match.')
    }
    setBusy(true)
    try {
      const url = mode === 'signup' ? '/api/patient/signup' : '/api/patient/login'
      const body = mode === 'signup'
        ? { firstName: af.firstName, lastName: af.lastName, email: af.email, phone: af.phone, address: af.address, city, password: af.password }
        : { email: af.email, password: af.password }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed')
      const meRes = await fetch('/api/patient/me').then((x) => x.json())
      setMe(meRes.patient)
      setStep('provider'); loadProviders(city)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  async function pay() {
    if (!provider || !slot) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id, date: slot.date, startTime: slot.startTime, city }),
      })
      const d = await r.json()
      if (!r.ok || !d.checkoutUrl) throw new Error(d.error ?? 'Could not start payment.')
      window.location.href = d.checkoutUrl
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start payment.'); setBusy(false) }
  }

  const activeIdx = STEPS.findIndex(([s]) => s === step)

  // group a provider's slots by date for the time step
  const byDate: [string, Slot[]][] = provider
    ? Object.entries(provider.slots.reduce((acc, s) => { (acc[s.date] ??= []).push(s); return acc }, {} as Record<string, Slot[]>))
    : []

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      {/* step header */}
      <div className="mb-5 flex items-center gap-1.5 sm:gap-3">
        {STEPS.map(([s, label], i) => (
          <div key={s} className="flex items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${i <= activeIdx ? 'bg-[color:var(--steel)]' : 'bg-[color:var(--line-2)]'}`} />
              <span className={`text-[10px] sm:text-[11.5px] uppercase tracking-[0.1em] ${i === activeIdx ? 'font-semibold text-[color:var(--steel)]' : 'text-[color:var(--muted)]'} ${i === activeIdx ? '' : 'hidden sm:inline'}`}>{i + 1}. {label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="h-px w-3 sm:w-6 bg-[color:var(--line-2)]" />}
          </div>
        ))}
      </div>

      <div className="card">
        <h1 className="text-[24px] font-semibold">Book a home therapy visit</h1>
        <p className="mb-5 mt-1 text-[13px] text-[color:var(--slate)]">A licensed therapist comes to your home.</p>
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

        {/* CITY */}
        {step === 'city' && (
          <div>
            <div className="label">Which city are you in?</div>
            {!cities && <p className="text-[13px] text-[color:var(--slate)]">Loading…</p>}
            {cities && cities.length === 0 && <p className="text-[13px] text-[color:var(--slate)]">No therapists are available yet. Please check back soon.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {cities?.map((c) => (
                <button key={c} onClick={() => chooseCity(c)} className="rounded-xl border border-[color:var(--line-2)] bg-white p-3.5 text-left text-[15px] font-medium text-[color:var(--ink)] hover:border-[color:var(--sky)]">{c}</button>
              ))}
            </div>
          </div>
        )}

        {/* AUTH */}
        {step === 'auth' && (
          <div>
            <button onClick={() => setStep('city')} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← {city}</button>
            <div className="mb-4 flex rounded-xl border border-[color:var(--line)] p-1 text-[13px]">
              <button onClick={() => setMode('signup')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'signup' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>New patient</button>
              <button onClick={() => setMode('login')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'login' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Sign in</button>
            </div>
            <form onSubmit={doAuth} className="space-y-3">
              {mode === 'signup' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="input" placeholder="First name" required value={af.firstName} onChange={(e) => setA('firstName', e.target.value)} />
                    <input className="input" placeholder="Last name" required value={af.lastName} onChange={(e) => setA('lastName', e.target.value)} />
                  </div>
                  <input className="input" placeholder="Cellphone no." value={af.phone} onChange={(e) => setA('phone', e.target.value)} />
                  <input className="input" placeholder="Home address (for the visit)" value={af.address} onChange={(e) => setA('address', e.target.value)} />
                </>
              )}
              <input className="input" type="email" placeholder="Email" required value={af.email} onChange={(e) => setA('email', e.target.value)} />
              <input className="input" type="password" placeholder="Password" required value={af.password} onChange={(e) => setA('password', e.target.value)} />
              {mode === 'signup' && <input className="input" type="password" placeholder="Confirm password" required value={af.confirm} onChange={(e) => setA('confirm', e.target.value)} />}
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account & continue' : 'Sign in & continue'}</button>
            </form>
          </div>
        )}

        {/* PROVIDER */}
        {step === 'provider' && (
          <div>
            <button onClick={() => setStep('city')} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← {city}</button>
            <div className="label">Choose your therapist in {city}</div>
            {!providers && <p className="text-[13px] text-[color:var(--slate)]">Loading therapists…</p>}
            {providers && providers.length === 0 && <p className="text-[13px] text-[color:var(--slate)]">No therapists with open schedules in {city} yet. Please check back soon.</p>}
            <div className="space-y-2">
              {providers?.map((p) => (
                <button key={p.id} onClick={() => { setProvider(p); setStep('time') }} className="w-full rounded-xl border border-[color:var(--line-2)] bg-white p-3.5 text-left hover:border-[color:var(--sky)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[color:var(--mist-2)] text-[15px] font-semibold text-[color:var(--slate)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-semibold text-[color:var(--ink)]">{p.name}{p.postNominals ? `, ${p.postNominals}` : ''}</span>
                        <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700" title="Identity-verified">✓</span>
                      </div>
                      <div className="text-[12px] text-[color:var(--slate)]">{PROF[p.profession] ?? p.profession}</div>
                      {(p.yearsExperience || p.school) && (
                        <div className="mt-0.5 text-[11.5px] text-[color:var(--muted)]">
                          {p.yearsExperience ? `${p.yearsExperience} yr${p.yearsExperience === '1' ? '' : 's'} experience` : ''}{p.yearsExperience && p.school ? ' · ' : ''}{p.school ?? ''}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[15px] font-bold text-[color:var(--steel-deep)]">{p.rate != null ? peso(p.rate) : ''}</div>
                      <div className="text-[10px] text-[color:var(--muted)]">{p.transpoIncluded ? 'transpo incl.' : '+ transpo'}</div>
                    </div>
                  </div>
                  {(p.certifications.length > 0 || p.postgraduate || p.specialization) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[color:var(--line)] pt-2">
                      {p.postgraduate && <span className="inline-flex items-center gap-1 rounded-md bg-[color:var(--mist)] px-2 py-0.5 text-[11px] text-[color:var(--slate)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m22 9-10-4.2L2 9l10 4.2L22 9Z"/><path d="M6 11v4.5c0 1.2 2.7 3 6 3s6-1.8 6-3V11"/></svg>{p.postgraduate}</span>}
                      {[...new Set([p.specialization, ...p.certifications].filter(Boolean))].map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-md bg-[color:var(--mist)] px-2 py-0.5 text-[11px] text-[color:var(--slate)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8.5" r="5"/><path d="m9 12.8-1.5 8.2L12 18.5l4.5 2.5L15 12.8"/></svg>{c}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] font-medium text-[color:var(--steel)]">{p.slots.length} open slot{p.slots.length === 1 ? '' : 's'} · tap to pick a time →</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TIME */}
        {step === 'time' && provider && (
          <div>
            <button onClick={() => setStep('provider')} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← {provider.name}</button>
            <div className="label">Pick a time with {provider.name}</div>
            <div className="space-y-3">
              {byDate.map(([date, slots]) => (
                <div key={date}>
                  <div className="mb-1.5 text-[13px] font-semibold text-[color:var(--ink)]">{fmtDate(date)}</div>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button key={s.startTime} onClick={() => { setSlot(s); setStep('confirm') }} className="rounded-lg border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-[13px] font-medium text-[color:var(--ink)] hover:border-[color:var(--sky)]">{fmtTime(s.startTime)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONFIRM */}
        {step === 'confirm' && provider && slot && (
          <div>
            <button onClick={() => setStep('time')} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← Change time</button>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-4">
              <div className="text-[13px] text-[color:var(--slate)]">{provider.name} · {PROF[provider.profession] ?? provider.profession}</div>
              <div className="mt-1 text-[16px] font-semibold text-[color:var(--ink)]">{fmtDate(slot.date)} · {fmtTime(slot.startTime)}</div>
              <div className="text-[13px] text-[color:var(--slate)]">{city}</div>
              <div className="my-3 h-px bg-[color:var(--line)]" />
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-[color:var(--slate)]">Session fee</span>
                <span className="text-[18px] font-bold text-[color:var(--steel-deep)]">{provider.rate != null ? peso(provider.rate) : ''}</span>
              </div>
              <p className="mt-2 text-[12px] text-[color:var(--muted)]">{provider.transpoIncluded ? 'Transportation is included in this rate.' : 'Transportation is not included — arrange it directly with your therapist.'}</p>
            </div>
            <p className="mt-3 text-[12px] text-[color:var(--slate)]">You&apos;ll be redirected to pay securely. Your booking is confirmed once payment is received.</p>
            <div className="mt-4 flex justify-end">
              <button className="btn-primary" disabled={busy} onClick={pay}>{busy ? 'Starting payment…' : `Pay ${provider.rate != null ? peso(provider.rate) : ''} →`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
