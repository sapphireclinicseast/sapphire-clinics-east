'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Users } from 'lucide-react'
import { useBranchSwitcher } from '@/components/BranchSwitcher'
import {
  Avatar, DashCard, EmptyState, Icon, PageHeader, PillTabs, RowsSkeleton, StatusPill, Tag,
  CONTROL, CONTROL_STYLE, FOCUS, PAGE,
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

export default function PatientsPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<PatientItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // READONLY covers DEACTIVATED and its legacy alias ENDORSED. The old
  // "Endorsed" tab matched ENDORSED only, so DEACTIVATED patients (the
  // current status) never appeared under any tab but All.
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'READONLY' | 'DISCHARGED'>('ALL')
  const { isMultiBranch, sharedStaffId, activeStaffId, activeBranch } = useBranchSwitcher()

  useEffect(() => {
    if (activeStaffId) fetchPatients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeStaffId, activeBranch?.branch])

  async function fetchPatients() {
    setLoading(true)
    try {
      const staffParam = isMultiBranch && activeStaffId ? `&staffId=${activeStaffId}` : ''
      const branchParam = sharedStaffId && activeBranch ? `&patientBranch=${activeBranch.branch}` : ''
      const res = await fetch(`/api/patients?search=${encodeURIComponent(search)}${staffParam}${branchParam}`)
      if (res.ok) {
        const data = await res.json()
        setPatients(data.patients)
      }
    } catch {}
    setLoading(false)
  }

  const isReadOnly = (s: string) => s === 'DEACTIVATED' || s === 'ENDORSED' || s === 'DISCHARGED'
  const inTab = (p: PatientItem, f: typeof filter) =>
    f === 'ALL' ? true
    : f === 'READONLY' ? (p.assignmentStatus === 'DEACTIVATED' || p.assignmentStatus === 'ENDORSED')
    : p.assignmentStatus === f
  const filtered = patients.filter((p) => inTab(p, filter))
  const count = (f: typeof filter) => patients.filter((p) => inTab(p, f)).length

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
        title={<>Your patients{!loading && <span className="ml-1.5 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>{patients.length}</span>}</>}
        icon={<Users size={16} />}
        flush
        action={
          <PillTabs
            label="Filter patients"
            size="sm"
            value={filter}
            onChange={(id) => setFilter(id as typeof filter)}
            tabs={[
              { id: 'ALL', label: 'All', count: patients.length },
              { id: 'ACTIVE', label: 'Active', count: count('ACTIVE') },
              { id: 'READONLY', label: 'Read-only', count: count('READONLY'), title: 'Previously assigned — notes stay viewable for continuity of care' },
              { id: 'DISCHARGED', label: 'Discharged', count: count('DISCHARGED') },
            ]}
          />
        }
      >
        {/* Search */}
        <div className="px-4 sm:px-5 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="relative">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              type="text"
              placeholder="Search patients by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search patients"
              className={`${CONTROL} w-full h-10 pl-9`}
              style={CONTROL_STYLE}
            />
          </div>
        </div>

        {loading ? (
          <RowsSkeleton rows={5} label="Loading patients" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={search ? 'search' : 'users'}
            title="No patients found"
            hint={search ? 'Try a different search term.' : filter !== 'ALL' ? 'No patients in this group.' : 'Confirmed sessions will appear here.'}
          />
        ) : (
          <ul>
            {filtered.map((patient, i) => {
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
                          {patient.lastName}, {patient.firstName}
                        </span>
                        {statusPill(patient.assignmentStatus)}
                        {/* Services availed — flags interdepartmental patients */}
                        {(patient.services ?? []).map((d) => (
                          <span key={d} title={`Also seen by ${d}`}><Tag tone="brand">{svcAbbr(d)}</Tag></span>
                        ))}
                      </div>
                      <p className="text-[12.5px] mt-1 truncate" style={{ color: 'var(--mid-gray)' }}>
                        {patient.patientType} {patient.diagnosis ? `· ${patient.diagnosis}` : ''}
                        {patient.email ? ` · ${patient.email}` : ''}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </DashCard>
    </div>
  )
}
