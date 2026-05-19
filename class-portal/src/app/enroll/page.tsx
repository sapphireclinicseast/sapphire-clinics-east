'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitLearnerProfile } from '@/lib/api'
import {
  getSession, setSession, getDraft, setDraft, levelLabel, ageFromDob,
  type LrnStatus, type GuardianOfRecord, type NameParts,
} from '@/lib/session'
import SignaturePad from '@/components/SignaturePad'

// All text inputs in this form auto-uppercase the value on every keystroke,
// so what the parent sees on screen matches what is stored / printed later.

export default function EnrollPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [levelLbl, setLevelLbl] = useState('')

  // Form state
  const [schoolYearFrom, setSchoolYearFrom] = useState('')
  const [schoolYearTo, setSchoolYearTo] = useState('')
  const [lrnStatus, setLrnStatus] = useState<LrnStatus | ''>('')
  const [lrn, setLrn] = useState('')
  const [psaBirthCertNo, setPsaBirthCertNo] = useState('')

  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [extensionName, setExtensionName] = useState('')

  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<'MALE' | 'FEMALE' | ''>('')

  const [ipMember, setIpMember] = useState<'YES' | 'NO' | ''>('')
  const [ipCommunity, setIpCommunity] = useState('')

  const [motherTongue, setMotherTongue] = useState('')
  const [religion, setReligion] = useState('')
  const [diagnosis, setDiagnosis] = useState('')

  const [houseStreet, setHouseStreet] = useState('')
  const [barangay, setBarangay] = useState('')
  const [cityProvinceCountry, setCityProvinceCountry] = useState('')
  const [zipCode, setZipCode] = useState('')

  const [father, setFather] = useState<NameParts>({ lastName: '', firstName: '', middleName: '' })
  const [fatherOccupation, setFatherOccupation] = useState('')
  const [mother, setMother] = useState<NameParts>({ lastName: '', firstName: '', middleName: '' })
  const [motherOccupation, setMotherOccupation] = useState('')
  const [guardian, setGuardian] = useState<NameParts>({ lastName: '', firstName: '', middleName: '' })
  const [guardianOfRecord, setGuardianOfRecord] = useState<GuardianOfRecord>('OTHER')

  const [telephone, setTelephone] = useState('')
  const [cellphone, setCellphone] = useState('')
  const [email, setEmail] = useState('')

  const [isReturningOrTransferee, setIsReturningOrTransferee] = useState<'YES' | 'NO' | ''>('')
  const [lastGradeCompleted, setLastGradeCompleted] = useState('')
  const [lastSchoolYearCompleted, setLastSchoolYearCompleted] = useState('')
  const [previousSchoolName, setPreviousSchoolName] = useState('')
  const [previousSchoolId, setPreviousSchoolId] = useState('')
  const [previousSchoolAddress, setPreviousSchoolAddress] = useState('')

  const [certSignatureDataUrl, setCertSignatureDataUrl] = useState('')
  const [certSignatureName, setCertSignatureName] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/?expired=1'); return }
    setLevelLbl(levelLabel(s.level))
    // Rehydrate from draft if the user is editing a previously started form.
    const d = getDraft()
    if (d) {
      setSchoolYearFrom(d.schoolYearFrom ?? '')
      setSchoolYearTo(d.schoolYearTo ?? '')
      setLrnStatus(d.lrnStatus ?? '')
      setLrn(d.lrn ?? '')
      setPsaBirthCertNo(d.psaBirthCertNo ?? '')
      setLastName(d.lastName ?? '')
      setFirstName(d.firstName ?? '')
      setMiddleName(d.middleName ?? '')
      setExtensionName(d.extensionName ?? '')
      setDob(d.dob ?? '')
      setSex(d.sex ?? '')
      setIpMember(d.ipMember ?? '')
      setIpCommunity(d.ipCommunity ?? '')
      setMotherTongue(d.motherTongue ?? '')
      setReligion(d.religion ?? '')
      setDiagnosis(d.diagnosis ?? '')
      setHouseStreet(d.houseStreet ?? '')
      setBarangay(d.barangay ?? '')
      setCityProvinceCountry(d.cityProvinceCountry ?? '')
      setZipCode(d.zipCode ?? '')
      if (d.father) setFather(d.father)
      setFatherOccupation(d.fatherOccupation ?? '')
      if (d.mother) setMother(d.mother)
      setMotherOccupation(d.motherOccupation ?? '')
      if (d.guardian) setGuardian(d.guardian)
      setGuardianOfRecord(d.guardianOfRecord ?? 'OTHER')
      setTelephone(d.telephone ?? '')
      setCellphone(d.cellphone ?? '')
      setEmail(d.email ?? '')
      setIsReturningOrTransferee(d.isReturningOrTransferee ?? '')
      setLastGradeCompleted(d.lastGradeCompleted ?? '')
      setLastSchoolYearCompleted(d.lastSchoolYearCompleted ?? '')
      setPreviousSchoolName(d.previousSchoolName ?? '')
      setPreviousSchoolId(d.previousSchoolId ?? '')
      setPreviousSchoolAddress(d.previousSchoolAddress ?? '')
      setCertSignatureDataUrl(d.certSignatureDataUrl ?? '')
      setCertSignatureName(d.certSignatureName ?? '')
    }
    setReady(true)
  }, [router])

  const age = useMemo(() => ageFromDob(dob), [dob])
  const guardianFieldsDisabled = guardianOfRecord === 'FATHER' || guardianOfRecord === 'MOTHER'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      // Required-field check beyond what the browser enforces with `required`.
      const missing: string[] = []
      if (!schoolYearFrom || !schoolYearTo) missing.push('School year')
      if (!lrnStatus) missing.push('LRN status')
      if (lrnStatus === 'WITH_LRN' && !lrn.trim()) missing.push('LRN')
      if (!psaBirthCertNo.trim()) missing.push('PSA Birth Certificate No.')
      if (!lastName.trim()) missing.push('Last Name')
      if (!firstName.trim()) missing.push('First Name')
      if (!middleName.trim()) missing.push('Middle Name')
      if (!dob) missing.push('Date of Birth')
      if (!sex) missing.push('Sex')
      if (!ipMember) missing.push('IP membership')
      if (ipMember === 'YES' && !ipCommunity.trim()) missing.push('IP community')
      if (!motherTongue.trim()) missing.push('Mother tongue')
      if (!religion.trim()) missing.push('Religion')
      if (!houseStreet.trim() || !barangay.trim() || !cityProvinceCountry.trim() || !zipCode.trim()) missing.push('Address')
      if (!father.lastName.trim() || !father.firstName.trim() || !father.middleName.trim()) missing.push("Father's Name")
      if (!mother.lastName.trim() || !mother.firstName.trim() || !mother.middleName.trim()) missing.push("Mother's Maiden Name")
      if (!telephone.trim()) missing.push('Telephone')
      if (!cellphone.trim()) missing.push('Cellphone')
      if (!email.trim()) missing.push('Email')
      if (isReturningOrTransferee === 'YES') {
        if (!lastGradeCompleted.trim()) missing.push('Last Grade Completed')
        if (!lastSchoolYearCompleted.trim()) missing.push('Last School Year Completed')
        if (!previousSchoolName.trim()) missing.push('Previous School Name')
        if (!previousSchoolAddress.trim()) missing.push('Previous School Address')
      }
      if (!certSignatureName.trim()) missing.push('Parent/Guardian printed name')
      if (!certSignatureDataUrl) missing.push('Signature')
      if (missing.length) {
        setErr('Please complete: ' + missing.join(', '))
        setBusy(false); return
      }

      const session = getSession()
      if (!session) { router.replace('/?expired=1'); return }

      const certSignedAt = new Date().toISOString()
      const payload = {
        level: session.level,
        schoolYearFrom, schoolYearTo,
        lrnStatus: lrnStatus as LrnStatus,
        lrn: lrnStatus === 'WITH_LRN' ? lrn : undefined,
        psaBirthCertNo,
        lastName, firstName, middleName, extensionName,
        dob, sex: sex as 'MALE' | 'FEMALE',
        ipMember: ipMember as 'YES' | 'NO',
        ipCommunity: ipMember === 'YES' ? ipCommunity : undefined,
        motherTongue, religion,
        ...(diagnosis ? { diagnosis } : {}),
        houseStreet, barangay, cityProvinceCountry, zipCode,
        father, mother,
        ...(fatherOccupation ? { fatherOccupation } : {}),
        ...(motherOccupation ? { motherOccupation } : {}),
        guardian: guardianOfRecord === 'OTHER' ? guardian : undefined,
        guardianOfRecord,
        telephone, cellphone, email,
        isReturningOrTransferee: isReturningOrTransferee || 'NO',
        ...(isReturningOrTransferee === 'YES' ? {
          lastGradeCompleted,
          lastSchoolYearCompleted,
          previousSchoolName,
          previousSchoolId: previousSchoolId || undefined,
          previousSchoolAddress,
        } : {}),
        certSignatureDataUrl,
        certSignatureName,
        certSignedAt,
      } as const

      const res = await submitLearnerProfile(session.token, payload)
      // Persist the full draft so /documents (and any return visit) sees it.
      setDraft(payload)
      // Replace the placeholder session with the student's real first name + level.
      setSession({ ...session, studentId: res.studentId, firstName: firstName || res.firstName })
      router.push('/documents')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <div className="max-w-3xl mx-auto animate-fade-up">
      <StepBar step={2} />

      <div className="card-static">
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-1">Learner profile</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-6">
          Enrolling for <span className="font-semibold text-[color:var(--narra)]">{levelLbl}</span>. All text is recorded in capital letters.
        </p>

        {err && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
            {err}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* School year + LRN */}
          <Section title="School year & LRN">
            <Field label="School year" required>
              <div className="flex items-center gap-2">
                <input required type="number" min={2000} max={2100} className="input"
                  value={schoolYearFrom} onChange={e => setSchoolYearFrom(e.target.value)}
                  placeholder="2026" style={{ width: 110 }} />
                <span className="text-sm text-[color:var(--mid-gray)]">to</span>
                <input required type="number" min={2000} max={2100} className="input"
                  value={schoolYearTo} onChange={e => setSchoolYearTo(e.target.value)}
                  placeholder="2027" style={{ width: 110 }} />
              </div>
            </Field>

            <Field label="Learner status" required>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {([
                  ['NO_LRN', 'No LRN'],
                  ['WITH_LRN', 'With LRN'],
                  ['RETURNING', 'Returning'],
                ] as const).map(([v, lbl]) => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm text-[color:var(--ink)]">
                    <input type="radio" name="lrnStatus" value={v} checked={lrnStatus === v} onChange={() => setLrnStatus(v)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </Field>

            {lrnStatus === 'WITH_LRN' && (
              <Field label="Learner Reference No. (LRN)" required>
                <UInput value={lrn} onValue={setLrn} placeholder="12-DIGIT LRN" />
              </Field>
            )}

            <Field label="PSA Birth Certificate No." required>
              <UInput required value={psaBirthCertNo} onValue={setPsaBirthCertNo} placeholder="e.g. 2017-1234567" />
            </Field>
          </Section>

          {/* Personal */}
          <Section title="Student info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Last Name" required>
                <UInput required value={lastName} onValue={setLastName} />
              </Field>
              <Field label="Full First Name" required>
                <UInput required value={firstName} onValue={setFirstName} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Middle Name" required>
                <UInput required value={middleName} onValue={setMiddleName} />
              </Field>
              <Field label="Extension Name (e.g. Jr., III)">
                <UInput value={extensionName} onValue={setExtensionName} placeholder="OPTIONAL" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Date of Birth" required>
                <input required type="date" className="input" value={dob} onChange={e => setDob(e.target.value)} />
              </Field>
              <Field label="Age (auto)">
                <input className="input" value={age} readOnly tabIndex={-1} />
              </Field>
              <Field label="Sex" required>
                <select required className="select" value={sex} onChange={e => setSex(e.target.value as 'MALE' | 'FEMALE')}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
            </div>

            <Field label="Belonging to any Indigenous Peoples (IP) Community / Indigenous Cultural Community?" required>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(['YES', 'NO'] as const).map(v => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm text-[color:var(--ink)]">
                    <input type="radio" name="ipMember" value={v} checked={ipMember === v} onChange={() => setIpMember(v)} />
                    {v === 'YES' ? 'Yes' : 'No'}
                  </label>
                ))}
              </div>
            </Field>
            {ipMember === 'YES' && (
              <Field label="If yes, please specify" required>
                <UInput required value={ipCommunity} onValue={setIpCommunity} placeholder="Community name" />
              </Field>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Mother tongue" required>
                <UInput required value={motherTongue} onValue={setMotherTongue} />
              </Field>
              <Field label="Religion" required>
                <UInput required value={religion} onValue={setReligion} />
              </Field>
            </div>
            <Field label="Diagnosis (if applicable)">
              <UInput value={diagnosis} onValue={setDiagnosis} placeholder="OPTIONAL" />
            </Field>
          </Section>

          {/* Address */}
          <Section title="Address" required>
            <Field label="House Number and Street" required>
              <UInput required value={houseStreet} onValue={setHouseStreet} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Barangay" required>
                <UInput required value={barangay} onValue={setBarangay} />
              </Field>
              <Field label="Zip Code" required>
                <UInput required value={zipCode} onValue={setZipCode} placeholder="e.g. 1100" />
              </Field>
            </div>
            <Field label="City / Municipality / Province / Country" required>
              <UInput required value={cityProvinceCountry} onValue={setCityProvinceCountry} placeholder="e.g. QUEZON CITY, METRO MANILA, PHILIPPINES" />
            </Field>
          </Section>

          {/* Parents / Guardian */}
          <Section title="Parent's / Guardian's information">
            <PersonNameRow
              label="Father's Name"
              required
              value={father}
              onChange={setFather}
              checkboxLabel="Is Father the official guardian?"
              checked={guardianOfRecord === 'FATHER'}
              onChecked={c => setGuardianOfRecord(c ? 'FATHER' : guardianOfRecord === 'FATHER' ? 'OTHER' : guardianOfRecord)}
            />
            <Field label="Father's Occupation">
              <UInput value={fatherOccupation} onValue={setFatherOccupation} placeholder="OPTIONAL" />
            </Field>
            <PersonNameRow
              label="Mother's Maiden Name"
              required
              value={mother}
              onChange={setMother}
              checkboxLabel="Is Mother the official guardian?"
              checked={guardianOfRecord === 'MOTHER'}
              onChecked={c => setGuardianOfRecord(c ? 'MOTHER' : guardianOfRecord === 'MOTHER' ? 'OTHER' : guardianOfRecord)}
            />
            <Field label="Mother's Occupation">
              <UInput value={motherOccupation} onValue={setMotherOccupation} placeholder="OPTIONAL" />
            </Field>
            <PersonNameRow
              label="Guardian's Name"
              value={guardian}
              onChange={setGuardian}
              disabled={guardianFieldsDisabled}
              hint={guardianFieldsDisabled ? `Disabled — ${guardianOfRecord === 'FATHER' ? 'Father' : 'Mother'} is the official guardian.` : undefined}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Telephone Number" required>
                <UInput required value={telephone} onValue={setTelephone} placeholder="(02) XXXX XXXX" />
              </Field>
              <Field label="Cellphone Number" required>
                <UInput required value={cellphone} onValue={setCellphone} placeholder="+63 9XX XXX XXXX" />
              </Field>
            </div>
            <Field label="Email" required>
              {/* Email stays uppercased per the rule; backends usually normalise on store. */}
              <UInput required value={email} onValue={setEmail} placeholder="PARENT@EXAMPLE.COM" inputMode="email" />
            </Field>
          </Section>

          {/* Returning / Transferee */}
          <Section title="Returning learner or transferee?">
            <Field label="Is the Student a returning learner or transferee?" required>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(['YES', 'NO'] as const).map(v => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm text-[color:var(--ink)]">
                    <input type="radio" name="isReturningOrTransferee" value={v} checked={isReturningOrTransferee === v} onChange={() => setIsReturningOrTransferee(v)} />
                    {v === 'YES' ? 'Yes' : 'No'}
                  </label>
                ))}
              </div>
            </Field>

            {isReturningOrTransferee === 'YES' && (
              <div className="space-y-3.5 pl-3 border-l-2" style={{ borderColor: 'var(--paper-3)' }}>
                <div className="text-[11.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                  For Returning Learners (Balik-Aral) and Those Who Shall Transfer / Move In
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Last Grade Level Completed" required>
                    <UInput required value={lastGradeCompleted} onValue={setLastGradeCompleted} />
                  </Field>
                  <Field label="Last School Year Completed" required>
                    <UInput required value={lastSchoolYearCompleted} onValue={setLastSchoolYearCompleted} placeholder="e.g. 2024 TO 2025" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="School Name" required>
                    <UInput required value={previousSchoolName} onValue={setPreviousSchoolName} />
                  </Field>
                  <Field label="School ID">
                    <UInput value={previousSchoolId} onValue={setPreviousSchoolId} placeholder="OPTIONAL" />
                  </Field>
                </div>
                <Field label="School Address" required>
                  <UInput required value={previousSchoolAddress} onValue={setPreviousSchoolAddress} />
                </Field>
              </div>
            )}
          </Section>

          {/* Certification + signature */}
          <Section title="Certification">
            <p className="text-[13.5px] text-[color:var(--ink)] leading-relaxed">
              I hereby certify that the above information given are true and correct to the best of my knowledge and I allow the Department of Education to use my child&apos;s details to create and/or update his/her learner profile in the Learner Information System. The information herein shall be treated as confidential in compliance with the Data Privacy Act of 2012.
            </p>

            <Field label="Signature Over Printed Name of Parent / Guardian" required>
              <UInput required value={certSignatureName} onValue={setCertSignatureName} placeholder="PARENT / GUARDIAN PRINTED NAME" />
            </Field>
            <div>
              <span className="label">Signature</span>
              <SignaturePad initialValue={certSignatureDataUrl} onChange={setCertSignatureDataUrl} />
            </div>
            <Field label="Date">
              <input className="input" value={new Date().toLocaleDateString()} readOnly tabIndex={-1} />
            </Field>
          </Section>

          <div className="flex items-center gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => router.push('/')}>← Back</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? 'Saving…' : 'Continue to documents →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ───────────────────────── reusable bits ───────────────────────── */

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3.5">
      <legend className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
        {title}{required ? ' *' : ''}
      </legend>
      {children}
    </fieldset>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}

