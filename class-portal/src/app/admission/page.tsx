'use client'

// Public admission tracker for the partner school. Gated by an access
// code (default "scei") instead of a class-portal sign-in so DepEd /
// LBCA staff can view + edit LIS status + remittance status without
// needing an account. Two tabs: one per branch, consolidating data
// from the same backend the front desk's spreadsheet writes to.

import { useEffect, useMemo, useState } from 'react'
import { backendOrigin } from '@/lib/backend'
import {
  levelLabel, LIS_STATUS_OPTIONS, REMITTANCE_OPTIONS, lsenClassificationLabel,
  LSEN_CLASSIFICATION_GROUPS,
  type LisStatus, type RemittanceStatus, type EnrollmentLevel, type EnrollmentDraft, type StoredUser,
  type LsenClassification,
} from '@/lib/session'
import { generateEnrollmentPdf } from '@/lib/enrollment-pdf'
import { exportToPdf, exportToXlsx, type ExportCol } from '@/lib/admission-export'

const ACCESS_CODE_KEY = 'scei_admission_code_v1'

interface DocumentBlob {
  docKey: string
  fileName: string
  fileSize: number
  fileType: string
  updatedAt: string
}

interface AdmissionStudent {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  branch: 'EAST' | 'GREENHILLS' | null
  level: EnrollmentLevel | null
  schoolYear: string | null
  lrnStatus: string | null
  lrn: string | null
  psaBirthCertNo: string | null
  middleName: string | null
  extensionName: string | null
  dob: string | null
  sex: string | null
  ipMember: string | null
  ipCommunity: string | null
  motherTongue: string | null
  religion: string | null
  nationality: string | null
  diagnosis: string | null
  pwdIdNumber: string | null
  lsenClassification: LsenClassification | null
  houseStreet: string | null
  barangay: string | null
  cityProvinceCountry: string | null
  zipCode: string | null
  fatherName: string | null
  fatherOccupation: string | null
  motherName: string | null
  motherOccupation: string | null
  guardianName: string | null
  guardianOfRecord: string | null
  telephone: string | null
  cellphone: string | null
  isReturningOrTransferee: string | null
  lastGradeCompleted: string | null
  lastSchoolYearCompleted: string | null
  previousSchoolName: string | null
  previousSchoolId: string | null
  previousSchoolAddress: string | null
  lisStatus: LisStatus | null
  remittanceStatus: RemittanceStatus | null
  admissionComments: string | null
  enrollment: EnrollmentDraft
  documentBlobs: DocumentBlob[]
  documentsMeta: Record<string, { name: string; size: number; type?: string; fileId?: string }>
  waiverSignedAt: string | null
  createdAt: string
}

