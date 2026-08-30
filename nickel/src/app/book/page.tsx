'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Stars from '@/components/Stars'

type Step = 'city' | 'provider' | 'time' | 'confirm'
const STEPS: [Step, string][] = [['city', 'City'], ['provider', 'Therapist'], ['time', 'Time'], ['confirm', 'Book']]
const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }

interface Slot { date: string; startTime: string; endTime: string }
interface Provider {
  id: string; name: string; postNominals: string | null; profession: string; photo: string | null
  yearsExperience: string | null; school: string | null; postgraduate: string | null
  certifications: string[]; specialization: string | null; specializedRate: number | null
  rate: number | null; transpoIncluded: boolean; slots: Slot[]
  ratingAvg: number | null; ratingCount: number
  priceInitialEval: number | null; priceProgressReport: number | null; priceHEP: number | null
}
interface Me { id: string; firstName: string; city: string | null; walletBalance?: number }

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

export default function BookPage() {
  const [step, setStep] = useState<Step>('city')
  const [cities, setCities] = useState<string[] | null>(null)
  const [city, setCity] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [providerQuery, setProviderQuery] = useState('')
  const [provider, setProvider] = useState<Provider | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [useWallet, setUseWallet] = useState(true)
  // PT doctor's-referral gate
  const [referralData, setReferralData] = useState<string | null>(null)
  const [referralName, setReferralName] = useState<string>('')
  const [referralConsultId, setReferralConsultId] = useState<string | null>(null)
  const [referrals, setReferrals] = useState<{ consultId: string; date: string; doctorName: string }[]>([])

  // auth form
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [af, setAf] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', dob: '', sex: '', password: '', confirm: '' })
  const setA = (k: keyof typeof af, v: string) => setAf((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then((d) => {
      const list: string[] = d.cities ?? []
      setCities(list)
      // Deep link: /book?city=Pasig jumps straight to that city's provider network.
      const wanted = new URLSearchParams(window.location.search).get('city')
      const match = wanted && list.find((c) => c.toLowerCase() === wanted.toLowerCase())
      if (match) chooseCity(match)
    }).catch(() => setErr('Could not load cities.'))
    fetch('/api/patient/me').then((r) => r.json()).then((d) => setMe(d.patient)).catch(() => {})
  }, [])

  // Load the patient's issued referrals once they're signed in and booking PT.
  useEffect(() => {
    if (me && provider?.profession === 'PT') {
      fetch('/api/patient/referrals').then((r) => r.json()).then((d) => setReferrals(d.referrals ?? [])).catch(() => {})
    }
  }, [me, provider])

  async function onReferralFile(file: File) {
    if (file.size > 8_000_000) { setErr('Referral file too large (max ~6 MB).'); return }
    const data: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
    setReferralData(data); setReferralName(file.name); setReferralConsultId(null)
  }

  async function loadProviders(c: string) {
    setProviders(null)
    const d = await fetch(`/api/providers?city=${encodeURIComponent(c)}`).then((r) => r.json())
    setProviders(d.providers ?? [])
  }

  function chooseCity(c: string) {
    setErr(null); setCity(c)
    // Browse therapists first — we only ask for an account at checkout.
    setStep('provider'); loadProviders(c)
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
        ? { firstName: af.firstName, lastName: af.lastName, email: af.email, phone: af.phone, address: af.address, dob: af.dob, sex: af.sex, city, password: af.password }
        : { email: af.email, password: af.password }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed')
      const meRes = await fetch('/api/patient/me').then((x) => x.json())
      setMe(meRes.patient)
      // Account created/signed in during checkout — stay on the confirm step.
      setStep('confirm')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  async function pay() {
    if (!provider || !slot) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id, date: slot.date, startTime: slot.startTime, city, useWallet, referralFile: referralData, referralConsultId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not start payment.')
      // Fully covered by wallet credit → no PayMongo step.
      if (d.paid) { window.location.href = d.redirect ?? '/bookings'; return }
      if (!d.checkoutUrl) throw new Error('Could not start payment.')
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

        {/* PROVIDER */}
        {step === 'provider' && (
          <div>
            <button onClick={() => setStep('city')} className="mb-3 text-[12px] text-[color:var(--steel)] hover:underline">← {city}</button>
            <div className="label">Choose your therapist in {city}</div>
            {!providers && <p className="text-[13px] text-[color:var(--slate)]">Loading therapists…</p>}
            {providers && providers.length === 0 && (
              <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-3.5 text-[13px] text-[color:var(--slate)]">
                No therapists with open schedules in {city} yet. <a href="/requests" className="font-semibold text-[color:var(--steel)] hover:underline">Post a request</a> instead and let therapists reach out to you.
              </div>
            )}
            {providers && providers.length > 0 && (
              <>
                <div className="relative mb-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  <input className="input !pl-9" value={providerQuery} onChange={(e) => setProviderQuery(e.target.value)} placeholder="Search by therapist name…" />
                </div>
                <p className="mb-2 text-[12.5px] text-[color:var(--slate)]">Can’t find the right time? <a href="/requests" className="font-semibold text-[color:var(--steel)] hover:underline">Post a request</a> and let therapists reach out.</p>
              </>
            )}
            <div className="space-y-2">
              {providers && providers.filter((p) => p.name.toLowerCase().includes(providerQuery.trim().toLowerCase())).length === 0 && providerQuery.trim() && (
                <p className="text-[13px] text-[color:var(--slate)]">No therapist named “{providerQuery}” in {city}.</p>
              )}
              {providers?.filter((p) => p.name.toLowerCase().includes(providerQuery.trim().toLowerCase())).map((p) => (
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
                      {p.ratingCount > 0 && p.ratingAvg != null && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[color:var(--slate)]">
                          <Stars value={p.ratingAvg} size={13} />
                          <span className="font-semibold text-[color:var(--ink)]">{p.ratingAvg.toFixed(1)}</span>
                          <span className="text-[color:var(--muted)]">({p.ratingCount})</span>
                        </div>
                      )}
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
                  {(p.priceInitialEval != null || p.priceProgressReport != null || p.priceHEP != null) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[color:var(--slate)]">
                      {p.priceInitialEval != null && <span className="rounded-md bg-[color:var(--mist)] px-2 py-0.5">Initial eval {peso(p.priceInitialEval)}</span>}
                      {p.priceProgressReport != null && <span className="rounded-md bg-[color:var(--mist)] px-2 py-0.5">Progress report {peso(p.priceProgressReport)}</span>}
                      {p.priceHEP != null && <span className="rounded-md bg-[color:var(--mist)] px-2 py-0.5">Home exercise program {peso(p.priceHEP)}</span>}
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
                <span className="text-[15px] font-semibold text-[color:var(--ink)]">{provider.rate != null ? peso(provider.rate) : ''}</span>
              </div>
              {(() => {
                const fee = Number(provider.rate ?? 0)
                const bal = Number(me?.walletBalance ?? 0)
                const applied = useWallet ? Math.min(bal, fee) : 0
                const due = Math.max(0, fee - applied)
                return (
                  <>
                    {bal > 0 && (
                      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-[13px]">
                        <span className="flex items-center gap-2 text-[color:var(--slate)]">
                          <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} className="h-4 w-4 accent-[color:var(--steel)]" />
                          Use Nickel wallet credit <span className="font-semibold text-[color:var(--ink)]">({peso(bal)} available)</span>
                        </span>
                        {applied > 0 && <span className="font-semibold text-emerald-700">−{peso(applied)}</span>}
                      </label>
                    )}
                    <div className="my-2 h-px bg-[color:var(--line)]" />
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="font-semibold text-[color:var(--slate)]">{due === 0 ? 'Paid from wallet' : 'To pay now'}</span>
                      <span className="text-[18px] font-bold text-[color:var(--steel-deep)]">{peso(due)}</span>
                    </div>
                  </>
                )
              })()}
              <p className="mt-2 text-[12px] text-[color:var(--muted)]">{provider.transpoIncluded ? 'Transportation is included in this rate.' : 'Transportation is not included — arrange it directly with your therapist.'}</p>
            </div>

            {/* Account is only asked for here — after choosing a therapist & time. */}
            {!me ? (
              <div className="mt-4">
                <div className="text-[14px] font-semibold text-[color:var(--ink)]">{mode === 'signup' ? 'Create your account to confirm' : 'Sign in to confirm'}</div>
                <p className="mb-3 mt-0.5 text-[12px] text-[color:var(--slate)]">Your booking with {provider.name} on {fmtDate(slot.date)} · {fmtTime(slot.startTime)} is held while you {mode === 'signup' ? 'sign up' : 'sign in'}.</p>
                <div className="mb-3 flex rounded-xl border border-[color:var(--line)] p-1 text-[13px]">
                  <button type="button" onClick={() => setMode('signup')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'signup' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>New patient</button>
                  <button type="button" onClick={() => setMode('login')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'login' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Sign in</button>
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
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block"><span className="mb-1 block text-[12px] text-[color:var(--slate)]">Date of birth</span><input className="input" type="date" required value={af.dob} onChange={(e) => setA('dob', e.target.value)} /></label>
                        <label className="block"><span className="mb-1 block text-[12px] text-[color:var(--slate)]">Sex</span><select className="select" required value={af.sex} onChange={(e) => setA('sex', e.target.value)}><option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option></select></label>
                      </div>
                    </>
                  )}
                  <input className="input" type="email" placeholder="Email" required value={af.email} onChange={(e) => setA('email', e.target.value)} />
                  <input className="input" type="password" placeholder="Password" required value={af.password} onChange={(e) => setA('password', e.target.value)} />
                  {mode === 'signup' && <input className="input" type="password" placeholder="Confirm password" required value={af.confirm} onChange={(e) => setA('confirm', e.target.value)} />}
                  <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account & continue' : 'Sign in & continue'}</button>
                </form>
              </div>
            ) : (() => {
              const fee = Number(provider.rate ?? 0)
              const applied = useWallet ? Math.min(Number(me?.walletBalance ?? 0), fee) : 0
              const due = Math.max(0, fee - applied)
              const needsReferral = provider.profession === 'PT'
              const hasReferral = !!(referralData || referralConsultId)
              return (
                <>
                  {needsReferral && (
                    <div className="mt-4 rounded-xl border border-[color:var(--line)] p-4">
                      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[color:var(--ink)]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></svg>
                        Doctor’s referral <span className="font-normal text-[color:var(--slate)]">(required for PT)</span>
                      </div>
                      <p className="mt-1 text-[12px] text-[color:var(--slate)]">Philippine practice requires a doctor’s referral for physical therapy. Attach yours, or get one from a rehab-doctor consult.</p>

                      {referrals.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {referrals.map((rf) => (
                            <label key={rf.consultId} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--line)] px-3 py-2 text-[13px]">
                              <input type="radio" name="ref" className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={referralConsultId === rf.consultId} onChange={() => { setReferralConsultId(rf.consultId); setReferralData(null); setReferralName('') }} />
                              <span>Referral from {rf.doctorName} <span className="text-[color:var(--muted)]">· {rf.date}</span></span>
                            </label>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer rounded-lg border border-dashed border-[color:var(--line-2)] px-3 py-2 text-[12.5px] font-medium text-[color:var(--steel)] hover:bg-[color:var(--mist)]">
                          {referralData ? `Selected: ${referralName}` : 'Upload referral (photo/PDF)'}
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReferralFile(f) }} />
                        </label>
                        <span className="text-[12px] text-[color:var(--muted)]">or</span>
                        <a href="/consult" className="rounded-lg border border-[color:var(--line-2)] px-3 py-2 text-[12.5px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--mist)]">I don’t have one — see a rehab doctor →</a>
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-[12px] text-[color:var(--slate)]">{due === 0 ? 'This visit is fully covered by your wallet credit — no card needed.' : 'You’ll be redirected to pay securely. Your booking is confirmed once payment is received.'}</p>
                  <div className="mt-4 flex justify-end">
                    <button className="btn-primary" disabled={busy || (needsReferral && !hasReferral)} onClick={pay}>{busy ? 'Please wait…' : needsReferral && !hasReferral ? 'Add a referral to continue' : due === 0 ? 'Confirm booking →' : `Pay ${peso(due)} →`}</button>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
