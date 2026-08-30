'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Pt { id: string; firstName: string; lastName: string; email: string; phone: string | null }
interface Pr { id: string; firstName: string; lastName: string; email: string; profession: string; verificationStatus: string }
const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }

export default function PeopleManager({ verified, patients, providers }: { verified: boolean; patients: Pt[]; providers: Pr[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'patients' | 'therapists'>('patients')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pf, setPf] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', dob: '', password: '' })
  const [tf, setTf] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', profession: 'PT', rate: '', password: '' })

  async function createPatient() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/clinic/create-patient', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pf) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setPf({ firstName: '', lastName: '', email: '', phone: '', address: '', dob: '', password: '' }); setMsg('Patient account created.'); router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }
  async function createTherapist() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/clinic/create-provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tf, rate: tf.rate === '' ? null : Number(tf.rate) }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setTf({ firstName: '', lastName: '', email: '', phone: '', dob: '', profession: 'PT', rate: '', password: '' }); setMsg('Therapist account created.'); router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {!verified && <div className="card text-[13px] text-[color:var(--slate)]">Your clinic must be verified before you can add patients and therapists. Submit your documents under <a href="/clinic/verify" className="font-semibold text-[color:var(--steel)] hover:underline">Documents</a>.</div>}

      <div className="flex gap-1 rounded-xl border border-[color:var(--line)] bg-white p-1 text-[13px]">
        <button onClick={() => setTab('patients')} className={`flex-1 rounded-lg py-2 font-medium ${tab === 'patients' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Patients ({patients.length})</button>
        <button onClick={() => setTab('therapists')} className={`flex-1 rounded-lg py-2 font-medium ${tab === 'therapists' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Therapists ({providers.length})</button>
      </div>
      {msg && <div className="rounded-lg bg-[color:var(--mist)] px-3 py-2 text-[13px] text-[color:var(--slate)]">{msg}</div>}

      {tab === 'patients' ? (
        <>
          {verified && (
            <section className="card space-y-3">
              <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Add a patient</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input" placeholder="First name" value={pf.firstName} onChange={(e) => setPf({ ...pf, firstName: e.target.value })} />
                <input className="input" placeholder="Last name" value={pf.lastName} onChange={(e) => setPf({ ...pf, lastName: e.target.value })} />
                <input className="input" type="email" placeholder="Email" value={pf.email} onChange={(e) => setPf({ ...pf, email: e.target.value })} />
                <input className="input" placeholder="Phone" value={pf.phone} onChange={(e) => setPf({ ...pf, phone: e.target.value })} />
                <input className="input sm:col-span-2" placeholder="Home address (for visits)" value={pf.address} onChange={(e) => setPf({ ...pf, address: e.target.value })} />
                <label className="block"><span className="mb-1 block text-[12px] text-[color:var(--slate)]">Date of birth</span><input className="input" type="date" value={pf.dob} onChange={(e) => setPf({ ...pf, dob: e.target.value })} /></label>
                <input className="input" type="password" placeholder="Temp password (min 8)" value={pf.password} onChange={(e) => setPf({ ...pf, password: e.target.value })} />
              </div>
              <p className="text-[12px] text-[color:var(--muted)]">Share the email + temporary password with your patient so they can sign in and manage their visits.</p>
              <div className="flex justify-end"><button className="btn-primary" disabled={busy} onClick={createPatient}>Create patient account</button></div>
            </section>
          )}
          <div className="card p-0">
            <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Your patients</b></div>
            {patients.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No patients yet.</p> : (
              <div className="divide-y divide-[color:var(--line)]">
                {patients.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3 text-[13.5px]">
                    <div><b className="text-[color:var(--ink)]">{p.firstName} {p.lastName}</b><div className="text-[12px] text-[color:var(--slate)]">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {verified && (
            <section className="card space-y-3">
              <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Add a therapist</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input" placeholder="First name" value={tf.firstName} onChange={(e) => setTf({ ...tf, firstName: e.target.value })} />
                <input className="input" placeholder="Last name" value={tf.lastName} onChange={(e) => setTf({ ...tf, lastName: e.target.value })} />
                <input className="input" type="email" placeholder="Email" value={tf.email} onChange={(e) => setTf({ ...tf, email: e.target.value })} />
                <input className="input" placeholder="Phone" value={tf.phone} onChange={(e) => setTf({ ...tf, phone: e.target.value })} />
                <label className="block"><span className="mb-1 block text-[12px] text-[color:var(--slate)]">Date of birth</span><input className="input" type="date" value={tf.dob} onChange={(e) => setTf({ ...tf, dob: e.target.value })} /></label>
                <select className="select" value={tf.profession} onChange={(e) => setTf({ ...tf, profession: e.target.value })}>{Object.entries(PROF).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input className="input" inputMode="numeric" placeholder="Default rate ₱ (optional)" value={tf.rate} onChange={(e) => setTf({ ...tf, rate: e.target.value.replace(/[^0-9]/g, '') })} />
                <input className="input sm:col-span-2" type="password" placeholder="Temp password (min 8)" value={tf.password} onChange={(e) => setTf({ ...tf, password: e.target.value })} />
              </div>
              <p className="text-[12px] text-[color:var(--muted)]">Clinic therapists still complete SCEI identity verification before appearing on the public network, but you can arrange visits for them right away.</p>
              <div className="flex justify-end"><button className="btn-primary" disabled={busy} onClick={createTherapist}>Create therapist account</button></div>
            </section>
          )}
          <div className="card p-0">
            <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Your therapists</b></div>
            {providers.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No therapists yet.</p> : (
              <div className="divide-y divide-[color:var(--line)]">
                {providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3 text-[13.5px]">
                    <div><b className="text-[color:var(--ink)]">{p.firstName} {p.lastName}</b><div className="text-[12px] text-[color:var(--slate)]">{PROF[p.profession] ?? p.profession} · {p.email}</div></div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${p.verificationStatus === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{p.verificationStatus.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
