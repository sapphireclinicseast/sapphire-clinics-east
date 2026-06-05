'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { lookupPatient, registerPatient } from '@/lib/api'
import { getSession, setSession } from '@/lib/session'
import Chatbot from '@/components/Chatbot'
import { Hero3D } from '@/components/landing/Hero3D'

type Tab = 'returning' | 'new'

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  )
}

function HomeInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const [tab, setTab] = useState<Tab>('returning')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<{ firstName: string } | null>(null)
  const expired = sp.get('expired') === '1'

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
    <div className="space-y-8 md:space-y-10">
      <Chatbot />

      {/* Hero — Splite 3D anatomy scene over a Narra/Sun gradient. */}
      <section className="animate-fade-up">
        <Hero3D signedInFirstName={signedIn?.firstName ?? null} />
      </section>

      {/* Auth card + complaint/concern callout */}
      <section className="max-w-5xl mx-auto animate-fade-up stagger-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
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

          {expired && !err && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 animate-fade-in">
              Your session expired. Please sign in again to continue booking.
            </div>
          )}
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

        <ComplaintCard />
      </section>
    </div>
  )
}

const COMPLAINT_FORM_URL = 'https://hr.sapphireclinicseast.org/patient-complaint-form.html'

function ComplaintCard() {
  return (
    <aside className="card-static lg:sticky lg:top-6">
      <h2 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">
        Have a concern or complaint?
      </h2>
      <p className="text-sm text-[color:var(--mid-gray)] mt-1.5">
        Your feedback is confidential and helps us care better. Submit it now.
      </p>

      <a
        href={COMPLAINT_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary w-full mt-4 inline-flex items-center justify-center"
      >
        Submit now →
      </a>

      <div className="mt-5 flex flex-col items-center">
        <div className="rounded-2xl bg-white p-3 border border-[color:var(--light-gray)] shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/complaint-qr.svg"
            alt="QR code to the patient complaint form"
            width={140}
            height={140}
            className="w-[140px] h-[140px]"
          />
        </div>
        <p className="text-[11px] text-[color:var(--mid-gray)] mt-2 text-center" style={{ fontFamily: 'var(--font-display)' }}>
          Or scan to open on your phone
        </p>
      </div>
    </aside>
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

// Check icon is now owned by Hero3D — removed the orphan local copy.
