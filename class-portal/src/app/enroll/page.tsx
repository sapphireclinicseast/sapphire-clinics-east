'use client'

import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { submitLearnerProfile } from '@/lib/api'
import {
  getSession, setSession, getDraft, setDraft, levelLabel, ageFromDob,
  type LrnStatus, type GuardianOfRecord, type NameParts,
} from '@/lib/session'
import SignaturePad from '@/components/SignaturePad'
import {
  Banner, BTN_PRIMARY, BTN_SECONDARY, CARD_STYLE, CONTROL, CONTROL_STYLE, DashCard, FOCUS, Icon,
  LABEL, LABEL_STYLE, PageHeader, PRIMARY_STYLE, SECONDARY_STYLE, Skeleton, SUBTLE_BG,
} from '@/components/hub/ui'

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
  const [nationality, setNationality] = useState('FILIPINO')
  const [diagnosis, setDiagnosis] = useState('')
  const [pwdIdNumber, setPwdIdNumber] = useState('')

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
      setNationality(d.nationality ?? 'FILIPINO')
      setDiagnosis(d.diagnosis ?? '')
      setPwdIdNumber(d.pwdIdNumber ?? '')
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
      // PSA Birth Certificate No. is optional — parents can fill it in
      // later from their profile if they don't have the document on hand.
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
        ...(nationality.trim() ? { nationality: nationality.trim() } : {}),
        ...(diagnosis ? { diagnosis } : {}),
        ...(pwdIdNumber.trim() ? { pwdIdNumber: pwdIdNumber.trim() } : {}),
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

  if (!ready) return <EnrollSkeleton />

  return (
    <div className="max-w-3xl mx-auto animate-fade-up space-y-5 min-w-0">
      <StepBar step={2} />

      <PageHeader
        eyebrow="Enrollment · Step 2 of 4"
        title="Learner profile"
        description={<>Enrolling for <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>{levelLbl}</span>. All text is recorded in capital letters. Fields marked * must be filled in.</>}
      />

      <form className="space-y-5" onSubmit={handleSubmit}>
        {/* School year + LRN */}
        <DashCard title="School year & LRN" icon={<Icon name="calendar" size={16} />}>
          <div className="space-y-4">
            <Group label="School year" required>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-w-xs">
                <input required type="number" min={2000} max={2100} className={INPUT} style={CONTROL_STYLE} aria-label="School year from"
                  value={schoolYearFrom} onChange={e => setSchoolYearFrom(e.target.value)}
                  placeholder="2026" />
                <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>to</span>
                <input required type="number" min={2000} max={2100} className={INPUT} style={CONTROL_STYLE} aria-label="School year to"
                  value={schoolYearTo} onChange={e => setSchoolYearTo(e.target.value)}
                  placeholder="2027" />
              </div>
            </Group>

            <Group label="Learner status" required>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  ['NO_LRN', 'No LRN'],
                  ['WITH_LRN', 'With LRN'],
                  ['RETURNING', 'Returning'],
                ] as const).map(([v, lbl]) => (
                  <Tile key={v} active={lrnStatus === v}>
                    <input type="radio" name="lrnStatus" value={v} checked={lrnStatus === v} onChange={() => setLrnStatus(v)} className="sr-only" />
                    {lbl}
                  </Tile>
                ))}
              </div>
            </Group>

            {lrnStatus === 'WITH_LRN' && (
              <Field label="Learner Reference No. (LRN)" required>
                <UInput value={lrn} onValue={setLrn} placeholder="12-DIGIT LRN" />
              </Field>
            )}

            <Field label="PSA Birth Certificate No." hint="Optional — you can add it later from your profile.">
              <UInput value={psaBirthCertNo} onValue={setPsaBirthCertNo} placeholder="e.g. 2017-1234567 (optional)" />
            </Field>
          </div>
        </DashCard>

        {/* Personal */}
        <DashCard title="Student info" icon={<Icon name="student" size={16} />}>
          <div className="space-y-4">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <Field label="Date of Birth" required>
                  <input required type="date" className={INPUT} style={CONTROL_STYLE} value={dob} onChange={e => setDob(e.target.value)} />
                </Field>
              </div>
              <Field label="Age (auto)">
                <input className={INPUT} style={LOCKED_STYLE} value={age} readOnly tabIndex={-1} />
              </Field>
              <Field label="Sex" required>
                <select required className={INPUT} style={CONTROL_STYLE} value={sex} onChange={e => setSex(e.target.value as 'MALE' | 'FEMALE')}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
            </div>

            <Group label="Belonging to any Indigenous Peoples (IP) Community / Indigenous Cultural Community?" required>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {(['YES', 'NO'] as const).map(v => (
                  <Tile key={v} active={ipMember === v}>
                    <input type="radio" name="ipMember" value={v} checked={ipMember === v} onChange={() => setIpMember(v)} className="sr-only" />
                    {v === 'YES' ? 'Yes' : 'No'}
                  </Tile>
                ))}
              </div>
            </Group>
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
              <Field label="Nationality">
                <UInput value={nationality} onValue={setNationality} placeholder="FILIPINO" />
              </Field>
              <Field label="PWD ID Number (if applicable)">
                <UInput value={pwdIdNumber} onValue={setPwdIdNumber} placeholder="OPTIONAL" />
              </Field>
            </div>
            <Field label="Diagnosis (if applicable)">
              <UInput value={diagnosis} onValue={setDiagnosis} placeholder="OPTIONAL" />
            </Field>
          </div>
        </DashCard>

        {/* Address */}
        <DashCard title="Address *" icon={<Icon name="building" size={16} />} description="Where the learner currently lives.">
          <div className="space-y-4">
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
          </div>
        </DashCard>

        {/* Parents / Guardian */}
        <DashCard title="Parent's / Guardian's information" icon={<Icon name="users" size={16} />}
          description="Tick the box beside Father or Mother if they are the official guardian; otherwise fill in the guardian's name.">
          <div className="space-y-5">
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
            <Divider />
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
            <Divider />
            <PersonNameRow
              label="Guardian's Name"
              value={guardian}
              onChange={setGuardian}
              disabled={guardianFieldsDisabled}
              hint={guardianFieldsDisabled ? `Disabled — ${guardianOfRecord === 'FATHER' ? 'Father' : 'Mother'} is the official guardian.` : undefined}
            />
            <Divider />
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
          </div>
        </DashCard>

        {/* Returning / Transferee */}
        <DashCard title="Returning learner or transferee?" icon={<Icon name="book" size={16} />}>
          <div className="space-y-4">
            <Group label="Is the Student a returning learner or transferee?" required>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {(['YES', 'NO'] as const).map(v => (
                  <Tile key={v} active={isReturningOrTransferee === v}>
                    <input type="radio" name="isReturningOrTransferee" value={v} checked={isReturningOrTransferee === v} onChange={() => setIsReturningOrTransferee(v)} className="sr-only" />
                    {v === 'YES' ? 'Yes' : 'No'}
                  </Tile>
                ))}
              </div>
            </Group>

            {isReturningOrTransferee === 'YES' && (
              <div className="space-y-3.5 rounded-xl p-3.5 sm:p-4 min-w-0" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
                  For Returning Learners (Balik-Aral) and Those Who Shall Transfer / Move In
                </p>
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
          </div>
        </DashCard>

        {/* Certification + signature */}
        <DashCard title="Certification" icon={<Icon name="edit" size={16} />} description="Read the statement, then type your name and sign.">
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed rounded-xl px-3.5 py-3" style={{ color: 'var(--charcoal)', background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
              I hereby certify that the above information given are true and correct to the best of my knowledge and I allow the Department of Education to use my child&apos;s details to create and/or update his/her learner profile in the Learner Information System. The information herein shall be treated as confidential in compliance with the Data Privacy Act of 2012.
            </p>

            <Field label="Signature Over Printed Name of Parent / Guardian" required>
              <UInput required value={certSignatureName} onValue={setCertSignatureName} placeholder="PARENT / GUARDIAN PRINTED NAME" />
            </Field>
            <Group label="Signature" required>
              <SignaturePad initialValue={certSignatureDataUrl} onChange={setCertSignatureDataUrl} />
            </Group>
            <div className="max-w-xs">
              <Field label="Date">
                <input className={INPUT} style={LOCKED_STYLE} value={new Date().toLocaleDateString()} readOnly tabIndex={-1} />
              </Field>
            </div>
          </div>
        </DashCard>

        {err && <Banner tone="error">{err}</Banner>}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${BTN_SECONDARY} max-sm:h-11`} style={SECONDARY_STYLE} onClick={() => router.push('/')}>
            <Icon name="arrowLeft" size={14} /> Back
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={`${BTN_PRIMARY} flex-1 min-w-[180px] max-sm:h-11`} style={PRIMARY_STYLE}>
            {busy && <Spinner />}
            {busy ? 'Saving…' : <>Continue to documents <Icon name="chevronRight" size={14} /></>}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ───────────────────────── reusable bits ───────────────────────── */

/** Kit control, full width. On phones: 16px text (stops iOS zoom-on-focus) and a taller tap target. */
const INPUT = `${CONTROL} w-full min-w-0 max-sm:h-11 max-sm:text-base`
const LOCKED_STYLE: CSSProperties = { ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={LABEL} style={LABEL_STYLE}>
        {label}{required ? ' *' : ''}
      </span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>{hint}</span>}
    </label>
  )
}

/** Labelled group for a field made of several controls (radio tiles, two-part inputs, signature). */
function Group({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className={`${LABEL} leading-snug`} style={LABEL_STYLE}>
        {label}{required ? ' *' : ''}
      </legend>
      {children}
    </fieldset>
  )
}

/**
 * Selectable tile wrapping a visually hidden native radio. The radio keeps
 * the field name, keyboard arrows and the "checked" announcement; the tile
 * shows a filled radio mark and a heavier border so the choice never rests
 * on colour alone.
 */
function Tile({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <label
      className={`flex items-center gap-2.5 min-w-0 rounded-xl px-3.5 h-11 text-sm font-semibold cursor-pointer transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[color:var(--teal)] ${active ? '' : 'hover:bg-[color:var(--paper)]'}`}
      style={active
        ? { background: 'var(--moss-tint)', border: '1.5px solid var(--teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }
        : { background: '#fff', border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}
    >
      <span aria-hidden className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ border: `1.5px solid ${active ? 'var(--deep-teal)' : 'var(--light-gray)'}`, background: '#fff' }}>
        {active && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--deep-teal)' }} />}
      </span>
      {children}
    </label>
  )
}

function Divider() {
  return <hr aria-hidden style={{ border: 0, borderTop: '1px solid var(--light-gray)' }} />
}

function Spinner() {
  return <span aria-hidden className="w-3.5 h-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />
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
      className={INPUT}
      value={value}
      placeholder={placeholder}
      onChange={e => onValue(e.target.value.toUpperCase())}
      style={{ ...CONTROL_STYLE, textTransform: 'uppercase' }}
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
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mb-1.5">
        <span id={labelId} className={`${LABEL} !mb-0`} style={LABEL_STYLE}>{label}{required ? ' *' : ''}</span>
        {checkboxLabel && (
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" className={`w-4 h-4 flex-shrink-0 rounded ${FOCUS}`} style={{ accentColor: 'var(--deep-teal)' }}
              checked={!!checked} onChange={e => onChecked?.(e.target.checked)} />
            {checkboxLabel}
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <label className="block min-w-0">
          <span className="sr-only">{label}: </span><span className="block text-[11px] mb-0.5 sm:sr-only" style={{ color: 'var(--mid-gray)' }}>Last name</span>
          <UInput value={value.lastName}   onValue={v => onChange({ ...value, lastName: v })}   placeholder="LAST NAME"   required={required} disabled={disabled} />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">{label}: </span><span className="block text-[11px] mb-0.5 sm:sr-only" style={{ color: 'var(--mid-gray)' }}>First name</span>
          <UInput value={value.firstName}  onValue={v => onChange({ ...value, firstName: v })}  placeholder="FIRST NAME"  required={required} disabled={disabled} />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">{label}: </span><span className="block text-[11px] mb-0.5 sm:sr-only" style={{ color: 'var(--mid-gray)' }}>Middle name</span>
          <UInput value={value.middleName} onValue={v => onChange({ ...value, middleName: v })} placeholder="MIDDLE NAME" required={required} disabled={disabled} />
        </label>
      </div>
      {hint && <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
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
    <div className="flex items-center justify-center gap-2" aria-hidden>
      <span className={dot(1)} />
      <span className={dot(2)} />
      <span className={dot(3)} />
      <span className={dot(4)} />
    </div>
  )
}

/** Placeholder while the session + draft are read on mount. */
function EnrollSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-5" role="status" aria-label="Loading learner profile">
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      {Array.from({ length: 2 }).map((_, n) => (
        <div key={n} className="rounded-xl p-4 sm:p-5 space-y-3" style={CARD_STYLE} aria-hidden>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
