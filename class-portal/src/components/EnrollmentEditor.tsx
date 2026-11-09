'use client'

import { useEffect, useState } from 'react'
import {
  updateUserEnrollment,
  ageFromDob, levelLabel,
  type EnrollmentDraft, type StoredUser,
  type EnrollmentLevel, type LrnStatus, type GuardianOfRecord, type NameParts,
} from '@/lib/session'
import { Portal } from './Modal'
import {
  Banner, BTN_PRIMARY, BTN_SECONDARY, CONTROL, CONTROL_STYLE, Dialog, GroupLabel, LABEL, LABEL_STYLE,
  PRIMARY_STYLE, SECONDARY_STYLE, displayName,
} from '@/components/hub/ui'

interface Props {
  student: StoredUser
  onClose: () => void
  onSaved: (updated: StoredUser) => void
  /** Label shown above the title bar. Defaults to "Admin · edit enrollment". */
  headerLabel?: string
}

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

/**
 * Admin-only modal that lets the main user fill in / correct any field on
 * the student's submitted enrollment data. The shape mirrors /enroll's
 * sections so values are interchangeable.
 */
export default function EnrollmentEditor({ student, onClose, onSaved, headerLabel }: Props) {
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

  async function save() {
    setBusy(true); setErr(null); setInfo(null)
    try {
      const updated = await updateUserEnrollment(student.id, draft)
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
    // Portaled to <body> so a transformed ancestor (animate-fade-up on
    // /profile) can't trap the fixed overlay; the z-[110] wrapper keeps
    // it above the Students list popup (z-[100]) when opened from there.
    <Portal>
    <div className="relative z-[110]">
    <Dialog
      labelId="enrollment-editor-title"
      size="lg"
      eyebrow={headerLabel ?? 'Admin · edit enrollment'}
      title={displayName(`${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()) || student.email}
      description={<span className="[overflow-wrap:anywhere]">{student.email} · enrolled in {student.level ? levelLabel(student.level) : '—'}</span>}
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onClose}>Close</button>
        <button type="button" disabled={busy} className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
        {err && <div className="mb-4"><Banner tone="error">{err}</Banner></div>}
        {info && <div className="mb-4"><Banner tone="success">{info}</Banner></div>}

        <div className="space-y-6">
          <Section title="School year & LRN">
            <Grid2>
              <Field label="School year (from)"><Input value={draft.schoolYearFrom ?? ''} onChange={v => patch('schoolYearFrom', v)} placeholder="2026" /></Field>
              <Field label="School year (to)"><Input value={draft.schoolYearTo ?? ''} onChange={v => patch('schoolYearTo', v)} placeholder="2027" /></Field>
            </Grid2>
            <Field label="LRN status">
              <select className={SELECT} style={CONTROL_STYLE} value={draft.lrnStatus ?? ''} onChange={e => patch('lrnStatus', (e.target.value || undefined) as LrnStatus | undefined)}>
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
              <Field label="Date of birth"><input type="date" className={SELECT} style={CONTROL_STYLE} value={draft.dob ?? ''} onChange={e => patch('dob', e.target.value)} /></Field>
              <Field label="Age (auto)"><Input value={draft.dob ? ageFromDob(draft.dob) : ''} readOnly /></Field>
              <Field label="Sex">
                <select className={SELECT} style={CONTROL_STYLE} value={draft.sex ?? ''} onChange={e => patch('sex', (e.target.value || undefined) as 'MALE' | 'FEMALE' | undefined)}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
            </Grid3>
            <Grid2>
              <Field label="IP / ICC community?">
                <select className={SELECT} style={CONTROL_STYLE} value={draft.ipMember ?? ''} onChange={e => patch('ipMember', (e.target.value || undefined) as 'YES' | 'NO' | undefined)}>
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
              <Field label="Nationality"><Upper value={draft.nationality ?? ''} onChange={v => patch('nationality', v)} /></Field>
              <Field label="PWD ID Number (optional)"><Upper value={draft.pwdIdNumber ?? ''} onChange={v => patch('pwdIdNumber', v)} /></Field>
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
              <Upper value={draft.father?.lastName ?? ''} onChange={v => patchName('father', 'lastName', v)} label="Father's last name" placeholder="LAST NAME" />
              <Upper value={draft.father?.firstName ?? ''} onChange={v => patchName('father', 'firstName', v)} label="Father's first name" placeholder="FIRST NAME" />
              <Upper value={draft.father?.middleName ?? ''} onChange={v => patchName('father', 'middleName', v)} label="Father's middle name" placeholder="MIDDLE NAME" />
            </Grid3>
            <Field label="Father&apos;s occupation"><Upper value={draft.fatherOccupation ?? ''} onChange={v => patch('fatherOccupation', v)} /></Field>

            <SubHead>Mother&apos;s Maiden Name (Last, First, Middle)</SubHead>
            <Grid3>
              <Upper value={draft.mother?.lastName ?? ''} onChange={v => patchName('mother', 'lastName', v)} label="Mother's last name" placeholder="LAST NAME" />
              <Upper value={draft.mother?.firstName ?? ''} onChange={v => patchName('mother', 'firstName', v)} label="Mother's first name" placeholder="FIRST NAME" />
              <Upper value={draft.mother?.middleName ?? ''} onChange={v => patchName('mother', 'middleName', v)} label="Mother's middle name" placeholder="MIDDLE NAME" />
            </Grid3>
            <Field label="Mother&apos;s occupation"><Upper value={draft.motherOccupation ?? ''} onChange={v => patch('motherOccupation', v)} /></Field>

            <Field label="Official guardian">
              <select className={SELECT} style={CONTROL_STYLE} value={draft.guardianOfRecord ?? 'OTHER'} onChange={e => patch('guardianOfRecord', e.target.value as GuardianOfRecord)}>
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="OTHER">Other (fill below)</option>
              </select>
            </Field>
            {!guardianFieldsDisabled && (
              <>
                <SubHead>Guardian&apos;s Name (Last, First, Middle)</SubHead>
                <Grid3>
                  <Upper value={draft.guardian?.lastName ?? ''} onChange={v => patchName('guardian', 'lastName', v)} label="Guardian's last name" placeholder="LAST NAME" />
                  <Upper value={draft.guardian?.firstName ?? ''} onChange={v => patchName('guardian', 'firstName', v)} label="Guardian's first name" placeholder="FIRST NAME" />
                  <Upper value={draft.guardian?.middleName ?? ''} onChange={v => patchName('guardian', 'middleName', v)} label="Guardian's middle name" placeholder="MIDDLE NAME" />
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
              <select className={SELECT} style={CONTROL_STYLE} value={draft.isReturningOrTransferee ?? 'NO'} onChange={e => patch('isReturningOrTransferee', e.target.value as 'YES' | 'NO')}>
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
              <select className={SELECT} style={CONTROL_STYLE} value={draft.level ?? student.level ?? 'KINDER'} onChange={e => patch('level', e.target.value as EnrollmentLevel)}>
                {ALL_LEVELS.map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </select>
            </Field>
          </Section>
        </div>
    </Dialog>
    </div>
    </Portal>
  )
}

/* ───────── tiny UI helpers (kept local so we don't add another file) ───────── */

const SELECT = `${CONTROL} w-full`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 min-w-0">
      <div className="pb-2" style={{ borderBottom: '1px solid var(--light-gray)' }}><GroupLabel>{title}</GroupLabel></div>
      {children}
    </section>
  )
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-bold pt-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{children}</div>
}
function Grid2({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div> }
function Grid3({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className={LABEL} style={LABEL_STYLE}>{label}</span>{children}</label>
}
function Input({ value, onChange, readOnly, placeholder }: { value: string; onChange?: (v: string) => void; readOnly?: boolean; placeholder?: string }) {
  return <input className={`${CONTROL} w-full`} style={readOnly ? { ...CONTROL_STYLE, background: '#F6F8EE' } : CONTROL_STYLE} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} readOnly={readOnly} placeholder={placeholder} />
}
/** `label` is the accessible name for the name-part boxes that sit under
 *  a SubHead instead of their own visible label. */
function Upper({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return <input className={`${CONTROL} w-full`} aria-label={label} value={value} onChange={e => onChange(e.target.value.toUpperCase())} placeholder={placeholder} style={{ ...CONTROL_STYLE, textTransform: 'uppercase' }} />
}
