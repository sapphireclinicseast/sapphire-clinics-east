'use client'

import React, { useEffect, useState, useMemo, type CSSProperties, type ReactNode } from 'react'
import {
  UserCog, X, Users, RefreshCw,
  ChevronUp, ChevronDown, ChevronsUpDown, CheckCircle2, AlertTriangle, GitMerge,
  Search, SearchX, Info, Mail, Phone, Building2, Briefcase, IdCard, Landmark, Database,
  Contact, SlidersHorizontal, Loader2, ArrowLeftRight, ShieldCheck, UserCheck,
} from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK'] as const
type Department = typeof DEPARTMENTS[number]

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  sex: string | null
  department: Department
  branch: string
  jobTitle: string | null
  employmentType: string | null
  employeeId: string | null
  dob: string | null
  // Government IDs + banking — synced one-way from HR Hub. Sensitive.
  tin: string | null
  sss: string | null
  pagibig: string | null
  philhealth: string | null
  bankName: string | null
  bankAccountNo: string | null
  hrPlatformId: string | null
  // Supervision and mentorship roles, synced from HR. Independent of each other
  // and of employmentType — one person can be an intern, a mentee, and later
  // both a supervisor and a mentor, so these are flags rather than one role.
  isInternshipSupervisor?: boolean | null
  isClinicalMentor?: boolean | null
  menteeIds?: string[]
  extraBranches: string[]
  branchEmployment: Record<string, { employmentType?: string | null; employeeId?: string | null; department?: string | null; jobTitle?: string | null }> | null
  createdAt: string
  updatedAt?: string | null
}

type SortCol = 'name' | 'department' | 'branch' | 'email' | 'phone' | 'jobTitle' | 'sex' | 'employmentType'
type SortDir = 'asc' | 'desc'

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_') || role.startsWith('AHEA_')) return 'SBEA'
  if (role.startsWith('SBGH_') || role.startsWith('AHGH_')) return 'SBGH'
  return null
}


// Short Aura-era branch codes. SBEA/SBGH are the legacy Sandbox codes still
// stored in the DB and used as filter values — these are display-only, so the
// UI never surfaces the retired Sandbox naming.
const BRANCH_CODE: Record<string, string> = {
  SBEA: 'AHEA',
  SBGH: 'AHGH',
}

// ── Presentation ─────────────────────────────────────────────────────────────
// Same control/button vocabulary as Partner Institutions, LOA Submissions and
// Queueing, so the page reads as part of the same app.

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60'
const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** One colour per department — the chip, the avatar and the KPI breakdown share it. */
const DEPT_COLOR: Record<string, string> = {
  OT: '#0E7490',
  PT: '#15803D',
  SLP: '#7C3AED',
  SPED: '#C2410C',
  MD: '#B91C1C',
  PSYCHOLOGY: '#BE185D',
  ORTHOSIS: '#4D7C0F',
  FRONT_DESK: '#475569',
}
const deptColor = (d: string) => DEPT_COLOR[d] ?? '#475569'
const deptLabel = (d: string) => d.replace(/_/g, ' ')

