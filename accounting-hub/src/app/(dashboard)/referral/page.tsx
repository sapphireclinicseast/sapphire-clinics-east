'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Users, UserPlus, Loader2, X, Trash2, Search, ChevronDown, Download, BarChart3, HandCoins, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Trophy, Stethoscope, Scale, GraduationCap } from 'lucide-react'
import ReferrerSettingsPanel, { REFERRER_TYPE_LABEL } from '@/components/ReferrerSettingsPanel'
import { AlertBanner, EmptyState, LoadingNote, display, ink, muted } from '@/components/ReferralUi'
import { AccountPicker, type PickableAccount } from '@/components/AccountPicker'
import { MedrepRecipientPicker, type IncentiveStaff } from '@/components/MedrepRecipientPicker'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import { branchLabel } from '@/lib/branch'
import { departmentLabel } from '@/lib/department'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── HR Hub look (shared pieces for this page) ──
// White card, 1px border, 8px radius; toolbar strip; 11px uppercase headers.
const hrCard = { borderColor: 'var(--light-gray)', background: '#fff' }
const hrToolbar = { background: '#fcfdfa', borderColor: 'var(--light-gray)' }
const hrTh = 'px-4 py-2.5 border-b text-[11px] font-bold uppercase tracking-[.5px] whitespace-nowrap'
const hrThStyle = { color: 'var(--mid-gray)', background: 'var(--hr-head)', borderColor: 'var(--light-gray)' }
const hrLine = { borderColor: 'var(--hr-line)' }
const hrInput = 'h-9 px-3 rounded-lg border bg-white text-[13px] outline-none focus:border-[var(--teal)] focus:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]'
const seg = (on: boolean) => (on ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' })
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** Card heading row, as on the HR dashboard's section cards. */
function CardHead({ icon, title, right }: { icon?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
      <h3 className="text-sm font-bold flex items-center gap-2 min-w-0" style={{ ...ink, ...display }}>
        {icon && <span className="shrink-0" style={{ color: 'var(--teal)' }}>{icon}</span>}{title}
      </h3>
      {right != null && <span className="text-xs" style={muted}>{right}</span>}
    </div>
  )
}

/** Shimmer rows while a table loads. */
function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 rounded-md hr-shimmer" />)}
    </div>
  )
}
// Where commission payout RFPs book when no account is chosen in the payout
// settings — must match the API's fallback (referrers/commission/rfp).
const DEFAULT_COMMISSION_ACCOUNT = '8120 Marketing and Advertising Expense'

interface RefOpt { id: string; name: string; type?: string | null }
interface PatientHit { id: string; name: string; email?: string | null }
interface RP { id: string; patientId: string | null; patientName: string; referrerId: string; referrerName: string; referrerType: string | null; branches: string[]; note: string | null; createdAt: string }
interface Sess { id: string; orderNumber: number; date: string; branch: string; paymentStatus: string; services: string; departments: string[]; netAmount: number }
interface DashRow { referrerId: string; name: string; type: string | null; referrals: number; net: number; medrepTotal: number; medrepPaid: number }

// Label a claim-ledger cutoff for humans: payroll "2026-10-2" → "Oct 2026 · 2nd
// cutoff"; a hand-mark "MANUAL-2026-10-13" → "marked Oct 13, 2026".
function paidLabel(paid: { cutoffPeriod: string; viaPayroll: boolean }): string {
  const m = paid.cutoffPeriod.match(/^(\d{4})-(\d{2})-([12])$/)
  if (m) {
    const month = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
    return `payroll · ${month} · ${m[3] === '1' ? '1st' : '2nd'} cutoff`
  }
  const man = paid.cutoffPeriod.match(/^MANUAL-(\d{4}-\d{2}-\d{2})$/)
  if (man) return `marked ${new Date(`${man[1]}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
  return paid.viaPayroll ? 'payroll' : 'marked paid'
}

