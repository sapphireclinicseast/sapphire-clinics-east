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
import {
  Banner, EmptyState, Icon, KpiCard, PageHeader, PillTabs, RowsSkeleton, StatusPill,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, FOCUS, LABEL, LABEL_STYLE,
  PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, TH, TH_STYLE,
} from '@/components/hub/ui'

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

  const branchPool = students.filter(s => s.branch === tab)
  const kNoLrn = branchPool.filter(s => s.lrnStatus === 'NO_LRN').length
  const kEnrolled = branchPool.filter(s => s.lisStatus === 'ENROLLED').length
  const kPaid = branchPool.filter(s => s.remittanceStatus === 'PAID').length
  const filtersOn = !!(search.trim() || levelFilter || sortKey)

  if (!code) {
    return (
      <div className="max-w-md mx-auto animate-fade-up">
        <div className="rounded-2xl px-6 py-7 sm:px-8 sm:py-8"
          style={{ ...CARD_STYLE, boxShadow: '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)' }}>
          <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            <Icon name="table" size={20} />
          </span>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
            Aura Academy · Partner school
          </div>
          <h1 className="text-[22px] sm:text-2xl font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Admission tracker
          </h1>
          <p className="text-sm mt-2 mb-5 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
            Enter the access code to view the consolidated enrollment list for both branches.
          </p>
          <form onSubmit={e => { e.preventDefault(); void tryCode(codeInput) }} className="space-y-4">
            <div>
              <label htmlFor="admission-code" className={LABEL} style={LABEL_STYLE}>Access code</label>
              <input
                id="admission-code"
                autoFocus
                className={`${CONTROL} w-full h-10`}
                style={CONTROL_STYLE}
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                placeholder="Enter code"
                type="password"
                autoComplete="off"
              />
            </div>
            {codeErr && <Banner tone="error">{codeErr}</Banner>}
            <button type="submit" disabled={loading} className={`${BTN_PRIMARY} w-full h-10`} style={PRIMARY_STYLE}>
              {loading ? 'Checking…' : <>View admission list <Icon name="chevronRight" size={16} /></>}
            </button>
          </form>
          <p className="text-[12px] mt-5 pt-4 leading-relaxed" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
            For DepEd / LBCA staff. The code is remembered on this device until you sign out.
          </p>
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
      <div className="px-3 sm:px-5 max-w-7xl mx-auto space-y-5 min-w-0">
        <PageHeader
          eyebrow="Aura Academy · Partner school"
          title="Admission tracker"
          description={<>{students.length} students across both branches. You can edit <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>LRN</span>, <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>LSEN classification</span>, <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>LIS status</span>, <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>remittance</span> and <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>comments</span>; edits save as you go and reach the front desk right away.</>}
          actions={<>
            <button type="button" onClick={() => void refresh()} className={BTN_SECONDARY} style={SECONDARY_STYLE} disabled={loading}>
              <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" onClick={() => exportToXlsx(filtered, exportCols, `admission-${tab.toLowerCase()}`)} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
              <Icon name="download" size={14} /> Excel
            </button>
            <button type="button" onClick={signOut} className={BTN_SECONDARY} style={{ ...SECONDARY_STYLE, color: 'var(--mid-gray)' }}>
              Sign out
            </button>
          </>}
        />

        {loadErr && <Banner tone="error" onRetry={() => void refresh()}>{loadErr}</Banner>}

        <PillTabs
          label="Branch"
          value={tab}
          onChange={id => setTab(id as 'EAST' | 'GREENHILLS')}
          tabs={(['EAST', 'GREENHILLS'] as const).map(b => ({
            id: b,
            label: b === 'EAST' ? 'East Branch' : 'Greenhills Branch',
            count: students.filter(s => s.branch === b).length,
          }))}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Students" value={branchPool.length} sub={tab === 'EAST' ? 'East Branch' : 'Greenhills Branch'} icon={<Icon name="student" size={16} />} />
          <KpiCard label="Enrolled in LIS" value={<>{kEnrolled}<span className="text-sm font-semibold" style={{ color: 'var(--mid-gray)' }}> / {branchPool.length}</span></>} sub={`${branchPool.length - kEnrolled} not yet`} icon={<Icon name="check" size={16} />} />
          <KpiCard label="Remitted" value={<>{kPaid}<span className="text-sm font-semibold" style={{ color: 'var(--mid-gray)' }}> / {branchPool.length}</span></>} sub={`${branchPool.length - kPaid} pending or unset`} icon={<Icon name="wallet" size={16} />} />
          <KpiCard label="No LRN yet" value={kNoLrn} sub="LRN still to be issued" accent={kNoLrn ? 'var(--sun)' : 'var(--teal)'} icon={<Icon name="clock" size={16} />} />
        </div>

        <section className="rounded-xl min-w-0" style={CARD_STYLE}>
          {/* Toolbar */}
          <div className="px-4 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
              <input
                className={`${CONTROL} w-full pl-8`}
                style={CONTROL_STYLE}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, LRN"
                aria-label="Search students"
              />
            </div>
            <select
              className={CONTROL}
              style={{ ...CONTROL_STYLE, width: 'auto' }}
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value as EnrollmentLevel | '')}
              title="Filter by grade level"
              aria-label="Filter by grade level"
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
                className={BTN_SM}
                style={{ color: 'var(--mid-gray)' }}
                title="Clear sort + level filter"
              ><Icon name="x" size={12} /> Clear</button>
            )}
            <span className="ml-auto text-[12px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>
              {filtered.length === branchPool.length ? `${branchPool.length} students` : `${filtered.length} of ${branchPool.length} shown`}
              <span className="hidden md:inline"> · click a column header to sort</span>
            </span>
          </div>

          {loading && students.length === 0 ? (
            <RowsSkeleton rows={6} label="Loading admission list" />
          ) : (
          <div className="overflow-auto rounded-b-xl" style={{ maxHeight: '75vh' }}>
            <table className="text-[12px] w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead className="sticky top-0 z-20">
                <tr>
                  {/* Sortable data columns. Click any header to cycle
                      asc → desc → off. Document columns at the end
                      aren't sortable — they're actions, not data. */}
                  {COLUMNS.map(col => {
                    const active = sortKey === col.key
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`${TH} !px-2.5 ${col.sticky ? 'sticky left-0 z-30' : ''}`}
                        style={{ ...TH_STYLE, minWidth: col.minWidth, ...(col.sticky ? { boxShadow: 'inset -1px 0 0 var(--light-gray)' } : null), ...(active ? { color: 'var(--deep-teal)' } : null) }}
                      >
                        <button
                          type="button"
                          onClick={() => cycleSort(col.key)}
                          title={`Sort by ${col.label}`}
                          className={`inline-flex items-center gap-1 uppercase tracking-wider rounded hover:text-[color:var(--deep-teal)] ${FOCUS}`}
                        >
                          {col.label}
                          <span aria-hidden className="text-[9px] w-2">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                        </button>
                      </th>
                    )
                  })}
                  {DOC_COLUMNS.map(label => (
                    <th key={label} scope="col" className={`${TH} !px-2.5 text-center`}
                      style={{ ...TH_STYLE, minWidth: label === 'Enrollment Form' ? 130 : 120, background: DOC_HEAD_BG }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={COLUMNS.length + DOC_COLUMNS.length} className="p-0">
                    <div className="sticky left-0 max-w-[min(100%,calc(100vw-48px))]">
                      <EmptyState
                        icon={filtersOn ? 'search' : 'users'}
                        title={filtersOn ? 'No students match these filters' : 'No students in this branch yet'}
                        hint={filtersOn ? 'Try a different name or grade level, or clear the filters.' : 'Enrollments appear here as soon as a parent finishes the online form.'}
                      />
                    </div>
                  </td></tr>
                )}
                {filtered.map(s => (
                  <tr key={s.id} className="group transition-colors hover:bg-[#FBF9F5]" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <td className={`${CELL} whitespace-nowrap font-semibold sticky left-0 z-10 bg-white group-hover:bg-[#FBF9F5] transition-colors`} style={{ color: 'var(--charcoal)', boxShadow: 'inset -1px 0 0 var(--light-gray)' }}>{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.level ? levelLabel(s.level) : <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.schoolYear || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.lrnStatus === 'NO_LRN' ? 'NO LRN' : s.lrnStatus === 'WITH_LRN' ? 'WITH LRN' : s.lrnStatus === 'RETURNING' ? 'RETURNING' : <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>
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
                          className={INLINE}
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
                        s.lrn || <Dash />
                      )}
                    </td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.psaBirthCertNo || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.middleName || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.extensionName || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.dob || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.sex || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.ipMember || <Dash />}</td>
                    <td className={CELL}>{s.ipCommunity || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.motherTongue || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.religion || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.nationality || <Dash />}</td>
                    <td className={CELL}>{s.diagnosis || <Dash />}</td>
                    <td className={CELL}>
                      <select
                        value={s.lsenClassification ?? ''}
                        onChange={e => patchField(s.id, { lsenClassification: (e.target.value || null) as LsenClassification | null })}
                        className={INLINE}
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
                    <td className={`${CELL} whitespace-nowrap`}>{s.pwdIdNumber || <Dash />}</td>
                    <td className={CELL}>{s.houseStreet || <Dash />}</td>
                    <td className={CELL}>{s.barangay || <Dash />}</td>
                    <td className={CELL}>{s.cityProvinceCountry || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.zipCode || <Dash />}</td>
                    <td className={CELL}>{s.fatherName || <Dash />}</td>
                    <td className={CELL}>{s.fatherOccupation || <Dash />}</td>
                    <td className={CELL}>{s.motherName || <Dash />}</td>
                    <td className={CELL}>{s.motherOccupation || <Dash />}</td>
                    <td className={CELL}>{s.guardianName || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.telephone || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.cellphone || <Dash />}</td>
                    <td className={CELL}>{s.email || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.isReturningOrTransferee || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.lastGradeCompleted || <Dash />}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{s.lastSchoolYearCompleted || <Dash />}</td>
                    <td className={CELL}>{s.previousSchoolName || <Dash />}</td>
                    <td className={CELL}>{s.previousSchoolId || <Dash />}</td>
                    <td className={CELL}>{s.previousSchoolAddress || <Dash />}</td>
                    <td className={CELL}>
                      <select
                        value={s.lisStatus ?? ''}
                        onChange={e => patchField(s.id, { lisStatus: (e.target.value || null) as LisStatus | null })}
                        className={INLINE}
                      >
                        <option value="">—</option>
                        {LIS_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className={CELL}>
                      <select
                        value={s.remittanceStatus ?? ''}
                        onChange={e => patchField(s.id, { remittanceStatus: (e.target.value || null) as RemittanceStatus | null })}
                        className={INLINE}
                      >
                        <option value="">—</option>
                        {REMITTANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className={CELL}>
                      <input
                        defaultValue={s.admissionComments ?? ''}
                        placeholder="Add comment…"
                        className={INLINE}
                        onBlur={e => {
                          const nv = e.target.value
                          if (nv !== (s.admissionComments ?? '')) patchField(s.id, { admissionComments: nv || null })
                        }}
                      />
                    </td>

                    {/* Enrollment Form — always available, rebuilt client-side from API data */}
                    <td className={`${CELL} whitespace-nowrap text-center`} style={{ background: DOC_BG }}>
                      <DocButtons onView={() => openEnrollmentForm(s)} onDownload={() => downloadEnrollmentForm(s)} viewTitle="Open Enrollment Form in a new tab" downloadTitle="Download Enrollment Form PDF" />
                    </td>

                    {/* Parent Waiver — server blob (if uploaded by parent) */}
                    <td className={`${CELL} whitespace-nowrap text-center`} style={{ background: DOC_BG }}>
                      <DocCell present={hasBlob(s, 'parent_waiver')} localOnly={hasLocalOnly(s, 'parent_waiver')} onView={() => openDocBlob(s, 'parent_waiver', true)} onDownload={() => openDocBlob(s, 'parent_waiver', false)} hint={s.waiverSignedAt ? `Signed ${new Date(s.waiverSignedAt).toLocaleDateString()}` : undefined} />
                    </td>

                    {/* DepEd Affidavit of Undertaking — only if filled */}
                    <td className={`${CELL} whitespace-nowrap text-center`} style={{ background: DOC_BG }}>
                      <DocCell present={hasBlob(s, 'affidavit_undertaking')} localOnly={hasLocalOnly(s, 'affidavit_undertaking')} onView={() => openDocBlob(s, 'affidavit_undertaking', true)} onDownload={() => openDocBlob(s, 'affidavit_undertaking', false)} />
                    </td>

                    {/* Latest Report Card / SF9 */}
                    <td className={`${CELL} whitespace-nowrap text-center`} style={{ background: DOC_BG }}>
                      <DocCell present={hasBlob(s, 'report_card_sf9')} localOnly={hasLocalOnly(s, 'report_card_sf9')} onView={() => openDocBlob(s, 'report_card_sf9', true)} onDownload={() => openDocBlob(s, 'report_card_sf9', false)} />
                    </td>

                    {/* PSA Birth Certificate */}
                    <td className={`${CELL} whitespace-nowrap text-center`} style={{ background: DOC_BG }}>
                      <DocCell present={hasBlob(s, 'psa_birth_cert')} localOnly={hasLocalOnly(s, 'psa_birth_cert')} onView={() => openDocBlob(s, 'psa_birth_cert', true)} onDownload={() => openDocBlob(s, 'psa_birth_cert', false)} />
                    </td>

                    {/* Form 137 / SF10 — uploaded by staff (teacher / admin / branch admin) */}
                    <td className={`${CELL} whitespace-nowrap text-center`} style={{ background: DOC_BG }}>
                      <DocCell present={hasBlob(s, 'form_137_sf10')} localOnly={hasLocalOnly(s, 'form_137_sf10')} onView={() => openDocBlob(s, 'form_137_sf10', true)} onDownload={() => openDocBlob(s, 'form_137_sf10', false)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          <div className="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" size={13} /> Edits save automatically</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="refresh" size={13} /> Refresh to pull the latest from the front desk</span>
            <span className="inline-flex items-center gap-1.5"><Dash /> Not uploaded by the parent</span>
            <span className="inline-flex items-center gap-1.5"><StatusPill tone="warn">On parent&apos;s device</StatusPill> Uploaded but not synced yet</span>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Table pieces ─────────────────────────────────────────────────────────────

const CELL = 'py-2 px-2.5 align-middle'
/** Inline editors inside the table: borderless until hovered or focused. */
const INLINE = 'w-full bg-transparent text-[12px] rounded-md px-1.5 py-1 -mx-1.5 outline-none border border-transparent hover:border-[color:var(--light-gray)] focus:border-[color:var(--teal)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(84,125,114,0.14)] transition-[border-color,box-shadow]'
const DOC_BG = '#FBF9F5'
const DOC_HEAD_BG = '#F3EEE4'

const COLUMNS: Array<{ key: string; label: string; minWidth: number; sticky?: boolean }> = [
  { key: 'lastName',                label: 'Full name',            minWidth: 170, sticky: true },
  { key: 'level',                   label: 'Grade level',          minWidth: 100 },
  { key: 'schoolYear',              label: 'School Year',          minWidth: 90 },
  { key: 'lrnStatus',               label: 'LRN status',           minWidth: 90 },
  { key: 'lrn',                     label: 'LRN',                  minWidth: 120 },
  { key: 'psaBirthCertNo',          label: 'PSA Birth Cert No.',   minWidth: 130 },
  { key: 'middleName',              label: 'Middle name',          minWidth: 90 },
  { key: 'extensionName',           label: 'Extension',            minWidth: 80 },
  { key: 'dob',                     label: 'Date of birth',        minWidth: 100 },
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
  { key: 'lisStatus',               label: 'LIS status',           minWidth: 180 },
  { key: 'remittanceStatus',        label: 'Remittance',           minWidth: 110 },
  { key: 'admissionComments',       label: 'Comments / Remarks',   minWidth: 200 },
]

const DOC_COLUMNS = ['Enrollment Form', 'Parent Waiver', 'DepEd Affidavit', 'Report Card / SF9', 'PSA Birth Cert', 'Form 137 / SF10']

function Dash() {
  return <span aria-label="None" style={{ color: 'var(--light-gray)' }}>—</span>
}

function DocButtons({ onView, onDownload, viewTitle = 'View in a new tab', downloadTitle = 'Download' }: {
  onView: () => void; onDownload: () => void; viewTitle?: string; downloadTitle?: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={onView} title={viewTitle}
        className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold transition-colors hover:bg-white ${FOCUS}`}
        style={{ border: '1px solid var(--light-gray)', color: 'var(--deep-teal)', background: '#fff' }}>
        <Icon name="eye" size={12} /> View
      </button>
      <button type="button" onClick={onDownload} title={downloadTitle} aria-label={downloadTitle}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-white transition-opacity hover:opacity-90 ${FOCUS}`}
        style={{ background: 'var(--deep-teal)' }}>
        <Icon name="download" size={12} />
      </button>
    </span>
  )
}

/** Inline document-cell renderer for the /admission table. Shows View +
 *  Download buttons when the server has the blob; otherwise a faint dash.
 *  `localOnly` flags the case where the parent uploaded the file but it
 *  lives only in their browser's IndexedDB (legacy enrollments from before
 *  the server-blob sync shipped) so staff know to ask the parent to
 *  re-submit. `hint` exposes meta like "Signed 11/9/2026". */
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
        <span title="Parent uploaded this on their device, but it hasn't synced to the server yet. Ask the parent to re-submit on /documents, or upload on their behalf from the admin profile.">
          <StatusPill tone="warn">On parent&apos;s device</StatusPill>
        </span>
      )
    }
    if (hint) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--mid-gray)' }} title={`${hint} — file not uploaded yet`}>
          <Icon name="clock" size={12} /> {hint}
        </span>
      )
    }
    return <span title="Not uploaded"><Dash /></span>
  }
  return <DocButtons onView={onView} onDownload={onDownload} />
}
