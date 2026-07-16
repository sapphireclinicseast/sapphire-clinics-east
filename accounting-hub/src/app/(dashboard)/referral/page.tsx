'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Users, UserPlus, Loader2, X, Trash2, Search } from 'lucide-react'
import ReferrerSettingsPanel, { REFERRER_TYPE_LABEL } from '@/components/ReferrerSettingsPanel'
import { branchLabel } from '@/lib/branch'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface RefOpt { id: string; name: string; type?: string | null }
interface PatientHit { id: string; name: string; email?: string | null }
interface RP { id: string; patientId: string | null; patientName: string; referrerId: string; referrerName: string; referrerType: string | null; note: string | null; createdAt: string }
interface Sess { id: string; orderNumber: number; date: string; branch: string; paymentStatus: string; services: string; netAmount: number }

export default function ReferralPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [tab, setTab] = useState<'referrers' | 'patients'>('referrers')

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && role === 'HMO_OFFICER') {
    return <div className="p-8 text-center text-gray-500">The Referral section isn&apos;t available for the HMO Officer role.</div>
  }

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Users size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Referral</h1>
      </div>

      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['referrers', 'Referrers'], ['patients', 'Referred patients']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-4 py-2 text-sm font-semibold -mb-px border-b-2"
            style={tab === k ? { borderColor: 'var(--teal)', color: 'var(--deep-teal)' } : { borderColor: 'transparent', color: 'var(--mid-gray)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'referrers' ? <ReferrerSettingsPanel /> : <ReferredPatientsPanel />}
    </div>
  )
}

