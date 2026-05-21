'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getUsers, hydrateUsers, getPayments, updateUserEnrollment,
  levelLabel, branchLabel, lrnStatusLabel,
  LIS_STATUS_OPTIONS, REMITTANCE_OPTIONS,
  type StoredUser, type EnrollmentDraft, type Branch, type EnrollmentLevel,
  type LisStatus, type RemittanceStatus,
} from '@/lib/session'

type Col = {
  key: keyof EnrollmentDraft | 'fullName' | 'level' | 'branch'
  label: string
  width?: number
  /** Render as a dropdown using these options instead of a free-text input. */
  options?: Array<{ value: string; label: string }>
}

const COLS: Col[] = [
  { key: 'fullName',            label: 'Full name',           width: 200 },
  { key: 'level',               label: 'Grade level',         width: 110 },
  { key: 'branch',              label: 'Branch',              width: 130 },
  { key: 'lisStatus',           label: 'LIS status',          width: 200, options: LIS_STATUS_OPTIONS },
  { key: 'remittanceStatus',    label: 'Remittance',          width: 130, options: REMITTANCE_OPTIONS },
  { key: 'lrnStatus',           label: 'LRN status',          width: 130 },
  { key: 'lrn',                 label: 'LRN',                 width: 130 },
  { key: 'psaBirthCertNo',      label: 'PSA Birth Cert',      width: 160 },
  { key: 'dob',                 label: 'Date of birth',       width: 120 },
  { key: 'sex',                 label: 'Sex',                 width: 70 },
  { key: 'motherTongue',        label: 'Mother tongue',       width: 130 },
  { key: 'religion',            label: 'Religion',            width: 130 },
  { key: 'diagnosis',           label: 'Diagnosis',           width: 200 },
  { key: 'houseStreet',         label: 'House / Street',      width: 200 },
  { key: 'barangay',            label: 'Barangay',            width: 130 },
  { key: 'cityProvinceCountry', label: 'City / Province',     width: 160 },
  { key: 'zipCode',             label: 'Zip',                 width: 70 },
  { key: 'fatherOccupation',    label: 'Father occupation',   width: 160 },
  { key: 'motherOccupation',    label: 'Mother occupation',   width: 160 },
  { key: 'telephone',           label: 'Telephone',           width: 130 },
  { key: 'cellphone',           label: 'Cellphone',           width: 130 },
  { key: 'email',               label: 'Email',               width: 220 },
]

interface Props {
  /** Restricts editing to admin only; frontdesk + others get a read-only view. */
  canEdit?: boolean
}

/**
 * Spreadsheet-style table of all PAID students with their enrollment
 * fields inline (no uploaded files — those live in the student profile).
 * Live edits patch the API via updateUserEnrollment and re-hydrate.
 */