/**
 * Uppercase-as-you-type input. Uppercases at the React state layer so the
 * value submitted matches what's on screen (CSS-only `text-transform` would
 * lie about the underlying value).
 */
function UInput({ value, onValue, required, placeholder, inputMode, disabled }: {
  value: string
  onValue: (v: string) => void
  required?: boolean
  placeholder?: string
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'decimal' | 'search' | 'none' | 'url'
  disabled?: boolean
}) {
  return (
    <input
      required={required}
      disabled={disabled}
      inputMode={inputMode}
      className="input"
      value={value}
      placeholder={placeholder}
      onChange={e => onValue(e.target.value.toUpperCase())}
      style={{ textTransform: 'uppercase' }}
    />
  )
}

function PersonNameRow({ label, value, onChange, checkboxLabel, checked, onChecked, required, disabled, hint }: {
  label: string
  value: NameParts
  onChange: (v: NameParts) => void
  checkboxLabel?: string
  checked?: boolean
  onChecked?: (c: boolean) => void
  required?: boolean
  disabled?: boolean
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label !mb-0">{label}{required ? ' *' : ''}</span>
        {checkboxLabel && (
          <label className="inline-flex items-center gap-2 text-[12px] text-[color:var(--mid-gray)]">
            <input type="checkbox" checked={!!checked} onChange={e => onChecked?.(e.target.checked)} />
            {checkboxLabel}
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <UInput value={value.lastName}   onValue={v => onChange({ ...value, lastName: v })}   placeholder="LAST NAME"   required={required} disabled={disabled} />
        <UInput value={value.firstName}  onValue={v => onChange({ ...value, firstName: v })}  placeholder="FIRST NAME"  required={required} disabled={disabled} />
        <UInput value={value.middleName} onValue={v => onChange({ ...value, middleName: v })} placeholder="MIDDLE NAME" required={required} disabled={disabled} />
      </div>
      {hint && <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-1.5">{hint}</p>}
    </div>
  )
}

function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const dot = (n: 1 | 2 | 3 | 4) => {
    if (n < step) return 'step-dot step-dot-done'
    if (n === step) return 'step-dot step-dot-active'
    return 'step-dot'
  }
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-hidden>
      <span className={dot(1)} />
      <span className={dot(2)} />
      <span className={dot(3)} />
      <span className={dot(4)} />
    </div>
  )
}