/** Soft tones for employment type. Anything HR adds later falls back to neutral. */
const EMP_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  employee:   { bg: '#DBEAFE', fg: '#1E40AF', border: '#BFDBFE' },
  consultant: { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
  intern:     { bg: '#E0E7FF', fg: '#3730A3', border: '#C7D2FE' },
}
const NEUTRAL_TONE = { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' }
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const prettyTitle = (t: string) => t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

function EmploymentBadge({ type, size = 'sm' }: { type: string; size?: 'xs' | 'sm' }) {
  const t = EMP_TONE[type] ?? NEUTRAL_TONE
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold leading-4 whitespace-nowrap ${size === 'xs' ? 'text-[10.5px]' : 'text-[11px]'}`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      {capitalise(type)}
    </span>
  )
}

function BranchChip({ branch, extra = false }: { branch: string; extra?: boolean }) {
  const isSBEA = branch === 'SBEA'
  const tone = isSBEA
    ? { bg: 'var(--pale-teal)', fg: 'var(--teal)', border: '#CBE3DC' }
    : { bg: '#FFF3CD', fg: '#92400E', border: '#FDE68A' }
  return (
    <span title={extra ? `Also works at ${branchLabel(branch) ?? branch} (interbranch)` : undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: extra ? '#fff' : tone.bg, color: tone.fg, border: `1px ${extra ? 'dashed' : 'solid'} ${tone.border}` }}>
      {extra && <ArrowLeftRight size={10} />}
      {branchLabel(branch) ?? branch}
    </span>
  )
}

function Avatar({ s, size = 34 }: { s: { firstName: string; lastName: string; department: string }; size?: number }) {
  const c = deptColor(s.department)
  const initials = `${(s.firstName || '').trim().charAt(0)}${(s.lastName || '').trim().charAt(0)}`.toUpperCase() || '?'
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `${c}18`, color: c, border: `1px solid ${c}30` }}>
      {initials}
    </span>
  )
}

function SexSelect({ staffId, value, onChange }: { staffId: string; value: string | null; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  async function update(next: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staffId, sex: next || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      onChange(next || null)
    } catch (err) {
      alert('Failed to save sex: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <select
      disabled={busy}
      value={value ?? ''}
      onChange={(e) => update(e.target.value)}
      aria-label="Sex"
      className="h-7 rounded-full focus:border-[var(--teal)]"
      style={{
        fontSize: '11.5px',
        padding: '0 8px',
        border: `1px solid ${value === 'M' ? '#BAE6FD' : value === 'F' ? '#FBCFE8' : 'var(--light-gray)'}`,
        background: value === 'M' ? '#EBF5FB' : value === 'F' ? '#FCE4EC' : '#fff',
        color: value === 'M' ? '#0369a1' : value === 'F' ? '#be185d' : 'var(--mid-gray)',
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        outline: 'none',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <option value="">—</option>
      <option value="M">Male</option>
      <option value="F">Female</option>
    </select>
  )
}

function ExtraBranchToggle({
  staffId, primaryBranch, value, onChange,
}: {
  staffId: string
  primaryBranch: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const extra = ['SBEA', 'SBGH'].filter(b => b !== primaryBranch)

  async function toggle(branch: string) {
    if (busy) return
    const next = value.includes(branch) ? value.filter(b => b !== branch) : [...value, branch]
    setBusy(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staffId, extraBranches: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      onChange(next)
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-2.5" style={{ background: '#fff' }}>
      <span className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--mid-gray)' }}>Also at Branch</span>
      <div className="flex flex-wrap items-center gap-2">
        {extra.map(b => {
          const checked = value.includes(b)
          return (
            <label key={b}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full cursor-pointer select-none transition-colors"
              style={{
                border: `1px solid ${checked ? 'var(--teal)' : 'var(--light-gray)'}`,
                background: checked ? 'var(--pale-teal)' : '#fff',
                opacity: busy ? 0.7 : 1,
              }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => toggle(b)}
                style={{ accentColor: 'var(--teal)', cursor: busy ? 'wait' : 'pointer' }}
              />
              <span className="text-xs font-semibold"
                    style={{ color: checked ? 'var(--teal)' : 'var(--mid-gray)' }}>
                {branchLabel(b) ?? b}
              </span>
            </label>
          )
        })}
        {busy && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
      </div>
    </div>
  )
}

// Who mentors whom, derived once from the staff list.
//
// HR models the relationship from the MENTOR's side (Staff.menteeIds), so
// "is this person a mentee?" has no field of its own — it is answered by
// scanning every mentor's list. Building the reverse index once per render
// beats an O(n) scan per row, and keeps the mentor's NAME available for the
// badge tooltip.
export function buildMentorIndex(staff: { id: string; firstName: string; lastName: string; menteeIds?: string[] }[]) {
  const mentorOf = new Map<string, string>()   // menteeId -> mentor display name
  for (const s of staff) {
    for (const menteeId of s.menteeIds ?? []) {
      if (menteeId && menteeId !== s.id) mentorOf.set(menteeId, `${s.firstName} ${s.lastName}`)
    }
  }
  return mentorOf
}

// Role badges. Deliberately additive: someone can be a Clinical Supervisor,
// a Clinical Mentor AND a mentee at once, and the module has to show all of it
// rather than pick one.
//
//   Clinical Supervisor — licensed clinician overseeing STUDENTS on placement
//   Clinical Mentor     — senior clinician guiding junior/newly licensed staff
//   Mentee              — the junior clinician on the receiving end
//   Intern              — the student themself (employmentType)
export function RoleBadges({ staff, mentorName, compact = false }: {
  staff: { employmentType?: string | null; isInternshipSupervisor?: boolean | null; isClinicalMentor?: boolean | null }
  mentorName?: string | null
  compact?: boolean
}) {
  const badges: { label: string; title: string; bg: string; fg: string }[] = []

  if (staff.employmentType === 'intern') {
    badges.push({ label: 'Intern', title: 'Student on clinical placement', bg: '#E0E7FF', fg: '#3730A3' })
  }
  if (staff.isInternshipSupervisor) {
    badges.push({ label: compact ? 'Supervisor' : 'Clinical Supervisor',
      title: 'Supervises students on clinical placement', bg: '#DBEAFE', fg: '#1E40AF' })
  }
  if (staff.isClinicalMentor) {
    badges.push({ label: compact ? 'Mentor' : 'Clinical Mentor',
      title: 'Mentors junior or newly licensed clinicians', bg: '#FEF3C7', fg: '#92400E' })
  }
  if (mentorName) {
    badges.push({ label: 'Mentee', title: `Mentored by ${mentorName}`, bg: '#FDE68A', fg: '#78350F' })
  }
  if (!badges.length) return null

  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {badges.map(b => (
        <span key={b.label} title={b.title}
          style={{ background: b.bg, color: b.fg, fontSize: compact ? 9.5 : 10, fontWeight: 700,
                   padding: '1px 6px', borderRadius: 9999, letterSpacing: '.02em', whiteSpace: 'nowrap', lineHeight: '15px' }}>
          {b.label}
        </span>
      ))}
    </span>
  )
}

function DeptBadge({ dept }: { dept: string }) {
  const c = deptColor(dept)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold leading-4 whitespace-nowrap"
      style={{ background: `${c}14`, color: c, border: `1px solid ${c}26` }}>
      {deptLabel(dept)}
    </span>
  )
}

/** A sortable column label: click toggles asc/desc, the arrow shows the active column. */
function SortHead({ col, label, sortCol, sortDir, onSort }: {
  col: SortCol; label: string; sortCol: SortCol | null; sortDir: SortDir; onSort: (c: SortCol) => void
}) {
  const active = sortCol === col
  return (
    <button type="button" onClick={() => onSort(col)}
      className={`inline-flex items-center gap-1 select-none whitespace-nowrap hover:text-[var(--teal)] ${SECTION_LABEL}`}
      style={{ color: active ? 'var(--teal)' : 'var(--mid-gray)', background: 'none', border: 'none', padding: 0 }}
      aria-label={`Sort by ${label}`}>
      {label}{' '}
      {!active
        ? <ChevronsUpDown size={11} style={{ color: '#bbb' }} />
        : sortDir === 'asc'
          ? <ChevronUp   size={11} style={{ color: 'var(--teal)' }} />
          : <ChevronDown size={11} style={{ color: 'var(--teal)' }} />}
    </button>
  )
}

// ── Existing duplicate scanner ────────────────────────────────────────────────
// Groups staff by lastName + first word of firstName + department + branch.
// Returns only groups with 2+ members (likely the same person entered twice).
function findExistingDuplicates(staff: StaffMember[]): StaffMember[][] {
  const groups = new Map<string, StaffMember[]>()
  for (const s of staff) {
    const key = [
      s.lastName.toUpperCase(),
      s.firstName.toUpperCase().split(/\s+/)[0],
      s.department,
      s.branch,
    ].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  return [...groups.values()].filter(g => g.length > 1)
}

const EMPTY_FILTERS = { name: '', department: '', branch: '', email: '', phone: '', jobTitle: '', sex: '', employmentType: '' }

// ── Main component ────────────────────────────────────────────────────────────
export default function StaffClient({ role }: { role: string }) {
  const autoBranch = branchFromRole(role)

  const [staff,   setStaff]   = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  // Display-only: what the roster request said when it failed. Before, a failed
  // load silently showed the "no staff" state.
  const [loadError, setLoadError] = useState<string | null>(null)

  // Sort + filter
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [showMoreFilters, setShowMoreFilters] = useState(false)

  // Merge duplicates
  const [mergeGroup,  setMergeGroup]  = useState<StaffMember[] | null>(null)
  const [mergeKeepId, setMergeKeepId] = useState<string>('')
  const [merging,     setMerging]     = useState(false)
  // A refusal stays in the modal; the follow-up notes (HR, Accounting) show as a banner after.
  const [mergeError,  setMergeError]  = useState<string | null>(null)
  const [mergeNotes,  setMergeNotes]  = useState<string[] | null>(null)

  // Staff details popup — opens when an admin clicks a staff name.
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  // Roles allowed to view the full HR profile (TIN, SSS, banking, etc.).
  // Excludes FRONT_DESK and MARKETING_ADMIN by design.
  const canViewStaffDetails = ['ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN'].includes(role)

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // HR Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<
    { synced: number; created: number; updated: number; deactivated: number; total: number; errors?: string[] } | null
  >(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/staff/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
        load()
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error') + ' (HTTP ' + res.status + ')')
      }
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : String(err)))
    }
    setSyncing(false)
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/staff')
      if (res.ok) setStaff(await res.json())
      else {
        const d = await res.json().catch(() => ({}))
        setLoadError((d as { error?: string }).error || `The staff list could not be loaded (HTTP ${res.status}).`)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setPage(1) }, [filters, sortCol, sortDir])

  // Escape closes the staff details panel.
  useEffect(() => {
    if (!selectedStaff) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedStaff(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedStaff])

  // ── Filtered + sorted view ────────────────────────────────────────────────
  // Built from the FULL list, not the filtered one: filtering out a mentor must
  // not blank the Mentee badge on someone still in view.
  const mentorOf = useMemo(() => buildMentorIndex(staff), [staff])

  const displayed = staff
    .filter(s => {
      if (autoBranch && s.branch !== autoBranch) return false
      const name = `${s.lastName} ${s.firstName}`.toLowerCase()
      if (filters.name       && !name.includes(filters.name.toLowerCase()))                          return false
      if (filters.department && s.department !== filters.department)                                  return false
      if (filters.branch     && s.branch !== filters.branch)                                          return false
      if (filters.email      && !(s.email  ?? '').toLowerCase().includes(filters.email.toLowerCase())) return false
      if (filters.phone      && !(s.phone  ?? '').includes(filters.phone))                            return false
      if (filters.jobTitle   && !(s.jobTitle ?? '').toLowerCase().includes(filters.jobTitle.toLowerCase())) return false
      if (filters.sex        && (s.sex ?? '') !== filters.sex) return false
      if (filters.employmentType && (s.employmentType ?? '') !== filters.employmentType) return false
      return true
    })
    .sort((a, b) => {
      let va = '', vb = ''
      switch (sortCol) {
        case 'name':       va = `${a.lastName} ${a.firstName}`;  vb = `${b.lastName} ${b.firstName}`; break
        case 'department': va = a.department;                     vb = b.department;                   break
        case 'branch':     va = a.branch;                         vb = b.branch;                       break
        case 'sex':        va = a.sex ?? '';                      vb = b.sex ?? '';                    break
        case 'email':      va = a.email ?? '';                    vb = b.email ?? '';                  break
        case 'phone':      va = a.phone ?? '';                    vb = b.phone ?? '';                  break
        case 'jobTitle':   va = a.jobTitle ?? '';                  vb = b.jobTitle ?? '';                break
        case 'employmentType': va = a.employmentType ?? ''; vb = b.employmentType ?? ''; break
        default:
          return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      }
      const cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    })

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortProps = { sortCol, sortDir, onSort: toggleSort }

  // ── Headline numbers — from the roster already loaded, no extra request ──
  // Scoped the same way the list is (branch-locked roles see their own branch).
  const stats = useMemo(() => {
    const inScope = autoBranch ? staff.filter(s => s.branch === autoBranch) : staff
    const byDept = new Map<string, number>()
    let employees = 0, consultants = 0, interns = 0, unset = 0, interbranch = 0, east = 0, greenhills = 0
    for (const s of inScope) {
      byDept.set(s.department, (byDept.get(s.department) ?? 0) + 1)
      if (s.employmentType === 'employee') employees++
      else if (s.employmentType === 'consultant') consultants++
      else if (s.employmentType === 'intern') interns++
      else if (!s.employmentType) unset++
      if ((s.extraBranches ?? []).some(b => b !== s.branch)) interbranch++
      if (s.branch === 'SBEA') east++
      if (s.branch === 'SBGH') greenhills++
    }
    const depts = DEPARTMENTS.map(d => [d, byDept.get(d) ?? 0] as const).filter(([, n]) => n > 0)
    return { total: inScope.length, employees, consultants, interns, unset, interbranch, east, greenhills, depts }
  }, [staff, autoBranch])

  // ── Merge handler ─────────────────────────────────────────────────────────
  async function handleMerge() {
    if (!mergeGroup || !mergeKeepId) return
    const deleteIds = mergeGroup.filter(s => s.id !== mergeKeepId).map(s => s.id)
    setMerging(true)
    setMergeError(null)
    const notes = new Set<string>()
    for (const deleteId of deleteIds) {
      const res = await fetch('/api/staff/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: mergeKeepId, deleteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Each merge is all-or-nothing, but in a group of three an earlier one may have gone through.
        setMergeError(data.error ?? `Merge failed (HTTP ${res.status})`)
        setMerging(false)
        load()
        return
      }
      setMergeGroup(g => g?.filter(s => s.id !== deleteId) ?? null)
      for (const n of (data.notes ?? []) as string[]) notes.add(n)
    }
    setMerging(false)
    setMergeGroup(null)
    setMergeKeepId('')
    setMergeNotes(notes.size ? [...notes] : null)
    load()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const existingDuplicates   = findExistingDuplicates(staff)
  const paginatedDisplayed   = displayed.slice((page - 1) * pageSize, page * pageSize)
  const totalPages           = Math.max(1, Math.ceil(displayed.length / pageSize))

  const initialLoad   = loading && staff.length === 0 && !loadError
  const activeFilters = (Object.keys(filters) as (keyof typeof filters)[])
    .filter(k => filters[k] && !(k === 'branch' && autoBranch)).length
  const moreFiltersActive = [filters.jobTitle, filters.email, filters.phone].filter(Boolean).length
  const moreOpen = showMoreFilters || moreFiltersActive > 0
  const clearFilters = () => setFilters(EMPTY_FILTERS)
  const setFilter = (k: keyof typeof EMPTY_FILTERS, v: string) => setFilters(f => ({ ...f, [k]: v }))

  const scopeHint = autoBranch
    ? `This roster is scoped to ${branchLabel(autoBranch) || autoBranch}. Staff who belong only to another branch won't appear here.`
    : 'The staff list is branch-scoped, so a roster outside your branch can come back empty rather than as an error.'

  const branchPills: { key: string; label: string; count: number }[] = [
    { key: '', label: 'All branches', count: stats.total },
    { key: 'SBEA', label: branchLabel('SBEA') || 'AHEA', count: stats.east },
    { key: 'SBGH', label: branchLabel('SBGH') || 'AHGH', count: stats.greenhills },
  ]

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 min-w-0">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Clinic Tools
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Staff Module
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Everyone on the clinic roster, with their department, branch and contact details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {autoBranch && (
            <span className={`${CONTROL} inline-flex items-center gap-1.5`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
              <Building2 size={13} /> Branch: <strong style={{ color: 'var(--charcoal)' }}>{BRANCH_CODE[autoBranch] ?? autoBranch}</strong>
            </span>
          )}
          {/* Manual HR pull. Kept as a quiet secondary button — same handler, same
              endpoint, no confirm added or removed. */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className={BTN_SECONDARY}
            style={CONTROL_STYLE}
            title="Pull the latest staff records from the HR Platform"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} />
            {syncing ? 'Syncing...' : 'Sync from HR'}
          </button>
        </div>
      </div>

      {/* Where the data comes from, said plainly. */}
      <div className="flex items-start gap-2.5 rounded-xl px-4 py-2.5" style={{ background: '#F1F7F8', border: '1px solid #CFE3E6' }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
        <p className="text-[13px] leading-relaxed m-0" style={{ color: '#12606C' }}>
          Staff data synced from the HR Platform. Syncing is manual, and inactive staff are left out of the HR feed.
          Update staff profiles at{' '}
          <span className="font-semibold">hr.sapphireclinicseast.org</span>.
        </p>
      </div>

      {/* Anything the sync could not do. Previously discarded: the endpoint has
          always returned errors[] and nothing rendered it, so a sync that
          skipped work still showed a plain green "complete". */}
      {syncResult && (syncResult.errors?.length ?? 0) > 0 && (
        <div role="alert" className="rounded-xl px-4 py-3 flex items-start gap-2.5" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
          <div className="min-w-0">
            <p className="text-xs font-bold mb-1" style={{ color: '#991B1B' }}>
              {syncResult.errors!.length} thing{syncResult.errors!.length === 1 ? '' : 's'} the sync did not do
            </p>
            <ul className="text-[11.5px] list-disc pl-4 space-y-0.5" style={{ color: '#7F1D1D' }}>
              {syncResult.errors!.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2.5"
          style={{ background: '#ECFDF5', border: '1px solid #BBF7D0' }}>
          <CheckCircle2 size={15} className="flex-shrink-0" style={{ color: '#065F46' }} />
          <span className="text-xs font-semibold" style={{ color: '#065F46' }}>
            Sync complete: {syncResult.created} created, {syncResult.updated} updated{syncResult.deactivated > 0 ? `, ${syncResult.deactivated} deactivated (no longer in HR — records kept)` : ''} ({syncResult.total} staff from HR Platform)
          </span>
          <button onClick={() => setSyncResult(null)} aria-label="Dismiss" className="ml-auto p-1 rounded hover:bg-green-100">
            <X size={13} style={{ color: '#065F46' }} />
          </button>
        </div>
      )}

      {/* Merge follow-ups — things the merge cannot do in HR Platform / Accounting Hub */}
      {mergeNotes && (
        <div className="rounded-xl px-4 py-3" style={{ background: '#ECFDF5', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-2.5 mb-1">
            <CheckCircle2 size={15} style={{ color: '#065F46' }} />
            <span className="text-xs font-semibold" style={{ color: '#065F46' }}>Merge complete. Outside this app:</span>
            <button onClick={() => setMergeNotes(null)} aria-label="Dismiss" className="ml-auto p-1 rounded hover:bg-green-100">
              <X size={13} style={{ color: '#065F46' }} />
            </button>
          </div>
          <ul className="text-[11.5px] list-disc pl-10 space-y-0.5" style={{ color: '#065F46' }}>
            {mergeNotes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      {/* ── KPIs ── */}
      {!(loadError && staff.length === 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {initialLoad ? (
            Array.from({ length: 4 }).map((_, n) => (
              <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-14 mt-2" />
                <Skeleton className="h-3 w-24 mt-2" />
              </div>
            ))
          ) : (
            <>
              <KpiCard
                label={autoBranch ? `${BRANCH_CODE[autoBranch] ?? autoBranch} Staff` : 'Total Staff'}
                icon={<Users size={16} />} value={stats.total}
                sub={autoBranch ? branchLabel(autoBranch) : `${stats.east} East · ${stats.greenhills} Greenhills`} />
              <KpiCard label="Employees" icon={<UserCheck size={16} />} accent={EMP_TONE.employee.fg} value={stats.employees}
                sub={stats.total ? `${Math.round((stats.employees / stats.total) * 100)}% of roster` : 'On payroll'} />
              <KpiCard label="Consultants" icon={<Briefcase size={16} />} accent={EMP_TONE.consultant.fg} value={stats.consultants}
                sub={[stats.interns ? `${stats.interns} intern${stats.interns === 1 ? '' : 's'}` : '', stats.unset ? `${stats.unset} not set` : '']
                  .filter(Boolean).join(' · ') || 'Per-session clinicians'} />
              <KpiCard label="Interbranch" icon={<ArrowLeftRight size={16} />} accent="var(--gold)" value={stats.interbranch}
                sub="Also work at the other branch" />
            </>
          )}
        </div>
      )}

      {/* ── Pending duplicates ── */}
      {existingDuplicates.length > 0 && (
        <section className="rounded-xl overflow-hidden min-w-0" style={{ background: '#fff', border: '1px solid #FED7AA' }}>
          <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
            style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} style={{ color: '#EA580C' }} />
              <span className="font-bold text-[14px]" style={{ color: '#9A3412', fontFamily: 'var(--font-display)' }}>
                Pending Duplicates — {existingDuplicates.length} group{existingDuplicates.length !== 1 ? 's' : ''} found
              </span>
            </div>
            <span className="text-xs" style={{ color: '#B45309' }}>
              Merge to consolidate records and preserve all schedules
            </span>
          </header>
          <ul>
            {existingDuplicates.map((group, idx) => (
              <li key={idx} className="flex flex-wrap items-center gap-3 px-5 py-3"
                style={{ borderTop: idx ? '1px solid #FFEDD5' : undefined }}>
                {group.map((s, si) => (
                  <div key={s.id} className="flex items-center gap-2 min-w-0">
                    {si > 0 && <span className="text-[11px] font-bold uppercase" style={{ color: '#EA580C' }}>vs</span>}
                    <Avatar s={s} size={26} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {s.lastName}, {s.firstName}
                    </span>
                    <DeptBadge dept={s.department} />
                    <BranchChip branch={s.branch} />
                  </div>
                ))}
                <button
                  onClick={() => {
                    const defaultKeep = [...group].sort((a, b) => b.firstName.length - a.firstName.length)[0]
                    setMergeKeepId(defaultKeep.id)
                    setMergeError(null)
                    setMergeGroup(group)
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-orange-50"
                  style={{ background: '#fff', color: '#C2410C', border: '1px solid #FDBA74' }}
                >
                  <GitMerge size={13} /> Merge
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Toolbar ── */}
      <div className="rounded-xl px-4 py-3 space-y-3" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input value={filters.name} onChange={e => setFilter('name', e.target.value)} aria-label="Search staff by name"
              placeholder="Search by name…"
              className={`${CONTROL} w-full pl-8 ${filters.name ? 'pr-8' : ''}`} style={CONTROL_STYLE} />
            {filters.name && (
              <button type="button" onClick={() => setFilter('name', '')} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
                <X size={13} />
              </button>
            )}
          </div>
          <select value={filters.department} onChange={e => setFilter('department', e.target.value)}
            aria-label="Department" className={CONTROL} style={CONTROL_STYLE}>
            <option value="">All departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
          </select>
          {/* Employment — synced from HR Platform Staff Profile */}
          <select value={filters.employmentType} onChange={e => setFilter('employmentType', e.target.value)}
            aria-label="Employment type" className={CONTROL} style={CONTROL_STYLE}>
            <option value="">Any employment</option>
            <option value="employee">Employee</option>
            <option value="consultant">Consultant</option>
          </select>
          <select value={filters.sex} onChange={e => setFilter('sex', e.target.value)}
            aria-label="Sex" className={CONTROL} style={CONTROL_STYLE}>
            <option value="">Any sex</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          <button type="button" onClick={() => setShowMoreFilters(v => !v)} aria-expanded={moreOpen}
            className={`${BTN_SECONDARY} text-xs`} style={{ ...CONTROL_STYLE, color: moreOpen ? 'var(--teal)' : 'var(--charcoal)' }}>
            <SlidersHorizontal size={13} /> More filters
            {moreFiltersActive > 0 && <span className="tabular-nums" style={{ opacity: 0.7 }}>({moreFiltersActive})</span>}
          </button>
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className={`${BTN_SECONDARY} text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
              <X size={12} /> Clear
              <span className="ml-0.5 px-1.5 rounded-full text-[10.5px] tabular-nums" style={{ background: 'var(--teal)', color: '#fff' }}>{activeFilters}</span>
            </button>
          )}
        </div>

        {moreOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input type="text" placeholder="Job title contains…" value={filters.jobTitle ?? ''} aria-label="Filter by job title"
              onChange={e => setFilter('jobTitle', e.target.value)} className={CONTROL} style={CONTROL_STYLE} />
            <input type="text" placeholder="Email contains…" value={filters.email} aria-label="Filter by email"
              onChange={e => setFilter('email', e.target.value)} className={CONTROL} style={CONTROL_STYLE} />
            <input type="text" placeholder="Mobile contains…" value={filters.phone} aria-label="Filter by mobile"
              onChange={e => setFilter('phone', e.target.value)} className={CONTROL} style={CONTROL_STYLE} />
          </div>
        )}

        {/* Branch switcher (admins) and the department mix of the roster. */}
        {!initialLoad && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!autoBranch && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch filter">
                {branchPills.map(p => {
                  const on = filters.branch === p.key
                  return (
                    <button key={p.key || 'all'} type="button" aria-pressed={on} onClick={() => setFilter('branch', p.key)}
                      className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${on ? '' : 'hover:bg-gray-50'}`}
                      style={on
                        ? { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }
                        : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                      {p.label}
                      <span className="ml-1.5 tabular-nums" style={{ opacity: on ? 0.8 : 0.55 }}>{p.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {stats.depts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>By department</span>
                {stats.depts.map(([d, n]) => {
                  const on = filters.department === d
                  const c = deptColor(d)
                  return (
                    <button key={d} type="button" aria-pressed={on}
                      onClick={() => setFilter('department', on ? '' : d)}
                      title={on ? 'Show all departments' : `Show ${deptLabel(d)} only`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 transition-colors"
                      style={on
                        ? { background: c, color: '#fff', border: `1px solid ${c}` }
                        : { background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                      {deptLabel(d)} <span className="tabular-nums" style={{ color: on ? '#fff' : c }}>{n}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reload failed but an earlier roster is still on screen. */}
      {loadError && staff.length > 0 && (
        <div role="alert" className="rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-2.5" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertTriangle size={15} className="flex-shrink-0" style={{ color: '#DC2626' }} />
          <span className="text-xs font-semibold" style={{ color: '#991B1B' }}>
            Couldn&rsquo;t refresh the staff list: {loadError} The list below may be out of date.
          </span>
          <button onClick={load} disabled={loading} className={`${BTN_SECONDARY} ml-auto h-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Try again
          </button>
        </div>
      )}

      {/* ── Staff list ── */}
      {loadError && staff.length === 0 ? (
        <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
          <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t load the staff list</p>
          <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: '#991B1B' }}>{loadError}</p>
          <button onClick={load} disabled={loading} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Try again
          </button>
        </div>
      ) : (
        <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
          <header className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <h2 className="text-[14px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {initialLoad ? 'Staff' : activeFilters > 0
                ? `${displayed.length} of ${stats.total} staff`
                : `${displayed.length} staff member${displayed.length === 1 ? '' : 's'}`}
              {loading && !initialLoad && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {canViewStaffDetails ? 'Click a name for the full HR profile' : 'Sorted by last name · click a column to sort'}
            </span>
          </header>

          {initialLoad ? (
            <div aria-hidden>
              {Array.from({ length: 7 }).map((_, n) => (
                <div key={n} className="flex items-center gap-5 px-5 py-3.5" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                  <div className="flex items-center gap-3 w-64">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2 mt-1.5" /></div>
                  </div>
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <div className="flex-1"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3.5 w-28 mt-1.5" /></div>
                </div>
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center">
              {activeFilters > 0
                ? <SearchX size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                : <UserCog size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />}
              <EmptyState
                title={activeFilters > 0 ? 'No staff match these filters' : 'No staff on this roster yet'}
                hint={activeFilters > 0
                  ? 'Try a different name or department, or clear the filters.'
                  : `${scopeHint} Staff come from the HR Platform — "Sync from HR" pulls the latest records.`} />
              {activeFilters > 0 && (
                <button type="button" onClick={clearFilters}
                  className={`${BTN_SECONDARY} -mt-6 mb-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 940 }}>
                  <thead>
                    <tr style={{ background: SUBTLE_BG }}>
                      <th className="px-5 py-2 text-left" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                        <span className="inline-flex items-center gap-2">
                          <SortHead col="name" label="Name" {...sortProps} />
                          <span style={{ color: 'var(--light-gray)' }}>·</span>
                          <SortHead col="jobTitle" label="Position" {...sortProps} />
                        </span>
                      </th>
                      <th className="px-4 py-2 text-left" style={{ borderBottom: '1px solid var(--light-gray)' }}><SortHead col="department" label="Department" {...sortProps} /></th>
                      <th className="px-4 py-2 text-left" style={{ borderBottom: '1px solid var(--light-gray)' }}><SortHead col="employmentType" label="Employment" {...sortProps} /></th>
                      <th className="px-4 py-2 text-left" style={{ borderBottom: '1px solid var(--light-gray)' }}><SortHead col="branch" label="Branch" {...sortProps} /></th>
                      <th className="px-4 py-2 text-left" style={{ borderBottom: '1px solid var(--light-gray)' }}><SortHead col="sex" label="Sex" {...sortProps} /></th>
                      <th className="px-4 py-2 text-left" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                        <span className="inline-flex items-center gap-2">
                          <SortHead col="email" label="Email" {...sortProps} />
                          <span style={{ color: 'var(--light-gray)' }}>·</span>
                          <SortHead col="phone" label="Mobile" {...sortProps} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDisplayed.map((s, n) => (
                      <tr key={s.id} style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}
                        className="hover:bg-[#F8FAF9] transition-colors align-middle">
                        {/* Who */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar s={s} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                {canViewStaffDetails ? (
                                  <button
                                    onClick={() => setSelectedStaff(s)}
                                    className="text-left text-[13.5px] font-semibold transition-colors hover:underline hover:text-[var(--teal)]"
                                    style={{ color: 'var(--charcoal)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                                    title="Click to view full HR profile">
                                    {s.lastName}, {s.firstName}
                                  </button>
                                ) : (
                                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                                    {s.lastName}, {s.firstName}
                                  </span>
                                )}
                                <RoleBadges staff={s} mentorName={mentorOf.get(s.id)} compact />
                              </div>
                              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>
                                {s.jobTitle ? prettyTitle(s.jobTitle) : 'No position recorded'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><DeptBadge dept={s.department} /></td>
                        <td className="px-4 py-3">
                          {(() => {
                            const empMap = s.branchEmployment ?? {}
                            const entries = Object.entries(empMap).filter(([, v]) => v?.employmentType)
                            const types = new Set(entries.map(([, v]) => v.employmentType))
                            if (entries.length >= 2 && types.size >= 2) {
                              return (
                                <div className="flex flex-col gap-1">
                                  {entries.map(([br, v]) => (
                                    <div key={br} className="flex items-center gap-1 whitespace-nowrap">
                                      <EmploymentBadge type={v.employmentType!} size="xs" />
                                      <span className="text-[10.5px] font-semibold" style={{ color: 'var(--mid-gray)' }}>
                                        at {BRANCH_CODE[br] ?? branchLabel(br) ?? br}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            return s.employmentType
                              ? <EmploymentBadge type={s.employmentType} />
                              : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <BranchChip branch={s.branch} />
                            {(s.extraBranches ?? []).filter(b => b !== s.branch).map(b => (
                              <BranchChip key={b} branch={b} extra />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <SexSelect staffId={s.id} value={s.sex} onChange={(v) => setStaff(prev => prev.map(x => x.id === s.id ? { ...x, sex: v } : x))} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5 min-w-0 max-w-[240px]">
                            {s.email ? (
                              <a href={`mailto:${s.email}`} title={s.email}
                                className="flex items-center gap-1.5 text-xs hover:underline min-w-0" style={{ color: 'var(--teal)' }}>
                                <Mail size={12} className="flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />
                                <span className="truncate">{s.email}</span>
                              </a>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                                <Mail size={12} className="flex-shrink-0" /> —
                              </span>
                            )}
                            {s.phone ? (
                              <a href={`tel:${s.phone.replace(/\s+/g, '')}`}
                                className="flex items-center gap-1.5 text-xs hover:underline tabular-nums" style={{ color: 'var(--teal)' }}>
                                <Phone size={12} className="flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />
                                <span className="truncate">{s.phone}</span>
                              </a>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                                <Phone size={12} className="flex-shrink-0" /> —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"
                style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                  Rows per page
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="h-7 px-2 rounded-md text-xs outline-none"
                    style={CONTROL_STYLE}
                  >
                    {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                    {displayed.length === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, displayed.length)}`} of {displayed.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                      className="h-7 px-2.5 rounded-md text-xs font-semibold transition-colors hover:bg-gray-50 disabled:hover:bg-transparent"
                      style={{ ...CONTROL_STYLE, color: page === 1 ? 'var(--mid-gray)' : 'var(--teal)', opacity: page === 1 ? 0.6 : 1 }}>
                      ‹ Prev
                    </button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                      className="h-7 px-2.5 rounded-md text-xs font-semibold transition-colors hover:bg-gray-50 disabled:hover:bg-transparent"
                      style={{ ...CONTROL_STYLE, color: page >= totalPages ? 'var(--mid-gray)' : 'var(--teal)', opacity: page >= totalPages ? 0.6 : 1 }}>
                      Next ›
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Staff Details Modal — surfaces every field synced from HR Hub.
          Visible ONLY to ADMIN / AHEA_ADMIN / AHGH_ADMIN. Defense-in-depth:
          even if a non-admin somehow set selectedStaff, the modal won't render. */}
      {selectedStaff && canViewStaffDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
             onClick={() => setSelectedStaff(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="staff-detail-title"
               className="bg-white rounded-xl w-full max-w-[720px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 py-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <Avatar s={selectedStaff} size={46} />
                <div className="min-w-0">
                  <h3 id="staff-detail-title" className="text-lg font-bold leading-snug" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                    {selectedStaff.lastName}, {selectedStaff.firstName}
                  </h3>
                  {selectedStaff.jobTitle && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{prettyTitle(selectedStaff.jobTitle)}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <DeptBadge dept={selectedStaff.department} />
                    <BranchChip branch={selectedStaff.branch} />
                    {(selectedStaff.extraBranches ?? []).filter(b => b !== selectedStaff.branch).map(b => (
                      <BranchChip key={b} branch={b} extra />
                    ))}
                    {selectedStaff.employmentType && <EmploymentBadge type={selectedStaff.employmentType} size="xs" />}
                    <RoleBadges staff={selectedStaff} mentorName={mentorOf.get(selectedStaff.id)} />
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedStaff(null)} aria-label="Close" autoFocus
                      className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100"
                      style={{ color: 'var(--mid-gray)' }}
                      title="Close">
                <X size={16} />
              </button>
            </div>

            {/* Body — sections of fields */}
            <div className="overflow-y-auto min-h-0 text-sm">
              <DetailSection icon={<Briefcase size={12} />} title="Role">
                {(() => {
                  const empMap = selectedStaff.branchEmployment ?? {}
                  const entries = Object.entries(empMap).filter(([, v]) => v?.employeeId)
                  const uniqueIds = new Set(entries.map(([, v]) => v.employeeId))
                  if (entries.length >= 2 && uniqueIds.size >= 2) {
                    return entries.map(([br, v]) => (
                      <DetailRow key={br}
                        label={`Employee ID (${branchLabel(br) ?? br})`}
                        value={v.employeeId ?? null}
                        mono />
                    ))
                  }
                  return <DetailRow label="Employee ID" value={selectedStaff.employeeId} mono />
                })()}
                <DetailRow label="Job Title"       value={selectedStaff.jobTitle ? prettyTitle(selectedStaff.jobTitle) : null} />
                <DetailRow label="Department"      value={selectedStaff.department.replace(/_/g, ' ')} />
                <DetailRow label="Primary Branch"  value={branchLabel(selectedStaff.branch) || selectedStaff.branch} />
                {role === 'ADMIN'
                  ? <ExtraBranchToggle
                      staffId={selectedStaff.id}
                      primaryBranch={selectedStaff.branch}
                      value={selectedStaff.extraBranches ?? []}
                      onChange={(v) => {
                        setSelectedStaff(s => s ? { ...s, extraBranches: v } : s)
                        setStaff(prev => prev.map(x => x.id === selectedStaff.id ? { ...x, extraBranches: v } : x))
                      }}
                    />
                  : (selectedStaff.extraBranches ?? []).filter(b => b !== selectedStaff.branch).length > 0
                    ? <DetailRow label="Also at" value={(selectedStaff.extraBranches ?? []).filter(b => b !== selectedStaff.branch).join(', ')} />
                    : null
                }
                <DetailRow label="Employment"      value={selectedStaff.employmentType ? capitalise(selectedStaff.employmentType) : null} />
              </DetailSection>

              <DetailSection icon={<Contact size={12} />} title="Contact">
                <DetailRow label="Email"     value={selectedStaff.email} />
                <DetailRow label="Phone"     value={selectedStaff.phone} mono />
                <DetailRow label="Birthday"  value={selectedStaff.dob ? new Date(selectedStaff.dob).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                <DetailRow label="Sex"       value={selectedStaff.sex} />
              </DetailSection>

              <DetailSection icon={<IdCard size={12} />} title="Government IDs" sensitive
                             note="Sensitive — synced one-way from HR Hub. Edit in HR Platform.">
                <DetailRow label="TIN"        value={selectedStaff.tin} mono />
                <DetailRow label="SSS"        value={selectedStaff.sss} mono />
                <DetailRow label="Pag-IBIG"   value={selectedStaff.pagibig} mono />
                <DetailRow label="PhilHealth" value={selectedStaff.philhealth} mono />
              </DetailSection>

              <DetailSection icon={<Landmark size={12} />} title="Banking" sensitive
                             note="Sensitive — synced one-way from HR Hub. Edit in HR Platform.">
                <DetailRow label="Bank Name"        value={selectedStaff.bankName} />
                <DetailRow label="Bank Account No." value={selectedStaff.bankAccountNo} mono />
              </DetailSection>

              <DetailSection icon={<Database size={12} />} title="System">
                <DetailRow label="HR Platform ID" value={selectedStaff.hrPlatformId} mono small />
                <DetailRow label="Created"        value={selectedStaff.createdAt ? new Date(selectedStaff.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null} small />
                {selectedStaff.updatedAt && (
                  <DetailRow label="Last Synced"  value={new Date(selectedStaff.updatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} small />
                )}
              </DetailSection>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3"
                 style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <p className="text-[11px] flex-1 min-w-[220px]" style={{ color: 'var(--mid-gray)' }}>
                All fields except Sex and Extra Branches flow one-way from HR Hub. To edit, use the HR Platform Staff Profile.
              </p>
              <button onClick={() => setSelectedStaff(null)}
                      className={BTN_PRIMARY}
                      style={{ background: 'var(--teal)' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="staff-merge-title"
               className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-start gap-3 px-6 pt-5 pb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <GitMerge size={18} style={{ color: '#EA580C' }} />
              </div>
              <div className="min-w-0">
                <p id="staff-merge-title" className="font-bold text-[15px]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                  Merge Duplicate Staff
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                  Select which record to keep. Keep the one HR Platform keeps, and the one with the staff portal login.
                </p>
              </div>
            </div>

            <div className="px-6 space-y-2 mb-4">
              {mergeGroup.map(s => (
                <label key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                  style={{
                    border: mergeKeepId === s.id ? '1.5px solid #F97316' : '1.5px solid var(--light-gray)',
                    background: mergeKeepId === s.id ? '#FFF7ED' : '#fff',
                  }}>
                  <input type="radio" name="mergeKeep" value={s.id}
                    checked={mergeKeepId === s.id}
                    onChange={() => setMergeKeepId(s.id)}
                    style={{ accentColor: '#F97316' }}
                  />
                  <Avatar s={s} size={30} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {s.lastName}, {s.firstName}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <DeptBadge dept={s.department} />
                      <BranchChip branch={s.branch} />
                    </div>
                  </div>
                  {mergeKeepId === s.id && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: '#F97316', color: '#fff' }}>Keep</span>
                  )}
                </label>
              ))}
            </div>

            <div className="mx-6 mb-4 rounded-lg px-3 py-2.5 flex gap-2" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
              <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--mid-gray)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                Schedules, bookings, decking, surveys, peer evaluations and the staff portal login move to the kept record,
                which also takes on the other record&apos;s branch (interbranch). The other record is then permanently deleted.
              </p>
            </div>

            {mergeError && (
              <div role="alert" className="mx-6 rounded-lg px-3 py-2 mb-4 text-xs flex gap-2"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#7F1D1D' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{mergeError}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end px-6 py-3" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <button onClick={() => { setMergeGroup(null); setMergeKeepId(''); setMergeError(null) }}
                className={BTN_SECONDARY}
                style={CONTROL_STYLE}>
                Cancel
              </button>
              <button onClick={handleMerge} disabled={!mergeKeepId || merging}
                className={BTN_PRIMARY}
                style={{ background: '#EA580C', opacity: (!mergeKeepId || merging) ? 0.7 : 1 }}>
                <GitMerge size={14} />
                {merging ? 'Merging…' : 'Merge & Remove Duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Staff details modal helpers ──────────────────────────────────
function DetailSection({ icon, title, note, sensitive = false, children }: {
  icon: ReactNode; title: string; note?: string; sensitive?: boolean; children: React.ReactNode
}) {
  return (
    <section className="px-6 py-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <h4 className={`flex items-center gap-1.5 mb-2.5 ${SECTION_LABEL}`} style={{ color: 'var(--mid-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>{title}
        {sensitive && (
          <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full normal-case tracking-normal text-[10px] font-semibold"
            style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
            <ShieldCheck size={10} /> Sensitive
          </span>
        )}
      </h4>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
        <div className="divide-y divide-[var(--light-gray)]">
          {children}
        </div>
      </div>
      {note && (
        <p className="text-[11px] mt-1.5 px-1 italic" style={{ color: 'var(--mid-gray)' }}>{note}</p>
      )}
    </section>
  )
}

function DetailRow({ label, value, mono, small }: { label: string; value: string | null | undefined; mono?: boolean; small?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-2.5" style={{ background: '#fff' }}>
      <span className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--mid-gray)' }}>{label}</span>
      <span className={small ? 'text-[12px]' : 'text-[13px]'}
            style={{
              color: value ? 'var(--charcoal)' : 'var(--mid-gray)',
              fontFamily: mono && value ? MONO : undefined,
              wordBreak: 'break-all',
            }}>
        {value && value.toString().trim().length > 0 ? value : '—'}
      </span>
    </div>
  )
}
