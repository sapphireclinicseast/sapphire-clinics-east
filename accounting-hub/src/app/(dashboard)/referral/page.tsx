'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Users, UserPlus, Loader2, X, Trash2, Search, ChevronDown, Download } from 'lucide-react'
import ReferrerSettingsPanel, { REFERRER_TYPE_LABEL } from '@/components/ReferrerSettingsPanel'
import { branchLabel } from '@/lib/branch'
import { departmentLabel } from '@/lib/department'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface RefOpt { id: string; name: string; type?: string | null }
interface PatientHit { id: string; name: string; email?: string | null }
interface RP { id: string; patientId: string | null; patientName: string; referrerId: string; referrerName: string; referrerType: string | null; branches: string[]; note: string | null; createdAt: string }
interface Sess { id: string; orderNumber: number; date: string; branch: string; paymentStatus: string; services: string; departments: string[]; netAmount: number }
interface DashRow { referrerId: string; name: string; type: string | null; referrals: number; net: number }

export default function ReferralPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [tab, setTab] = useState<'referrers' | 'patients' | 'dashboard' | 'commission'>('referrers')

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
        {([['referrers', 'Referrers'], ['patients', 'Referred patients'], ['dashboard', 'Referral Dashboard'], ['commission', 'Commission']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-4 py-2 text-sm font-semibold -mb-px border-b-2"
            style={tab === k ? { borderColor: 'var(--teal)', color: 'var(--deep-teal)' } : { borderColor: 'transparent', color: 'var(--mid-gray)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'referrers' ? <ReferrerSettingsPanel /> : tab === 'patients' ? <ReferredPatientsPanel /> : tab === 'dashboard' ? <ReferralDashboardPanel /> : <ReferralCommissionPanel />}
    </div>
  )
}

function ReferredPatientsPanel() {
  const [rows, setRows] = useState<RP[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [sessionsFor, setSessionsFor] = useState<RP | null>(null)
  const [sortField, setSortField] = useState<'patientName' | 'referrerName' | 'referrerType' | 'branches' | 'createdAt'>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (f: typeof sortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc') } }

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
                {([['patientName', 'Patient'], ['referrerName', 'Referrer'], ['referrerType', 'Type'], ['branches', 'Branch'], ['createdAt', 'Added']] as [typeof sortField, string][]).map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)} className="px-4 py-2.5 text-left text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--deep-teal)' }}>
                    {label}{sortField === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {[...rows].sort((a, b) => {
                const av = String(a[sortField] ?? ''); const bv = String(b[sortField] ?? '')
                const c = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
                return sortDir === 'asc' ? c : -c
              }).map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => setSessionsFor(r)}>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{r.patientName}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{r.referrerName}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{REFERRER_TYPE_LABEL[r.referrerType || 'DOCTOR'] || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.branches?.length ? r.branches.map(branchLabel).join(', ') : '—'}</td>
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

function ReferralDashboardPanel() {
  const TYPES: [string, string][] = [['DOCTOR', 'Doctors'], ['PARTNER_SCHOOL', 'Partner Schools'], ['LAW_FIRM', 'Law Firms']]
  const [types, setTypes] = useState<string[]>(['DOCTOR', 'PARTNER_SCHOOL', 'LAW_FIRM'])
  const [rows, setRows] = useState<DashRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<'name' | 'type' | 'referrals' | 'net'>('net')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    (async () => { setLoading(true); try { const r = await fetch('/api/referred-patients/dashboard'); const j = r.ok ? await r.json() : { rows: [] }; setRows(j.rows || []) } catch { setRows([]) } finally { setLoading(false) } })()
  }, [])

  const toggleType = (t: string) => setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleSort = (f: typeof sortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir(f === 'name' || f === 'type' ? 'asc' : 'desc') } }

  const filtered = rows.filter(r => types.includes(r.type || 'DOCTOR'))
  const sorted = [...filtered].sort((a, b) => {
    let c = 0
    if (sortField === 'name') c = a.name.localeCompare(b.name)
    else if (sortField === 'type') c = String(a.type).localeCompare(String(b.type))
    else if (sortField === 'referrals') c = a.referrals - b.referrals
    else c = a.net - b.net
    return sortDir === 'asc' ? c : -c
  })
  const top5 = [...filtered].sort((a, b) => (b.referrals - a.referrals) || (b.net - a.net)).slice(0, 5).filter(r => r.referrals > 0)
  const totalReferrals = filtered.reduce((s, r) => s + r.referrals, 0)
  const totalNet = filtered.reduce((s, r) => s + r.net, 0)
  const arrow = (f: typeof sortField) => sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Referral Dashboard</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Referral counts and net sales per referrer, from their referred patients&apos; POS orders.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map(([val, label]) => (
          <label key={val} className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm"
            style={types.includes(val) ? { borderColor: 'var(--teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={types.includes(val)} onChange={() => toggleType(val)} />
            {label}
          </label>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Referrers (shown)</div>
              <div className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{filtered.length}</div>
            </div>
            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total referrals</div>
              <div className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>{totalReferrals}</div>
            </div>
            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total net sales</div>
              <div className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>{peso(totalNet)}</div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Top 5 referrers</p>
            {top5.length === 0 ? <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No referrals yet for the selected type(s).</p> : (
              <div className="space-y-1.5">
                {top5.map((r, i) => (
                  <div key={r.referrerId} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-center font-bold" style={{ color: 'var(--teal)' }}>{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{r.name} <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>· {REFERRER_TYPE_LABEL[r.type || 'DOCTOR']}</span></span>
                    <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{r.referrals} referral{r.referrals === 1 ? '' : 's'}</span>
                    <span className="font-mono font-semibold w-28 text-right" style={{ color: 'var(--deep-teal)' }}>{peso(r.net)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--pale-teal)' }}>
                  {([['name', 'Referrer'], ['type', 'Type'], ['referrals', 'Count of Referrals'], ['net', 'Total Net Sales']] as [typeof sortField, string][]).map(([key, label]) => (
                    <th key={key} onClick={() => toggleSort(key)} className={`px-4 py-2.5 text-xs font-semibold cursor-pointer select-none ${key === 'referrals' || key === 'net' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--deep-teal)' }}>{label}{arrow(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-gray-400">No referrers for the selected type(s).</td></tr>
                  : sorted.map(r => (
                    <tr key={r.referrerId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{REFERRER_TYPE_LABEL[r.type || 'DOCTOR']}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.referrals}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{peso(r.net)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

interface ComSession { id: string; orderNumber: number; date: string; branch: string; patientName: string | null; net: number; paymentStatus: string | null; via: 'tag' | 'link' }
interface ComRow { referrerId: string; name: string; specialization: string | null; isInhouse: boolean; rate: number | null; patients: number; sessions: number; commission: number; orders: ComSession[] }
interface MedrepBlock { staffName: string | null; amount: number; count: number; total: number; patients: { patientKey: string; patientName: string; referrerName: string; referrerType: string | null; firstDate: string; branch: string; orderNumber: number }[] }

// Per-session referral commission for doctors, each at the ₱ rate set on their
// card in Referrers (no rate = listed but earns nothing, so unticked doctors
// with activity stay visible). A session is an earned, non-voided POS order
// attributed to the doctor — by the order's own Doctor Referral tag, or by the
// patient's Referred-patients link when the order wasn't tagged. In-house
// doctors show separately, so both subtotals are always visible.
function ReferralCommissionPanel() {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(iso(today))
  const [branch, setBranch] = useState('')
  const [includeInhouse, setIncludeInhouse] = useState(true)
  const [rows, setRows] = useState<ComRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  // The server clamps the range to the scheme's start date; when it does, the
  // report says so instead of silently showing fewer sessions than the picker.
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [commissionStart, setCommissionStart] = useState('')
  const [medrep, setMedrep] = useState<MedrepBlock | null>(null)
  const [medrepOpen, setMedrepOpen] = useState(false)

  const load = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)
    try {
      const r = await fetch(`/api/referrers/commission?from=${from}&to=${to}&branch=${branch}`)
      const d = r.ok ? await r.json() : { rows: [] }
      setRows(d.rows || [])
      setEffectiveFrom(d.effectiveFrom || '')
      setCommissionStart(d.commissionStart || '')
      setMedrep(d.medrep || null)
    } catch { setRows([]); setMedrep(null) } finally { setLoading(false) }
  }, [from, to, branch])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const shown = includeInhouse ? rows : rows.filter(r => !r.isInhouse)
  const external = shown.filter(r => !r.isInhouse)
  const inhouse = shown.filter(r => r.isInhouse)
  const sum = (list: ComRow[], k: 'sessions' | 'commission') => list.reduce((s, r) => s + r[k], 0)
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const exportCsv = () => {
    const head = ['Doctor', 'Specialization', 'In-house', 'Patients', 'Sessions', 'Rate/session', 'Commission']
    const body = shown.map(r => [r.name, r.specialization || '', r.isInhouse ? 'Yes' : '', r.patients, r.sessions, r.rate != null ? r.rate.toFixed(2) : 'no commission set', r.commission.toFixed(2)])
    const csv = [head, ...body].map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `referral-commission_${from}_${to}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(13); doc.text('Referral Commission — Doctors', 14, 16)
    doc.setFontSize(8); doc.setTextColor(120)
    doc.text(`${effectiveFrom || from} to ${to} · ${branch ? branchLabel(branch) : 'All branches'} · per-doctor rates · commissions count from ${commissionStart || '2026-10-01'} · Generated ${new Date().toLocaleDateString('en-PH')}`, 14, 22)
    doc.setTextColor(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc as any, {
      startY: 28,
      head: [['#', 'Doctor', 'In-house', 'Patients', 'Sessions', 'Rate (P)', 'Commission (P)']],
      body: [
        ...shown.map((r, i) => [i + 1, r.name, r.isInhouse ? 'Yes' : '', r.patients, r.sessions, r.rate != null ? r.rate.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—', r.commission.toLocaleString('en-PH', { minimumFractionDigits: 2 })]),
        ['', 'TOTAL — external doctors', '', '', sum(external, 'sessions'), '', sum(external, 'commission').toLocaleString('en-PH', { minimumFractionDigits: 2 })],
        ...(inhouse.length ? [['', 'TOTAL — in-house doctors', '', '', sum(inhouse, 'sessions'), '', sum(inhouse, 'commission').toLocaleString('en-PH', { minimumFractionDigits: 2 })]] : []),
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [46, 94, 90] },
    })
    doc.save(`referral-commission_${from}_${to}.pdf`)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Referral commission — doctors</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
          Each doctor&apos;s own ₱/session rate — tick &ldquo;Commission&rdquo; on their card in Referrers and set the amount. Sessions come from the POS Doctor Referral tag, plus untagged orders of patients linked under Referred patients (tag a patient&apos;s first order once and every later session attributes automatically). Click a doctor to see the sessions behind the number.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {([['', 'All branches'], ['SANDBOX_EAST', 'East'], ['SANDBOX_GREENHILLS', 'Greenhills']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setBranch(v)} className="px-3 py-2 text-xs font-semibold"
              style={branch === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-xs font-medium"
          style={includeInhouse ? { borderColor: '#fcd34d', background: '#fef3c7', color: '#92400e' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={includeInhouse} onChange={() => setIncludeInhouse(v => !v)} className="accent-[#b45309]" />
          Include in-house doctors
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><Download size={13} /> CSV</button>
          <button onClick={exportPdf} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><Download size={13} /> PDF</button>
        </div>
      </div>

      {!loading && effectiveFrom && effectiveFrom !== from && (
        <p className="text-xs px-3 py-2 rounded-xl inline-block" style={{ background: '#fef3c7', color: '#92400e' }}>
          The commission scheme starts {commissionStart ? new Date(`${commissionStart}T00:00:00+08:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : effectiveFrom} — sessions before that never earn, so this report covers {effectiveFrom} → {to}.
        </p>
      )}

      {loading ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Commission — external doctors</div>
              <div className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>{peso(sum(external, 'commission'))}</div>
              <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{sum(external, 'sessions')} session{sum(external, 'sessions') === 1 ? '' : 's'} · {external.length} doctor{external.length === 1 ? '' : 's'}</div>
            </div>
            {includeInhouse && (
              <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: '#fcd34d' }}>
                <div className="text-xs font-semibold" style={{ color: '#92400e' }}>Commission — in-house doctors</div>
                <div className="text-xl font-bold" style={{ color: '#92400e' }}>{peso(sum(inhouse, 'commission'))}</div>
                <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{sum(inhouse, 'sessions')} session{sum(inhouse, 'sessions') === 1 ? '' : 's'} · {inhouse.length} doctor{inhouse.length === 1 ? '' : 's'}</div>
              </div>
            )}
            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total shown</div>
              <div className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{peso(sum(shown, 'commission'))}</div>
              <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{sum(shown, 'sessions')} session{sum(shown, 'sessions') === 1 ? '' : 's'} at per-doctor rates</div>
            </div>
          </div>

          {medrep && (
            <div className="rounded-2xl border bg-white" style={{ borderColor: '#fcd34d' }}>
              <button onClick={() => setMedrepOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-2 flex-wrap text-left">
                <ChevronDown size={14} style={{ color: 'var(--mid-gray)', transform: medrepOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                <span className="text-sm font-bold" style={{ color: '#92400e' }}>Medical representative incentive</span>
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  one-time per new patient from an external referrer · {medrep.staffName ? `recipient: ${medrep.staffName}` : 'no recipient set — Referrers → Incentive settings'}
                </span>
                <span className="ml-auto text-sm font-mono font-semibold" style={{ color: '#92400e' }}>
                  {medrep.count} × ₱{peso(medrep.amount)} = {peso(medrep.total)}
                </span>
              </button>
              {medrepOpen && (
                <div className="px-10 pb-3">
                  {medrep.patients.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No new referred patients in this range.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {medrep.patients.map(p => (
                          <tr key={p.patientKey}>
                            <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(p.firstDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                            <td className="py-1 pr-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{p.patientName}</td>
                            <td className="py-1 pr-3" style={{ color: 'var(--mid-gray)' }}>via {p.referrerName}{p.referrerType && p.referrerType !== 'DOCTOR' ? ` (${REFERRER_TYPE_LABEL[p.referrerType] || p.referrerType})` : ''}</td>
                            <td className="py-1 pr-3" style={{ color: 'var(--mid-gray)' }}>first session #{p.orderNumber} · {branchLabel(p.branch)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--pale-teal)' }}>
                  {['Doctor', 'Patients', 'Sessions', 'Rate', 'Commission'].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-semibold ${i === 0 ? 'text-left' : 'text-right'}`} style={{ color: 'var(--deep-teal)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No referred sessions in this range.</td></tr>
                ) : shown.map(r => (
                  <Fragment key={r.referrerId}>
                    <tr className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => toggle(r.referrerId)}>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--charcoal)' }}>
                          <ChevronDown size={13} style={{ color: 'var(--mid-gray)', transform: open.has(r.referrerId) ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                          {r.name}
                          {r.isInhouse && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>In-house</span>}
                        </span>
                        {r.specialization && <span className="ml-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>· {r.specialization}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.patients}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.sessions}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: r.rate != null ? 'var(--charcoal)' : 'var(--mid-gray)' }}
                        title={r.rate == null ? 'No commission set — tick "Commission" on this doctor\'s card in Referrers to pay them per session' : undefined}>
                        {r.rate != null ? `₱${peso(r.rate)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: r.rate != null ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>
                        {r.rate != null ? peso(r.commission) : '—'}
                      </td>
                    </tr>
                    {open.has(r.referrerId) && (
                      <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        <td colSpan={5} className="px-10 py-2">
                          <table className="w-full text-xs">
                            <tbody>
                              {r.orders.map(s => (
                                <tr key={s.id}>
                                  <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(s.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                  <td className="py-1 pr-3 font-semibold" style={{ color: 'var(--charcoal)' }}>#{s.orderNumber}</td>
                                  <td className="py-1 pr-3" style={{ color: 'var(--charcoal)' }}>{s.patientName || '—'}
                                    {s.paymentStatus === 'UNPAID' && <span className="ml-1 text-[10px] font-semibold" style={{ color: '#b45309' }}>(unpaid)</span>}
                                  </td>
                                  <td className="py-1 pr-3" style={{ color: 'var(--mid-gray)' }}>{branchLabel(s.branch)}</td>
                                  <td className="py-1 pr-3" style={{ color: 'var(--mid-gray)' }} title={s.via === 'tag' ? 'The order named this doctor at POS' : 'Attributed through the Referred-patients link (order not tagged)'}>
                                    {s.via === 'tag' ? 'POS tag' : 'patient link'}
                                  </td>
                                  <td className="py-1 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{peso(s.net)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
                  {['Date', 'Service', 'Department', 'Branch', 'Net amount'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(s.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{s.services}{s.paymentStatus === 'UNPAID' ? <span className="ml-1 text-[10px] font-semibold" style={{ color: '#b45309' }}>(unpaid)</span> : null}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{s.departments && s.departments.length ? s.departments.map(departmentLabel).join(', ') : '—'}</td>
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