export default function AdmissionPage() {
  const [code, setCode] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [codeErr, setCodeErr] = useState<string | null>(null)
  const [students, setStudents] = useState<AdmissionStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'EAST' | 'GREENHILLS'>('EAST')
  const [search, setSearch] = useState('')

  // Persist the code so the partner school doesn't re-enter every visit.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(ACCESS_CODE_KEY)
    if (saved) setCode(saved)
  }, [])

  async function tryCode(c: string) {
    setCodeErr(null)
    const trimmed = c.trim()
    if (!trimmed) { setCodeErr('Enter the access code to continue.'); return }
    setLoading(true)
    try {
      const res = await fetch(`${backendOrigin()}/api/public/admission?code=${encodeURIComponent(trimmed)}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { students: AdmissionStudent[] }
      localStorage.setItem(ACCESS_CODE_KEY, trimmed)
      setCode(trimmed)
      setStudents(data.students)
    } catch (e) {
      setCodeErr((e as Error).message)
    } finally { setLoading(false) }
  }

  async function refresh(active: string | null = code) {
    if (!active) return
    setLoading(true); setLoadErr(null)
    try {
      const res = await fetch(`${backendOrigin()}/api/public/admission?code=${encodeURIComponent(active)}`, { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) {
          // Code rotated — drop saved and re-prompt.
          localStorage.removeItem(ACCESS_CODE_KEY)
          setCode(null)
          return
        }
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { students: AdmissionStudent[] }
      setStudents(data.students)
    } catch (e) {
      setLoadErr((e as Error).message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (code) void refresh(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function patchField(studentId: string, patch: Partial<Pick<AdmissionStudent, 'lisStatus' | 'remittanceStatus' | 'admissionComments' | 'lsenClassification'>>) {
    if (!code) return
    // Optimistic update so the dropdown feels instant.
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...patch } : s))
    try {
      const res = await fetch(`${backendOrigin()}/api/public/admission?code=${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studentId, ...patch }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      setLoadErr((e as Error).message)
      // Re-sync from the server so the local view doesn't drift.
      void refresh()
    }
  }

  const filtered = useMemo(() => {
    const pool = students.filter(s => s.branch === tab)
    const q = search.trim().toLowerCase()
    if (!q) return pool
    return pool.filter(s => `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.email} ${s.lrn ?? ''}`.toLowerCase().includes(q))
  }, [students, tab, search])

  // Map an AdmissionStudent to the export columns. Reuses the same display
  // formatting the table uses so XLSX + PDF read identically to the screen.
  const lisLabel  = (v: LisStatus | null)        => v ? (LIS_STATUS_OPTIONS.find(o => o.value === v)?.label ?? v) : ''
  const remitLabel = (v: RemittanceStatus | null) => v ? (REMITTANCE_OPTIONS.find(o => o.value === v)?.label ?? v) : ''
  const lrnLbl    = (v: string | null) => v === 'NO_LRN' ? 'NO LRN' : v === 'WITH_LRN' ? 'WITH LRN' : v === 'RETURNING' ? 'RETURNING (BALIK-ARAL)' : ''
  const exportCols: ExportCol<AdmissionStudent>[] = [
    { header: 'Full name',         width: 180, value: s => [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email },
    { header: 'Grade level',       width: 100, value: s => s.level ? levelLabel(s.level) : '' },
    { header: 'School Year',       width: 100, value: s => s.schoolYear ?? '' },
    { header: 'Branch',            width: 110, value: s => s.branch ?? '' },
    { header: 'LRN status',        width: 120, value: s => lrnLbl(s.lrnStatus) },
    { header: 'LRN',               width: 120, value: s => s.lrn ?? '' },
    { header: 'PSA Birth Cert No.', width: 140, value: s => s.psaBirthCertNo ?? '' },
    { header: 'Middle name',       width: 110, value: s => s.middleName ?? '' },
    { header: 'Extension name',    width: 90,  value: s => s.extensionName ?? '' },
    { header: 'Date of birth',     width: 100, value: s => s.dob ?? '' },
    { header: 'Sex',               width: 70,  value: s => s.sex ?? '' },
    { header: 'IP member',         width: 80,  value: s => s.ipMember ?? '' },
    { header: 'IP community',      width: 120, value: s => s.ipCommunity ?? '' },
    { header: 'Mother tongue',     width: 100, value: s => s.motherTongue ?? '' },
    { header: 'Religion',          width: 100, value: s => s.religion ?? '' },
    { header: 'Nationality',       width: 100, value: s => s.nationality ?? '' },
    { header: 'Diagnosis',         width: 140, value: s => s.diagnosis ?? '' },
    { header: 'LSEN classification', width: 220, value: s => lsenClassificationLabel(s.lsenClassification) },
    { header: 'PWD ID No.',        width: 100, value: s => s.pwdIdNumber ?? '' },
    { header: 'House / Street',    width: 160, value: s => s.houseStreet ?? '' },
    { header: 'Barangay',          width: 100, value: s => s.barangay ?? '' },
    { header: 'City / Province',   width: 160, value: s => s.cityProvinceCountry ?? '' },
    { header: 'Zip',               width: 60,  value: s => s.zipCode ?? '' },
    { header: "Father's Name",     width: 160, value: s => s.fatherName ?? '' },
    { header: "Father's occupation", width: 130, value: s => s.fatherOccupation ?? '' },
    { header: "Mother's Maiden Name", width: 160, value: s => s.motherName ?? '' },
    { header: "Mother's occupation", width: 130, value: s => s.motherOccupation ?? '' },
    { header: "Guardian's Name",   width: 160, value: s => s.guardianName ?? '' },
    { header: 'Telephone',         width: 110, value: s => s.telephone ?? '' },
    { header: 'Cellphone',         width: 110, value: s => s.cellphone ?? '' },
    { header: 'Email',             width: 180, value: s => s.email ?? '' },
    { header: 'Returning/Transferee', width: 100, value: s => s.isReturningOrTransferee ?? '' },
    { header: 'Last Grade Completed', width: 120, value: s => s.lastGradeCompleted ?? '' },
    { header: 'Last SY Completed', width: 120, value: s => s.lastSchoolYearCompleted ?? '' },
    { header: 'Previous School',   width: 160, value: s => s.previousSchoolName ?? '' },
    { header: 'Prev School ID',    width: 100, value: s => s.previousSchoolId ?? '' },
    { header: 'Prev School Address', width: 180, value: s => s.previousSchoolAddress ?? '' },
    { header: 'LIS status',        width: 160, value: s => lisLabel(s.lisStatus) },
    { header: 'Remittance',        width: 90,  value: s => remitLabel(s.remittanceStatus) },
    { header: 'Comments / Remarks', width: 200, value: s => s.admissionComments ?? '' },
  ]

  // Server-side blob presence checker.
  const hasBlob = (s: AdmissionStudent, docKey: string) => s.documentBlobs.some(b => b.docKey === docKey)
  // Local-IndexedDB fallback: the parent uploaded the file but the server-side
  // sync wasn't running at the time (legacy enrollments from before the blob
  // sync shipped). Surfacing this lets staff know to ask the parent to re-
  // submit so the file lands in the partner-school's reach.
  const hasLocalOnly = (s: AdmissionStudent, docKey: string) =>
    !hasBlob(s, docKey) && !!s.documentsMeta?.[docKey]?.fileId

  /** Open a document blob via the code-gated admission endpoint. */
  function openDocBlob(s: AdmissionStudent, docKey: string, inline = false) {
    if (!code) return
    const url = `${backendOrigin()}/api/public/admission/document?code=${encodeURIComponent(code)}&studentId=${encodeURIComponent(s.id)}&docKey=${encodeURIComponent(docKey)}${inline ? '&inline=1' : ''}`
    window.open(url, '_blank', 'noopener')
  }

  /** Build + open the Enrollment Form (Annex 2) PDF from the API data. */
  function openEnrollmentForm(s: AdmissionStudent) {
    const fakeUser: StoredUser = {
      id: s.id,
      role: 'STUDENT',
      email: s.email,
      password: '',
      firstName: s.firstName ?? undefined,
      lastName: s.lastName ?? undefined,
      level: s.level ?? undefined,
      branch: s.branch ?? undefined,
      createdAt: s.createdAt,
    }
    const doc = generateEnrollmentPdf(fakeUser, s.enrollment ?? {})
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  function downloadEnrollmentForm(s: AdmissionStudent) {
    const fakeUser: StoredUser = {
      id: s.id,
      role: 'STUDENT',
      email: s.email,
      password: '',
      firstName: s.firstName ?? undefined,
      lastName: s.lastName ?? undefined,
      level: s.level ?? undefined,
      branch: s.branch ?? undefined,
      createdAt: s.createdAt,
    }
    const doc = generateEnrollmentPdf(fakeUser, s.enrollment ?? {})
    const safe = `${s.lastName ?? ''}-${s.firstName ?? ''}-enrollment-form`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    doc.save(`${safe}.pdf`)
  }

  function signOut() {
    localStorage.removeItem(ACCESS_CODE_KEY)
    setCode(null); setStudents([])
  }

  if (!code) {
    return (
      <div className="max-w-md mx-auto animate-fade-up">
        <div className="card-static">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy</div>
          <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)] mb-1">Admission tracker</h1>
          <p className="text-sm text-[color:var(--mid-gray)] mb-5">
            Enter the access code to view the consolidated enrollment list for both branches.
          </p>
          <form onSubmit={e => { e.preventDefault(); void tryCode(codeInput) }} className="space-y-3">
            <label className="block">
              <span className="label">Access code</span>
              <input
                autoFocus
                className="input"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                placeholder="Enter code"
                type="password"
                autoComplete="off"
              />
            </label>
            {codeErr && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{codeErr}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Checking…' : 'View admission list'}</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      className="animate-fade-up"
      style={{
        width: '100vw',
        maxWidth: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
      }}
    >
      <div className="px-3 sm:px-5 max-w-7xl mx-auto">
        <div className="card-static mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy</div>
              <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">Admission tracker</h1>
              <p className="text-sm text-[color:var(--mid-gray)] mt-1">
                {students.length} students total · partner school may edit <span className="font-semibold">LIS status</span> + <span className="font-semibold">remittance</span>. Edits sync back to the front desk in real time.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, LRN" style={{ width: 260 }} />
              <button onClick={() => void refresh()} className="btn-secondary text-xs" disabled={loading}>{loading ? '…' : 'Refresh'}</button>
              <button onClick={() => exportToXlsx(filtered, exportCols, `admission-${tab.toLowerCase()}`)} className="btn-secondary text-xs">Excel</button>
              <button onClick={() => exportToPdf(filtered, exportCols, `admission-${tab.toLowerCase()}`, `Admission tracker — ${tab === 'EAST' ? 'East Branch' : 'Greenhills Branch'}`)} className="btn-secondary text-xs">PDF</button>
              <button onClick={signOut} className="text-xs text-[color:var(--mid-gray)] hover:text-[color:var(--clay)] px-2 py-1">Sign out</button>
            </div>
          </div>

          {loadErr && <div className="mt-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{loadErr}</div>}

          <div className="flex gap-2 mt-5 p-1 bg-[color:var(--pale-teal)] rounded-xl w-fit" style={{ fontFamily: 'var(--font-display)' }}>
            {(['EAST', 'GREENHILLS'] as const).map(b => {
              const count = students.filter(s => s.branch === b).length
              return (
                <button key={b} onClick={() => setTab(b)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === b ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}>
                  {b === 'EAST' ? 'East Branch' : 'Greenhills Branch'} <span className="text-[11px] text-[color:var(--mid-gray)] ml-1">({count})</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card-static p-0 overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
            <table className="text-[11px] w-full" style={{ borderCollapse: 'collapse' }}>
              <thead className="sticky top-0 z-10" style={{ background: 'var(--paper-2)' }}>
                <tr className="text-left uppercase tracking-[0.06em] text-[10px] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap sticky left-0 z-20" style={{ minWidth: 160, background: 'var(--paper-2)' }}>Full name</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Grade level</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>School Year</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 80 }}>LRN status</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 110 }}>LRN</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 130 }}>PSA Birth Cert No.</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>Middle name</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 80 }}>Extension</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>Date of birth</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 60 }}>Sex</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 60 }}>IP</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 110 }}>IP community</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Mother tongue</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>Religion</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>Nationality</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 140 }}>Diagnosis</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 220 }}>LSEN classification</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>PWD ID No.</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 150 }}>House / Street</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Barangay</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 160 }}>City / Province</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 60 }}>Zip</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 160 }}>Father&apos;s Name</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 130 }}>Father&apos;s occupation</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 160 }}>Mother&apos;s Maiden Name</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 130 }}>Mother&apos;s occupation</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 160 }}>Guardian&apos;s Name</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Telephone</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 110 }}>Cellphone</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 180 }}>Email</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Returning/Transferee</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Last Grade</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Last SY</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 150 }}>Previous School</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Prev School ID</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 170 }}>Prev School Address</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 160 }}>LIS status</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>Remittance</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 200 }}>Comments / Remarks</th>
                  {/* Document download columns — server-side blobs */}
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap text-center" style={{ minWidth: 130, background: '#fef3c7' }}>Enrollment Form</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap text-center" style={{ minWidth: 110, background: '#fef3c7' }}>Parent Waiver</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap text-center" style={{ minWidth: 110, background: '#fef3c7' }}>DepEd Affidavit</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap text-center" style={{ minWidth: 110, background: '#fef3c7' }}>Report Card / SF9</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap text-center" style={{ minWidth: 110, background: '#fef3c7' }}>PSA Birth Cert</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap text-center" style={{ minWidth: 110, background: '#fef3c7' }}>Form 137 / SF10</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={46} className="py-10 text-center text-[color:var(--mid-gray)]">No students in this branch yet.</td></tr>
                )}
                {filtered.map(s => (
                  <tr key={s.id} className="border-b hover:bg-[color:var(--paper-2)]" style={{ borderColor: 'var(--paper-3)' }}>
                    <td className="py-1 px-1.5 whitespace-nowrap font-medium sticky left-0 bg-white z-10 group-hover:bg-[color:var(--paper-2)]" style={{ background: '#fff' }}>{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.level ? levelLabel(s.level) : <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.schoolYear || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.lrnStatus === 'NO_LRN' ? 'NO LRN' : s.lrnStatus === 'WITH_LRN' ? 'WITH LRN' : s.lrnStatus === 'RETURNING' ? 'RETURNING' : <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.lrn || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.psaBirthCertNo || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.middleName || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.extensionName || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.dob || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.sex || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.ipMember || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.ipCommunity || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.motherTongue || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.religion || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.nationality || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.diagnosis || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">
                      <select
                        value={s.lsenClassification ?? ''}
                        onChange={e => patchField(s.id, { lsenClassification: (e.target.value || null) as LsenClassification | null })}
                        className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0"
                        title="Set by the teacher, front desk, or admin once the school has assessed the learner."
                      >
                        <option value="">—</option>
                        {LSEN_CLASSIFICATION_GROUPS.map(g => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.pwdIdNumber || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.houseStreet || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.barangay || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.cityProvinceCountry || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.zipCode || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.fatherName || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.fatherOccupation || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.motherName || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.motherOccupation || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.guardianName || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.telephone || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.cellphone || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.email || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.isReturningOrTransferee || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.lastGradeCompleted || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.lastSchoolYearCompleted || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.previousSchoolName || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.previousSchoolId || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.previousSchoolAddress || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">
                      <select
                        value={s.lisStatus ?? ''}
                        onChange={e => patchField(s.id, { lisStatus: (e.target.value || null) as LisStatus | null })}
                        className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0"
                      >
                        <option value="">—</option>
                        {LIS_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1 px-1.5">
                      <select
                        value={s.remittanceStatus ?? ''}
                        onChange={e => patchField(s.id, { remittanceStatus: (e.target.value || null) as RemittanceStatus | null })}
                        className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0"
                      >
                        <option value="">—</option>
                        {REMITTANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        defaultValue={s.admissionComments ?? ''}
                        placeholder="Add comment…"
                        className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0"
                        onBlur={e => {
                          const nv = e.target.value
                          if (nv !== (s.admissionComments ?? '')) patchField(s.id, { admissionComments: nv || null })
                        }}
                      />
                    </td>

                    {/* Enrollment Form — always available, rebuilt client-side from API data */}
                    <td className="py-1 px-1.5 whitespace-nowrap text-center" style={{ background: '#fffbe6' }}>
                      <button
                        type="button"
                        onClick={() => openEnrollmentForm(s)}
                        className="text-[10.5px] px-1.5 py-0.5 rounded text-[color:var(--narra)] hover:bg-[color:var(--paper-2)] border"
                        style={{ borderColor: 'var(--paper-3)' }}
                        title="Open Enrollment Form in a new tab"
                      >View</button>
                      <button
                        type="button"
                        onClick={() => downloadEnrollmentForm(s)}
                        className="ml-1 text-[10.5px] px-1.5 py-0.5 rounded text-white"
                        style={{ background: 'var(--narra)' }}
                        title="Download Enrollment Form PDF"
                      >↓</button>
                    </td>

                    {/* Parent Waiver — server blob (if uploaded by parent) */}
                    <td className="py-1 px-1.5 whitespace-nowrap text-center" style={{ background: '#fffbe6' }}>
                      <DocCell present={hasBlob(s, 'parent_waiver')} localOnly={hasLocalOnly(s, 'parent_waiver')} onView={() => openDocBlob(s, 'parent_waiver', true)} onDownload={() => openDocBlob(s, 'parent_waiver', false)} hint={s.waiverSignedAt ? `Signed ${new Date(s.waiverSignedAt).toLocaleDateString()}` : undefined} />
                    </td>

                    {/* DepEd Affidavit of Undertaking — only if filled */}
                    <td className="py-1 px-1.5 whitespace-nowrap text-center" style={{ background: '#fffbe6' }}>
                      <DocCell present={hasBlob(s, 'affidavit_undertaking')} localOnly={hasLocalOnly(s, 'affidavit_undertaking')} onView={() => openDocBlob(s, 'affidavit_undertaking', true)} onDownload={() => openDocBlob(s, 'affidavit_undertaking', false)} />
                    </td>

                    {/* Latest Report Card / SF9 */}
                    <td className="py-1 px-1.5 whitespace-nowrap text-center" style={{ background: '#fffbe6' }}>
                      <DocCell present={hasBlob(s, 'report_card_sf9')} localOnly={hasLocalOnly(s, 'report_card_sf9')} onView={() => openDocBlob(s, 'report_card_sf9', true)} onDownload={() => openDocBlob(s, 'report_card_sf9', false)} />
                    </td>

                    {/* PSA Birth Certificate */}
                    <td className="py-1 px-1.5 whitespace-nowrap text-center" style={{ background: '#fffbe6' }}>
                      <DocCell present={hasBlob(s, 'psa_birth_cert')} localOnly={hasLocalOnly(s, 'psa_birth_cert')} onView={() => openDocBlob(s, 'psa_birth_cert', true)} onDownload={() => openDocBlob(s, 'psa_birth_cert', false)} />
                    </td>

                    {/* Form 137 / SF10 — uploaded by staff (teacher / admin / branch admin) */}
                    <td className="py-1 px-1.5 whitespace-nowrap text-center" style={{ background: '#fffbe6' }}>
                      <DocCell present={hasBlob(s, 'form_137_sf10')} localOnly={hasLocalOnly(s, 'form_137_sf10')} onView={() => openDocBlob(s, 'form_137_sf10', true)} onDownload={() => openDocBlob(s, 'form_137_sf10', false)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-3 text-center" style={{ fontFamily: 'var(--font-display)' }}>
          Edits save automatically · Refresh to pull the latest from the front desk · Documents with a — were not uploaded by the parent
        </p>
      </div>
    </div>
  )
}

/** Inline document-cell renderer for the /admission table. Shows View +
 *  Download mini-buttons when the server has the blob; otherwise shows a
 *  faint dash. `localOnly` flags the case where the parent uploaded the file
 *  but it lives only in their browser's IndexedDB (legacy enrollments from
 *  before the server-blob sync shipped) — staff sees a phone glyph so they
 *  know to ask the parent to re-submit. The `hint` slot lets callers expose
 *  meta like "Signed YYYY-MM-DD". */
function DocCell({ present, localOnly, onView, onDownload, hint }: {
  present: boolean
  localOnly?: boolean
  onView: () => void
  onDownload: () => void
  hint?: string
}) {
  if (!present) {
    if (localOnly) {
      return (
        <span className="text-[10.5px] text-amber-700" title="Parent uploaded this on their device, but it hasn't synced to the server yet. Ask the parent to re-submit on /documents, or upload on their behalf from the admin profile.">
          📱 Local
        </span>
      )
    }
    return (
      <span className="text-[color:var(--mid-gray)] text-[10.5px]" title={hint ?? 'Not uploaded'}>
        {hint ? '⌛' : '—'}
      </span>
    )
  }
  return (
    <span className="inline-flex gap-1">
      <button
        type="button"
        onClick={onView}
        className="text-[10.5px] px-1.5 py-0.5 rounded text-[color:var(--narra)] hover:bg-[color:var(--paper-2)] border"
        style={{ borderColor: 'var(--paper-3)' }}
        title="View in a new tab"
      >View</button>
      <button
        type="button"
        onClick={onDownload}
        className="text-[10.5px] px-1.5 py-0.5 rounded text-white"
        style={{ background: 'var(--narra)' }}
        title="Download"
      >↓</button>
    </span>
  )
}