export default function PaidStudentsSpreadsheet({ canEdit = false }: Props) {
  const [students, setStudents] = useState<StoredUser[]>([])
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    hydrateUsers().then(us => setStudents(us.filter(u => u.role === 'STUDENT'))).catch(() => setStudents(getUsers().filter(u => u.role === 'STUDENT')))
    const ids = new Set(getPayments().filter(p => p.status === 'PAID').map(p => p.studentId))
    setPaidIds(ids)
  }, [])

  const rows = useMemo(() => {
    const pool = students.filter(s => paidIds.has(s.id))
    const q = search.trim().toLowerCase()
    if (!q) return pool
    return pool.filter(s => {
      const hay = `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.email} ${s.enrollment?.lrn ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [students, paidIds, search])

  function fullName(s: StoredUser): string {
    return [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
  }

  async function commit(studentId: string, key: keyof EnrollmentDraft | 'fullName', value: string) {
    if (key === 'fullName') {
      // Split into first + last for the patch.
      const idx = value.indexOf(' ')
      const firstName = (idx > 0 ? value.slice(0, idx) : value).trim() || undefined
      const lastName  = (idx > 0 ? value.slice(idx + 1) : '').trim() || undefined
      try {
        const updated = await updateUserEnrollment(studentId, { firstName, lastName })
        setStudents(prev => prev.map(s => s.id === studentId ? updated : s))
      } catch (e) { console.warn(e) }
      return
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { [key]: value }
      const updated = await updateUserEnrollment(studentId, patch)
      setStudents(prev => prev.map(s => s.id === studentId ? updated : s))
    } catch (e) { console.warn(e) }
  }

  /** Raw underlying value used as the input/select value (kept enum-like). */
  function cellValue(s: StoredUser, c: Col): string {
    if (c.key === 'fullName') return fullName(s)
    if (c.key === 'level')    return s.level ? levelLabel(s.level as EnrollmentLevel) : ''
    if (c.key === 'branch')   return s.branch ? branchLabel(s.branch as Branch) : ''
    const v = (s.enrollment as Partial<EnrollmentDraft> | undefined)?.[c.key as keyof EnrollmentDraft]
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  /** Human-friendly display for read-only cells. The data layer keeps
   *  enum-style values like WITH_LRN; here we render "WITH LRN" so the
   *  spreadsheet reads like a regular form (the all-caps version keeps
   *  visual rhythm with the rest of the uppercase entries). */
  function cellDisplay(s: StoredUser, c: Col): string {
    const raw = cellValue(s, c)
    if (!raw) return ''
    if (c.key === 'lrnStatus') {
      if (raw === 'NO_LRN')    return 'NO LRN'
      if (raw === 'WITH_LRN')  return 'WITH LRN'
      if (raw === 'RETURNING') return 'RETURNING (BALIK-ARAL)'
      return raw
    }
    if (c.options) {
      return c.options.find(o => o.value === raw)?.label ?? raw
    }
    return raw
  }

  return (
    // Break out of the parent layout's max-w-5xl so the spreadsheet uses
    // the full viewport width — fewer columns get clipped on a laptop,
    // less right-scrolling for the front desk.
    <div
      className="card-static"
      style={{
        width: '100vw',
        maxWidth: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        borderRadius: 0,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3 px-3 sm:px-5">
        <div>
          <h2 className="text-[18px] leading-tight">Paid students — enrollment register</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            One row per student who has a PAID payment record. {canEdit ? 'Click any cell to edit; changes save automatically.' : 'Read-only view.'}
          </p>
        </div>
        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or LRN"
          style={{ width: 280 }}
        />
      </div>

      <div className="overflow-auto rounded-xl border mx-3 sm:mx-5" style={{ borderColor: 'var(--paper-3)', maxHeight: 560 }}>
        <table className="text-[12.5px]" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-10" style={{ background: 'var(--paper-2)' }}>
            <tr className="text-left uppercase tracking-[0.08em] text-[11px] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
              {COLS.map(c => (
                <th key={String(c.key)} className="py-2 px-2.5 font-semibold whitespace-nowrap" style={{ minWidth: c.width }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} className="py-8 px-3 text-center text-[color:var(--mid-gray)]">No paid students yet.</td></tr>
            )}
            {rows.map(s => (
              <tr key={s.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                {COLS.map(c => {
                  const v = cellValue(s, c)
                  const display = cellDisplay(s, c)
                  // level + branch are derived — editing them requires touching
                  // the top-level user record. Treat as read-only here for now.
                  const isEditable = canEdit && c.key !== 'level' && c.key !== 'branch' && c.key !== 'fullName'
                  const isFullName = canEdit && c.key === 'fullName'
                  return (
                    <td key={String(c.key)} className="py-1.5 px-2.5 align-top" style={{ minWidth: c.width }}>
                      {isEditable && c.options ? (
                        <select
                          value={v}
                          className="w-full bg-transparent text-[12.5px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0.5"
                          onChange={e => {
                            const nv = e.target.value
                            if (nv !== v) commit(s.id, c.key as keyof EnrollmentDraft | 'fullName', nv)
                          }}
                        >
                          <option value="">—</option>
                          {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (isEditable || isFullName) ? (
                        <input
                          defaultValue={v}
                          className="w-full bg-transparent text-[12.5px] outline-none border-b border-transparent focus:border-[color:var(--narra)] py-0.5"
                          onBlur={e => {
                            const nv = e.target.value
                            if (nv !== v) commit(s.id, c.key as keyof EnrollmentDraft | 'fullName', nv)
                          }}
                        />
                      ) : (
                        <span className="text-[color:var(--ink)]">{display || <span className="text-[color:var(--mid-gray)]">—</span>}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
