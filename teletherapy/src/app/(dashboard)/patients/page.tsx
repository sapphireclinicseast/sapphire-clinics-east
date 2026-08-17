'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Users,
  Loader2,
  ChevronRight,
  UserCheck,
  UserX,
  ArrowRightLeft,
} from 'lucide-react'
import { useBranchSwitcher } from '@/components/BranchSwitcher'

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
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DEACTIVATED' | 'ENDORSED' | 'DISCHARGED'>('ALL')
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

  const filtered = filter === 'ALL' ? patients : patients.filter((p) => p.assignmentStatus === filter)

  const statusBadge = (status: string) => {
    switch (status) {
      // DEACTIVATED = previously assigned, now read-only (continuity of care).
      // ENDORSED is a legacy alias for DEACTIVATED — treat the same.
      case 'DEACTIVATED':
      case 'ENDORSED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--paper-2)] text-[var(--mid-gray)] border border-[var(--paper-3)]">
            <ArrowRightLeft size={11} />
            Read-only
          </span>
        )
      case 'DISCHARGED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
            <UserX size={11} />
            Discharged
          </span>
        )
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
            <UserCheck size={11} />
            Active
          </span>
        )
    }
  }
  const isReadOnly = (s: string) => s === 'DEACTIVATED' || s === 'ENDORSED' || s === 'DISCHARGED'

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Patients
          </h1>
          <p className="text-sm text-[var(--mid-gray)] mt-1">
            View session history, endorse, or discharge patients
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--pale-teal)]">
          <Users className="w-6 h-6 text-[var(--teal)]" />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 animate-fade-up stagger-1">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--mid-gray)]" />
        <input
          type="text"
          placeholder="Search patients by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input !pl-11 !rounded-xl"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 animate-fade-up stagger-2">
        {(['ALL', 'ACTIVE', 'ENDORSED', 'DISCHARGED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              filter === f
                ? 'bg-[var(--teal)] text-white shadow-sm'
                : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-[var(--light-gray)]'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            {f !== 'ALL' && (
              <span className="ml-1.5 opacity-70">
                ({patients.filter((p) => p.assignmentStatus === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Patient list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" />
          <p className="text-sm text-[var(--mid-gray)]">Loading patients...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-static text-center py-16 animate-fade-up">
          <Users className="w-12 h-12 text-[var(--light-gray)] mx-auto mb-3" />
          <p className="text-[var(--mid-gray)] font-medium">No patients found</p>
          <p className="text-sm text-[var(--mid-gray)] mt-1 opacity-70">
            {search ? 'Try a different search term' : 'Confirmed sessions will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((patient, i) => {
            const ro = isReadOnly(patient.assignmentStatus)
            return (
              <button
                key={patient.id}
                onClick={() => router.push(`/patients/${patient.id}`)}
                className={`card-static w-full text-left !p-4 hover:shadow-md hover:border-[var(--teal)]/30 transition-all active:scale-[0.995] animate-fade-up stagger-${Math.min(i + 3, 8)} ${
                  ro ? 'opacity-60 bg-[var(--paper-2)]/40' : ''
                }`}
                title={ro ? 'Read-only — view past notes for continuity of care' : undefined}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-full ${ro ? 'bg-[var(--paper-3)]' : 'bg-gradient-to-br from-[#cf9d88] to-[#c69849]'} flex items-center justify-center font-bold text-[13px] shrink-0 ${ro ? 'text-[var(--mid-gray)]' : 'text-white'}`}>
                    {patient.firstName[0]}{patient.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`font-semibold text-[14px] ${ro ? 'text-[var(--mid-gray)]' : 'text-[var(--charcoal)]'}`}>
                        {patient.lastName}, {patient.firstName}
                      </p>
                      {statusBadge(patient.assignmentStatus)}
                      {/* Services availed — flags interdepartmental patients */}
                      {(patient.services ?? []).map((d) => (
                        <span
                          key={d}
                          title={`Also seen by ${d}`}
                          className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-[var(--pale-teal)] text-[var(--teal)]"
                        >
                          {svcAbbr(d)}
                        </span>
                      ))}
                    </div>
                    <p className="text-[12px] text-[var(--mid-gray)]">
                      {patient.patientType} {patient.diagnosis ? `· ${patient.diagnosis}` : ''}
                      {patient.email ? ` · ${patient.email}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-[var(--mid-gray)] shrink-0" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
