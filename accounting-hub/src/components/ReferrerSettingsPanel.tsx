'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Plus, Search, Pencil, Trash2, ArrowDownAZ, ArrowUpAZ, Stethoscope, Scale, GraduationCap, HandCoins, Gift,
  Download, Upload, FileText, FileSpreadsheet, Users, Home, ListOrdered,
} from 'lucide-react'
import { branchLabel } from '@/lib/branch'
import {
  AlertBanner, EmptyState, LoadingNote, Modal, Tile, btnPrimary, btnSecondary, btnSecondaryStyle, card, display, ink,
  inputCls, inputStyle, labelCls, muted, pulse, pulseTone,
} from '@/components/ReferralUi'

export const REFERRER_TYPE_LABEL: Record<string, string> = { DOCTOR: 'Doctor', LAW_FIRM: 'Law Firm', PARTNER_SCHOOL: 'Partner School' }
const REFERRER_TYPES = ['DOCTOR', 'LAW_FIRM', 'PARTNER_SCHOOL'] as const
const BRANCH_VALUES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'AURA_INSTITUTE']

interface Ref { id: string; name: string; type?: string | null; affiliation?: string | null; specialization?: string | null; branches?: string[]; isInhouse?: boolean; commissionPerSession?: string | number | null; commissionBasis?: string | null; referralCount?: number }
// Prisma Decimal arrives as a string; null/undefined = no commission.
const commissionOf = (r: Ref): number | null => r.commissionPerSession == null ? null : Number(r.commissionPerSession)
// How the ₱ rate is counted: per session of each referred patient (doctors), or
// once per referred patient regardless of sessions (law firms, schools).
// In-house doctors are always per session — payroll pays them.
type Basis = 'SESSION' | 'PATIENT'
const basisOf = (r: Ref): Basis => !r.isInhouse && r.commissionBasis === 'PATIENT' ? 'PATIENT' : 'SESSION'
const defaultBasisFor = (type?: string | null): Basis => type === 'DOCTOR' || !type ? 'SESSION' : 'PATIENT'

