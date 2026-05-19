'use client'

import { useEffect, useState } from 'react'
import {
  updateUserEnrollment,
  ageFromDob, levelLabel,
  type EnrollmentDraft, type StoredUser,
  type EnrollmentLevel, type LrnStatus, type GuardianOfRecord, type NameParts,
} from '@/lib/session'

interface Props {
  student: StoredUser
  onClose: () => void
  onSaved: (updated: StoredUser) => void
}

const ALL_LEVELS: EnrollmentLevel[] = ['KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6']

/**
 * Admin-only modal that lets the main user fill in / correct any field on
 * the student's submitted enrollment data. The shape mirrors /enroll's
 * sections so values are interchangeable.
 */
export default function EnrollmentEditor({ student, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Partial<EnrollmentDraft>>(() => ({ ...(student.enrollment ?? {}), level: (student.enrollment?.level ?? student.level) as EnrollmentLevel }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Keep age in sync with dob
  useEffect(() => {
    if (draft.dob) setDraft(d => ({ ...d, /* age is derived elsewhere */ }))
  }, [draft.dob])

  function patch<K extends keyof EnrollmentDraft>(key: K, value: EnrollmentDraft[K] | undefined) {
    setDraft(d => ({ ...d, [key]: value }))
  }
  function patchName(field: 'father' | 'mother' | 'guardian', part: keyof NameParts, value: string) {
    setDraft(d => ({
      ...d,
      [field]: { ...(d[field] ?? { lastName: '', firstName: '', middleName: '' }), [part]: value.toUpperCase() } as NameParts,
    }))
  }

  function save() {
    setBusy(true); setErr(null); setInfo(null)
    try {
      const updated = updateUserEnrollment(student.id, draft)
      setInfo('Saved.')
      onSaved(updated)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const guardianFieldsDisabled = draft.guardianOfRecord === 'FATHER' || draft.guardianOfRecord === 'MOTHER'

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm overflow-y-auto p-4 animate-fade-in" onClick={onClose}>
      <div className="max-w-3xl mx-auto my-4 card-static" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Admin · edit enrollment</div>
            <h2 className="text-[22px] leading-tight text-[color:var(--deep-teal)]">{student.firstName} {student.lastName}</h2>
            <p className="text-sm text-[color:var(--mid-gray)]">{student.email} · enrolled in {student.level ? levelLabel(student.level) : '—'}</p>
          </div>
          <button className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
        </div>

        {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        {info && <div className="mb-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">{info}</div>}

        <div className="space-y-5">
          <Section title="School year & LRN">
            <Grid2>
              <Field label="School year (from)"><Input value={draft.schoolYearFrom ?? ''} onChange={v => patch('schoolYearFrom', v)} placeholder="2026" /></Field>
              <Field label="School year (to)"><Input value={draft.schoolYearTo ?? ''} onChange={v => patch('schoolYearTo', v)} placeholder="2027" /></Field>
            </Grid2>
            <Field label="LRN status">
              <select className="select" value={draft.lrnStatus ?? ''} onChange={e => patch('lrnStatus', (e.target.value || undefined) as LrnStatus | undefined)}>
                <option value="">—</option>
                <option value="NO_LRN">No LRN</option>
                <option value="WITH_LRN">With LRN</option>
                <option value="RETURNING">Returning</option>
              </select>
            </Field>
            {draft.lrnStatus === 'WITH_LRN' && (
              <Field label="Learner Reference No. (LRN)"><Upper value={draft.lrn ?? ''} onChange={v => patch('lrn', v)} /></Field>
            )}
            <Field label="PSA Birth Certificate No."><Upper value={draft.psaBirthCertNo ?? ''} onChange={v => patch('psaBirthCertNo', v)} /></Field>
          </Section>

          <Section title="Student info">
            <Grid2>
              <Field label="Last name"><Upper value={draft.lastName ?? ''} onChange={v => patch('lastName', v)} /></Field>
              <Field label="First name"><Upper value={draft.firstName ?? ''} onChange={v => patch('firstName', v)} /></Field>
            </Grid2>
            <Grid2>
              <Field label="Middle name"><Upper value={draft.middleName ?? ''} onChange={v => patch('middleName', v)} /></Field>
              <Field label="Extension name"><Upper value={draft.extensionName ?? ''} onChange={v => patch('extensionName', v)} placeholder="JR, III, …" /></Field>
            </Grid2>
            <Grid3>
              <Field label="Date of birth"><input type="date" className="input" value={draft.dob ?? ''} onChange={e => patch('dob', e.target.value)} /></Field>
              <Field label="Age (auto)"><Input value={draft.dob ? ageFromDob(draft.dob) : ''} readOnly /></Field>
              <Field label="Sex">
                <select className="select" value={draft.sex ?? ''} onChange={e => patch('sex', (e.target.value || undefined) as 'MALE' | 'FEMALE' | undefined)}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
            </Grid3>
            <Grid2>
              <Field label="IP / ICC community?">
                <select className="select" value={draft.ipMember ?? ''} onChange={e => patch('ipMember', (e.target.value || undefined) as 'YES' | 'NO' | undefined)}>
                  <option value="">—</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                </select>
              </Field>
              <Field label="If yes, specify"><Upper value={draft.ipCommunity ?? ''} onChange={v => patch('ipCommunity', v)} /></Field>
            </Grid2>
            <Grid2>
              <Field label="Mother tongue"><Upper value={draft.motherTongue ?? ''} onChange={v => patch('motherTongue', v)} /></Field>
              <Field label="Religion"><Upper value={draft.religion ?? ''} onChange={v => patch('religion', v)} /></Field>
            </Grid2>
            <Field label="Diagnosis (if applicable)"><Upper value={draft.diagnosis ?? ''} onChange={v => patch('diagnosis', v)} /></Field>
          </Section>

          <Section title="Address">
            <Field label="House number and street"><Upper value={draft.houseStreet ?? ''} onChange={v => patch('houseStreet', v)} /></Field>
            <Grid2>
              <Field label="Barangay"><Upper value={draft.barangay ?? ''} onChange={v => patch('barangay', v)} /></Field>
              <Field label="Zip code"><Upper value={draft.zipCode ?? ''} onChange={v => patch('zipCode', v)} /></Field>
            </Grid2>
            <Field label="City / Municipality / Province / Country"><Upper value={draft.cityProvinceCountry ?? ''} onChange={v => patch('cityProvinceCountry', v)} /></Field>
          </Section>

          <Section title="Parent / Guardian">
            <SubHead>Father&apos;s Name (Last, First, Middle)</SubHead>
            <Grid3>
              <Upper value={draft.father?.lastName ?? ''} onChange={v => patchName('father', 'lastName', v)} placeholder="LAST NAME" />
              <Upper value={draft.father?.firstName ?? ''} onChange={v => patchName('father', 'firstName', v)} placeholder="FIRST NAME" />
              <Upper value={draft.father?.middleName ?? ''} onChange={v => patchName('father', 'middleName', v)} placeholder="MIDDLE NAME" />
            </Grid3>
            <Field label="Father&apos;s occupation"><Upper value={draft.fatherOccupation ?? ''} onChange={v => patch('fatherOccupation', v)} /></Field>

            <SubHead>Mother&apos;s Maiden Name (Last, First, Middle)</SubHead>
            <Grid3>
              <Upper value={draft.mother?.lastName ?? ''} onChange={v => patchName('mother', 'lastName', v)} placeholder="LAST NAME" />
              <Upper value={draft.mother?.firstName ?? ''} onChange={v => patchName('mother', 'firstName', v)} placeholder="FIRST NAME" />
              <Upper value={draft.mother?.middleName ?? ''} onChange={v => patchName('mother', 'middleName', v)} placeholder="MIDDLE NAME" />
            </Grid3>
            <Field label="Mother&apos;s occupation"><Upper value={draft.motherOccupation ?? ''} onChange={v => patch('motherOccupation', v)} /></Field>

            <Field label="Official guardian">
              <select className="select" value={draft.guardianOfRecord ?? 'OTHER'} onChange={e => patch('guardianOfRecord', e.target.value as GuardianOfRecord)}>
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="OTHER">Other (fill below)</option>
              </select>
            </Field>
            {!guardianFieldsDisabled && (
              <>
                <SubHead>Guardian&apos;s Name (Last, First, Middle)</SubHead>
                <Grid3>
                  <Upper value={draft.guardian?.lastName ?? ''} onChange={v => patchName('guardian', 'lastName', v)} placeholder="LAST NAME" />
                  <Upper value={draft.guardian?.firstName ?? ''} onChange={v => patchName('guardian', 'firstName', v)} placeholder="FIRST NAME" />
                  <Upper value={draft.guardian?.middleName ?? ''} onChange={v => patchName('guardian', 'middleName', v)} placeholder="MIDDLE NAME" />
                </Grid3>
              </>
            )}
            <Grid3>
              <Field label="Telephone"><Upper value={draft.telephone ?? ''} onChange={v => patch('telephone', v)} /></Field>
              <Field label="Cellphone"><Upper value={draft.cellphone ?? ''} onChange={v => patch('cellphone', v)} /></Field>
              <Field label="Email"><Upper value={draft.email ?? ''} onChange={v => patch('email', v)} /></Field>
            </Grid3>
          </Section>

          <Section title="Returning learner / transferee">
            <Field label="Is the student a returning learner or transferee?">
              <select className="select" value={draft.isReturningOrTransferee ?? 'NO'} onChange={e => patch('isReturningOrTransferee', e.target.value as 'YES' | 'NO')}>
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </Field>
            {draft.isReturningOrTransferee === 'YES' && (
              <>
                <Grid2>
                  <Field label="Last grade completed"><Upper value={draft.lastGradeCompleted ?? ''} onChange={v => patch('lastGradeCompleted', v)} /></Field>
                  <Field label="Last school year completed"><Upper value={draft.lastSchoolYearCompleted ?? ''} onChange={v => patch('lastSchoolYearCompleted', v)} placeholder="e.g. 2024 TO 2025" /></Field>
                </Grid2>
                <Grid2>
                  <Field label="Previous school name"><Upper value={draft.previousSchoolName ?? ''} onChange={v => patch('previousSchoolName', v)} /></Field>
                  <Field label="Previous school ID"><Upper value={draft.previousSchoolId ?? ''} onChange={v => patch('previousSchoolId', v)} /></Field>
                </Grid2>
                <Field label="Previous school address"><Upper value={draft.previousSchoolAddress ?? ''} onChange={v => patch('previousSchoolAddress', v)} /></Field>
              </>
            )}
          </Section>

          <Section title="Class program">
            <Field label="Enrolled grade level">
              <select className="select" value={draft.level ?? student.level ?? 'KINDER'} onChange={e => patch('level', e.target.value as EnrollmentLevel)}>
                {ALL_LEVELS.map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </select>
            </Field>
          </Section>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" disabled={busy} className="btn-primary" onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

/* ───────── tiny UI helpers (kept local so we don't add another file) ───────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
      {children}
    </div>
  )
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{children}</div>
}
function Grid2({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-2 gap-3">{children}</div> }
function Grid3({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-3 gap-3">{children}</div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
function Input({ value, onChange, readOnly, placeholder }: { value: string; onChange?: (v: string) => void; readOnly?: boolean; placeholder?: string }) {
  return <input className="input" value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} readOnly={readOnly} placeholder={placeholder} />
}
function Upper({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input" value={value} onChange={e => onChange(e.target.value.toUpperCase())} placeholder={placeholder} style={{ textTransform: 'uppercase' }} />
}