function ReferredPatientsPanel() {
  const [rows, setRows] = useState<RP[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [sessionsFor, setSessionsFor] = useState<RP | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/referred-patients?search=${encodeURIComponent(search)}`); setRows(r.ok ? await r.json() : []) }
    catch { setRows([]) } finally { setLoading(false) }
  }, [search])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const del = async (r: RP) => {
    if (!window.confirm(`Remove referred patient "${r.patientName}" (${r.referrerName})?`)) return
    await fetch(`/api/referred-patients?id=${r.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Referred patients</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Link a patient to the referrer who sent them. Click a row to see the patient&apos;s recorded sessions with us.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
          <UserPlus size={14} /> Add referred patient
        </button>
      </div>

      <div className="relative w-72">
        <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or referrer..."
          className="pl-9 pr-3 py-2 rounded-xl border text-sm outline-none w-full" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {loading ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No referred patients yet.</div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--pale-teal)' }}>
                {['Patient', 'Referrer', 'Type', 'Added', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => setSessionsFor(r)}>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{r.patientName}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{r.referrerName}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{REFERRER_TYPE_LABEL[r.referrerType || 'DOCTOR'] || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => del(r)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddReferredPatientModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
      {sessionsFor && <SessionsModal rp={sessionsFor} onClose={() => setSessionsFor(null)} />}
    </div>
  )
}

function AddReferredPatientModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [referrers, setReferrers] = useState<RefOpt[]>([])
  const [refSearch, setRefSearch] = useState('')
  const [referrerId, setReferrerId] = useState('')
  const [patSearch, setPatSearch] = useState('')
  const [patHits, setPatHits] = useState<PatientHit[]>([])
  const [patLoading, setPatLoading] = useState(false)
  const [patient, setPatient] = useState<PatientHit | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const patTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/referrers?all=true').then(r => r.json()).then(d => setReferrers(Array.isArray(d) ? d : d.data || [])).catch(() => {})
  }, [])

  // Patient CRM search (Operations Hub), debounced.
  useEffect(() => {
    if (patient) return
    if (patTimer.current) clearTimeout(patTimer.current)
    if (patSearch.trim().length < 2) { setPatHits([]); return }
    patTimer.current = setTimeout(async () => {
      setPatLoading(true)
      try { const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(patSearch)}`); setPatHits(r.ok ? await r.json() : []) }
      catch { setPatHits([]) } finally { setPatLoading(false) }
    }, 300)
  }, [patSearch, patient])

  const referrer = referrers.find(r => r.id === referrerId)
  const filteredRefs = referrers.filter(r => !refSearch || r.name.toLowerCase().includes(refSearch.toLowerCase()))

  const save = async () => {
    if (!referrerId) { setError('Select a referrer'); return }
    if (!patient) { setError('Select a patient'); return }
    setError(''); setSaving(true)
    try {
      const r = await fetch('/api/referred-patients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referrerId, patientId: patient.id, patientName: patient.name, note: note.trim() || null }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Failed to save'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  const inp = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const bc = { borderColor: 'var(--light-gray)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4 max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Add referred patient</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Referrer */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Referrer *</label>
          {referrer ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border" style={bc}>
              <span className="text-sm font-medium">{referrer.name} <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>· {REFERRER_TYPE_LABEL[referrer.type || 'DOCTOR']}</span></span>
              <button onClick={() => { setReferrerId(''); setRefSearch('') }} className="text-xs" style={{ color: 'var(--teal)' }}>Change</button>
            </div>
          ) : (
            <>
              <input value={refSearch} onChange={e => setRefSearch(e.target.value)} placeholder="Search referrers..." className={inp} style={bc} />
              {refSearch && (
                <div className="mt-1 max-h-40 overflow-auto rounded-xl border" style={bc}>
                  {filteredRefs.length === 0 ? <div className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No match.</div>
                    : filteredRefs.slice(0, 30).map(r => (
                      <button key={r.id} onClick={() => { setReferrerId(r.id); setRefSearch('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0" style={bc}>
                        {r.name} <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>· {REFERRER_TYPE_LABEL[r.type || 'DOCTOR']}</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Patient (from Operations Hub CRM) */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient * <span className="font-normal">(from Patient CRM)</span></label>
          {patient ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border" style={bc}>
              <span className="text-sm font-medium">{patient.name}{patient.email ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}> · {patient.email}</span> : null}</span>
              <button onClick={() => { setPatient(null); setPatSearch('') }} className="text-xs" style={{ color: 'var(--teal)' }}>Change</button>
            </div>
          ) : (
            <>
              <input value={patSearch} onChange={e => setPatSearch(e.target.value)} placeholder="Search patient name (min 2 chars)..." className={inp} style={bc} />
              {patSearch.trim().length >= 2 && (
                <div className="mt-1 max-h-40 overflow-auto rounded-xl border" style={bc}>
                  {patLoading ? <div className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}><Loader2 size={12} className="inline animate-spin" /> Searching…</div>
                    : patHits.length === 0 ? <div className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No patient found.</div>
                      : patHits.map(p => (
                        <button key={p.id} onClick={() => { setPatient(p); setPatSearch('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0" style={bc}>
                          {p.name}{p.email ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}> · {p.email}</span> : null}
                        </button>
                      ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} className={inp} style={bc} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50 flex items-center gap-2" style={{ background: 'var(--teal)' }}>{saving && <Loader2 size={13} className="animate-spin" />} Save</button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function SessionsModal({ rp, onClose }: { rp: RP; onClose: () => void }) {
  const [sessions, setSessions] = useState<Sess[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try { const r = await fetch(`/api/referred-patients/sessions?id=${rp.id}`); const j = r.ok ? await r.json() : { sessions: [], total: 0 }; setSessions(j.sessions || []); setTotal(j.total || 0) }
      catch { setSessions([]) } finally { setLoading(false) }
    })()
  }, [rp.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Sessions — {rp.patientName}</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Recorded sessions with us (from POS Orders) · referred by {rp.referrerName}</p>
        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No recorded sessions found for this patient.</div>
        ) : (
          <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--pale-teal)' }}>
                  {['Date', 'Service', 'Branch', 'Net amount'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(s.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{s.services}{s.paymentStatus === 'UNPAID' ? <span className="ml-1 text-[10px] font-semibold" style={{ color: '#b45309' }}>(unpaid)</span> : null}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{branchLabel(s.branch)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{peso(s.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && sessions.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <span style={{ color: 'var(--mid-gray)' }}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
            <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>Total net: {peso(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
