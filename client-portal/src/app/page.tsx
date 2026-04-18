'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lookupPatient, registerPatient } from '@/lib/api'
import { getSession, setSession } from '@/lib/session'

type Tab = 'returning' | 'new'

export default function HomePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('returning')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (getSession()) router.push('/book')
  }, [router])

  async function handleReturning(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    try {
      const res = await lookupPatient(String(f.get('email')), String(f.get('lastName')))
      setSession(res); router.push('/book')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function handleNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    try {
      const res = await registerPatient({
        firstName: String(f.get('firstName')),
        lastName: String(f.get('lastName')),
        email: String(f.get('email')),
        phone: String(f.get('phone') ?? '') || undefined,
        branch: f.get('branch') as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS',
        patientType: f.get('patientType') as 'PEDIATRIC' | 'ADULT',
      })
      setSession(res); router.push('/book')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start">
      {/* Hero */}
      <section className="md:col-span-2 animate-fade-up">
        <div className="hero-gradient rounded-3xl p-8 md:p-9 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--gold-light)] animate-pulse-ring"></span>
              Online booking
            </div>
            <h1 className="text-[40px] md:text-[44px] leading-[1.05] mb-4">
              Book your next<br/>appointment with ease.
            </h1>
            <p className="text-white/80 text-[15px] leading-relaxed mb-7 max-w-sm">
              Pick from our team of therapists across Sandbox East and Greenhills. Your slot is confirmed once downpayment is received.
            </p>
            <div className="flex flex-col gap-2.5 text-[13px] text-white/85" style={{ fontFamily: 'var(--font-display)' }}>
              <div className="flex items-center gap-2"><Check/> 7 services · 2 branches</div>
              <div className="flex items-center gap-2"><Check/> In-clinic or teletherapy</div>
              <div className="flex items-center gap-2"><Check/> Secure PayMongo checkout</div>
            </div>
          </div>
        </div>
      </section>

      {/* Auth card */}
      <section className="md:col-span-3 animate-fade-up stagger-2">
        <div className="card-static">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Get started</h2>
              <p className="text-sm text-[color:var(--mid-gray)] mt-1">Returning or new? Choose below.</p>
            </div>
          </div>

          <div className="flex gap-2 mb-6 p-1 bg-[color:var(--pale-teal)] rounded-xl" style={{ fontFamily: 'var(--font-display)' }}>
            <button
              onClick={() => { setTab('returning'); setErr(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'returning' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
            >Returning patient</button>
            <button
              onClick={() => { setTab('new'); setErr(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'new' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
            >New patient</button>
          </div>

          {err && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
              {err}
            </div>
          )}

          {tab === 'returning' ? (
            <form className="space-y-4" onSubmit={handleReturning} key="returning">
              <Field label="Email">
                <input required name="email" type="email" className="input" placeholder="you@example.com" />
              </Field>
              <Field label="Last name">
                <input required name="lastName" className="input" placeholder="Dela Cruz" />
              </Field>
              <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
                {busy ? 'Looking up…' : 'Continue'}
              </button>
              <p className="text-xs text-[color:var(--mid-gray)] text-center pt-1">
                Don&apos;t have a record yet?{' '}
                <button type="button" className="text-[color:var(--teal)] font-semibold hover:underline" onClick={() => setTab('new')}>
                  Register as a new patient
                </button>
              </p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleNew} key="new">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name"><input required name="firstName" className="input" /></Field>
                <Field label="Last name"><input required name="lastName" className="input" /></Field>
              </div>
              <Field label="Email"><input required name="email" type="email" className="input" placeholder="you@example.com" /></Field>
              <Field label="Phone (optional)"><input name="phone" className="input" placeholder="+63 9XX XXX XXXX" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Branch">
                  <select required name="branch" className="select">
                    <option value="SANDBOX_EAST">Sandbox East</option>
                    <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
                  </select>
                </Field>
                <Field label="Patient type">
                  <select required name="patientType" className="select">
                    <option value="PEDIATRIC">Pediatric</option>
                    <option value="ADULT">Adult</option>
                  </select>
                </Field>
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
                {busy ? 'Creating…' : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

function Check() {
  return (
    <span className="inline-flex w-4 h-4 rounded-full bg-white/20 items-center justify-center text-[10px]">✓</span>
  )
}
