'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lookupPatient, registerPatient } from '@/lib/api'
import { getSession, setSession } from '@/lib/session'
import Chatbot from '@/components/Chatbot'

type Tab = 'returning' | 'new'

export default function HomePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('returning')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<{ firstName: string } | null>(null)

  useEffect(() => {
    const s = getSession()
    if (s) setSignedIn({ firstName: s.firstName })
  }, [])

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
    const get = (k: string) => String(f.get(k) ?? '').trim() || undefined
    try {
      const res = await registerPatient({
        firstName: String(f.get('firstName')),
        lastName: String(f.get('lastName')),
        email: String(f.get('email')),
        phone: get('phone'),
        dob: get('dob'),
        sex: get('sex'),
        address: get('address'),
        city: get('city'),
        civilStatus: get('civilStatus'),
        religion: get('religion'),
        nationality: get('nationality'),
        diagnosis: get('diagnosis'),
        pwdSeniorId: get('pwdSeniorId'),
        branch: f.get('branch') as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS',
        patientType: f.get('patientType') as 'PEDIATRIC' | 'ADULT',
      })
      setSession(res); router.push('/book')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start">
      <Chatbot />
      {/* Hero */}
      <section className="md:col-span-2 animate-fade-up md:sticky md:top-24">
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
              Pick a therapist, choose up to three possible slots, and the front desk will confirm your appointment.
            </p>
            <div className="flex flex-col gap-2.5 text-[13px] text-white/85" style={{ fontFamily: 'var(--font-display)' }}>
              <div className="flex items-center gap-2"><Check/> 9 services · 2 branches</div>
              <div className="flex items-center gap-2"><Check/> In-clinic or teletherapy</div>
              <div className="flex items-center gap-2"><Check/> Secure PayMongo checkout</div>
            </div>
            {signedIn && (
              <div className="mt-6 p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-white/60" style={{ fontFamily: 'var(--font-display)' }}>Signed in as</div>
                  <div className="font-semibold">{signedIn.firstName}</div>
                </div>
                <a href="/book" className="inline-flex items-center gap-1.5 bg-[color:var(--gold)] hover:bg-[color:var(--gold-light)] text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
                  Continue booking →
                </a>
              </div>
            )}
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
            <form className="space-y-3.5" onSubmit={handleNew} key="new">
              <SectionLabel>Basic info</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name"><input required name="firstName" className="input" /></Field>
                <Field label="Last name"><input required name="lastName" className="input" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email"><input required name="email" type="email" className="input" placeholder="you@example.com" /></Field>
                <Field label="Cellphone no."><input name="phone" className="input" placeholder="+63 9XX XXX XXXX" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth"><input name="dob" type="date" className="input" /></Field>
                <Field label="Sex">
                  <select name="sex" className="select" defaultValue="">
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Patient type">
                  <select required name="patientType" className="select" defaultValue="ADULT">
                    <option value="PEDIATRIC">Pediatric</option>
                    <option value="ADULT">Adult</option>
                  </select>
                </Field>
                <Field label="Branch">
                  <select required name="branch" className="select" defaultValue="SANDBOX_EAST">
                    <option value="SANDBOX_EAST">Sandbox East</option>
                    <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
                  </select>
                </Field>
              </div>

              <SectionLabel>Address</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Barangay / Address"><input name="address" className="input" /></Field>
                <Field label="City"><input name="city" className="input" /></Field>
              </div>

              <SectionLabel>Additional</SectionLabel>
              <Field label="Diagnosis / Condition"><input name="diagnosis" className="input" placeholder="Optional" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Civil status"><input name="civilStatus" className="input" placeholder="Single / Married / …" /></Field>
                <Field label="Religion"><input name="religion" className="input" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nationality"><input name="nationality" className="input" placeholder="e.g. Filipino" /></Field>
                <Field label="PWD / Senior ID"><input name="pwdSeniorId" className="input" placeholder="Optional — for discount" /></Field>
              </div>

              <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
                {busy ? 'Creating…' : 'Create profile & continue'}
              </button>
              <p className="text-[11px] text-[color:var(--mid-gray)] text-center" style={{ fontFamily: 'var(--font-display)' }}>
                Your info will be saved to Patient CRM once the clinic confirms.
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] pt-2" style={{ fontFamily: 'var(--font-display)' }}>
      {children}
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
  return <span className="inline-flex w-4 h-4 rounded-full bg-white/20 items-center justify-center text-[10px]">✓</span>
}