export default function ReferralPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [tab, setTab] = useState<'referrers' | 'patients' | 'dashboard' | 'commission'>('referrers')

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && role === 'HMO_OFFICER') {
    return <div className="p-8 text-center text-gray-500">The Referral section isn&apos;t available for the HMO Officer role.</div>
  }

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      {/* ── Title ── */}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Users size={22} style={{ color: 'var(--teal)' }} /> Referral
        </h1>
        <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
          The doctors, law firms and partner schools who send us patients — who they referred, the sales that followed, and the commission they earn.
        </p>
      </div>

      {/* ── Tabs: one row, swipes sideways on narrow screens ── */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div role="tablist" aria-label="Referral sections" className="flex items-end -mb-[2px] max-w-full overflow-x-auto">
          {([['referrers', 'Referrers', Users], ['patients', 'Referred patients', UserPlus], ['dashboard', 'Referral Dashboard', BarChart3], ['commission', 'Commission', HandCoins]] as const).map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors hover:text-[var(--teal)]"
              style={{ fontFamily: 'var(--font-display)', borderColor: tab === k ? 'var(--teal)' : 'transparent', color: tab === k ? 'var(--teal)' : 'var(--mid-gray)' }}>
              <Icon size={15} style={{ opacity: tab === k ? 1 : 0.7 }} />
              {label}
            </button>
          ))}
        </div>
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

  // Display-only: the type cards double as a quick filter on the loaded rows
  // (a row with no referrer type counts as a doctor, as the Type column shows).
  const [typeFilter, setTypeFilter] = useState('')
  const typeOf = (r: RP) => r.referrerType || 'DOCTOR'
  const nOfType = (t: string) => rows.filter(r => typeOf(r) === t).length
  const nReferrers = new Set(rows.map(r => r.referrerId)).size
  const shownRows = typeFilter ? rows.filter(r => typeOf(r) === typeFilter) : rows
  const sortedRows = [...shownRows].sort((a, b) => {
    const av = String(a[sortField] ?? ''); const bv = String(b[sortField] ?? '')
    const c = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
    return sortDir === 'asc' ? c : -c
  })
  const TYPE_CARDS: [string, string, string][] = [['DOCTOR', 'From doctors', 'Referred by doctors'], ['PARTNER_SCHOOL', 'From partner schools', 'Referred by partner schools'], ['LAW_FIRM', 'From law firms', 'Referred by law firms']]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={loading} label="Referred patients" value={rows.length.toLocaleString()}
          sub={`${plural(nReferrers, 'referrer')}${search.trim() ? ' · matching the search' : ''}`}
          accent={{ line: 'var(--teal)' }} onClick={typeFilter ? () => setTypeFilter('') : undefined} title={typeFilter ? 'Show every type' : undefined} />
        {TYPE_CARDS.map(([t, label, sub]) => {
          const n = nOfType(t)
          return (
            <StatCard key={t} loading={loading} label={label} value={n.toLocaleString()} sub={sub}
              tone={n ? undefined : 'zero'} accent={n ? { line: typeTone(t).bar } : undefined}
              active={typeFilter === t} onClick={() => setTypeFilter(f => (f === t ? '' : t))} title={`Show only patients ${sub.toLowerCase()}`} />
          )
        })}
      </div>

      <section className="rounded-lg border bg-white min-w-0" style={hrCard}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold" style={{ ...ink, ...display }}>
              Referred patients <span className="ml-1 text-xs font-semibold" style={{ ...muted, fontFamily: 'var(--font-body)' }}>
                {loading ? '' : `${shownRows.length.toLocaleString()}${shownRows.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''}`}
              </span>
            </h2>
            <p className="text-xs mt-0.5" style={muted}>Link a patient to the referrer who sent them. Click a row to see the patient&apos;s recorded sessions with us.</p>
          </div>
          <button onClick={() => setShowAdd(true)} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <UserPlus size={15} /> Add referred patient
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-y" style={hrToolbar}>
          <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-72 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
            <Search size={15} className="flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or referrer…"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={ink} />
            {search && <button onClick={() => setSearch('')} title="Clear search"><X size={14} /></button>}
          </label>
          {typeFilter && (
            <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full text-xs font-semibold" style={{ background: typeTone(typeFilter).bg, color: typeTone(typeFilter).fg }}>
              <TypeIcon t={typeFilter} size={12} /> {REFERRER_TYPE_LABEL[typeFilter]} only
              <button onClick={() => setTypeFilter('')} title="Show every type" className="p-0.5 rounded-full hover:bg-white/60"><X size={12} /></button>
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          {loading ? <RowsSkeleton /> : sortedRows.length === 0 ? (
            <div className="py-12 text-center text-sm" style={muted}>
              {rows.length === 0 ? (search.trim() ? 'No referred patient matches the search.' : 'No referred patients yet.') : 'No referred patients of this type.'}
            </div>
          ) : (
            <table className="w-full text-[13px]" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  {([['patientName', 'Patient'], ['referrerName', 'Referrer'], ['referrerType', 'Type'], ['branches', 'Branch'], ['createdAt', 'Added']] as [typeof sortField, string][]).map(([key, label]) => (
                    <th key={key} className={`${hrTh} text-left`} style={hrThStyle} aria-sort={sortField === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 uppercase hover:text-[var(--teal)]" style={sortField === key ? { color: 'var(--teal)' } : undefined}>
                        {label}
                        {sortField === key ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}
                      </button>
                    </th>
                  ))}
                  <th className={hrTh} style={hrThStyle} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(r => (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-[#fafbf7]" onClick={() => setSessionsFor(r)} title="See this patient's recorded sessions">
                    <td className="px-4 py-2.5 border-b font-semibold" style={{ ...hrLine, ...ink }}>{r.patientName}</td>
                    <td className="px-4 py-2.5 border-b" style={{ ...hrLine, ...ink }}>{r.referrerName}</td>
                    <td className="px-4 py-2.5 border-b whitespace-nowrap" style={hrLine}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: typeTone(r.referrerType).bg, color: typeTone(r.referrerType).fg }}>
                        <TypeIcon t={r.referrerType} size={11} /> {REFERRER_TYPE_LABEL[typeOf(r)] || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 border-b" style={hrLine}>
                      {r.branches?.length
                        ? <span className="flex flex-wrap gap-1">{r.branches.map(b => <span key={b} className="px-1.5 py-px rounded text-[10.5px] font-semibold whitespace-nowrap" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>{branchLabel(b)}</span>)}</span>
                        : <span style={{ color: 'var(--hr-faint)' }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 border-b whitespace-nowrap text-xs" style={{ ...hrLine, ...muted }}>{new Date(r.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
                    <td className="px-3 py-2 border-b text-right" style={hrLine} onClick={e => e.stopPropagation()}>
                      <button onClick={() => del(r)} title="Remove this referred patient" className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

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

  const inp = `w-full ${hrInput}`
  const bc = { borderColor: 'var(--light-gray)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b" style={bc}>
          <h3 className="text-base font-bold" style={{ ...ink, ...display }}>Add referred patient</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg hover:bg-[var(--pale-teal)]"><X size={18} style={muted} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
        {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c' }}>{error}</p>}

        {/* Referrer */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[.4px] mb-1" style={muted}>Referrer *</label>
          {referrer ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
              <span className="text-sm font-medium">{referrer.name} <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>· {REFERRER_TYPE_LABEL[referrer.type || 'DOCTOR']}</span></span>
              <button onClick={() => { setReferrerId(''); setRefSearch('') }} className="text-xs" style={{ color: 'var(--teal)' }}>Change</button>
            </div>
          ) : (
            <>
              <input value={refSearch} onChange={e => setRefSearch(e.target.value)} placeholder="Search referrers..." className={inp} style={bc} />
              {refSearch && (
                <div className="mt-1 max-h-40 overflow-auto rounded-lg border bg-white shadow-sm" style={bc}>
                  {filteredRefs.length === 0 ? <div className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No match.</div>
                    : filteredRefs.slice(0, 30).map(r => (
                      <button key={r.id} onClick={() => { setReferrerId(r.id); setRefSearch('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--pale-teal)] border-b last:border-0" style={hrLine}>
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
          <label className="block text-[11px] font-bold uppercase tracking-[.4px] mb-1" style={muted}>Patient * <span className="font-normal normal-case tracking-normal">(from Patient CRM)</span></label>
          {patient ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
              <span className="text-sm font-medium">{patient.name}{patient.email ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}> · {patient.email}</span> : null}</span>
              <button onClick={() => { setPatient(null); setPatSearch('') }} className="text-xs" style={{ color: 'var(--teal)' }}>Change</button>
            </div>
          ) : (
            <>
              <input value={patSearch} onChange={e => setPatSearch(e.target.value)} placeholder="Search patient name (min 2 chars)..." className={inp} style={bc} />
              {patSearch.trim().length >= 2 && (
                <div className="mt-1 max-h-40 overflow-auto rounded-lg border bg-white shadow-sm" style={bc}>
                  {patLoading ? <div className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}><Loader2 size={12} className="inline animate-spin" /> Searching…</div>
                    : patHits.length === 0 ? <div className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No patient found.</div>
                      : patHits.map(p => (
                        <button key={p.id} onClick={() => { setPatient(p); setPatSearch('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--pale-teal)] border-b last:border-0" style={hrLine}>
                          {p.name}{p.email ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}> · {p.email}</span> : null}
                        </button>
                      ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[.4px] mb-1" style={muted}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} className={inp} style={bc} />
        </div>

        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={bc}>
          <button onClick={onClose} className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
          <button onClick={save} disabled={saving} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>{saving && <Loader2 size={13} className="animate-spin" />} Save</button>
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
  // Click a referrer's row to see the sessions behind its figures — fetched
  // once per referrer, attributed server-side with the same rules the totals
  // use, so the drill-down always adds up to the row.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [rowSessions, setRowSessions] = useState<Record<string, { id: string; orderNumber: number; date: string; patientName: string | null; branch: string; net: number }[] | 'loading'>>({})
  const toggleRow = (id: string) => {
    setOpenRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    setRowSessions(s => {
      if (s[id]) return s
      fetch(`/api/referred-patients/dashboard?referrerId=${encodeURIComponent(id)}`)
        .then(r => (r.ok ? r.json() : { sessions: [] }))
        .then(j => setRowSessions(cur => ({ ...cur, [id]: j.sessions || [] })))
        .catch(() => setRowSessions(cur => ({ ...cur, [id]: [] })))
      return { ...s, [id]: 'loading' }
    })
  }
  const BRANCH_SHORT: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'Institute' }

  // Display-only: a failed load shows a banner (with Try again, which re-runs
  // the same request) instead of an empty dashboard that looks like "no data".
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    (async () => { setLoading(true); setLoadError(false); try { const r = await fetch('/api/referred-patients/dashboard'); if (!r.ok) setLoadError(true); const j = r.ok ? await r.json() : { rows: [] }; setRows(j.rows || []) } catch { setRows([]); setLoadError(true) } finally { setLoading(false) } })()
  }, [reload])

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
  // Display-only roll-ups of the rows already loaded.
  const activeReferrers = filtered.filter(r => r.referrals > 0).length
  const medrepTotal = filtered.reduce((s, r) => s + (r.medrepTotal || 0), 0)
  const medrepPaid = filtered.reduce((s, r) => s + (r.medrepPaid || 0), 0)
  const topMax = Math.max(1, ...top5.map(r => r.referrals))
  const byType = TYPES.filter(([val]) => types.includes(val)).map(([val, label]) => {
    const list = filtered.filter(r => (r.type || 'DOCTOR') === val)
    return { val, label, count: list.length, referrals: list.reduce((s, r) => s + r.referrals, 0), net: list.reduce((s, r) => s + r.net, 0) }
  })
  const sortHead = (f: typeof sortField, label: string, align: 'left' | 'right' = 'left') => (
    <th className={`${hrTh} ${align === 'right' ? 'text-right' : 'text-left'}`} style={hrThStyle} aria-sort={sortField === f ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => toggleSort(f)} className={`inline-flex items-center gap-1 uppercase hover:text-[var(--teal)] ${align === 'right' ? 'flex-row-reverse' : ''}`} style={sortField === f ? { color: 'var(--teal)' } : undefined}>
        {label}
        {sortField === f ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      {/* ── Title + type filter ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold" style={{ ...ink, ...display }}>Referral Dashboard</h2>
          <p className="text-xs mt-0.5 max-w-2xl" style={muted}>Referral counts and net sales per referrer, from their referred patients&apos; POS orders. Click a referrer in the table to see the sessions behind the figures.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Referrer types shown">
          <span className="text-[11px] font-bold uppercase tracking-[.4px] mr-1" style={muted}>Show</span>
          {TYPES.map(([val, label]) => {
            const on = types.includes(val)
            const n = rows.filter(r => (r.type || 'DOCTOR') === val).length
            return (
              <label key={val} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border cursor-pointer text-xs font-semibold select-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--teal)]"
                style={on ? { borderColor: 'var(--teal)', background: 'var(--teal)', color: '#fff' } : { borderColor: 'var(--light-gray)', background: '#fff', color: 'var(--mid-gray)' }}>
                <input type="checkbox" checked={on} onChange={() => toggleType(val)} className="sr-only" />
                <TypeIcon t={val} size={13} />
                {label}
                {!loading && <span className="tabular-nums" style={{ opacity: on ? 0.75 : 0.6 }}>{n}</span>}
              </label>
            )
          })}
        </div>
      </div>

      {loadError && !loading && (
        <AlertBanner onRetry={() => setReload(n => n + 1)}>Couldn&apos;t load the referral dashboard. The figures below may be missing.</AlertBanner>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <StatCard key={i} loading label="" value="" sub="" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="h-[230px] rounded-lg border hr-shimmer" style={hrCard} />
            <div className="h-[230px] rounded-lg border hr-shimmer hidden sm:block" style={hrCard} />
          </div>
          <div className="h-[260px] rounded-lg border hr-shimmer" style={hrCard} />
          <LoadingNote>Loading referral figures…</LoadingNote>
        </div>
      ) : rows.length === 0 ? (
        loadError ? null : (
          <EmptyState icon={<BarChart3 size={32} />} title="No referral figures yet">
            Once referred patients are linked to their referrer (Referred patients tab) and have POS orders, their referral counts and net sales show here.
          </EmptyState>
        )
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Referrers (shown)" value={filtered.length.toLocaleString()} sub={`${activeReferrers.toLocaleString()} with at least one referral`}
              accent={{ line: 'var(--teal)' }} />
            <StatCard label="Total referrals" value={totalReferrals.toLocaleString()}
              sub={activeReferrers ? `${(totalReferrals / activeReferrers).toLocaleString('en-PH', { maximumFractionDigits: 1 })} per active referrer` : '—'}
              tone={totalReferrals ? undefined : 'zero'} accent={totalReferrals ? { line: '#2563eb' } : undefined} />
            <StatCard compact label="Total net sales" value={peso(totalNet)} sub="Referred patients' POS orders" tone={totalNet ? 'green' : 'zero'} />
            <StatCard label="Med-rep incentive paid" value={medrepTotal ? `${medrepPaid.toLocaleString()} of ${medrepTotal.toLocaleString()}` : '—'}
              sub={medrepTotal ? (medrepPaid >= medrepTotal ? 'All paid' : `${(medrepTotal - medrepPaid).toLocaleString()} still to pay`) : 'External doctors only'}
              tone={!medrepTotal ? 'zero' : medrepPaid >= medrepTotal ? 'green' : 'amber'} />
          </div>

          {/* ── Top referrers + by type ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className="rounded-lg border min-w-0" style={hrCard}>
              <CardHead icon={<Trophy size={15} />} title="Top 5 referrers" right="by referrals" />
              <div className="p-4">
              {top5.length === 0 ? <p className="text-xs py-6 text-center" style={muted}>No referrals yet for the selected type(s).</p> : (
                <ol className="space-y-3">
                  {top5.map((r, i) => (
                    <li key={r.referrerId} className="min-w-0">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                          style={i === 0 ? { background: 'var(--teal)', color: '#fff' } : { background: 'var(--pale-teal)', color: 'var(--teal)' }}>{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate font-medium" style={ink} title={r.name}>{r.name} <span className="text-xs font-normal" style={muted}>· {REFERRER_TYPE_LABEL[r.type || 'DOCTOR']}</span></span>
                        <span className="font-mono text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--teal)' }}>{peso(r.net)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 pl-9">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hr-line)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(r.referrals / topMax) * 100}%`, background: typeTone(r.type).bar }} />
                        </div>
                        <span className="text-[11px] tabular-nums whitespace-nowrap w-20 text-right" style={muted}>{r.referrals} referral{r.referrals === 1 ? '' : 's'}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              </div>
            </section>

            <section className="rounded-lg border min-w-0" style={hrCard}>
              <CardHead icon={<BarChart3 size={15} />} title="By referrer type" right="share of net sales" />
              <div className="p-4">
              {byType.length === 0 ? <p className="text-xs py-6 text-center" style={muted}>Pick at least one type above.</p> : (
                <ul className="space-y-3.5">
                  {byType.map(t => (
                    <li key={t.val} className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: typeTone(t.val).bg, color: typeTone(t.val).fg }}><TypeIcon t={t.val} size={13} /></span>
                        <span className="flex-1 min-w-0 font-medium truncate" style={ink}>{t.label}</span>
                        <span className="font-mono text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--teal)' }}>{peso(t.net)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 pl-8">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hr-line)' }}>
                          <div className="h-full rounded-full" style={{ width: `${totalNet > 0 ? Math.max(0, (t.net / totalNet) * 100) : 0}%`, background: typeTone(t.val).bar }} />
                        </div>
                        <span className="text-[11px] tabular-nums whitespace-nowrap w-20 text-right" style={muted}>{totalNet > 0 ? `${((t.net / totalNet) * 100).toFixed(0)}%` : '—'}</span>
                      </div>
                      <p className="text-[11px] mt-0.5 pl-8" style={muted}>{t.count} referrer{t.count === 1 ? '' : 's'} · {t.referrals} referral{t.referrals === 1 ? '' : 's'}</p>
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </section>
          </div>

          {/* ── Every referrer ── */}
          <section className="rounded-lg border min-w-0" style={hrCard}>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pt-3.5 pb-3">
              <h3 className="text-[15px] font-bold" style={{ ...ink, ...display }}>
                All referrers <span className="ml-1 text-xs font-semibold" style={{ ...muted, fontFamily: 'var(--font-body)' }}>{sorted.length.toLocaleString()}</span>
              </h3>
              <span className="text-xs" style={muted}>Click a row for the sessions behind its figures</span>
            </div>
            <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-[13px]" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    {sortHead('name', 'Referrer')}
                    {sortHead('type', 'Type')}
                    {sortHead('referrals', 'Count of Referrals', 'right')}
                    <th className={`${hrTh} text-center`} style={hrThStyle} title="One-time ₱ incentive to the med rep per new patient referred by an external doctor — paid vs total. Schools and law firms don't earn it. Mark payouts in Commission → Medical representative incentive.">Med-Rep Paid</th>
                    {sortHead('net', 'Total Net Sales', 'right')}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-sm" style={muted}>
                      No referrers for the selected type(s).{' '}
                      {types.length < TYPES.length && <button onClick={() => setTypes(TYPES.map(([v]) => v))} className="underline" style={{ color: 'var(--teal)' }}>Show all types</button>}
                    </td></tr>
                  ) : sorted.map(r => {
                    const open = openRows.has(r.referrerId)
                    const sess = rowSessions[r.referrerId]
                    return (
                      <Fragment key={r.referrerId}>
                        <tr className="cursor-pointer transition-colors hover:bg-[#fafbf7]" style={{ background: open ? 'var(--hr-head)' : undefined }}
                          onClick={() => toggleRow(r.referrerId)} title="Click to see the sessions behind these figures" aria-expanded={open}>
                          <td className="px-4 py-2.5 border-b font-medium" style={{ ...hrLine, ...ink, boxShadow: `inset 3px 0 0 ${open ? 'var(--teal)' : 'transparent'}` }}>
                            <span className="inline-flex items-start gap-1.5">
                              <span className="mt-0.5 shrink-0" style={muted}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                              <span className="break-words">{r.name}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 border-b whitespace-nowrap" style={hrLine}>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: typeTone(r.type).bg, color: typeTone(r.type).fg }}>
                              <TypeIcon t={r.type} size={11} /> {REFERRER_TYPE_LABEL[r.type || 'DOCTOR']}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 border-b text-right font-mono tabular-nums" style={{ ...hrLine, color: r.referrals ? 'var(--charcoal)' : 'var(--hr-faint)' }}>{r.referrals}</td>
                          <td className="px-4 py-2.5 border-b text-center" style={hrLine}><MedrepPill r={r} /></td>
                          <td className="px-4 py-2.5 border-b text-right font-mono font-semibold whitespace-nowrap" style={{ ...hrLine, color: r.net ? 'var(--teal)' : 'var(--hr-faint)' }}>{peso(r.net)}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={5} className="px-4 sm:px-6 pt-1 pb-4 border-b" style={{ ...hrLine, background: 'var(--hr-head)', boxShadow: 'inset 3px 0 0 var(--teal)' }}>
                              {sess === 'loading' || !sess ? (
                                <div className="space-y-1.5 pt-2" aria-busy="true">
                                  {[0, 1, 2].map(i => <div key={i} className="h-7 rounded-md hr-shimmer" />)}
                                  <LoadingNote>Loading sessions…</LoadingNote>
                                </div>
                              ) : sess.length === 0 ? (
                                <p className="text-xs py-3" style={muted}>No earned sessions recorded for this referrer&apos;s patients yet.</p>
                              ) : (
                                <div className="rounded-lg border bg-white overflow-x-auto mt-1" style={{ borderColor: 'var(--light-gray)' }}>
                                  <table className="w-full text-xs tabular-nums">
                                    <thead>
                                      <tr className="text-left">
                                        {['Date', 'Order #', 'Patient', 'Branch', 'Net'].map((h, i) => (
                                          <th key={h} className={`px-3 py-2 border-b text-[10.5px] font-bold uppercase tracking-[.5px] whitespace-nowrap ${i === 4 ? 'text-right' : ''}`} style={hrThStyle}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sess.map(s => (
                                        <tr key={s.id}>
                                          <td className="px-3 py-1.5 border-b whitespace-nowrap" style={{ ...hrLine, ...muted }}>{new Date(s.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                          <td className="px-3 py-1.5 border-b font-mono" style={{ ...hrLine, ...ink }}>{s.orderNumber}</td>
                                          <td className="px-3 py-1.5 border-b" style={{ ...hrLine, ...ink }}>{s.patientName || '—'}</td>
                                          <td className="px-3 py-1.5 border-b whitespace-nowrap" style={{ ...hrLine, ...muted }}>{BRANCH_SHORT[s.branch] || s.branch}</td>
                                          <td className="px-3 py-1.5 border-b text-right font-mono whitespace-nowrap" style={{ ...hrLine, ...ink }}>{peso(s.net)}</td>
                                        </tr>
                                      ))}
                                      <tr className="font-semibold" style={{ background: 'var(--hr-head)' }}>
                                        <td className="px-3 py-2" colSpan={4} style={ink}>{sess.length} session{sess.length === 1 ? '' : 's'}</td>
                                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color: 'var(--teal)' }}>{peso(sess.reduce((t, s) => t + s.net, 0))}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
                {sorted.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold" style={{ background: 'var(--hr-head)' }}>
                      <td className="px-4 py-2.5 border-t text-[11px] font-bold uppercase tracking-[.5px]" colSpan={2} style={{ borderColor: 'var(--light-gray)', ...muted }}>Total</td>
                      <td className="px-4 py-2.5 border-t text-right font-mono tabular-nums" style={{ borderColor: 'var(--light-gray)', ...ink }}>{totalReferrals}</td>
                      <td className="px-4 py-2.5 border-t text-center text-xs" style={{ borderColor: 'var(--light-gray)', ...muted }}>{medrepTotal ? `${medrepPaid}/${medrepTotal} paid` : '—'}</td>
                      <td className="px-4 py-2.5 border-t text-right font-mono whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>{peso(totalNet)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// Referral Dashboard view helpers (module level so rows don't remount on every render).
const typeTone = (t?: string | null) => t === 'LAW_FIRM' ? { bg: '#fef3c7', fg: '#92400e', bar: '#d9a441' } : t === 'PARTNER_SCHOOL' ? { bg: '#ede9fe', fg: '#6d28d9', bar: '#8b78d8' } : { bg: 'var(--pale-teal)', fg: 'var(--deep-teal)', bar: 'var(--bright-teal)' }
function TypeIcon({ t, size = 14 }: { t?: string | null; size?: number }) {
  return t === 'LAW_FIRM' ? <Scale size={size} /> : t === 'PARTNER_SCHOOL' ? <GraduationCap size={size} /> : <Stethoscope size={size} />
}
function MedrepPill({ r }: { r: DashRow }) {
  if (!r.medrepTotal) return <span className="text-xs" style={muted}>—</span>
  return r.medrepPaid >= r.medrepTotal
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: '#ecfdf5', color: '#047857' }}>✓ {r.medrepPaid}/{r.medrepTotal} paid</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: '#fffbeb', color: '#b45309' }}>{r.medrepPaid}/{r.medrepTotal} paid</span>
}

interface ComSession { id: string; orderNumber: number; date: string; branch: string; patientName: string | null; net: number; paymentStatus: string | null; via: 'tag' | 'link' }
interface ComRow { referrerId: string; name: string; specialization: string | null; isInhouse: boolean; basis?: 'SESSION' | 'PATIENT'; rate: number | null; patients: number; sessions: number; commission: number; orders: ComSession[] }
interface MedrepBlock { staffName: string | null; amount: number; count: number; total: number; patients: { patientKey: string; patientName: string; referrerId: string; referrerName: string; referrerType: string | null; firstDate: string; branch: string; orderNumber: number; paid: { cutoffPeriod: string; viaPayroll: boolean; at: string } | null }[] }

// Per-session referral commission for doctors, each at the ₱ rate set on their
// card in Referrers (no rate = listed but earns nothing, so unticked doctors
// with activity stay visible). A session is an earned, non-voided POS order
// attributed to the doctor — by the order's own Doctor Referral tag, or by the
// patient's Referred-patients link when the order wasn't tagged. In-house
// doctors show separately, so both subtotals are always visible.
function ReferralCommissionPanel() {
  const { data: session } = useSession()
  const canMarkPaid = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN'].includes((session?.user?.role as string) || '')
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
  // Open by default so the recipient is set where the incentive shows (Hannah 2026-11-11).
  const [medrepOpen, setMedrepOpen] = useState(true)
  // Med rep incentive settings, edited right here: recipient (searchable staff
  // list) and ₱ per new patient. Payroll then adds the unpaid ones to that
  // person's payslip automatically when it is generated.
  const [incStaff, setIncStaff] = useState<IncentiveStaff[]>([])
  const [incStaffId, setIncStaffId] = useState<string | null>(null)
  const [incAmount, setIncAmount] = useState('50')
  const [incSaving, setIncSaving] = useState(false)
  useEffect(() => {
    fetch('/api/referrers/incentive-settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setIncStaff(d.staff || []); setIncStaffId(d.staffId || null); setIncAmount(String(d.amount ?? 50)) } })
      .catch(() => {})
  }, [])
  const saveIncentive = async (patch: { staffId?: string | null; staffName?: string | null; amount?: number }) => {
    setIncSaving(true)
    try {
      const r = await fetch('/api/referrers/incentive-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Could not save the incentive settings'); return }
      const d = await r.json()
      setIncStaffId(d.staffId || null); setIncAmount(String(d.amount ?? 50))
      await load()
    } finally { setIncSaving(false) }
  }
  // In-house doctors with referred sessions but no rate: payroll pays them nothing.
  const [bulkRateBusy, setBulkRateBusy] = useState(false)

  // RFP payout for EXTERNAL referrers (outside doctors, law firms, partner
  // schools — not staff → no payroll): one expense RFP per referrer covering
  // their unclaimed sessions, claim-ledger stamped. First built 10/07, rolled
  // back on Hannah's call; reinstated on her call 2026-10-16 with the expense
  // account configurable below.
  const [rfpOpen, setRfpOpen] = useState(true)
  const [rfpBranch, setRfpBranch] = useState('SANDBOX_EAST')
  const [rfpUpTo, setRfpUpTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [rfpBusy, setRfpBusy] = useState(false)
  const [rfpResult, setRfpResult] = useState<{ created: { referrer: string; refNumber: string; sessions: number; basis?: string; amount: number }[]; note?: string; error?: string } | null>(null)
  // What Generate would create right now (GET preview — nothing is written).
  const [rfpPreview, setRfpPreview] = useState<{ referrerId: string; referrer: string; basis: string; units: number; rate: number; amount: number }[] | null>(null)
  const [previewTick, setPreviewTick] = useState(0)
  useEffect(() => {
    if (!rfpOpen || !rfpUpTo) return
    let alive = true
    fetch(`/api/referrers/commission/rfp?upTo=${rfpUpTo}`)
      .then(r => (r.ok ? r.json() : { preview: [] }))
      .then(d => { if (alive) setRfpPreview(d.preview || []) })
      .catch(() => { if (alive) setRfpPreview([]) })
    return () => { alive = false }
  }, [rfpOpen, rfpUpTo, previewTick])
  // Payout settings: the expense account the RFPs book under (persisted on the
  // incentive-settings singleton; picking an account saves immediately).
  const [payoutAccount, setPayoutAccount] = useState<string | null>(null)
  const [acctSaving, setAcctSaving] = useState(false)
  const [coa, setCoa] = useState<PickableAccount[]>([])
  useEffect(() => {
    if (!rfpOpen || coa.length) return
    fetch('/api/chart-of-accounts?accountType=EXPENSE&pageSize=1000')
      .then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => { const list = Array.isArray(d) ? d : (d.accounts || d.data || []); setCoa(list) })
      .catch(() => {})
  }, [rfpOpen, coa.length])
  const saveAccount = async (next: string) => {
    const prev = payoutAccount
    setPayoutAccount(next || null); setAcctSaving(true)
    try {
      const r = await fetch('/api/referrers/incentive-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionExpenseAccount: next || null }),
      })
      if (!r.ok) setPayoutAccount(prev)
    } catch { setPayoutAccount(prev) } finally { setAcctSaving(false) }
  }

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
      setPayoutAccount(d.commissionExpenseAccount ?? null)
    } catch { setRows([]); setMedrep(null) } finally { setLoading(false) }
  }, [from, to, branch])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const generateRfps = async () => {
    setRfpBusy(true); setRfpResult(null)
    try {
      const r = await fetch('/api/referrers/commission/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: rfpBranch, upTo: rfpUpTo }),
      })
      const d = await r.json()
      if (!r.ok) { setRfpResult({ created: [], error: d.error || 'Failed to generate' }); return }
      setRfpResult(d)
      load()
      setPreviewTick(t => t + 1)
    } catch { setRfpResult({ created: [], error: 'Failed to generate' }) }
    finally { setRfpBusy(false) }
  }

  // Mark / unmark a med-rep incentive as paid out (manual claim-ledger row).
  const [marking, setMarking] = useState<string | null>(null)
  const markPaid = async (p: { patientKey: string; referrerId: string }) => {
    setMarking(p.patientKey)
    try {
      const r = await fetch('/api/referrers/commission/medrep-paid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientKey: p.patientKey, referrerId: p.referrerId }),
      })
      if (!r.ok) alert((await r.json()).error || 'Failed to mark as paid')
      await load()
    } finally { setMarking(null) }
  }
  const unmarkPaid = async (patientKey: string) => {
    if (!confirm('Remove the manual “paid” mark for this incentive?')) return
    setMarking(patientKey)
    try {
      const r = await fetch(`/api/referrers/commission/medrep-paid?patientKey=${encodeURIComponent(patientKey)}`, { method: 'DELETE' })
      if (!r.ok) alert((await r.json()).error || 'Failed to unmark')
      await load()
    } finally { setMarking(null) }
  }

  const shown = includeInhouse ? rows : rows.filter(r => !r.isInhouse)
  const external = shown.filter(r => !r.isInhouse)
  const inhouse = shown.filter(r => r.isInhouse)
  const sum = (list: ComRow[], k: 'sessions' | 'commission') => list.reduce((s, r) => s + r[k], 0)
  // Units are sessions for per-session referrers and patients for per-patient ones.
  const unitsText = (list: ComRow[]) => {
    const sess = list.filter(r => r.basis !== 'PATIENT').reduce((n, r) => n + r.sessions, 0)
    const pats = list.filter(r => r.basis === 'PATIENT').reduce((n, r) => n + r.sessions, 0)
    return [sess || !pats ? `${sess} session${sess === 1 ? '' : 's'}` : '', pats ? `${pats} patient${pats === 1 ? '' : 's'}` : ''].filter(Boolean).join(' + ')
  }
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const exportCsv = () => {
    const head = ['Referrer', 'Specialization', 'In-house', 'Basis', 'Patients', 'Sessions', 'Rate', 'Commission']
    const body = shown.map(r => [r.name, r.specialization || '', r.isInhouse ? 'Yes' : '', r.basis === 'PATIENT' ? 'Per patient' : 'Per session', r.patients, r.basis === 'PATIENT' ? '' : r.sessions, r.rate != null ? r.rate.toFixed(2) : 'no commission set', r.commission.toFixed(2)])
    const csv = [head, ...body].map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM so Excel reads UTF-8 (₱, —, ñ)
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
      head: [['#', 'Referrer', 'In-house', 'Basis', 'Patients', 'Sessions', 'Rate (P)', 'Commission (P)']],
      body: [
        ...shown.map((r, i) => [i + 1, r.name, r.isInhouse ? 'Yes' : '', r.basis === 'PATIENT' ? 'Per patient' : 'Per session', r.patients, r.basis === 'PATIENT' ? '' : r.sessions, r.rate != null ? r.rate.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—', r.commission.toLocaleString('en-PH', { minimumFractionDigits: 2 })]),
        ['', 'TOTAL — external referrers', '', '', '', '', '', sum(external, 'commission').toLocaleString('en-PH', { minimumFractionDigits: 2 })],
        ...(inhouse.length ? [['', 'TOTAL — in-house doctors', '', '', '', '', '', sum(inhouse, 'commission').toLocaleString('en-PH', { minimumFractionDigits: 2 })]] : []),
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [46, 94, 90] },
    })
    doc.save(`referral-commission_${from}_${to}.pdf`)
  }

  const extCommission = sum(external, 'commission')
  const inCommission = sum(inhouse, 'commission')
  // In-house doctors with referred sessions in range but no rate: payroll's
  // automatic line skips them. Listed so it's never a silent ₱0.
  const inhouseNoRate = rows.filter(r => r.isInhouse && r.rate == null && r.sessions > 0)
  const inhouseRated = rows.filter(r => r.isInhouse && r.rate != null)
  const setInhouseRate = async (rate: number) => {
    const names = inhouseNoRate.map(r => `${r.name} (${r.sessions} session${r.sessions === 1 ? '' : 's'})`).join('\n')
    if (!confirm(`Set ₱${rate.toLocaleString('en-PH')} per session for these in-house doctors?\n\n${names}\n\nTheir next consultant payroll cutoff then adds every unpaid referred session since the scheme started. You can untick anyone on their card in Referrers.`)) return
    setBulkRateBusy(true)
    try {
      for (const r of inhouseNoRate) {
        const res = await fetch('/api/referrers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.referrerId, commissionPerSession: rate, commissionBasis: 'SESSION' }) })
        if (!res.ok) { alert(`Could not set the rate for ${r.name}.`); break }
      }
      await load()
    } finally { setBulkRateBusy(false) }
  }
  const shownCommission = sum(shown, 'commission')

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h2 className="text-lg font-bold" style={{ ...ink, ...display }}>Referral commission — doctors</h2>
        <p className="text-xs mt-0.5 max-w-4xl" style={muted}>
          Each referrer&apos;s own rate — tick &ldquo;Commission&rdquo; on their card in Referrers, choose <b>per session</b> (doctors: ₱ for every session of a referred patient) or <b>per patient</b> (law firms, schools: ₱ once per referred patient, regardless of sessions), then set the amount. Sessions come from the POS Doctor Referral tag, plus untagged orders of patients linked under Referred patients (tag a patient&apos;s first order once and every later session attributes automatically). Click a doctor to see the sessions behind the number.
        </p>
      </div>

      {/* ── Filters ── */}
      <section className="rounded-lg border px-4 py-3 flex flex-wrap items-center gap-2" style={hrCard}>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" className={`${hrInput} px-2 text-xs`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
          <span className="text-xs" style={muted}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To" className={`${hrInput} px-2 text-xs`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
        </div>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          {([['', 'All branches'], ['SANDBOX_EAST', 'East'], ['SANDBOX_GREENHILLS', 'Greenhills']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setBranch(v)} aria-pressed={branch === v} className="h-9 px-3 text-xs font-semibold whitespace-nowrap" style={seg(branch === v)}>{label}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 h-8 px-3 rounded-full border cursor-pointer text-xs font-semibold select-none whitespace-nowrap"
          style={includeInhouse ? { borderColor: '#fcd34d', background: '#fef3c7', color: '#92400e' } : { borderColor: 'var(--light-gray)', background: '#fff', color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={includeInhouse} onChange={() => setIncludeInhouse(v => !v)} className="accent-[#b45309]" />
          Include in-house doctors
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportCsv} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Download size={13} /> CSV</button>
          <button onClick={exportPdf} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Download size={13} /> PDF</button>
        </div>
      </section>

      {!loading && effectiveFrom && effectiveFrom !== from && (
        <p className="text-xs px-3 py-2 rounded-lg border inline-block" style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
          The commission scheme starts {commissionStart ? new Date(`${commissionStart}T00:00:00+08:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : effectiveFrom} — sessions before that never earn, so this report covers {effectiveFrom} → {to}.
        </p>
      )}

      {/* ── Totals ── */}
      <div className={`grid grid-cols-1 gap-3 ${includeInhouse ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <StatCard compact loading={loading} label="Commission — external referrers" value={peso(extCommission)}
          sub={`${unitsText(external)} · ${plural(external.length, 'referrer')}`} tone={extCommission ? 'green' : 'zero'} />
        {includeInhouse && (
          <StatCard compact loading={loading} label="Commission — in-house doctors" value={peso(inCommission)}
            sub={`${unitsText(inhouse)} · ${plural(inhouse.length, 'doctor')} · paid via payroll`}
            accent={{ line: '#d97706', fg: inCommission ? '#b45309' : '#8A9AA0' }} />
        )}
        <StatCard compact loading={loading} label="Total shown" value={peso(shownCommission)}
          sub={`${unitsText(shown)} at per-referrer rates`} accent={{ line: 'var(--teal)', fg: shownCommission ? 'var(--charcoal)' : '#8A9AA0' }} />
      </div>

      {loading ? (
        <section className="rounded-lg border" style={hrCard}><RowsSkeleton rows={5} /></section>
      ) : (
        <>
          {medrep && (
            <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid #d97706' }}>
              <button onClick={() => setMedrepOpen(o => !o)} aria-expanded={medrepOpen} className="w-full px-4 py-3 flex items-center gap-2 flex-wrap text-left">
                <ChevronDown size={14} style={{ color: 'var(--mid-gray)', transform: medrepOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                <span className="text-sm font-bold" style={{ color: '#92400e', ...display }}>Medical representative incentive</span>
                <span className="text-xs" style={muted}>
                  one-time per new patient from an external doctor · {medrep.staffName ? `recipient: ${medrep.staffName} · added to their payslip automatically` : 'no recipient set — pick one below'}
                </span>
                <span className="ml-auto text-sm font-mono font-semibold whitespace-nowrap" style={{ color: '#92400e' }}>
                  {medrep.count} × {peso(medrep.amount)} = {peso(medrep.total)}
                </span>
              </button>
              {medrepOpen && (
                <div className="border-t px-4 py-3 flex flex-wrap items-end gap-3" style={{ borderColor: 'var(--light-gray)', background: '#fffbeb' }}>
                  <div className="w-80 max-w-full">
                    <p className="text-[11px] font-bold uppercase tracking-[.4px] mb-1" style={muted}>Med rep (recipient)</p>
                    <MedrepRecipientPicker staff={incStaff} staffId={incStaffId} staffName={medrep.staffName} disabled={!canMarkPaid || incSaving}
                      onPick={st => saveIncentive({ staffId: st?.id || null, staffName: st?.name || null })} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[.4px] mb-1" style={muted}>Per new patient</p>
                    <div className="relative w-28">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={muted}>₱</span>
                      <input type="number" min={0} step="1" value={incAmount} disabled={!canMarkPaid || incSaving}
                        onChange={e => setIncAmount(e.target.value)}
                        onBlur={() => { const n = Math.max(0, Number(incAmount) || 0); if (n !== medrep.amount) saveIncentive({ amount: n }) }}
                        className="w-full pl-7 pr-2 py-2 rounded-xl border text-sm font-mono bg-white" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </div>
                  {incSaving && <Loader2 size={14} className="animate-spin mb-2.5" style={muted} />}
                  <p className="text-xs flex-1 min-w-[240px] mb-1" style={muted}>
                    {medrep.staffName
                      ? <>Paid automatically: when {medrep.staffName}&apos;s payslip for a cutoff is generated, every new patient not yet paid up to that cutoff is added as a taxable allowance (&ldquo;New-referred-patient incentive&rdquo;). Use <b>Mark paid</b> only for one paid outside payroll.</>
                      : <>No one gets this yet. Pick the med rep and their next generated payslip carries every unpaid new patient since the scheme started.</>}
                  </p>
                </div>
              )}
              {medrepOpen && (
                <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
                  {medrep.patients.length === 0 ? (
                    <p className="text-xs px-4 py-3" style={muted}>No new referred patients in this range.</p>
                  ) : (
                    <table className="w-full text-xs" style={{ minWidth: 560 }}>
                      <tbody>
                        {medrep.patients.map(p => (
                          <tr key={p.patientKey} className="hover:bg-[#fafbf7]">
                            <td className="pl-4 pr-3 py-2 border-b whitespace-nowrap" style={{ ...hrLine, ...muted }}>{new Date(p.firstDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                            <td className="py-2 pr-3 border-b font-semibold" style={{ ...hrLine, ...ink }}>{p.patientName}</td>
                            <td className="py-2 pr-3 border-b" style={{ ...hrLine, ...muted }}>via {p.referrerName}{p.referrerType && p.referrerType !== 'DOCTOR' ? ` (${REFERRER_TYPE_LABEL[p.referrerType] || p.referrerType})` : ''}</td>
                            <td className="py-2 pr-3 border-b" style={{ ...hrLine, ...muted }}>first session #{p.orderNumber} · {branchLabel(p.branch)}</td>
                            <td className="py-2 pr-4 border-b text-right whitespace-nowrap" style={hrLine}>
                              {p.paid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }}
                                  title={p.paid.viaPayroll ? 'Carried on the med rep’s payslip' : 'Marked paid by hand'}>
                                  ✓ Paid · {paidLabel(p.paid)}
                                  {!p.paid.viaPayroll && canMarkPaid && (
                                    <button onClick={() => unmarkPaid(p.patientKey)} disabled={marking === p.patientKey} title="Remove the manual paid mark" className="ml-0.5 hover:opacity-70">
                                      <X size={11} />
                                    </button>
                                  )}
                                </span>
                              ) : canMarkPaid ? (
                                <button onClick={() => markPaid(p)} disabled={marking === p.patientKey}
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border disabled:opacity-50 hover:bg-[#fef3c7]"
                                  style={{ borderColor: '#fcd34d', background: '#fffbeb', color: '#b45309' }}>
                                  {marking === p.patientKey ? '…' : 'Mark paid'}
                                </button>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>Unpaid</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Commission payouts — external referrers get paid by RFP, not payroll. */}
          <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid var(--teal)' }}>
            <button onClick={() => { setRfpResult(null); setRfpOpen(o => !o) }} aria-expanded={rfpOpen} className="w-full px-4 py-3 flex items-center gap-2 flex-wrap text-left">
              <ChevronDown size={14} style={{ color: 'var(--mid-gray)', transform: rfpOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--teal)', ...display }}>Commission payouts — external referrers</span>
              <span className="text-xs min-w-0" style={muted}>
                generate RFPs under Expenses → RFP · expense account: {payoutAccount || `${DEFAULT_COMMISSION_ACCOUNT} (default)`}
              </span>
            </button>
            {rfpOpen && (
              <div className="px-4 sm:px-10 pt-3 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-xs max-w-4xl" style={muted}>
                  Creates one RFP per external referrer — outside doctors, law firms and partner schools with a commission rate ticked — payable to the referrer and booked as an audited expense entry under the account below, covering every commission session (per-session referrers) or newly referred patient (per-patient referrers) not yet paid by payroll or an earlier RFP, from the scheme start through the chosen date. In-house doctors are paid through payroll, never here. Deleting a generated RFP (Expenses → RFP) releases its sessions for the next run.
                </p>
                {canMarkPaid ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap" style={muted}>Expense account</label>
                      <div className="w-96 max-w-full">
                        <AccountPicker accounts={coa} value={payoutAccount || ''} valueKey="numberTitle"
                          onChange={next => saveAccount(next)} clearLabel={`Use default — ${DEFAULT_COMMISSION_ACCOUNT}`} />
                      </div>
                      {acctSaving && <Loader2 size={13} className="animate-spin" style={muted} />}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={rfpBranch} onChange={e => setRfpBranch(e.target.value)} className={hrInput} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                        <option value="SANDBOX_EAST">Paid by: Aura Health East</option>
                        <option value="SANDBOX_GREENHILLS">Paid by: Aura Health Greenhills</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs font-semibold" style={muted}>
                        through
                        <input type="date" value={rfpUpTo} onChange={e => setRfpUpTo(e.target.value)} className={`${hrInput} px-2 text-xs`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
                      </label>
                      <button onClick={generateRfps} disabled={rfpBusy || (rfpPreview !== null && rfpPreview.length === 0)} className={`${hrBtn.primary} disabled:opacity-50`} style={{ background: 'var(--teal)' }}>
                        {rfpBusy && <Loader2 size={13} className="animate-spin" />}
                        {rfpBusy ? 'Generating…' : rfpPreview && rfpPreview.length
                          ? `Generate ${rfpPreview.length} RFP${rfpPreview.length === 1 ? '' : 's'} · ${peso(rfpPreview.reduce((t, p) => t + p.amount, 0))}`
                          : 'Generate commission payment'}
                      </button>
                    </div>
                  </>
                ) : <p className="text-xs" style={muted}>Only Admin, Accountant, Bookkeeper or a branch admin can change the account and generate payouts.</p>}
                {/* What Generate would create now — one RFP per referrer, payable to them, under Expenses → RFP. */}
                {rfpPreview === null ? (
                  <p className="text-xs flex items-center gap-1.5" style={muted}><Loader2 size={12} className="animate-spin" /> Checking unpaid commissions…</p>
                ) : rfpPreview.length === 0 ? (
                  <p className="text-xs" style={muted}>Nothing unpaid for external referrers through {rfpUpTo} — every commission is already on an RFP.</p>
                ) : (
                  <div className="rounded-lg border overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    <table className="w-full text-xs" style={{ minWidth: 480 }}>
                      <thead>
                        <tr style={{ background: 'var(--hr-head, #f6f7f3)' }}>
                          {['To be paid (RFP payable to)', 'Unpaid', 'Rate', 'RFP amount'].map((h, i) => (
                            <th key={h} className={`px-3 py-1.5 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`} style={muted}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rfpPreview.map(p => (
                          <tr key={p.referrerId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-3 py-1.5 font-semibold" style={ink}>{p.referrer}</td>
                            <td className="px-3 py-1.5 text-right" style={ink}>{p.units} {p.basis === 'PATIENT' ? `patient${p.units === 1 ? '' : 's'}` : `session${p.units === 1 ? '' : 's'}`}</td>
                            <td className="px-3 py-1.5 text-right font-mono" style={muted}>{peso(p.rate)}/{p.basis === 'PATIENT' ? 'patient' : 'session'}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>{peso(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {rfpResult && (
                  rfpResult.error ? <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c' }}>{rfpResult.error}</p>
                  : rfpResult.created.length === 0 ? <p className="text-xs" style={muted}>{rfpResult.note || 'Nothing unpaid in that window.'}</p>
                  : (
                    <div className="rounded-lg border p-3 text-xs space-y-1" style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}>
                      <p className="font-bold flex flex-wrap items-center gap-x-2" style={{ color: 'var(--teal)' }}>
                        Created {rfpResult.created.length} RFP{rfpResult.created.length === 1 ? '' : 's'} — pay them under Expenses → RFP ({rfpBranch === 'SANDBOX_GREENHILLS' ? 'Greenhills' : 'East'}):
                        <a href="/expenses?tab=rfp" className="underline font-semibold">Open Expenses → RFP</a>
                      </p>
                      {rfpResult.created.map(c => (
                        <div key={c.refNumber} className="flex justify-between gap-2">
                          <span className="font-mono">{c.refNumber}</span>
                          <span className="truncate flex-1">{c.referrer}</span>
                          <span>{c.sessions} {c.basis === 'PATIENT' ? `patient${c.sessions === 1 ? '' : 's'}` : 'sess.'}</span>
                          <span className="font-mono font-semibold">{peso(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* In-house doctors are paid by consultant payroll automatically — but only at a rate. */}
          {includeInhouse && (inhouseNoRate.length > 0 || inhouseRated.length > 0) && (
            <section className="rounded-lg border px-4 py-3 space-y-2" style={{ borderColor: inhouseNoRate.length ? '#fcd34d' : 'var(--light-gray)', background: inhouseNoRate.length ? '#fffbeb' : '#fff', borderLeft: '4px solid #d97706' }}>
              <p className="text-sm font-bold" style={{ color: '#92400e', ...display }}>In-house doctors — paid through payroll</p>
              <p className="text-xs" style={muted}>
                Each in-house doctor with a rate gets an automatic &ldquo;Referral commission&rdquo; line on their consultant payslip (their own branch) when the cutoff is generated, covering every referred session not yet paid. Saving the payslip marks those sessions paid, so none is paid twice.
              </p>
              {inhouseNoRate.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold flex-1 min-w-[260px]" style={{ color: '#92400e' }}>
                    Not being paid — no rate set: {inhouseNoRate.map(r => `${r.name} (${r.sessions})`).join(' · ')}
                  </p>
                  {canMarkPaid && (
                    <button onClick={() => setInhouseRate(100)} disabled={bulkRateBusy} className={`${hrBtn.primary} disabled:opacity-50`} style={{ background: '#b45309' }}>
                      {bulkRateBusy && <Loader2 size={13} className="animate-spin" />} Set ₱100/session for {inhouseNoRate.length === 1 ? 'this doctor' : `these ${inhouseNoRate.length}`}
                    </button>
                  )}
                </div>
              )}
              {inhouseRated.length > 0 && (
                <p className="text-xs" style={muted}>With a rate: {inhouseRated.map(r => `${r.name} ${peso(r.rate as number)}/session`).join(' · ')}</p>
              )}
            </section>
          )}

          {/* ── Per referrer ── */}
          <section className="rounded-lg border bg-white min-w-0" style={hrCard}>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pt-3.5 pb-3">
              <h3 className="text-[15px] font-bold" style={{ ...ink, ...display }}>
                Commission by referrer <span className="ml-1 text-xs font-semibold" style={{ ...muted, fontFamily: 'var(--font-body)' }}>{shown.length.toLocaleString()}</span>
              </h3>
              <span className="text-xs" style={muted}>Click a referrer for the sessions behind the number</span>
            </div>
            <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-[13px]" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    {['Referrer', 'Patients', 'Sessions', 'Rate', 'Commission'].map((h, i) => (
                      <th key={h} className={`${hrTh} ${i === 0 ? 'text-left' : 'text-right'}`} style={hrThStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-sm" style={muted}>No referred sessions in this range.</td></tr>
                  ) : shown.map(r => {
                    const isOpen = open.has(r.referrerId)
                    return (
                      <Fragment key={r.referrerId}>
                        <tr className="cursor-pointer transition-colors hover:bg-[#fafbf7]" style={{ background: isOpen ? 'var(--hr-head)' : undefined }} onClick={() => toggle(r.referrerId)} aria-expanded={isOpen}>
                          <td className="px-4 py-2.5 border-b" style={{ ...hrLine, boxShadow: `inset 3px 0 0 ${r.isInhouse ? '#d97706' : isOpen ? 'var(--teal)' : 'transparent'}` }}>
                            <span className="inline-flex items-center gap-1.5 font-medium" style={ink}>
                              <ChevronDown size={13} style={{ color: 'var(--mid-gray)', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                              {r.name}
                              {r.isInhouse && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>In-house</span>}
                            </span>
                            {r.specialization && <span className="ml-1.5 text-xs" style={muted}>· {r.specialization}</span>}
                          </td>
                          <td className="px-4 py-2.5 border-b text-right font-mono" style={{ ...hrLine, ...ink }}>{r.patients}</td>
                          <td className="px-4 py-2.5 border-b text-right font-mono" style={{ ...hrLine, ...ink }} title={r.basis === 'PATIENT' ? 'Per-patient referrer: paid once per referred patient, so sessions are not counted' : undefined}>{r.basis === 'PATIENT' ? '—' : r.sessions}</td>
                          <td className="px-4 py-2.5 border-b text-right font-mono text-xs whitespace-nowrap" style={{ ...hrLine, color: r.rate != null ? 'var(--charcoal)' : 'var(--hr-faint)' }}
                            title={r.rate == null ? 'No commission set — tick "Commission" on this doctor\'s card in Referrers to pay them per session' : undefined}>
                            {r.rate != null ? `${peso(r.rate)}${r.basis === 'PATIENT' ? '/patient' : '/session'}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 border-b text-right font-mono font-semibold whitespace-nowrap" style={{ ...hrLine, color: r.rate != null ? (r.commission ? 'var(--teal)' : 'var(--charcoal)') : 'var(--hr-faint)' }}>
                            {r.rate != null ? peso(r.commission) : '—'}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={5} className="px-4 sm:px-10 py-2 border-b" style={{ ...hrLine, background: 'var(--hr-head)', boxShadow: `inset 3px 0 0 ${r.isInhouse ? '#d97706' : 'var(--teal)'}` }}>
                              {r.basis === 'PATIENT' && <div className="pb-1 text-[11px]" style={muted}>Per-patient: each row is the patient&apos;s qualifying first session — paid once, however many sessions follow.</div>}
                              <table className="w-full text-xs">
                                <tbody>
                                  {r.orders.map(s => (
                                    <tr key={s.id}>
                                      <td className="py-1 pr-3 whitespace-nowrap" style={muted}>{new Date(s.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                      <td className="py-1 pr-3 font-semibold font-mono" style={ink}>#{s.orderNumber}</td>
                                      <td className="py-1 pr-3" style={ink}>{s.patientName || '—'}
                                        {s.paymentStatus === 'UNPAID' && <span className="ml-1 px-1.5 py-px rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>unpaid</span>}
                                      </td>
                                      <td className="py-1 pr-3" style={muted}>{branchLabel(s.branch)}</td>
                                      <td className="py-1 pr-3" style={muted} title={s.via === 'tag' ? 'The order named this doctor at POS' : 'Attributed through the Referred-patients link (order not tagged)'}>
                                        {s.via === 'tag' ? 'POS tag' : 'patient link'}
                                      </td>
                                      <td className="py-1 text-right font-mono" style={muted}>{peso(s.net)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-bold" style={{ ...ink, ...display }}>Sessions — {rp.patientName}</h3>
            <p className="text-xs mt-0.5" style={muted}>Recorded sessions with us (from POS Orders) · referred by {rp.referrerName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg hover:bg-[var(--pale-teal)] shrink-0"><X size={18} style={muted} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col min-h-0 flex-1">
        {loading ? (
          <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="h-8 rounded-md hr-shimmer" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No recorded sessions found for this patient.</div>
        ) : (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr>
                  {['Date', 'Service', 'Department', 'Branch', 'Net amount'].map((h, i) => <th key={h} className={`px-3 py-2 border-b text-[10.5px] font-bold uppercase tracking-[.5px] whitespace-nowrap ${i === 4 ? 'text-right' : 'text-left'}`} style={hrThStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 border-b whitespace-nowrap" style={{ ...hrLine, ...muted }}>{new Date(s.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-3 py-2 border-b" style={{ ...hrLine, ...ink }}>{s.services}{s.paymentStatus === 'UNPAID' ? <span className="ml-1 px-1.5 py-px rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>unpaid</span> : null}</td>
                    <td className="px-3 py-2 border-b" style={{ ...hrLine, ...muted }}>{s.departments && s.departments.length ? s.departments.map(departmentLabel).join(', ') : '—'}</td>
                    <td className="px-3 py-2 border-b" style={{ ...hrLine, ...muted }}>{branchLabel(s.branch)}</td>
                    <td className="px-3 py-2 border-b text-right font-mono whitespace-nowrap" style={{ ...hrLine, ...ink }}>{peso(s.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && sessions.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <span style={muted}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
            <span className="font-semibold" style={{ color: 'var(--teal)' }}>Total net: <span className="font-mono">{peso(total)}</span></span>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
