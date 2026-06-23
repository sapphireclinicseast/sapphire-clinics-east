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
import { exportToXlsx, type ExportCol } from '@/lib/admission-export'

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
  // Grade-level filter dropdown above the table. '' = all levels.
  const [levelFilter, setLevelFilter] = useState<EnrollmentLevel | ''>('')
  // Column sort. Null key = use default (lastName, firstName).
  // Click a header to cycle: unsorted → asc → desc → unsorted.
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

  async function patchField(studentId: string, patch: Partial<Pick<AdmissionStudent, 'lisStatus' | 'remittanceStatus' | 'admissionComments' | 'lsenClassification' | 'lrn' | 'lrnStatus'>>) {
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
    let pool = students.filter(s => s.branch === tab)
    if (levelFilter) pool = pool.filter(s => s.level === levelFilter)
    const q = search.trim().toLowerCase()
    if (q) pool = pool.filter(s => `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.email} ${s.lrn ?? ''}`.toLowerCase().includes(q))
    if (!sortKey) return pool
    // Sort by the selected column. Strings: locale-compare. Anything
    // that quacks like a number gets numeric ordering. Nulls always
    // sort last so a partial dataset doesn't jumble usable rows.
    const dir = sortDir === 'asc' ? 1 : -1
    return [...pool].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey]
      const bv = (b as unknown as Record<string, unknown>)[sortKey]
      const aNull = av === null || av === undefined || av === ''
      const bNull = bv === null || bv === undefined || bv === ''
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      const an = typeof av === 'number' ? av : Number(av)
      const bn = typeof bv === 'number' ? bv : Number(bv)
      if (!Number.isNaN(an) && !Number.isNaN(bn) && typeof av !== 'string' && typeof bv !== 'string') {
        return (an - bn) * dir
      }
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true }) * dir
    })
  }, [students, tab, search, levelFilter, sortKey, sortDir])

  /** Click a header to cycle sort. Same key + asc → desc; same key + desc → off; different key → asc. */
  function cycleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return }
    if (sortDir === 'asc') { setSortDir('desc'); return }
    setSortKey(null); setSortDir('asc')
  }
  /** Tiny "▲ / ▼ / —" hint next to a header. */
  function sortIndicator(key: string): string {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

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

  /** Build + open the Enrollment Form (Annex 2) PDF from the API data.
   *  The bulk list shipped enrollment WITHOUT the heavy signature; we
   *  fetch the full record before rendering so the cert block ends up
   *  signed. Falls back to the trimmed record if the fetch fails so the
   *  PDF still renders (with a blank signature) rather than hanging. */
  async function openEnrollmentForm(s: AdmissionStudent) {
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
    const full = await fetchFullEnrollment(s.id)
    const doc = generateEnrollmentPdf(fakeUser, full ?? s.enrollment ?? {})
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  async function downloadEnrollmentForm(s: AdmissionStudent) {
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
    const full = await fetchFullEnrollment(s.id)
    const doc = generateEnrollmentPdf(fakeUser, full ?? s.enrollment ?? {})
    const safe = `${s.lastName ?? ''}-${s.firstName ?? ''}-enrollment-form`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    doc.save(`${safe}.pdf`)
  }

  function signOut() {
    localStorage.removeItem(ACCESS_CODE_KEY)
    setCode(null); setStudents([])
  }

  /**
   * Fetch the full enrollment JSON (including the base64 signature data
   * URL) for one student. The bulk /api/public/admission endpoint
   * strips `certSignatureDataUrl` to keep the list payload small —
   * this fills it back in just before we generate a PDF so the
   * certification block ends up signed.
   */
  async function fetchFullEnrollment(studentId: string): Promise<EnrollmentDraft | null> {
    if (!code) return null
    try {
      const res = await fetch(
        `${backendOrigin()}/api/public/admission/enrollment?code=${encodeURIComponent(code)}&studentId=${encodeURIComponent(studentId)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return null
      const data = await res.json() as { student: { enrollment: EnrollmentDraft } }
      return data.student.enrollment ?? null
    } catch (e) {
      console.warn('[admission fetchFullEnrollment]', e)
      return null
    }
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
              <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, LRN" style={{ width: 220 }} />
              <select
                className="select"
                value={levelFilter}
                onChange={e => setLevelFilter(e.target.value as EnrollmentLevel | '')}
                style={{ width: 'auto' }}
                title="Filter by grade level"
              >
                <option value="">All grade levels</option>
                {(['NURSERY','KINDER','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','GRADE_6','GRADE_7','GRADE_8','GRADE_9','GRADE_10','GRADE_11','GRADE_12'] as EnrollmentLevel[]).map(l => (
                  <option key={l} value={l}>{levelLabel(l)}</option>
                ))}
              </select>
              {(sortKey || levelFilter) && (
                <button
                  type="button"
                  onClick={() => { setSortKey(null); setSortDir('asc'); setLevelFilter('') }}
                  className="text-xs text-[color:var(--mid-gray)] hover:text-[color:var(--narra)] px-2 py-1"
                  title="Clear sort + level filter"
                >Clear</button>
              )}
              <button onClick={() => void refresh()} className="btn-secondary text-xs" disabled={loading}>{loading ? '…' : 'Refresh'}</button>
              <button onClick={() => exportToXlsx(filtered, exportCols, `admission-${tab.toLowerCase()}`)} className="btn-secondary text-xs">Excel</button>
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
                  {/* Sortable data columns. Click any header to cycle
                      asc → desc → off. Document download columns at the
                      end aren't sortable. */}
                  {([
                    { key: 'lastName',                label: 'Full name',            minWidth: 160, sticky: true },
                    { key: 'level',                   label: 'Grade level',          minWidth: 100 },
                    { key: 'schoolYear',              label: 'School Year',          minWidth: 90 },
                    { key: 'lrnStatus',               label: 'LRN status',           minWidth: 80 },
                    { key: 'lrn',                     label: 'LRN',                  minWidth: 110 },
                    { key: 'psaBirthCertNo',          label: 'PSA Birth Cert No.',   minWidth: 130 },
                    { key: 'middleName',              label: 'Middle name',          minWidth: 90 },
                    { key: 'extensionName',           label: 'Extension',            minWidth: 80 },
                    { key: 'dob',                     label: 'Date of birth',        minWidth: 90 },
                    { key: 'sex',                     label: 'Sex',                  minWidth: 60 },
                    { key: 'ipMember',                label: 'IP',                   minWidth: 60 },
                    { key: 'ipCommunity',             label: 'IP community',         minWidth: 110 },
                    { key: 'motherTongue',            label: 'Mother tongue',        minWidth: 100 },
                    { key: 'religion',                label: 'Religion',             minWidth: 90 },
                    { key: 'nationality',             label: 'Nationality',          minWidth: 90 },
                    { key: 'diagnosis',               label: 'Diagnosis',            minWidth: 140 },
                    { key: 'lsenClassification',      label: 'LSEN classification',  minWidth: 220 },
                    { key: 'pwdIdNumber',             label: 'PWD ID No.',           minWidth: 100 },
                    { key: 'houseStreet',             label: 'House / Street',       minWidth: 150 },
                    { key: 'barangay',                label: 'Barangay',             minWidth: 100 },
                    { key: 'cityProvinceCountry',     label: 'City / Province',      minWidth: 160 },
                    { key: 'zipCode',                 label: 'Zip',                  minWidth: 60 },
                    { key: 'fatherName',              label: "Father's Name",        minWidth: 160 },
                    { key: 'fatherOccupation',        label: "Father's occupation",  minWidth: 130 },
                    { key: 'motherName',              label: "Mother's Maiden Name", minWidth: 160 },
                    { key: 'motherOccupation',        label: "Mother's occupation",  minWidth: 130 },
                    { key: 'guardianName',            label: "Guardian's Name",      minWidth: 160 },
                    { key: 'telephone',               label: 'Telephone',            minWidth: 100 },
                    { key: 'cellphone',               label: 'Cellphone',            minWidth: 110 },
                    { key: 'email',                   label: 'Email',                minWidth: 180 },
                    { key: 'isReturningOrTransferee', label: 'Returning/Transferee', minWidth: 100 },
                    { key: 'lastGradeCompleted',      label: 'Last Grade',           minWidth: 100 },
                    { key: 'lastSchoolYearCompleted', label: 'Last SY',              minWidth: 100 },
                    { key: 'previousSchoolName',      label: 'Previous School',      minWidth: 150 },
                    { key: 'previousSchoolId',        label: 'Prev School ID',       minWidth: 100 },
                    { key: 'previousSchoolAddress',   label: 'Prev School Address',  minWidth: 170 },
                    { key: 'lisStatus',               label: 'LIS status',           minWidth: 160 },
                    { key: 'remittanceStatus',        label: 'Remittance',           minWidth: 90 },
                    { key: 'admissionComments',       label: 'Comments / Remarks',   minWidth: 200 },
                  ] as Array<{ key: string; label: string; minWidth: number; sticky?: boolean }>).map(col => {
                    const active = sortKey === col.key
                    return (
                      <th
                        key={col.key}
                        onClick={() => cycleSort(col.key)}
                        title={`Sort by ${col.label}`}
                        className={`py-1 px-1.5 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-[color:var(--narra)] ${col.sticky ? 'sticky left-0 z-20' : ''} ${active ? 'text-[color:var(--narra)]' : ''}`}
                        style={{ minWidth: col.minWidth, ...(col.sticky ? { background: 'var(--paper-2)' } : null) }}
                      >
                        {col.label}{sortIndicator(col.key)}
                      </th>
                    )
                  })}
                  {/* Document download columns — server-side blobs.
                      Not sortable: they're action buttons, not data. */}
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
                    <td className="py-1 px-1.5 whitespace-nowrap">
                      {s.lrnStatus === 'NO_LRN' ? (
                        // NO_LRN row: inline 12-digit input. Save fires
                        // on blur when the digits resolve to a valid
                        // LRN; the server auto-flips lrnStatus to
                        // WITH_LRN so this cell becomes read-only on
                        // next render.
                        <input
                          key={s.id + '-' + (s.lrn ?? '')}
                          defaultValue={s.lrn ?? ''}
                          inputMode="numeric"
                          maxLength={12}
                          placeholder="12 digits"
                          className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0"
                          onBlur={e => {
                            const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 12)
                            const prev = (s.lrn ?? '')
                            if (v === prev) return
                            if (!v) return // empty → no-op
                            if (!/^\d{12}$/.test(v)) {
                              alert('LRN must be exactly 12 digits.')
                              e.currentTarget.value = prev
                              return
                            }
                            void patchField(s.id, { lrn: v, lrnStatus: 'WITH_LRN' })
                          }}
                          title="DepEd-issued LRN. Type the 12 digits then click outside to save. The cell locks once an LRN is on file."
                        />
                      ) : (
                        s.lrn || <span className="text-[color:var(--mid-gray)]">—</span>
                      )}
                    </td>
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
