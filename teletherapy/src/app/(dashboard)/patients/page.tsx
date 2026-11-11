'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Users } from 'lucide-react'
import { useBranchSwitcher } from '@/components/BranchSwitcher'
import {
  Avatar, DashCard, EmptyState, Icon, PageHeader, PillTabs, RowsSkeleton, StatusPill, Tag,
  BTN_SECONDARY, CONTROL, CONTROL_STYLE, FOCUS, PAGE, SECONDARY_STYLE,
} from '@/components/hub/ui'

interface PatientItem {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  patientType: string
  diagnosis: string | null
  assignmentStatus: 'ACTIVE' | 'DEACTIVATED' | 'ENDORSED' | 'DISCHARGED'
  services?: string[]
}

// Short chip label for a department/service.
function svcAbbr(dept: string): string {
  const m: Record<string, string> = {
    PSYCHOLOGY: 'Psych', ADMINISTRATION: 'Admin', ORTHOSIS: 'Ortho',
  }
  return m[dept] ?? dept
}

/* Names and types are stored ALL CAPS; title-case for display (\p{L} + u keeps ñ). */
function niceName(name: string | null | undefined): string {
  const n = (name || '').trim()
  if (!n || n !== n.toUpperCase()) return n
  return n.toLowerCase().replace(/(^|[\s\-'.(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

const PAGE_SIZE = 100

export default function PatientsPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<PatientItem[]>([])
  const [loading, setLoading] = useState(true)
  // What's typed, and the debounced value that actually queries the API —
  // searching on every keystroke fired a request per letter, and a slower
  // older reply could land last and show results for the wrong text.
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const reqId = useRef(0)
  const [service, setService] = useState('ALL')
  const [ptype, setPtype] = useState('ALL')
  const [shown, setShown] = useState(PAGE_SIZE)
  // READONLY covers DEACTIVATED and its legacy alias ENDORSED. The old
  // "Endorsed" tab matched ENDORSED only, so DEACTIVATED patients (the
  // current status) never appeared under any tab but All.
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'READONLY' | 'DISCHARGED'>('ALL')
  const { isMultiBranch, sharedStaffId, activeStaffId, activeBranch } = useBranchSwitcher()

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (activeStaffId) fetchPatients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeStaffId, activeBranch?.branch])

  async function fetchPatients() {
    const id = ++reqId.current
    setLoading(true)
    try {
      const staffParam = isMultiBranch && activeStaffId ? `&staffId=${activeStaffId}` : ''
      const branchParam = sharedStaffId && activeBranch ? `&patientBranch=${activeBranch.branch}` : ''
      const res = await fetch(`/api/patients?search=${encodeURIComponent(search)}${staffParam}${branchParam}`)
      if (res.ok) {
        const data = await res.json()
        if (id !== reqId.current) return // a newer search has started
        setPatients(data.patients ?? [])
      }
    } catch {}
    if (id === reqId.current) setLoading(false)
  }

  const isReadOnly = (s: string) => s === 'DEACTIVATED' || s === 'ENDORSED' || s === 'DISCHARGED'
  const inTab = (p: PatientItem, f: typeof filter) =>
    f === 'ALL' ? true
    : f === 'READONLY' ? (p.assignmentStatus === 'DEACTIVATED' || p.assignmentStatus === 'ENDORSED')
    : p.assignmentStatus === f
  // Service + patient-type filters apply first; the tab counts reflect them.
  const services = useMemo(() => [...new Set(patients.flatMap((p) => p.services ?? []))].sort(), [patients])
  const types = useMemo(() => [...new Set(patients.map((p) => (p.patientType || '').toUpperCase()).filter(Boolean))].sort(), [patients])
  const scoped = patients.filter((p) =>
    (service === 'ALL' || (p.services ?? []).includes(service)) &&
    (ptype === 'ALL' || (p.patientType || '').toUpperCase() === ptype))
  const filtered = scoped.filter((p) => inTab(p, filter))
  const count = (f: typeof filter) => scoped.filter((p) => inTab(p, f)).length
  const visible = filtered.slice(0, shown)
  // Back to the first page whenever the list underneath changes.
  useEffect(() => { setShown(PAGE_SIZE) }, [search, filter, service, ptype, activeStaffId])

  const statusPill = (status: string) => {
    switch (status) {
      // DEACTIVATED = previously assigned, now read-only (continuity of care).
      // ENDORSED is a legacy alias for DEACTIVATED — treat the same.
      case 'DEACTIVATED':
      case 'ENDORSED':
        return <StatusPill tone="neutral" title="Read-only — view past notes for continuity of care">Read-only</StatusPill>
      case 'DISCHARGED':
        return <StatusPill tone="error">Discharged</StatusPill>
      default:
        return <StatusPill tone="success">Active</StatusPill>
    }
  }

  return (
    <div className={`${PAGE} !max-w-[960px]`}>
      <PageHeader
        eyebrow="Clinical"
        title="Patients"
        description="View session history, endorse, or discharge patients."
      />

      <DashCard
        title={<>Your patients{!loading && <span className="ml-1.5 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>{scoped.length}</span>}</>}
        icon={<Users size={16} />}
        flush
        action={
          <PillTabs
            label="Filter patients"
            size="sm"
            value={filter}
            onChange={(id) => setFilter(id as typeof filter)}
            tabs={[
              { id: 'ALL', label: 'All', count: scoped.length },
              { id: 'ACTIVE', label: 'Active', count: count('ACTIVE') },
              { id: 'READONLY', label: 'Read-only', count: count('READONLY'), title: 'Previously assigned — notes stay viewable for continuity of care' },
              { id: 'DISCHARGED', label: 'Discharged', count: count('DISCHARGED') },
            ]}
          />
        }
      >
        {/* Search */}
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              type="text"
              placeholder="Search patients by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search patients"
              className={`${CONTROL} w-full h-10 pl-9`}
              style={CONTROL_STYLE}
            />
          </div>
          {services.length > 1 && (
            <select aria-label="Service" value={service} onChange={(e) => setService(e.target.value)} className={`${CONTROL} h-10`} style={CONTROL_STYLE}>
              <option value="ALL">All services</option>
              {services.map((d) => <option key={d} value={d}>{svcAbbr(d)}</option>)}
            </select>
          )}
          {types.length > 1 && (
            <select aria-label="Patient type" value={ptype} onChange={(e) => setPtype(e.target.value)} className={`${CONTROL} h-10`} style={CONTROL_STYLE}>
              <option value="ALL">All types</option>
              {types.map((t) => <option key={t} value={t}>{niceName(t)}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <RowsSkeleton rows={5} label="Loading patients" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={search ? 'search' : 'users'}
            title="No patients found"
            hint={search ? 'Try a different search term.' : (filter !== 'ALL' || service !== 'ALL' || ptype !== 'ALL') ? 'No patients match these filters.' : 'Confirmed sessions will appear here.'}
          />
        ) : (
          <>
          <ul>
            {visible.map((patient, i) => {
              const ro = isReadOnly(patient.assignmentStatus)
              return (
                <li key={patient.id} style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/patients/${patient.id}`)}
                    className={`group w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3.5 transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
                    title={ro ? 'Read-only — view past notes for continuity of care' : undefined}
                  >
                    <span className={ro ? 'opacity-55' : ''}>
                      <Avatar text={`${patient.firstName[0]}${patient.lastName[0]}`} size={38} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-[14.5px]" style={{ fontFamily: 'var(--font-display)', color: ro ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                          {niceName(patient.lastName)}, {niceName(patient.firstName)}
                        </span>
                        {statusPill(patient.assignmentStatus)}
                        {/* Services availed — flags interdepartmental patients */}
                        {(patient.services ?? []).map((d) => (
                          <span key={d} title={`Also seen by ${d}`}><Tag tone="brand">{svcAbbr(d)}</Tag></span>
                        ))}
                      </div>
                      <p className="text-[12.5px] mt-1 truncate" style={{ color: 'var(--mid-gray)' }}>
                        {niceName(patient.patientType)} {patient.diagnosis ? `· ${patient.diagnosis}` : ''}
                        {patient.email ? ` · ${patient.email}` : ''}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </li>
              )
            })}
          </ul>
          {filtered.length > PAGE_SIZE && (
            <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
              <p className="text-xs" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}
              </p>
              {visible.length < filtered.length && (
                <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                  Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
                </button>
              )}
            </div>
          )}
          </>
        )}
      </DashCard>
    </div>
  )
}
