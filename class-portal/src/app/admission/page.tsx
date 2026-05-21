'use client'

// Public admission tracker for the partner school. Gated by an access
// code (default "scei") instead of a class-portal sign-in so DepEd /
// LBCA staff can view + edit LIS status + remittance status without
// needing an account. Two tabs: one per branch, consolidating data
// from the same backend the front desk's spreadsheet writes to.

import { useEffect, useMemo, useState } from 'react'
import { backendOrigin } from '@/lib/backend'
import {
  levelLabel, LIS_STATUS_OPTIONS, REMITTANCE_OPTIONS,
  type LisStatus, type RemittanceStatus, type EnrollmentLevel,
} from '@/lib/session'
import { exportToPdf, exportToXlsx, type ExportCol } from '@/lib/admission-export'

const ACCESS_CODE_KEY = 'scei_admission_code_v1'

interface AdmissionStudent {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  branch: 'EAST' | 'GREENHILLS' | null
  level: EnrollmentLevel | null
  lrnStatus: string | null
  lrn: string | null
  cellphone: string | null
  diagnosis: string | null
  lisStatus: LisStatus | null
  remittanceStatus: RemittanceStatus | null
  admissionComments: string | null
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

  async function patchField(studentId: string, patch: Partial<Pick<AdmissionStudent, 'lisStatus' | 'remittanceStatus' | 'admissionComments'>>) {
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
    { header: 'Full name',      width: 200, value: s => [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email },
    { header: 'Grade level',    width: 110, value: s => s.level ? levelLabel(s.level) : '' },
    { header: 'LRN status',     width: 130, value: s => lrnLbl(s.lrnStatus) },
    { header: 'LRN',            width: 130, value: s => s.lrn ?? '' },
    { header: 'Cellphone',      width: 130, value: s => s.cellphone ?? '' },
    { header: 'Diagnosis',      width: 200, value: s => s.diagnosis ?? '' },
    { header: 'LIS status',     width: 220, value: s => lisLabel(s.lisStatus) },
    { header: 'Remittance',     width: 140, value: s => remitLabel(s.remittanceStatus) },
    { header: 'Comments / Remarks', width: 280, value: s => s.admissionComments ?? '' },
  ]

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
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 140 }}>Full name</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 80 }}>Grade level</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 80 }}>LRN status</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>LRN</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>Cellphone</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 140 }}>Diagnosis</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 160 }}>LIS status</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>Remittance</th>
                  <th className="py-1 px-1.5 font-semibold whitespace-nowrap" style={{ minWidth: 200 }}>Comments / Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="py-10 text-center text-[color:var(--mid-gray)]">No students in this branch yet.</td></tr>
                )}
                {filtered.map(s => (
                  <tr key={s.id} className="border-b hover:bg-[color:var(--paper-2)]" style={{ borderColor: 'var(--paper-3)' }}>
                    <td className="py-1 px-1.5 whitespace-nowrap">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.level ? levelLabel(s.level) : <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.lrnStatus === 'NO_LRN' ? 'NO LRN' : s.lrnStatus === 'WITH_LRN' ? 'WITH LRN' : s.lrnStatus === 'RETURNING' ? 'RETURNING' : <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.lrn || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5 whitespace-nowrap">{s.cellphone || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
                    <td className="py-1 px-1.5">{s.diagnosis || <span className="text-[color:var(--mid-gray)]">—</span>}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-3 text-center" style={{ fontFamily: 'var(--font-display)' }}>
          Edits save automatically · Refresh to pull the latest from the front desk
        </p>
      </div>
    </div>
  )
}
