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
      setSession(res)
      router.push('/book')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
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
      setSession(res)
      router.push('/book')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-[color:var(--scei-teal)]">Book an appointment</h1>
        <p className="text-slate-600 text-sm mt-1">
          Sapphire Clinics East — Patient Online Booking
        </p>
      </div>

      <div className="bg-white border rounded-xl shadow-sm">
        <div className="flex border-b">
          <button
            className={`flex-1 py-3 text-sm font-medium ${tab === 'returning' ? 'text-[color:var(--scei-teal)] border-b-2 border-[color:var(--scei-teal)]' : 'text-slate-500'}`}
            onClick={() => setTab('returning')}
          >Returning patient</button>
          <button
            className={`flex-1 py-3 text-sm font-medium ${tab === 'new' ? 'text-[color:var(--scei-teal)] border-b-2 border-[color:var(--scei-teal)]' : 'text-slate-500'}`}
            onClick={() => setTab('new')}
          >New patient</button>
        </div>

        <div className="p-5">
          {err && <div className="mb-3 text-sm text-rose-600">{err}</div>}

          {tab === 'returning' ? (
            <form className="space-y-3" onSubmit={handleReturning}>
              <label className="block">
                <span className="text-sm text-slate-700">Email</span>
                <input required name="email" type="email" className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Last name</span>
                <input required name="lastName" className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-[color:var(--scei-teal)] text-white rounded-lg py-2 font-medium disabled:opacity-50"
              >{busy ? 'Looking up…' : 'Continue'}</button>
              <p className="text-xs text-slate-500">
                Don&apos;t have a record yet? <button type="button" className="underline" onClick={() => setTab('new')}>Register as a new patient.</button>
              </p>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={handleNew}>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-700">First name</span>
                  <input required name="firstName" className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Last name</span>
                  <input required name="lastName" className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
              </div>
              <label className="block">
                <span className="text-sm text-slate-700">Email</span>
                <input required name="email" type="email" className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Phone (optional)</span>
                <input name="phone" className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-700">Branch</span>
                  <select required name="branch" className="mt-1 w-full rounded-lg border px-3 py-2 bg-white">
                    <option value="SANDBOX_EAST">Sandbox East</option>
                    <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Patient type</span>
                  <select required name="patientType" className="mt-1 w-full rounded-lg border px-3 py-2 bg-white">
                    <option value="PEDIATRIC">Pediatric</option>
                    <option value="ADULT">Adult</option>
                  </select>
                </label>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-[color:var(--scei-teal)] text-white rounded-lg py-2 font-medium disabled:opacity-50"
              >{busy ? 'Creating…' : 'Continue'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
