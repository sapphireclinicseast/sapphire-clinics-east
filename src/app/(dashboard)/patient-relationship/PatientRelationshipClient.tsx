'use client'

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import {
  HeartHandshake, Phone, Mail, Clock, AlertTriangle, CheckCircle, MessageSquare, Check,
  Calendar, Filter, Users, XCircle, ChevronDown, ChevronRight,
  Upload, Eye, Trash2, FileText, QrCode, Loader2, X,
} from 'lucide-react'
import { branchLabel as sharedBranchLabel } from '@/lib/branch-label'

type Tab = 'waitlist' | 'followup' | 'noshow' | 'cancellation'

// Only East/Greenhills \u2014 this tab's data (waitlist/follow-up/no-show/
// cancellation) is clinic-only, deliberately excludes Verdana.
const BRANCHES = [
  { value: 'SANDBOX_EAST', label: sharedBranchLabel('SANDBOX_EAST') },
  { value: 'SANDBOX_GREENHILLS', label: sharedBranchLabel('SANDBOX_GREENHILLS') },
]

function branchLabel(b?: string | null) {
  return BRANCHES.find(x => x.value === b)?.label ?? b ?? '\u2014'
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db',
  fontSize: '0.8rem', color: '#374151', background: '#fff', cursor: 'pointer',
}

const PAGE_OPTIONS = [25, 50, 75, 100]

function Pagination({ total, page, perPage, onPage, onPerPage }: {
  total: number; page: number; perPage: number; onPage: (p: number) => void; onPerPage: (n: number) => void
}) {
  const pages = Math.ceil(total / perPage)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs" style={{ color: '#6B7280', borderTop: '1px solid #F3F4F6' }}>
      <div className="flex items-center gap-2">
        <span>Show</span>
        <select value={perPage} onChange={e => { onPerPage(Number(e.target.value)); onPage(1) }} style={{ ...selectStyle, padding: '3px 6px', fontSize: '0.75rem' }}>
          {PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>of {total}</span>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => onPage(p)}
              style={{
                padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                background: page === p ? 'var(--teal)' : '#F3F4F6', color: page === p ? '#fff' : '#6B7280',
              }}>{p}</button>
          ))}
          {pages > 10 && <span>...</span>}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WAITLIST TAB
// ══════════════════════════════════════════════════════════════════════════════

const WAITLIST_FORMS = [
  { key: 'registration', label: 'Registration Form' },
  { key: 'group-therapy', label: 'Group Therapy' },
  { key: 'sip', label: 'SIP Registration' },
  { key: 'psych', label: 'Psych Registration' },
]

// ── Sorting ──────────────────────────────────────────────────────────────────
// All four tabs render the same table shell over different row shapes, so the
// sort lives here once and each tab supplies accessors for its own columns.
//
// A column with no accessor (row-expand chevrons, contact buttons) is rendered
// as a plain, unclickable header — sorting by a button is meaningless.

type SortDir = 'asc' | 'desc'
type SortCol = { key: string; label: string; get?: (row: any) => string | number | null | undefined }