const typeBadgeStyle = (t?: string | null): React.CSSProperties => {
  if (t === 'LAW_FIRM') return { background: '#fef3c7', color: '#92400e' }
  if (t === 'PARTNER_SCHOOL') return { background: '#ede9fe', color: '#6d28d9' }
  return { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
}
const TypeIcon = ({ t, size = 16 }: { t?: string | null; size?: number }) =>
  t === 'LAW_FIRM' ? <Scale size={size} /> : t === 'PARTNER_SCHOOL' ? <GraduationCap size={size} /> : <Stethoscope size={size} />

const initials = (name: string) => name.replace(/^(dr|dra|atty)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

// Pill-shaped selectable option used across the edit form (radio / checkbox inside).
function OptionPill({ on, tone = 'teal', title, className = '', children }: { on: boolean; tone?: 'teal' | 'amber'; title?: string; className?: string; children: ReactNode }) {
  const onStyle = tone === 'amber'
    ? { borderColor: '#fcd34d', background: '#fef3c7', color: '#92400e' }
    : { borderColor: 'var(--bright-teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
  return (
    <label title={title} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors ${className}`}
      style={on ? onStyle : { borderColor: 'var(--light-gray)', color: 'var(--charcoal)', background: '#fff' }}>
      {children}
    </label>
  )
}

function FormSection({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-bold uppercase tracking-wider" style={muted}>{title}</h4>
      {children}
      {hint && <p className="text-[11px] leading-relaxed" style={muted}>{hint}</p>}
    </section>
  )
}

// One type bucket — its own search box, A→Z / Z→A sort, and scrollable list.
function ReferrerCard({ title, type, referrers, onEdit, onDelete, onOpenOrders, onToggleInhouse, onSetCommission }: {
  title: string; type: string; referrers: Ref[]
  onEdit: (r: Ref) => void; onDelete: (id: string) => void; onOpenOrders: (r: { id: string; name: string }) => void
  // Doctors only: tick straight on the card to tag a doctor as in-house.
  onToggleInhouse?: (r: Ref) => void
  // Any referrer type: tick who earns the per-session commission and set each one's ₱ rate.
  onSetCommission?: (r: Ref, value: number | null, basis?: Basis) => void
}) {
  const [search, setSearch] = useState('')
  const [asc, setAsc] = useState(true)
  const all = referrers.filter(r => r.type === type)
  const rows = all
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.affiliation?.toLowerCase().includes(search.toLowerCase()) || r.specialization?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
  const earning = all.filter(r => commissionOf(r) != null).length

  return (
    <section id={`referrers-${type}`} className="rounded-2xl border flex flex-col min-w-0 scroll-mt-4" style={card}>
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-x-4 gap-y-2.5" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={typeBadgeStyle(type)}><TypeIcon t={type} /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ ...ink, ...display }}>
              {title}
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums" style={typeBadgeStyle(type)}>{all.length}</span>
            </h3>
            <p className="text-[11px]" style={muted}>
              {earning} earn{earning === 1 ? 's' : ''} commission{search && <> · {rows.length} match{rows.length === 1 ? '' : 'es'}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={muted} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}...`} aria-label={`Search ${title.toLowerCase()}`}
              className="w-full sm:w-60 pl-8 pr-3 py-1.5 rounded-xl border text-sm outline-none bg-white focus:border-[var(--bright-teal)]" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <button onClick={() => setAsc(a => !a)} title={asc ? 'Sorted A→Z' : 'Sorted Z→A'} aria-label={asc ? 'Sorted A to Z' : 'Sorted Z to A'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold bg-white hover:bg-[var(--off-white)] shrink-0" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
            {asc ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}<span className="hidden sm:inline">{asc ? 'A–Z' : 'Z–A'}</span>
          </button>
        </div>
      </div>
      <div className="overflow-y-auto max-h-[60vh]">
        {rows.length === 0 ? (
          <div className="py-10 px-4 text-center text-sm" style={muted}>
            {search ? <>No {title.toLowerCase()} match &ldquo;{search}&rdquo;. <button onClick={() => setSearch('')} className="underline" style={{ color: 'var(--teal)' }}>Clear search</button></>
              : <>No {title.toLowerCase()} yet. Use <b>Add referrer</b> to add one.</>}
          </div>
        ) : rows.map((r, i) => (
          <div key={r.id} className={`px-4 py-3 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4 transition-colors hover:bg-[#fbf9f5] ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5" style={typeBadgeStyle(type)} aria-hidden>{initials(r.name)}</span>
              <div className="min-w-0">
                <div className="font-semibold text-sm break-words" style={ink}>{r.name}</div>
                {(r.affiliation || r.specialization) && (
                  <div className="text-xs break-words" style={muted}>{[r.affiliation, r.specialization].filter(Boolean).join(' · ')}</div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {(r.branches && r.branches.length > 0)
                    ? r.branches.map(b => <span key={b} className="px-2 py-0.5 rounded-full text-[11px] font-medium border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)', color: 'var(--charcoal)' }}>{branchLabel(b)}</span>)
                    : <span className="px-2 py-0.5 rounded-full text-[11px] border border-dashed" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>All branches</span>}
                  {(r.referralCount ?? 0) > 0 && (
                    <button onClick={() => onOpenOrders(r)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold hover:underline" style={{ background: '#eef2f6', color: 'var(--deep-teal)' }} title="View referred orders">
                      <ListOrdered size={11} /> {r.referralCount} referral{r.referralCount === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end pl-11 md:pl-0 shrink-0">
              {onToggleInhouse && (
                <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-semibold cursor-pointer select-none border transition-colors"
                  title="Tick when this doctor is one of ours — in-house doctors are set apart from outside referrers in the referral commission."
                  style={r.isInhouse ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } : { background: '#fff', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
                  <input type="checkbox" checked={!!r.isInhouse} onChange={() => onToggleInhouse(r)} className="w-3.5 h-3.5 accent-[#b45309]" />
                  <Home size={12} /> In-house
                </label>
              )}
              {onSetCommission && (() => {
                const rate = commissionOf(r)
                return (
                  <span className="inline-flex items-center h-8 rounded-xl text-xs font-semibold select-none border overflow-hidden transition-colors"
                    title="Tick when this referrer earns a commission, choose whether it is per session or per referred patient, then set the ₱ rate."
                    style={rate != null ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)', borderColor: 'var(--bright-teal)' } : { background: '#fff', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
                    <label className="inline-flex items-center gap-1.5 h-full px-2.5 cursor-pointer">
                      <input type="checkbox" checked={rate != null} onChange={() => onSetCommission(r, rate != null ? null : 100, rate != null ? undefined : defaultBasisFor(r.type))} className="w-3.5 h-3.5 accent-[var(--teal)]" />
                      <HandCoins size={12} /> Commission
                    </label>
                    {rate != null && (
                      <>
                        <span className="w-px self-stretch" style={{ background: 'var(--bright-teal)', opacity: 0.35 }} />
                        {r.isInhouse ? <span className="px-2.5" title="In-house doctors are paid per session through payroll">Per session</span> : (
                          <select value={basisOf(r)} onClick={e => e.stopPropagation()}
                            onChange={e => onSetCommission(r, rate, e.target.value as Basis)}
                            title="Per session = ₱ for every session of each referred patient. Per patient = ₱ once for each referred patient, regardless of sessions."
                            aria-label={`Commission basis for ${r.name}`}
                            className="h-full pl-2 pr-1 text-xs font-semibold outline-none bg-transparent cursor-pointer" style={{ color: 'var(--deep-teal)' }}>
                            <option value="SESSION">Per session</option>
                            <option value="PATIENT">Per patient</option>
                          </select>
                        )}
                        <span className="w-px self-stretch" style={{ background: 'var(--bright-teal)', opacity: 0.35 }} />
                        <span className="inline-flex items-center gap-0.5 h-full pl-2 pr-1.5">
                          ₱<input key={rate} type="number" min={0} step="1" defaultValue={rate}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            onBlur={e => { const n = Number(e.target.value); if (!isNaN(n) && n >= 0 && n !== rate) onSetCommission(r, n); else e.target.value = String(rate) }}
                            aria-label={`Commission rate for ${r.name}`}
                            className="w-14 px-1.5 py-0.5 rounded-lg border text-xs font-mono outline-none bg-white focus:border-[var(--bright-teal)]" style={{ borderColor: 'var(--light-gray)', color: 'var(--deep-teal)' }} />
                        </span>
                      </>
                    )}
                  </span>
                )
              })()}
              <div className="flex items-center gap-0.5">
                <button onClick={() => onEdit(r)} title="Edit" aria-label={`Edit ${r.name}`} className="p-2 rounded-lg hover:bg-[var(--off-white)]"><Pencil size={14} style={{ color: 'var(--teal)' }} /></button>
                <button onClick={() => onDelete(r.id)} title="Remove" aria-label={`Remove ${r.name}`} className="p-2 rounded-lg hover:bg-red-50"><Trash2 size={14} className="text-red-400" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ReferrersLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <div key={i} className={`${pulse} h-[88px]`} style={pulseTone} />)}
      </div>
      {[0, 1].map(i => (
        <div key={i} className="rounded-2xl border overflow-hidden" style={card}>
          <div className="h-14 border-b animate-pulse motion-reduce:animate-none" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }} />
          {[0, 1, 2].map(j => (
            <div key={j} className="px-4 py-3 flex items-center gap-3 border-t first:border-t-0" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="w-8 h-8 rounded-full animate-pulse motion-reduce:animate-none" style={{ background: 'var(--off-white)' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 rounded animate-pulse motion-reduce:animate-none" style={{ background: 'var(--off-white)' }} />
                <div className="h-2.5 w-1/4 rounded animate-pulse motion-reduce:animate-none" style={{ background: 'var(--off-white)' }} />
              </div>
              <div className="h-8 w-32 rounded-xl animate-pulse motion-reduce:animate-none hidden md:block" style={{ background: 'var(--off-white)' }} />
            </div>
          ))}
        </div>
      ))}
      <LoadingNote>Loading referrers…</LoadingNote>
    </div>
  )
}

export default function ReferrerSettingsPanel() {
  const [referrers, setReferrers] = useState<Ref[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; type: string; affiliation: string; specialization: string; branches: string[]; isInhouse: boolean; commissionOn: boolean; commissionBasis: Basis; commissionRate: string }>({ name: '', type: 'DOCTOR', affiliation: '', specialization: '', branches: [], isInhouse: false, commissionOn: false, commissionBasis: 'SESSION', commissionRate: '100' })
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  // One-time new-referred-patient incentive (the med rep's ₱50): recipient +
  // amount live in a singleton settings row, edited from this tab.
  const [showIncentive, setShowIncentive] = useState(false)
  const [incLoading, setIncLoading] = useState(false)
  const [incSaving, setIncSaving] = useState(false)
  const [incStaff, setIncStaff] = useState<{ id: string; name: string; jobTitle: string }[]>([])
  const [incForm, setIncForm] = useState<{ staffId: string; staffName: string; amount: string }>({ staffId: '', staffName: '', amount: '50' })
  const openIncentive = async () => {
    setShowIncentive(true); setIncLoading(true)
    try {
      const r = await fetch('/api/referrers/incentive-settings')
      if (r.ok) {
        const d = await r.json()
        setIncStaff(d.staff || [])
        setIncForm({ staffId: d.staffId || '', staffName: d.staffName || '', amount: String(d.amount ?? 50) })
      }
    } catch { /* modal still opens; dropdown just stays empty */ }
    finally { setIncLoading(false) }
  }
  const saveIncentive = async () => {
    setIncSaving(true)
    try {
      const r = await fetch('/api/referrers/incentive-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: incForm.staffId || null, staffName: incForm.staffName || null, amount: Number(incForm.amount) || 0 }),
      })
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Failed to save incentive settings'); return }
      setShowIncentive(false)
    } finally { setIncSaving(false) }
  }

  const [ordersFor, setOrdersFor] = useState<{ id: string; name: string } | null>(null)
  const [orders, setOrders] = useState<{ id: string; orderNumber: number; date: string; patientName?: string | null; amount: number; branch: string }[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const openOrders = async (r: { id: string; name: string }) => {
    setOrdersFor(r); setOrders([]); setOrdersLoading(true)
    try { const res = await fetch(`/api/referrers/orders?id=${r.id}`); setOrders(res.ok ? await res.json() : []) }
    catch { setOrders([]) }
    finally { setOrdersLoading(false) }
  }

  // Display-only flag so a failed list load shows a banner instead of a silently empty page.
  const [loadError, setLoadError] = useState(false)
  const fetchReferrers = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const r = await fetch('/api/referrers?all=true')
      if (!r.ok) setLoadError(true)
      const d = await r.json()
      setReferrers(Array.isArray(d) ? d : d.data || [])
    } catch { setReferrers([]); setLoadError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReferrers() }, [fetchReferrers])

  // HR Hub doctors (department MD) get their in-house Referrer row created
  // automatically — fired on every visit (idempotent server-side), so nobody
  // has to add our own doctors by hand. Refreshes the lists when it changed
  // anything; failures stay silent (the HR feed being down shouldn't nag).
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/referrers/sync-inhouse', { method: 'POST' })
        if (!r.ok) return
        const d = await r.json()
        if ((d.created || 0) + (d.tagged || 0) > 0) fetchReferrers()
      } catch { /* ignore */ }
    })()
  }, [fetchReferrers])

  const openCreate = () => { setEditingId(null); setForm({ name: '', type: 'DOCTOR', affiliation: '', specialization: '', branches: [], isInhouse: false, commissionOn: false, commissionBasis: 'SESSION', commissionRate: '100' }); setError(''); setShowForm(true) }
  const openEdit = (r: Ref) => { const rate = commissionOf(r); setEditingId(r.id); setForm({ name: r.name, type: r.type || 'DOCTOR', affiliation: r.affiliation || '', specialization: r.specialization || '', branches: r.branches || [], isInhouse: !!r.isInhouse, commissionOn: rate != null, commissionBasis: basisOf(r), commissionRate: rate != null ? String(rate) : '100' }); setError(''); setShowForm(true) }
  const toggleBranch = (b: string) => setForm(f => ({ ...f, branches: f.branches.includes(b) ? f.branches.filter(x => x !== b) : [...f.branches, b] }))

  // PUT a referrer change. Switching the commission basis of a referrer that
  // already has paid/claimed commission asks for confirmation first (409).
  const putReferrer = async (body: Record<string, unknown>): Promise<boolean> => {
    let res = await fetch('/api/referrers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.status === 409) {
      const d = await res.json().catch(() => ({}))
      if (!d.needsConfirm || !window.confirm(d.error)) return false
      res = await fetch('/api/referrers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, confirmBasisSwitch: true }) })
    }
    return res.ok
  }

  // Set/clear a referrer's commission rate (and optionally its basis) from the
  // card — optimistic, reverted on failure. null = no commission.
  const setCommission = async (r: Ref, value: number | null, basis?: Basis) => {
    const prev = { rate: r.commissionPerSession ?? null, basis: r.commissionBasis }
    setReferrers(p => p.map(x => x.id === r.id ? { ...x, commissionPerSession: value, ...(basis ? { commissionBasis: basis } : {}) } : x))
    try {
      const ok = await putReferrer({ id: r.id, commissionPerSession: value, ...(basis ? { commissionBasis: basis } : {}) })
      if (!ok) throw new Error()
    } catch {
      setReferrers(p => p.map(x => x.id === r.id ? { ...x, commissionPerSession: prev.rate, commissionBasis: prev.basis } : x))
      setError(`Could not update the commission for ${r.name}.`)
    }
  }

  // Tag a doctor as in-house straight from the card — optimistic, reverted on failure.
  const toggleInhouse = async (r: Ref) => {
    const nv = !r.isInhouse
    setReferrers(prev => prev.map(x => x.id === r.id ? { ...x, isInhouse: nv } : x))
    try {
      const res = await fetch('/api/referrers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, isInhouse: nv }) })
      if (!res.ok) throw new Error()
    } catch {
      setReferrers(prev => prev.map(x => x.id === r.id ? { ...x, isInhouse: !nv } : x))
      setError(`Could not update the in-house tag for ${r.name}.`)
    }
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (saving) return
    setError('')
    setSaving(true)
    try {
      // Affiliation/Specialization apply to doctors only; clear them for schools/law firms.
      // Commission applies to every referrer type (doctors, law firms, schools).
      const isDoctor = form.type === 'DOCTOR'
      const body = { id: editingId, name: form.name.trim(), type: form.type, affiliation: isDoctor ? (form.affiliation.trim() || null) : null, specialization: isDoctor ? (form.specialization.trim() || null) : null, branches: form.branches, isInhouse: isDoctor && form.isInhouse, commissionPerSession: form.commissionOn && !isNaN(Number(form.commissionRate)) ? Math.max(0, Number(form.commissionRate)) : null, commissionBasis: isDoctor && form.isInhouse ? 'SESSION' : form.commissionBasis }
      let res = await fetch('/api/referrers', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.status === 409 && editingId) {
        const d = await res.json().catch(() => ({}))
        if (d.needsConfirm) {
          if (!window.confirm(d.error)) return
          res = await fetch('/api/referrers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, confirmBasisSwitch: true }) })
        } else { setError(d.error || 'Failed to save'); return }
      }
      if (res.ok) { setShowForm(false); fetchReferrers() }
      else { const d = await res.json().catch(() => ({})); setError(d.error || 'Failed to save') }
    } finally { setSaving(false) }
  }

  const deleteReferrer = async (id: string) => {
    if (!window.confirm('Remove this referrer?')) return
    await fetch(`/api/referrers?id=${id}`, { method: 'DELETE' })
    fetchReferrers()
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase()
      const hasHeader = header.includes('name') || header.includes('affiliation')
      const dataLines = hasHeader ? lines.slice(1) : lines
      let created = 0
      for (const line of dataLines) {
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
        if (!cols[0]) continue
        const t = cols[3] || ''
        const type = /school/i.test(t) ? 'PARTNER_SCHOOL' : /law/i.test(t) ? 'LAW_FIRM' : 'DOCTOR'
        const res = await fetch('/api/referrers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cols[0], type, affiliation: cols[1] || null, specialization: cols[2] || null }),
        })
        if (res.ok) created++
      }
      alert(`Uploaded ${created} referrer(s).`)
      fetchReferrers()
    } catch { setError('Failed to parse CSV') }
    finally { setUploading(false); e.target.value = '' }
  }

  const downloadCsv = () => {
    const rows = [['Name', 'Type', 'Affiliation', 'Specialization', 'In-house', 'Commission rate', 'Commission basis'], ...referrers.map(r => [r.name, REFERRER_TYPE_LABEL[r.type || 'DOCTOR'] || 'Doctor', r.affiliation || '', r.specialization || '', r.isInhouse ? 'Yes' : '', commissionOf(r) != null ? String(commissionOf(r)) : '', commissionOf(r) != null ? (basisOf(r) === 'PATIENT' ? 'Per patient' : 'Per session') : ''])]
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'referrers.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(14); doc.text('Referrers', 14, 16)
    doc.setFontSize(8); doc.setTextColor(120); doc.text(`Generated ${new Date().toLocaleDateString('en-PH')}`, 14, 22); doc.setTextColor(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc as any, {
      startY: 28,
      head: [['#', 'Name', 'Type', 'Affiliation', 'Specialization', 'In-house', 'Commission']],
      body: referrers.map((r, i) => [i + 1, r.name, REFERRER_TYPE_LABEL[r.type || 'DOCTOR'] || 'Doctor', r.affiliation || '', r.specialization || '', r.isInhouse ? 'Yes' : '', commissionOf(r) != null ? `P${commissionOf(r)}${basisOf(r) === 'PATIENT' ? '/patient' : '/session'}` : '']),
      styles: { fontSize: 8 }, headStyles: { fillColor: [46, 94, 90] },
    })
    doc.save('referrers.pdf')
  }

  const downloadTemplate = () => {
    const csv = 'Name,Affiliation,Specialization,Type\nDr. Juan Dela Cruz,Manila Medical Center,Orthopedics,Doctor\nCruz & Associates Law Firm,Makati,,Law Firm\nSt. Marys School,Quezon City,,Partner School\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'referrer_template.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  // Summary figures — read straight off the list already loaded above.
  const typeCount = (t: string) => referrers.filter(r => r.type === t).length
  const earningCount = referrers.filter(r => commissionOf(r) != null).length
  const perPatientCount = referrers.filter(r => commissionOf(r) != null && basisOf(r) === 'PATIENT').length
  const inhouseCount = referrers.filter(r => r.type === 'DOCTOR' && r.isInhouse).length
  const referralTotal = referrers.reduce((s, r) => s + (r.referralCount ?? 0), 0)
  const GROUPS: [string, string][] = [['DOCTOR', 'Doctors'], ['LAW_FIRM', 'Law Firms'], ['PARTNER_SCHOOL', 'Partner Schools']]
  const groupBtn = 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white transition-colors hover:bg-[var(--off-white)]'
  const isInhouseDoctor = form.type === 'DOCTOR' && form.isInhouse

  return (
    <div className="space-y-4">
      {/* ── Title + actions ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold" style={{ ...ink, ...display }}>Referrers</h2>
          <p className="text-xs mt-0.5 max-w-2xl" style={muted}>
            Doctors, law firms and partner schools who send us patients. Tick who earns a commission and set the rate on each row; each list has its own search and A→Z / Z→A sort.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border divide-x" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Export">
            <button onClick={downloadCsv} className={groupBtn} style={{ color: 'var(--teal)', borderColor: 'var(--light-gray)' }} title="Download the referrer list as CSV"><FileSpreadsheet size={14} /> CSV</button>
            <button onClick={downloadPdf} className={groupBtn} style={{ color: 'var(--teal)', borderColor: 'var(--light-gray)' }} title="Download the referrer list as PDF"><FileText size={14} /> PDF</button>
          </div>
          <div className="flex rounded-xl overflow-hidden border divide-x" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Import">
            <button onClick={downloadTemplate} className={groupBtn} style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }} title="Download a blank CSV template"><Download size={14} /> Template</button>
            <label className={`${groupBtn} cursor-pointer`} style={{ color: uploading ? 'var(--mid-gray)' : 'var(--deep-teal)', borderColor: 'var(--light-gray)' }} title="Add referrers from a CSV file">
              <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload CSV'}
              <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
          <button onClick={openIncentive} title="Who receives the one-time new-referred-patient incentive, and how much"
            className={btnSecondary} style={btnSecondaryStyle}>
            <Gift size={14} style={{ color: 'var(--gold-light)' }} /> Incentive settings
          </button>
          <button onClick={openCreate} className={btnPrimary} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> Add referrer
          </button>
        </div>
      </div>

      {error && <AlertBanner onDismiss={() => setError('')}>{error}</AlertBanner>}
      {loadError && !loading && <AlertBanner onRetry={fetchReferrers}>Couldn&apos;t load the referrer list. The lists below may be empty or out of date.</AlertBanner>}

      {loading ? (
        <ReferrersLoading />
      ) : referrers.length === 0 ? (
        loadError ? null : (
          <EmptyState icon={<Users size={32} />} title="No referrers yet"
            action={<>
              <button onClick={openCreate} className={btnPrimary} style={{ background: 'var(--teal)' }}><Plus size={15} /> Add referrer</button>
              <button onClick={downloadTemplate} className={btnSecondary} style={btnSecondaryStyle}><Download size={14} /> CSV template</button>
            </>}>
            Add the doctors, law firms and partner schools who refer patients, one at a time or from a CSV. In-house doctors from the HR Hub are added automatically.
          </EmptyState>
        )
      ) : (
        <>
          {/* ── At a glance ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile icon={<Users size={13} />} label="Referrers" value={referrers.length.toLocaleString()}
              note={`${typeCount('DOCTOR')} doctor${typeCount('DOCTOR') === 1 ? '' : 's'} · ${typeCount('LAW_FIRM')} law firm${typeCount('LAW_FIRM') === 1 ? '' : 's'} · ${typeCount('PARTNER_SCHOOL')} school${typeCount('PARTNER_SCHOOL') === 1 ? '' : 's'}`} />
            <Tile icon={<HandCoins size={13} />} label="Earn commission" strong
              value={<>{earningCount.toLocaleString()} <span className="text-sm font-semibold" style={muted}>of {referrers.length.toLocaleString()}</span></>}
              note={`${earningCount - perPatientCount} per session · ${perPatientCount} per patient`} />
            <Tile icon={<Home size={13} />} label="In-house doctors" value={inhouseCount.toLocaleString()} note="paid per session through payroll" />
            <Tile icon={<ListOrdered size={13} />} label="Referrals logged" value={referralTotal.toLocaleString()} note="orders that named a referrer" />
          </div>

          {/* ── Jump to a list ── */}
          <nav className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Referrer lists">
            <span style={muted}>Jump to</span>
            {GROUPS.map(([t, label]) => (
              <a key={t} href={`#referrers-${t}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-white font-medium transition-colors hover:border-[var(--bright-teal)]" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <span style={{ color: typeBadgeStyle(t).color }}><TypeIcon t={t} size={12} /></span>{label}
                <span className="tabular-nums" style={{ opacity: 0.55 }}>{typeCount(t)}</span>
              </a>
            ))}
          </nav>

          {/* ── One list per referrer type ── */}
          <div className="space-y-4">
            <ReferrerCard title="Doctors" type="DOCTOR" referrers={referrers} onEdit={openEdit} onDelete={deleteReferrer} onOpenOrders={openOrders} onToggleInhouse={toggleInhouse} onSetCommission={setCommission} />
            <ReferrerCard title="Law Firms" type="LAW_FIRM" referrers={referrers} onEdit={openEdit} onDelete={deleteReferrer} onOpenOrders={openOrders} onSetCommission={setCommission} />
            <ReferrerCard title="Partner Schools" type="PARTNER_SCHOOL" referrers={referrers} onEdit={openEdit} onDelete={deleteReferrer} onOpenOrders={openOrders} onSetCommission={setCommission} />
          </div>
        </>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <Modal title={editingId ? 'Edit referrer' : 'Add referrer'} subtitle="Who they are, whether they earn a commission, and which branches see them."
          onClose={() => setShowForm(false)}
          footer={<>
            <button onClick={() => setShowForm(false)} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
            <button onClick={save} disabled={saving} className={btnPrimary} style={{ background: 'var(--teal)' }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
          </>}>
          <div className="space-y-5">
            {error && <AlertBanner>{error}</AlertBanner>}

            <FormSection title="Details">
              <div>
                <label className={labelCls} style={muted} htmlFor="referrer-name">Name <span className="text-red-500">*</span></label>
                <input id="referrer-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className={inputCls} style={inputStyle} placeholder="e.g. Dr. Juan Dela Cruz" />
              </div>
              <div>
                <span className={labelCls} style={muted}>Classification</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {REFERRER_TYPES.map(t => (
                    <OptionPill key={t} on={form.type === t}>
                      <input type="radio" name="referrerType" checked={form.type === t} onChange={() => setForm(f => ({ ...f, type: t, commissionBasis: f.commissionOn || (editingId && f.type === t) ? f.commissionBasis : defaultBasisFor(t) }))} className="accent-[var(--teal)]" />
                      <span style={{ color: form.type === t ? 'var(--deep-teal)' : typeBadgeStyle(t).color }}><TypeIcon t={t} size={14} /></span>
                      {REFERRER_TYPE_LABEL[t]}
                    </OptionPill>
                  ))}
                </div>
              </div>
              {form.type === 'DOCTOR' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={muted} htmlFor="referrer-affiliation">Affiliation</label>
                      <input id="referrer-affiliation" value={form.affiliation} onChange={e => setForm({ ...form, affiliation: e.target.value })}
                        className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                      <label className={labelCls} style={muted} htmlFor="referrer-specialization">Specialization</label>
                      <input id="referrer-specialization" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })}
                        className={inputCls} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <OptionPill on={form.isInhouse} tone="amber">
                      <input type="checkbox" checked={form.isInhouse} onChange={() => setForm(f => ({ ...f, isInhouse: !f.isInhouse }))} className="accent-[#b45309]" />
                      <Home size={14} /> In-house doctor
                    </OptionPill>
                    <p className="text-[11px] mt-1.5" style={muted}>Tick when this doctor is one of ours — sets them apart from outside referrers in the referral commission.</p>
                  </div>
                </>
              )}
            </FormSection>

            <FormSection title="Commission"
              hint={form.commissionOn && form.commissionBasis === 'PATIENT' && !isInhouseDoctor
                ? 'Paid once for each new patient they referred (their first session from 1 Oct 2026), no matter how many sessions follow. Patients who already had a session before then do not count.'
                : 'Paid per session of each patient this referrer referred. Untick = no commission for this referrer.'}>
              <OptionPill on={form.commissionOn}>
                <input type="checkbox" checked={form.commissionOn} onChange={() => setForm(f => ({ ...f, commissionOn: !f.commissionOn }))} className="accent-[var(--teal)]" />
                <HandCoins size={14} /> Earns referral commission
              </OptionPill>
              {form.commissionOn && (
                <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)', background: '#fbf9f5' }}>
                  {isInhouseDoctor ? (
                    <p className="text-xs" style={muted}>In-house doctors are paid <b>per session</b> through payroll.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([['SESSION', 'Per session', 'Paid for every session of each patient they referred'], ['PATIENT', 'Per patient', 'Paid once per patient they referred, regardless of sessions']] as const).map(([v, label, hint]) => (
                        <OptionPill key={v} on={form.commissionBasis === v} title={hint}>
                          <input type="radio" name="commissionBasis" checked={form.commissionBasis === v} onChange={() => setForm(f => ({ ...f, commissionBasis: v }))} className="accent-[var(--teal)]" />
                          <span className="min-w-0">
                            <span className="block font-medium">{label}</span>
                            <span className="block text-[11px]" style={muted}>{hint}</span>
                          </span>
                        </OptionPill>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className={labelCls} style={muted} htmlFor="referrer-rate">Rate</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative w-36">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={muted}>₱</span>
                        <input id="referrer-rate" type="number" min={0} step="1" value={form.commissionRate}
                          onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
                          className={`${inputCls} pl-7 font-mono`} style={inputStyle} />
                      </div>
                      <span className="text-sm" style={muted}>{form.commissionBasis === 'PATIENT' && !isInhouseDoctor ? 'per referred patient' : 'per session'}</span>
                    </div>
                  </div>
                </div>
              )}
            </FormSection>

            <FormSection title="Visible to branch"
              hint={<>Leave all unticked = visible at all branches. Tick a branch so only that branch&apos;s front desk sees this referrer.</>}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {BRANCH_VALUES.map(val => (
                  <OptionPill key={val} on={form.branches.includes(val)}>
                    <input type="checkbox" checked={form.branches.includes(val)} onChange={() => toggleBranch(val)} className="accent-[var(--teal)]" />
                    <span className="min-w-0 leading-tight">{branchLabel(val)}</span>
                  </OptionPill>
                ))}
              </div>
            </FormSection>
          </div>
        </Modal>
      )}

      {/* One-time new-referred-patient incentive settings */}
      {showIncentive && (
        <Modal title="New-referred-patient incentive" width="max-w-md" onClose={() => setShowIncentive(false)}
          footer={incLoading ? undefined : <>
            <button onClick={() => setShowIncentive(false)} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
            <button onClick={saveIncentive} disabled={incSaving} className={btnPrimary} style={{ background: 'var(--teal)' }}>
              {incSaving ? 'Saving…' : 'Save'}
            </button>
          </>}>
          <div className="space-y-4">
            <div className="rounded-xl border px-3 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: 'var(--bright-teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
              <Gift size={14} className="mt-px shrink-0" />
              <span>Paid once per NEW patient brought by an external DOCTOR (not in-house) — referrals from law firms and partner schools don&apos;t earn it. Triggered by the patient&apos;s first session; shown in the Commission tab and paid through payroll.</span>
            </div>
            {error && <AlertBanner>{error}</AlertBanner>}
            {incLoading ? (
              <div className="space-y-3" aria-busy="true">
                <div className={`${pulse} h-10`} style={pulseTone} />
                <div className={`${pulse} h-10 w-40`} style={pulseTone} />
                <LoadingNote>Loading settings…</LoadingNote>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls} style={muted} htmlFor="incentive-recipient">Recipient (staff)</label>
                  <select id="incentive-recipient" value={incForm.staffId}
                    onChange={e => { const s = incStaff.find(x => x.id === e.target.value); setIncForm(f => ({ ...f, staffId: e.target.value, staffName: s?.name || '' })) }}
                    className={inputCls} style={inputStyle}>
                    <option value="">— no recipient (incentive off) —</option>
                    {incStaff.map(s => <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` — ${s.jobTitle}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={muted} htmlFor="incentive-amount">Amount per new patient</label>
                  <div className="relative w-40">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={muted}>₱</span>
                    <input id="incentive-amount" type="number" min={0} step="1" value={incForm.amount} onChange={e => setIncForm(f => ({ ...f, amount: e.target.value }))}
                      className={`${inputCls} pl-7 font-mono`} style={inputStyle} />
                  </div>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Referred-orders drill-down */}
      {ordersFor && (
        <Modal title={<>Referrals — {ordersFor.name}</>} subtitle="Orders that named this referrer." width="max-w-2xl" closeOnBackdrop onClose={() => setOrdersFor(null)}
          footer={!ordersLoading && <span className="text-xs font-semibold mr-auto" style={{ color: 'var(--deep-teal)' }}>{orders.length} order{orders.length === 1 ? '' : 's'}</span>}>
          {ordersLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2, 3].map(i => <div key={i} className={`${pulse} h-9`} style={pulseTone} />)}
              <LoadingNote>Loading orders…</LoadingNote>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-10 text-center">
              <ListOrdered size={28} className="mx-auto mb-2 opacity-40" style={muted} />
              <p className="text-sm" style={muted}>No orders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Order #</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Patient</th>
                    <th className="px-3 py-2 font-semibold text-right">Amount</th>
                    <th className="px-3 py-2 font-semibold">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-t hover:bg-[#fbf9f5]" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap" style={ink}>#{o.orderNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={muted}>{new Date(o.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                      <td className="px-3 py-2" style={ink}>{o.patientName || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={ink}>₱{Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={muted}>{branchLabel(o.branch)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