function useSort(cols: SortCol[], rows: any[]) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggle(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const col = cols.find(c => c.key === sortKey)
    if (!col?.get) return rows
    // Copy before sorting: rows is the caller's filtered array, and sorting it
    // in place mutates component state.
    return [...rows].sort((a, b) => {
      const av = col.get!(a), bv = col.get!(b)
      // Blanks sort last in BOTH directions — a patient with no first session
      // is missing data, not the earliest one, and flipping the arrow should
      // not parade empty rows to the top.
      const aEmpty = av === null || av === undefined || av === ''
      const bEmpty = bv === null || bv === undefined || bv === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [cols, rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggle }
}

function SortHeaders({ cols, sortKey, sortDir, onToggle }: {
  cols: SortCol[]; sortKey: string | null; sortDir: SortDir; onToggle: (key: string) => void
}) {
  return (
    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
      {cols.map(c => {
        const active = sortKey === c.key
        const sortable = !!c.get
        return (
          <th key={c.key} className="px-4 py-3 font-semibold"
            onClick={sortable ? () => onToggle(c.key) : undefined}
            title={sortable ? `Sort by ${c.label}` : undefined}
            style={{
              color: active ? 'var(--teal)' : 'var(--mid-gray)',
              fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              cursor: sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
            }}>
            {c.label}
            {sortable && (
              // Reserve the arrow's width always, so turning sorting on does not
              // nudge the column headers sideways.
              <span style={{ display: 'inline-block', width: '0.9em', marginLeft: 2,
                             opacity: active ? 1 : 0.25 }}>
                {active ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
              </span>
            )}
          </th>
        )
      })}
    </tr>
  )
}

function WaitlistTab({ branch }: { branch: string }) {
  const [formKey, setFormKey] = useState('registration')
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [converting, setConverting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [patientNames, setPatientNames] = useState<Set<string>>(new Set())

  // Fetch existing patients to check if already converted
  useEffect(() => {
    fetch('/api/patients?limit=10000').then(r => r.json()).then(d => {
      const names = new Set<string>()
      for (const p of (d.patients || [])) {
        const n = `${p.firstName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim().toLowerCase()
        if (n) names.add(n)
      }
      setPatientNames(names)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true); setExpanded(null); setPage(1)
    const params = new URLSearchParams({ tab: 'waitlist', formKey })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setResponses(d.responses || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [branch, formKey])

  function isConverted(item: any): boolean {
    const name = getName(item).toLowerCase().trim()
    return name !== 'unknown' && patientNames.has(name)
  }

  async function deleteResponse(item: any) {
    if (!confirm('Are you sure you want to remove this waitlist entry?')) return
    setDeleting(item.landing_id)
    try {
      const res = await fetch(`/api/patient-relationship?tab=waitlist-delete&formId=${item._formId}&submissionId=${item.landing_id}`, { method: 'DELETE' })
      if (res.ok) {
        setResponses(prev => prev.filter(r => r.landing_id !== item.landing_id))
      } else {
        alert('Failed to delete')
      }
    } catch { alert('Failed to delete') }
    finally { setDeleting(null) }
  }

  // Extract name from response answers
  // HR forms store answers with field as object {id, ref, type} and contact info as {contact: {first_name, last_name}}
  function getFieldTitle(item: any, answer: any): string {
    const fields = item.fields || []
    const match = fields.find((f: any) => f.id === answer?.field?.id)
    return match?.title || ''
  }
  function getFieldTitleLower(item: any, answer: any): string {
    return getFieldTitle(item, answer).toLowerCase()
  }

  function getName(item: any) {
    if (!item.answers) return 'Unknown'
    // Try to find the patient name contact field
    for (const a of item.answers) {
      const title = getFieldTitleLower(item, a)
      if ((title.includes('name') && title.includes('patient')) || title.includes('name of')) {
        if (a.contact) return `${a.contact.first_name || ''} ${a.contact.last_name || ''}`.replace(/\s+/g, ' ').trim()
        if (a.text) return a.text
      }
    }
    // Fallback: first contact_info field
    const contactAnswer = item.answers.find((a: any) => a.field?.type === 'contact_info' || a.contact)
    if (contactAnswer?.contact) return `${contactAnswer.contact.first_name || ''} ${contactAnswer.contact.last_name || ''}`.replace(/\s+/g, ' ').trim()
    if (contactAnswer?.text) return contactAnswer.text
    return 'Unknown'
  }

  const filtered = search
    ? responses.filter(r => getName(r).toLowerCase().includes(search.toLowerCase()))
    : responses

  const COLS: SortCol[] = [
    { key: 'expand', label: '' },                                   // chevron
    { key: 'name',   label: 'Name', get: r => getName(r) },
    { key: 'form',   label: 'Form', get: r => r._formTitle ?? '' },
    // Raw ISO timestamp, not the formatted cell — "Mar" vs "Apr" would sort alphabetically.
    { key: 'date',   label: 'Date', get: r => r.submitted_at ?? '' },
  ]
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, filtered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  async function convertToPatient(item: any) {
    setConverting(item.landing_id)
    try {
      const answers = item.answers || []
      const findByTitle = (keywords: string[]) => {
        for (const a of answers) {
          const title = getFieldTitleLower(item, a)
          if (keywords.some(k => title.includes(k))) return a
        }
        return null
      }

      // Name extraction: prefer a structured contact_info answer; fall back to
      // splitting the same display name that getName() already extracts correctly.
      let firstName = '', lastName = '', email = '', phone = ''
      const contactField = answers.find((a: any) => a.contact?.first_name || a.contact?.last_name)
      if (contactField?.contact) {
        firstName = contactField.contact.first_name  || ''
        lastName  = contactField.contact.last_name   || ''
        email     = contactField.contact.email        || ''
        phone     = contactField.contact.phone_number || ''
      } else {
        // Text-type name field — reuse getName() which already handles all form layouts.
        const fullName = getName(item)
        if (fullName && fullName !== 'Unknown') {
          const parts = fullName.trim().split(/\s+/).filter(Boolean)
          firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '')
          lastName  = parts.length > 1 ? parts[parts.length - 1] : ''
        }
        // Look for email and phone in separate text answers
        for (const a of answers) {
          const t = getFieldTitleLower(item, a)
          if (!email && (a.email || t.includes('email'))) email = a.email || a.text || ''
          if (!phone && (a.phone_number || t.includes('phone') || t.includes('mobile'))) phone = a.phone_number || a.text || ''
        }
      }

      // Try birthday field
      const dobAnswer = findByTitle(['birthday', 'birth', 'dob'])
      const dob = dobAnswer?.text || ''

      // Try diagnosis
      const diagAnswer = findByTitle(['diagnosis'])
      const diagnosis = diagAnswer?.text || ''

      const patientData: any = {
        firstName, lastName, email, phone,
        patientType: 'PEDIATRIC',
        branches: branch ? [branch] : (item._branch === 'SBEA' ? ['SANDBOX_EAST'] : item._branch === 'SBGH' ? ['SANDBOX_GREENHILLS'] : []),
      }
      if (dob) patientData.dob = dob
      if (diagnosis) patientData.diagnosis = diagnosis

      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData),
      })
      if (res.ok) {
        // Delete the HR form response so it won't reappear on next reload
        fetch(`/api/patient-relationship?tab=waitlist-delete&formId=${item._formId}&submissionId=${item.landing_id}`, { method: 'DELETE' }).catch(() => {})
        // Mark as converted in local state: add name to patientNames so isConverted()
        // returns true and the row turns green — do NOT remove from responses list.
        const convertedName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim().toLowerCase()
        if (convertedName) setPatientNames(prev => new Set([...prev, convertedName]))
        alert('Patient converted successfully! They are now in the Patient CRM.')
      } else {
        const d = await res.json()
        alert(d.error || 'Failed to convert')
      }
    } catch (e) {
      alert('Failed to convert patient')
    } finally {
      setConverting(null)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      {/* Sub-tabs for form types */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F1F5F9' }}>
        {WAITLIST_FORMS.map(f => (
          <button key={f.key} onClick={() => setFormKey(f.key)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold"
            style={{
              background: formKey === f.key ? '#fff' : 'transparent',
              color: formKey === f.key ? 'var(--teal)' : '#64748B',
              border: 'none', cursor: 'pointer', flex: 1,
              boxShadow: formKey === f.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}>{f.label}</button>
        ))}
      </div>

      <input type="text" placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%', maxWidth: 400 }} />

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <table className="w-full text-left" style={{ fontSize: '0.82rem' }}>
          <thead>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-10" style={{ color: '#9ca3af' }}>No responses found.</td></tr>
            ) : paginated.map((item: any) => {
              const converted = isConverted(item)
              return (
              <Fragment key={item.landing_id}>
                <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: converted ? '#F0FDF4' : undefined }}
                  onClick={() => setExpanded(expanded === item.landing_id ? null : item.landing_id)}>
                  <td className="px-4 py-3" style={{ width: 30 }}>
                    {expanded === item.landing_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: converted ? '#15803D' : 'var(--charcoal)' }}>
                    {getName(item)}
                    {converted && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: '#DCFCE7', color: '#15803D', fontWeight: 600, fontSize: '0.65rem' }}>Converted</span>}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#6B7280' }}>{item._formTitle}</td>
                  <td className="px-4 py-3 flex items-center gap-2" style={{ color: '#374151' }}>
                    {new Date(item.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    <button onClick={(e) => { e.stopPropagation(); deleteResponse(item) }} disabled={deleting === item.landing_id}
                      className="ml-auto p-1.5 rounded-lg hover:opacity-80" title="Remove from waitlist"
                      style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
                      {deleting === item.landing_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </td>
                </tr>
                {expanded === item.landing_id && (
                  <tr key={item.landing_id + '-detail'}>
                    <td colSpan={4} className="px-6 py-4" style={{ background: '#F8FAFC' }}>
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase" style={{ color: 'var(--teal)', letterSpacing: '0.05em' }}>Form Responses</p>
                        {(item.answers || []).map((a: any, i: number) => {
                          const title = getFieldTitle(item, a) || `Question ${i + 1}`
                          let value = a.text || ''
                          if (a.contact) value = `${a.contact.first_name || ''} ${a.contact.last_name || ''} ${a.contact.phone_number ? '| ' + a.contact.phone_number : ''} ${a.contact.email ? '| ' + a.contact.email : ''}`.trim()
                          if (a.choices?.labels) value = a.choices.labels.join(', ')
                          if (a.choice?.label) value = a.choice.label
                          return (
                            <div key={i} className="flex gap-2 text-xs">
                              <span style={{ color: '#6B7280', fontWeight: 600, minWidth: 200 }}>{title}:</span>
                              <span style={{ color: '#111827' }}>{value || '\u2014'}</span>
                            </div>
                          )
                        })}
                        <div className="mt-3 flex gap-2">
                          {!converted && (
                            <button onClick={() => convertToPatient(item)} disabled={converting === item.landing_id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', opacity: converting === item.landing_id ? 0.6 : 1 }}>
                              {converting === item.landing_id ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                              Convert to Patient
                            </button>
                          )}
                          <button onClick={() => deleteResponse(item)} disabled={deleting === item.landing_id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                            {deleting === item.landing_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            Remove from Waitlist
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
        <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FOLLOW UP TAB
// ══════════════════════════════════════════════════════════════════════════════

const DEPT_TABS = [
  { key: 'PT', label: 'PT' },
  { key: 'OT', label: 'OT' },
  { key: 'SLP', label: 'SLP' },
  { key: 'SPED', label: 'SPED' },
  { key: 'PSYCHOLOGY', label: 'Psych' },
  { key: 'MD', label: 'MD' },
]

const DEPT_NOTES: Record<string, string> = {
  PSYCHOLOGY: 'Psychology: 3 months of no consult',
  PT: 'PT: Should consult with MD after 2 months',
  OT: 'OT: Reconsult with Developmental Pediatrician after 6 months',
  SLP: 'SLP: Reconsult with Developmental Pediatrician after 6 months',
  SPED: 'SPED: Reconsult with Developmental Pediatrician after 6 months',
  MD: 'MD: Follow up as needed',
}

const statusConfig: Record<string, { bg: string; color: string; border: string; label: string; icon: any }> = {
  due:     { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Due Now',  icon: AlertTriangle },
  overdue: { bg: '#FEF2F2', color: '#991B1B', border: '#FCA5A5', label: 'Overdue',  icon: AlertTriangle },
  upcoming:{ bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Upcoming', icon: Clock },
  ok:      { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'On Track', icon: CheckCircle },
}

function FollowUpTab({ branch }: { branch: string }) {
  const [dept, setDept] = useState('PT')
  const [patients, setPatients] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  useEffect(() => {
    setLoading(true); setPage(1)
    const params = new URLSearchParams({ tab: 'followup', dept })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setPatients(d.patients || []); setSummary(d.summary); setLoading(false) })
      .catch(() => setLoading(false))
  }, [branch, dept])

  const filtered = search
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : patients

  const COLS: SortCol[] = [
    { key: 'patient',   label: 'Patient',       get: p => `${p.lastName} ${p.firstName}` },
    { key: 'clinician', label: 'Clinician',     get: p => p.clinicianName ?? '' },
    // Sort the raw date, not the "Mar 3, 2026" the cell prints — the formatted
    // string would sort alphabetically by month name.
    { key: 'first',     label: 'First Session', get: p => p.firstSessionDate ?? '' },
    { key: 'reference', label: 'Reference',     get: p => p.referenceSource ?? '' },
    // Numeric so 9 sorts before 10 rather than after it.
    { key: 'days',      label: 'Days',          get: p => (p.daysSince ?? null) === null ? null : Number(p.daysSince) },
    // Sort by the label shown in the pill, so the order matches what is on screen.
    { key: 'status',    label: 'Status',        get: p => (statusConfig[p.status] || statusConfig.ok).label },
    { key: 'contact',   label: 'Contact' },                          // buttons
  ]
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, filtered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-4">
      {/* Dept sub-tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F1F5F9' }}>
        {DEPT_TABS.map(d => (
          <button key={d.key} onClick={() => setDept(d.key)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold"
            style={{
              background: dept === d.key ? '#fff' : 'transparent',
              color: dept === d.key ? 'var(--teal)' : '#64748B',
              border: 'none', cursor: 'pointer', flex: 1,
              boxShadow: dept === d.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}>{d.label}</button>
        ))}
      </div>

      {/* Reminder note */}
      <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
        <Calendar size={16} style={{ color: '#1D4ED8', marginTop: 1, flexShrink: 0 }} />
        <p className="text-xs" style={{ color: '#1E40AF', fontWeight: 500 }}>{DEPT_NOTES[dept] || ''}</p>
      </div>

      {summary && (
        <div className="flex gap-3">
          {[
            { label: 'Due', value: summary.due, color: '#DC2626' },
            { label: 'Overdue', value: summary.overdue, color: '#991B1B' },
            { label: 'Upcoming', value: summary.upcoming, color: '#D97706' },
            { label: 'On Track', value: summary.ok, color: '#15803D' },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: c.color }}>
              <span className="text-lg font-bold">{c.value}</span> {c.label}
            </div>
          ))}
        </div>
      )}

      <input type="text" placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%', maxWidth: 400 }} />

      {loading ? <Loading /> : (
        <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-left" style={{ fontSize: '0.82rem' }}>
              <thead>
                <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10" style={{ color: '#9ca3af' }}>No patients in this department.</td></tr>
                ) : paginated.map((p: any) => {
                  const sc = statusConfig[p.status] || statusConfig.ok
                  const Icon = sc.icon
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{p.lastName}, {p.firstName}</td>
                      <td className="px-4 py-3" style={{ color: '#374151' }}>{p.clinicianName}</td>
                      <td className="px-4 py-3" style={{ color: '#374151' }}>{new Date(p.firstSessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: p.referenceSource === 'consult' ? '#EFF6FF' : '#F0FDF4', color: p.referenceSource === 'consult' ? '#1D4ED8' : '#15803D' }}>
                          {p.referenceSource === 'consult' ? 'Dr. Consult' : '1st Session'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: '#374151' }}>{p.daysSince}d</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          <Icon size={12} />{sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3"><FollowUpContactBtns patient={p} department={dept} onSent={(sentAt) => setPatients(prev => prev.map(x => x.id === p.id ? { ...x, reminderSentAt: sentAt } : x))} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// NO SHOW TAB
// ══════════════════════════════════════════════════════════════════════════════

const MAX_NOSHOWS = 3

function NoShowTab({ branch }: { branch: string }) {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logForm, setLogForm] = useState<{ patientId: string; remarks: string } | null>(null)
  const [logSaving, setLogSaving] = useState(false)
  const [deleting, setDeleting] = useState<{ logId: string; reason: string } | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ tab: 'noshow' })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setPatients(d.patients || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [branch])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = search
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : patients

  const COLS: SortCol[] = [
    { key: 'expand',  label: '' },                                  // chevron
    { key: 'patient', label: 'Patient',   get: p => `${p.lastName} ${p.firstName}` },
    { key: 'branch',  label: 'Branch',    get: p => branchLabel(p.branch) ?? '' },
    // The whole reason to sort this tab: who is closest to the no-show limit.
    { key: 'count',   label: 'No-Shows',  get: p => Number(p.noShowCount ?? 0) },
  ]
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, filtered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  async function saveLog() {
    if (!logForm) return
    setLogSaving(true)
    try {
      const res = await fetch('/api/patient-relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: 'noshow', patientId: logForm.patientId, remarks: logForm.remarks, branch: branch || patients.find((p: any) => p.id === logForm.patientId)?.branch || '' }),
      })
      if (res.ok) { setLogForm(null); fetchData() }
      else alert('Failed to save')
    } catch { alert('Failed to save') }
    finally { setLogSaving(false) }
  }

  async function deleteLog() {
    if (!deleting) return
    const params = new URLSearchParams({ tab: 'noshow-delete', logId: deleting.logId, reason: deleting.reason })
    const res = await fetch(`/api/patient-relationship?${params}`, { method: 'DELETE' })
    if (res.ok) { setDeleting(null); fetchData() }
    else alert('Failed to delete')
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-3 text-xs" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
        Patients are allowed a maximum of <strong>{MAX_NOSHOWS} no-shows</strong>. Upon reaching {MAX_NOSHOWS}/{MAX_NOSHOWS}, the patient is <strong>subject to slot removal</strong>.
      </div>

      <input type="text" placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%', maxWidth: 400 }} />

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <table className="w-full text-left" style={{ fontSize: '0.82rem' }}>
          <thead>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-10" style={{ color: '#9ca3af' }}>No patients found.</td></tr>
            ) : paginated.map((p: any) => {
              const isExpanded = expandedId === p.id
              const atLimit = p.noShowCount >= MAX_NOSHOWS
              const nearing = p.noShowCount === MAX_NOSHOWS - 1
              const rowColor = atLimit ? '#FEF2F2' : nearing ? '#FFFBEB' : undefined
              const textColor = atLimit ? '#DC2626' : nearing ? '#D97706' : 'var(--charcoal)'
              return (
                <Fragment key={p.id}>
                  <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: rowColor }}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <td className="px-4 py-3" style={{ width: 30 }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: textColor }}>
                      {p.lastName}, {p.firstName}
                      {atLimit && <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#FEE2E2', color: '#DC2626' }}>SUBJECT TO SLOT REMOVAL</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#6B7280' }}>{branchLabel(p.branch)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: textColor }}>{p.noShowCount}</span>
                      <span className="text-xs ml-1" style={{ color: '#9ca3af' }}>/ {MAX_NOSHOWS}</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={p.id + '-detail'}>
                      <td colSpan={4} className="px-6 py-4" style={{ background: '#FAFBFC' }}>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase" style={{ color: 'var(--teal)', letterSpacing: '0.05em' }}>No-Show Logs</p>
                            <button onClick={() => setLogForm({ patientId: p.id, remarks: '' })}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                              + Log No-Show
                            </button>
                          </div>

                          {logForm?.patientId === p.id && (
                            <div className="rounded-lg p-3 space-y-2" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
                              <input type="text" placeholder="Remarks (optional)" value={logForm.remarks} onChange={e => setLogForm({ ...logForm, remarks: e.target.value })} style={{ ...selectStyle, width: '100%' }} />
                              <div className="flex gap-2">
                                <button onClick={saveLog} disabled={logSaving} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                  {logSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => setLogForm(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                                  style={{ background: '#fff', color: '#6B7280', border: '1px solid #d1d5db', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          )}

                          {p.logs.length === 0 ? (
                            <p className="text-xs" style={{ color: '#9ca3af' }}>No no-show logs yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {p.logs.map((log: any) => (
                                <div key={log.id} className="rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs"
                                  style={{
                                    background: log.deletedAt ? '#F9FAFB' : '#fff',
                                    border: `1px solid ${log.deletedAt ? '#E5E7EB' : '#E2E8F0'}`,
                                    opacity: log.deletedAt ? 0.6 : 1,
                                  }}>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>No-Show</span>
                                    <span className="ml-2" style={{ color: '#6B7280' }}>
                                      {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    {log.remarks && <span className="ml-2" style={{ color: '#9ca3af' }}>- {log.remarks}</span>}
                                    {log.deletedAt && (
                                      <span className="ml-2 text-xs" style={{ color: '#DC2626' }}>
                                        DELETED by {log.deletedBy} ({log.deleteReason || 'no reason'})
                                      </span>
                                    )}
                                  </div>
                                  {!log.deletedAt && (
                                    <button onClick={(e) => { e.stopPropagation(); setDeleting({ logId: log.id, reason: '' }) }}
                                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
                                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>

      {/* Delete confirmation modal */}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Delete No-Show Log</h3>
            <p className="text-xs mb-3" style={{ color: '#6B7280' }}>Please provide a reason for deletion. This will be tracked.</p>
            <textarea value={deleting.reason} onChange={e => setDeleting({ ...deleting, reason: e.target.value })}
              placeholder="Reason for deletion..." rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.83rem', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setDeleting(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: '#fff', color: '#6B7280', border: '1px solid #d1d5db', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteLog} disabled={!deleting.reason.trim()} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: deleting.reason.trim() ? '#DC2626' : '#ccc', color: '#fff', border: 'none', cursor: deleting.reason.trim() ? 'pointer' : 'not-allowed' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CANCELLATION TAB
// ══════════════════════════════════════════════════════════════════════════════

const CANCELLATION_TYPES = [
  'Cancellation >24 hrs (VALID)',
  'Cancellation >24 hrs (INVALID)',
  'Late Cancellation <24 hrs (VALID)',
  'Late Cancellation <24 hrs (INVALID)',
  'Retainer (VALID)',
  'Retainer (INVALID)',
]

function CancellationTab({ branch }: { branch: string }) {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logForm, setLogForm] = useState<{ patientId: string; type: string; remarks: string } | null>(null)
  const [logSaving, setLogSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{ logId: string; reason: string } | null>(null)
  const [qrModal, setQrModal] = useState<{ logId: string; url: string } | null>(null)
  const [qrUploaded, setQrUploaded] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ tab: 'cancellation' })
    if (branch) params.set('branch', branch)
    fetch(`/api/patient-relationship?${params}`)
      .then(r => r.json())
      .then(d => { setPatients(d.patients || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [branch])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = search
    ? patients.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : patients

  const COLS: SortCol[] = [
    { key: 'expand',  label: '' },                                  // chevron
    { key: 'patient', label: 'Patient',        get: p => `${p.lastName} ${p.firstName}` },
    { key: 'branch',  label: 'Branch',         get: p => branchLabel(p.branch) ?? '' },
    { key: 'free',    label: 'Free Allowance', get: p => Number(p.windowUsed ?? 0) },
    // Sorting by this surfaces who is at the 12-cancellation slot-removal line.
    { key: 'slot',    label: 'Slot Removal',   get: p => Number(p.cancellationsUsed ?? 0) },
  ]
  const { sorted, sortKey, sortDir, toggle } = useSort(COLS, filtered)
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)

  async function saveLog() {
    if (!logForm) return
    setLogSaving(true)
    try {
      const res = await fetch('/api/patient-relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...logForm, branch: branch || patients.find((p: any) => p.id === logForm.patientId)?.branch || '' }),
      })
      if (res.ok) { setLogForm(null); fetchData() }
      else alert('Failed to save')
    } catch { alert('Failed to save') }
    finally { setLogSaving(false) }
  }

  async function uploadProof(logId: string, file: File) {
    setUploading(logId)
    const form = new FormData()
    form.append('logId', logId)
    form.append('file', file)
    try {
      const res = await fetch('/api/patient-relationship', { method: 'POST', body: form })
      if (res.ok) fetchData()
      else alert('Upload failed')
    } catch { alert('Upload failed') }
    finally { setUploading(null) }
  }

  async function deleteLog() {
    if (!deleting) return
    const params = new URLSearchParams({ logId: deleting.logId, reason: deleting.reason })
    const res = await fetch(`/api/patient-relationship?${params}`, { method: 'DELETE' })
    if (res.ok) { setDeleting(null); fetchData() }
    else alert('Failed to delete')
  }

  function openQrUpload(logId: string) {
    const uploadUrl = `${window.location.origin}/upload-proof/${logId}`
    setQrUploaded(false)
    setQrModal({ logId, url: uploadUrl })
  }

  // Poll for proof upload while QR modal is open
  useEffect(() => {
    if (!qrModal || qrUploaded) return
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({ tab: 'cancellation' })
        if (branch) params.set('branch', branch)
        const res = await fetch(`/api/patient-relationship?${params}`)
        const data = await res.json()
        const allLogs = (data.patients || []).flatMap((p: any) => p.logs || [])
        const log = allLogs.find((l: any) => l.id === qrModal.logId)
        if (log?.proofUrl) {
          setQrUploaded(true)
          fetchData()
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [qrModal, qrUploaded, branch, fetchData])

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-3 text-xs" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
        <strong>Free Allowance:</strong> Each patient gets <strong>2 free cancellations</strong> per 6-month window (from first session). After that, a cancellation fee applies.<br />
        <strong>Slot Removal:</strong> Upon reaching <strong>12 total cancellations</strong>, the patient is subject to slot removal.
      </div>

      <input type="text" placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%', maxWidth: 400 }} />

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <table className="w-full text-left" style={{ fontSize: '0.82rem' }}>
          <thead>
            <SortHeaders cols={COLS} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10" style={{ color: '#9ca3af' }}>No patients found.</td></tr>
            ) : paginated.map((p: any) => {
              const isExpanded = expandedId === p.id
              const atSlotLimit = p.cancellationsUsed >= 12
              const nearingSlot = p.cancellationsUsed >= 10 && p.cancellationsUsed < 12
              const freeUsed = p.windowUsed ?? 0
              const freeGone = freeUsed >= 2
              const rowColor = atSlotLimit ? '#FEF2F2' : nearingSlot ? '#FFFBEB' : undefined
              const slotColor = atSlotLimit ? '#DC2626' : nearingSlot ? '#D97706' : 'var(--charcoal)'
              const freeColor = freeGone ? '#DC2626' : freeUsed === 1 ? '#D97706' : '#16a34a'
              return (
                <Fragment key={p.id}>
                  <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: rowColor }}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <td className="px-4 py-3" style={{ width: 30 }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: slotColor }}>
                      {p.lastName}, {p.firstName}
                      {atSlotLimit && <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#FEE2E2', color: '#DC2626' }}>SUBJECT TO SLOT REMOVAL</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#6B7280' }}>{branchLabel(p.branch)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: freeColor }}>{freeUsed}</span>
                      <span className="text-xs ml-1" style={{ color: '#9ca3af' }}>/ 2</span>
                      {freeGone && <span className="ml-1.5 text-xs" style={{ color: '#DC2626', fontWeight: 600 }}>Fee applies</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold" style={{ color: slotColor }}>{p.cancellationsUsed}</span>
                      <span className="text-xs ml-1" style={{ color: '#9ca3af' }}>/ 12</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={p.id + '-detail'}>
                      <td colSpan={5} className="px-6 py-4" style={{ background: '#FAFBFC' }}>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase" style={{ color: 'var(--teal)', letterSpacing: '0.05em' }}>Cancellation Logs</p>
                            <button onClick={() => setLogForm({ patientId: p.id, type: CANCELLATION_TYPES[0], remarks: '' })}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                              style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                              + Log Cancellation
                            </button>
                          </div>

                          {/* New log form */}
                          {logForm?.patientId === p.id && (
                            <div className="rounded-lg p-3 space-y-2" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
                              <select value={logForm.type} onChange={e => setLogForm({ ...logForm, type: e.target.value })} style={{ ...selectStyle, width: '100%' }}>
                                {CANCELLATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input type="text" placeholder="Remarks (optional)" value={logForm.remarks} onChange={e => setLogForm({ ...logForm, remarks: e.target.value })} style={{ ...selectStyle, width: '100%' }} />
                              <div className="flex gap-2">
                                <button onClick={saveLog} disabled={logSaving} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                  {logSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => setLogForm(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                                  style={{ background: '#fff', color: '#6B7280', border: '1px solid #d1d5db', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          )}

                          {/* Existing logs */}
                          {p.logs.length === 0 ? (
                            <p className="text-xs" style={{ color: '#9ca3af' }}>No cancellation logs yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {p.logs.map((log: any) => (
                                <div key={log.id} className="rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs"
                                  style={{
                                    background: log.deletedAt ? '#F9FAFB' : '#fff',
                                    border: `1px solid ${log.deletedAt ? '#E5E7EB' : '#E2E8F0'}`,
                                    opacity: log.deletedAt ? 0.6 : 1,
                                  }}>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold px-2 py-0.5 rounded-full" style={{
                                      background: log.isValid ? '#F0FDF4' : '#FEF2F2',
                                      color: log.isValid ? '#15803D' : '#DC2626',
                                    }}>{log.type}</span>
                                    <span className="ml-2" style={{ color: '#6B7280' }}>
                                      {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    {log.remarks && <span className="ml-2" style={{ color: '#9ca3af' }}>- {log.remarks}</span>}
                                    {log.deletedAt && (
                                      <span className="ml-2 text-xs" style={{ color: '#DC2626' }}>
                                        DELETED by {log.deletedBy} ({log.deleteReason || 'no reason'})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-1.5 items-center">
                                    {/* View proof */}
                                    {log.proofUrl && (
                                      <a href={log.proofUrl} target="_blank" rel="noreferrer" title="View proof"
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
                                        style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                        <Eye size={13} />
                                      </a>
                                    )}
                                    {/* Upload proof (only for valid, no proof yet, not deleted) */}
                                    {log.isValid && !log.proofUrl && !log.deletedAt && (
                                      <>
                                        <label className="inline-flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer"
                                          style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                                          {uploading === log.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                          <input type="file" accept="image/*,application/pdf" className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadProof(log.id, f) }} />
                                        </label>
                                        <button onClick={() => openQrUpload(log.id)} title="Take photo with camera"
                                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
                                          style={{ background: '#FFF', color: 'var(--charcoal)', border: '1px solid #CBD5E1', cursor: 'pointer' }}>
                                          <QrCode size={13} />
                                        </button>
                                      </>
                                    )}
                                    {/* Delete (soft) */}
                                    {!log.deletedAt && (
                                      <button onClick={(e) => { e.stopPropagation(); setDeleting({ logId: log.id, reason: '' }) }}
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
                                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>

      {/* QR code modal */}
      {qrModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setQrModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 360, width: '90%', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            {qrUploaded ? (
              <>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={32} style={{ color: '#15803D' }} />
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: '#15803D' }}>Proof Uploaded!</h3>
                <p className="text-xs mb-4" style={{ color: '#6B7280' }}>The proof document has been successfully received from the scanned device.</p>
                <button onClick={() => setQrModal(null)}
                  className="text-sm px-5 py-2 rounded-lg font-semibold"
                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Scan to Upload Proof</h3>
                  <button onClick={() => setQrModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
                </div>
                <div className="flex justify-center mb-3">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModal.url)}`}
                    alt="QR Code"
                    width={200} height={200}
                    style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                  />
                </div>
                <p className="text-xs mb-1" style={{ color: '#6B7280' }}>Scan this QR code with a tablet or phone to upload proof.</p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <div className="animate-spin w-3 h-3 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
                  <p className="text-xs" style={{ color: '#9ca3af' }}>Waiting for upload...</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Delete Cancellation Log</h3>
            <p className="text-xs mb-3" style={{ color: '#6B7280' }}>Please provide a reason for deletion. This will be tracked.</p>
            <textarea value={deleting.reason} onChange={e => setDeleting({ ...deleting, reason: e.target.value })}
              placeholder="Reason for deletion..." rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.83rem', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setDeleting(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: '#fff', color: '#6B7280', border: '1px solid #d1d5db', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteLog} disabled={!deleting.reason.trim()} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: deleting.reason.trim() ? '#DC2626' : '#ccc', color: '#fff', border: 'none', cursor: deleting.reason.trim() ? 'pointer' : 'not-allowed' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared Components ────────────────────────────────────────────────────────

function ContactBtns({ phone, email }: { phone?: string | null; email?: string | null }) {
  return (
    <div className="flex gap-1.5">
      {phone && (
        <a href={`tel:${phone}`} title={phone} className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}><Phone size={13} /></a>
      )}
      {email && (
        <a href={`mailto:${email}`} title={email} className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}><Mail size={13} /></a>
      )}
    </div>
  )
}

// ── Follow-Up Contact Buttons ────────────────────────────────────────────────
// Replaces the plain Call button with an SMS-send button that posts to
// /api/patient-relationship/followup-sms. Once the reminder is sent, the
// button switches to a permanent muted "Sent" chip.

function FollowUpContactBtns({
  patient,
  department,
  onSent,
}: {
  patient: { id: string; branch: string | null; phone: string | null; email: string | null; reminderSentAt: string | null }
  department: string
  onSent: (sentAt: string) => void
}) {
  const [sending, setSending] = useState(false)
  const sent = !!patient.reminderSentAt

  async function sendSms() {
    if (sent || sending) return
    if (!patient.phone) { alert('No phone on file'); return }
    if (!patient.branch) { alert('No branch on record'); return }
    if (!confirm('Send follow-up SMS reminder to ' + patient.phone + '?')) return
    setSending(true)
    try {
      const branchCode = patient.branch === 'SANDBOX_EAST' ? 'SBEA'
        : patient.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : patient.branch
      const r = await fetch('/api/patient-relationship/followup-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id, department, branch: branchCode }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Send failed')
      onSent(data.sentAt || new Date().toISOString())
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally { setSending(false) }
  }

  return (
    <div className="flex gap-1.5">
      {sent ? (
        <span
          title={'Sent ' + new Date(patient.reminderSentAt!).toLocaleDateString()}
          className="inline-flex items-center justify-center gap-1 px-2 h-7 rounded-lg text-[10px] font-bold"
          style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1' }}
        >
          <Check size={11} /> Sent
        </span>
      ) : (
        <button
          onClick={sendSms}
          disabled={sending || !patient.phone}
          title={patient.phone ? 'Send follow-up SMS' : 'No phone on file'}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{
            background: patient.phone ? '#EFF6FF' : '#F1F5F9',
            color: patient.phone ? '#1D4ED8' : '#94A3B8',
            border: '1px solid ' + (patient.phone ? '#BFDBFE' : '#CBD5E1'),
            cursor: patient.phone && !sending ? 'pointer' : 'not-allowed',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
        </button>
      )}
      {patient.email && (
        <a href={'mailto:' + patient.email} title={patient.email} className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}><Mail size={13} /></a>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="text-center py-12">
      <div className="animate-spin inline-block w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
      <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>Loading...</p>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'waitlist',     label: 'Waitlist',      icon: Users },
  { key: 'followup',     label: 'Follow Up',     icon: Clock },
  { key: 'noshow',       label: 'No-Show',       icon: AlertTriangle },
  { key: 'cancellation', label: 'Cancellations', icon: XCircle },
]

export default function PatientRelationshipClient({ role }: { role: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('waitlist')
  const [filterBranch, setFilterBranch] = useState('')

  // Auto-set branch for branch-specific roles
  const isSBEA = role.startsWith('SBEA')
  const isSBGH = role.startsWith('SBGH')
  const effectiveBranch = isSBEA ? 'SANDBOX_EAST' : isSBGH ? 'SANDBOX_GREENHILLS' : filterBranch
  const isAdmin = !isSBEA && !isSBGH

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <HeartHandshake size={24} style={{ color: 'var(--teal)' }} />
            Patient Relationship
          </h1>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: '#9ca3af' }} />
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={selectStyle}>
              <option value="">All Branches</option>
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: active ? '#fff' : 'transparent',
                color: active ? 'var(--teal)' : '#64748B',
                border: 'none', cursor: 'pointer',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                flex: 1, justifyContent: 'center',
              }}>
              <Icon size={15} />{t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'waitlist' && <WaitlistTab branch={effectiveBranch} />}
      {activeTab === 'followup' && <FollowUpTab branch={effectiveBranch} />}
      {activeTab === 'noshow' && <NoShowTab branch={effectiveBranch} />}
      {activeTab === 'cancellation' && <CancellationTab branch={effectiveBranch} />}
    </div>
  )
}
