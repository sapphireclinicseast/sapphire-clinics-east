'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  getDraft, setDraft, saveWaiver,
  levelLabel, ageFromDob,
  type EnrollmentLevel, type WaiverContent, type WaiverRecord,
} from '@/lib/session'
import { downloadWaiverPdf } from '@/lib/waiver-pdf'
import SignaturePad from '@/components/SignaturePad'

const CLAUSES: Array<{ key: string; title: string; body: string }> = [
  { key: '5.1', title: 'Location of Classes', body: 'All academic classes, SPED instruction, therapy-integrated learning sessions, and intervention activities under the Program shall be conducted at the SCEI premises — and NOT at the LBCA campus.' },
  { key: '5.2', title: 'Nature of Services', body: 'I have been informed of the nature, scope, and methods of services (IEPs, behavioural support, sensory-integration approaches, therapy-integrated learning). I voluntarily assume the inherent risks on behalf of my child.' },
  { key: '5.3', title: 'Qualifications & Standards', body: "SCEI's SPED teachers, therapists, and specialists meet the minimum qualifications in the SCEI × LBCA Partnership Agreement (relevant degrees, valid PRC licenses, SPED training). Programs align with K–12 DepEd standards and my child's IEP." },
  { key: '5.4', title: 'Class Sizes', body: 'Max student-to-teacher ratios are 1:1 (high-support per IEP), 1:4 (small-group SPED), or 1:8 (inclusive academic with shadow teacher). Any deviation requires my prior written consent.' },
  { key: '5.5', title: 'Authority to Administer First Aid', body: 'I authorise SCEI personnel to administer basic first aid and to seek emergency medical attention when reasonably necessary. I agree to be responsible for any resulting medical costs.' },
  { key: '5.6', title: 'Data Privacy Consent (R.A. 10173)', body: "I consent to SCEI and LBCA's collection, use, storage, and limited sharing of my child's and my own personal information for enrollment, academic supervision, LIS registration, school records, billing, and parent communication, in line with the Data Privacy Act of 2012." },
  { key: '5.7', title: "LBCA's Limited Role", body: "LBCA's role is limited to academic supervision, enrollment, LIS registration, and issuance of school records (LRN, Form 137, Report Cards, certificates, transfer credentials). LBCA does NOT provide on-site supervision or custody at the SCEI premises." },
  { key: '5.8', title: 'Release of LBCA', body: "To the fullest extent permitted by law, I release, waive, and hold LBCA free and harmless from any claims arising solely from incidents that occur at the SCEI premises and within SCEI's exclusive control, save for LBCA's own gross negligence or willful misconduct." },
  { key: '5.9', title: 'Assumption of Risk for Clinic Premises', body: "I voluntarily assume the ordinary and reasonably foreseeable risks of my child's participation at SCEI premises (minor injuries, allergic reactions, behavioural incidents, illness exposure), except those caused by SCEI's gross negligence or willful misconduct." },
  { key: '5.10', title: 'Behavioural and Crisis Interventions', body: 'I authorise SCEI personnel to use developmentally appropriate, evidence-based, least-restrictive behavioural and crisis-management strategies when reasonably necessary to safeguard my child or others. SCEI shall notify me promptly of any significant incident.' },
  { key: '5.11', title: 'Communication & Reporting', body: 'I will maintain accurate and current contact information, respond promptly to communications about my child, and attend scheduled parent conferences, IEP reviews, and progress meetings to the best of my ability.' },
  { key: '5.12', title: 'Compliance with Program Policies', body: "My child and family will comply with SCEI's published policies (Child Protection Policy, attendance/tardiness, dress code, fee schedule, code of conduct). Material non-compliance may result in suspension or termination of enrollment." },
  { key: '5.13', title: 'Truthfulness of Information', body: "All information provided in this Waiver and the enrollment documents is true, accurate, and complete to the best of my knowledge. I will promptly inform SCEI of any material change." },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function WaiverPage() {
  return (
    <Suspense fallback={null}>
      <WaiverInner />
    </Suspense>
  )
}

function WaiverInner() {
  const sp = useSearchParams()
  const levelParam = (sp.get('level') ?? 'KINDER') as EnrollmentLevel

  // Pull the enrollment draft to pre-populate everything we already have.
  const draft = useMemo(() => getDraft() ?? {}, [])

  // ────── Form state — every field in the waiver ──────────────────
  const [content, setContent] = useState<WaiverContent>(() => seedFromDraft(draft, levelParam))
  const [parentSig, setParentSig] = useState('')
  const [secondarySig, setSecondarySig] = useState('')
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState<WaiverRecord | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // keep age in sync with dob
  useEffect(() => {
    setContent(c => ({ ...c, studentAge: ageFromDob(c.studentDob) || c.studentAge }))
  }, [content.studentDob])

  function update<K extends keyof WaiverContent>(key: K, value: WaiverContent[K]) {
    setContent(c => ({ ...c, [key]: value }))
  }
  function updateFetcher(idx: number, key: 'name' | 'relationship' | 'mobile' | 'idNumber', value: string) {
    setContent(c => {
      const fetchers = c.fetchers.slice()
      fetchers[idx] = { ...fetchers[idx], [key]: value }
      return { ...c, fetchers }
    })
  }
  function updateInitial(key: string, value: string) {
    setContent(c => ({ ...c, initials: { ...c.initials, [key]: value } }))
  }

  function handleSign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    setSigning(true)
    try {
      // Required: student names, parent name, parent signature
      const f = new FormData(e.currentTarget)
      const parentPrinted = String(f.get('parentPrinted') ?? '').trim()
      const secondaryPrinted = String(f.get('secondaryPrinted') ?? '').trim()

      if (!content.studentFullName.trim()) throw new Error("Student's Full Name is required.")
      if (!content.primary.fullName.trim()) throw new Error("Primary Parent/Guardian's Full Name is required.")
      if (!parentPrinted) throw new Error("Please type the Parent/Guardian's printed name below the signature.")
      if (!parentSig) throw new Error('Please sign or upload the Parent/Guardian signature.')
      // Check that all 13 clauses were initialed
      const missing = CLAUSES.filter(cl => !(content.initials[cl.key] ?? '').trim()).map(cl => cl.key)
      if (missing.length) throw new Error('Please initial every clause. Missing: ' + missing.join(', '))
      if (!content.photoRelease) throw new Error('Please choose either GRANT or DENY under section 6 (Photo Release).')

      const now = new Date()
      const record: WaiverRecord = {
        id: 'waiver_' + Math.random().toString(36).slice(2, 10),
        studentEmail: draft.email ?? content.primary.email,
        studentFirstName: draft.firstName ?? content.studentFullName.split(' ')[0] ?? '',
        studentLastName:  draft.lastName  ?? content.studentFullName.split(' ').slice(-1)[0] ?? '',
        level: levelParam,
        content: {
          ...content,
          executionDay: content.executionDay || String(now.getDate()),
          executionMonth: content.executionMonth || MONTHS[now.getMonth()],
          executionYear: content.executionYear || String(now.getFullYear()).slice(-2),
        },
        parentSig: {
          printedName: parentPrinted,
          signatureDataUrl: parentSig,
          signedAt: now.toISOString(),
        },
        ...(secondaryPrinted && secondarySig ? {
          secondaryParentSig: {
            printedName: secondaryPrinted,
            signatureDataUrl: secondarySig,
            signedAt: now.toISOString(),
          },
        } : {}),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      saveWaiver(record)
      setDraft({ waiverSignedAt: now.toISOString() })
      try { localStorage.setItem('scei_class_waiver_signature_v1', JSON.stringify({ parentName: parentPrinted, signedAt: now.toISOString(), level: levelParam })) } catch { /* ignore */ }
      setSigned(record)

      // Auto-download immediately so the parent has a copy.
      try { downloadWaiverPdf(record) } catch (e) { console.warn('PDF download failed', e) }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSigning(false)
    }
  }

  if (signed) {
    return (
      <div className="max-w-xl mx-auto py-12 px-5 text-center animate-fade-up">
        <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--sage-tint)] items-center justify-center mb-4 text-[color:var(--moss)] text-2xl">✓</div>
        <h1 className="text-[26px] leading-tight mb-2">Waiver signed</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-2">
          A PDF copy was downloaded to your device. The assigned SCEI SPED teacher will counter-sign as witness when she next logs in.
        </p>
        <p className="text-[12px] text-[color:var(--mid-gray)] mb-7">Filed for {signed.studentFirstName} {signed.studentLastName} · {levelLabel(signed.level)}.</p>
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" onClick={() => downloadWaiverPdf(signed)}>Download again</button>
          <button className="btn-primary" onClick={() => window.close()}>Close window</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-5 animate-fade-up">
      <div className="card-static space-y-7">
        <header>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            SCEI × LBCA · {levelLabel(levelParam)}
          </div>
          <h1 className="text-[24px] leading-tight">Parent / Guardian Waiver, Acknowledgment, and Consent</h1>
          <p className="text-[13.5px] text-[color:var(--mid-gray)] leading-relaxed mt-2">
            This form is executed by the undersigned parent or legal guardian in favour of <b>Sapphire Clinics East, Inc.</b> and <b>Light Bearer Christian Academy</b> for participation in the SCEI × LBCA SPED School Program. Please review every clause and initial each one before signing. A PDF copy is generated automatically once signed.
          </p>
        </header>

        {err && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">
            {err}
          </div>
        )}

        <form onSubmit={handleSign} className="space-y-7">
          {/* 1. Student */}
          <SectionHead n={1}>Student Information</SectionHead>
          <Grid2>
            <Field label="Full Name *"><Input value={content.studentFullName} onChange={v => update('studentFullName', v)} /></Field>
            <Field label="Date of Birth"><Input type="date" value={content.studentDob} onChange={v => update('studentDob', v)} /></Field>
            <Field label="Age"><Input value={content.studentAge} readOnly /></Field>
            <Field label="Gender">
              <Select value={content.studentGender} onChange={v => update('studentGender', v)} options={['', 'Male', 'Female']} />
            </Field>
            <Field label="Grade Level"><Input value={content.gradeLevel || levelLabel(levelParam)} onChange={v => update('gradeLevel', v)} /></Field>
            <Field label="Term of Enrollment"><Input placeholder="e.g. SY 2026–2027" value={content.termOfEnrollment} onChange={v => update('termOfEnrollment', v)} /></Field>
            <Field label="Nationality"><Input value={content.studentNationality} onChange={v => update('studentNationality', v)} /></Field>
            <Field label="Religion"><Input value={content.studentReligion} onChange={v => update('studentReligion', v)} /></Field>
          </Grid2>
          <Field label="Home Address"><Input value={content.homeAddress} onChange={v => update('homeAddress', v)} /></Field>
          <Field label="City / Province"><Input value={content.cityProvince} onChange={v => update('cityProvince', v)} /></Field>
          <Grid2>
            <Field label="Previous School"><Input value={content.previousSchool ?? ''} onChange={v => update('previousSchool', v)} /></Field>
            <Field label="School Year Attended"><Input value={content.schoolYearAttended ?? ''} onChange={v => update('schoolYearAttended', v)} /></Field>
            <Field label="Diagnosis / Conditions (if any)"><Input value={content.diagnosis ?? ''} onChange={v => update('diagnosis', v)} /></Field>
            <Field label="Date of Diagnosis"><Input type="date" value={content.dateOfDiagnosis ?? ''} onChange={v => update('dateOfDiagnosis', v)} /></Field>
          </Grid2>

          {/* 2. Parent / Guardian */}
          <SectionHead n={2}>Parent / Guardian Information</SectionHead>
          <SubHead>Primary Parent / Guardian</SubHead>
          <Grid2>
            <Field label="Full Name *"><Input value={content.primary.fullName} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, fullName: v } }))} /></Field>
            <Field label="Relationship to Student"><Input value={content.primary.relationship} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, relationship: v } }))} placeholder="Mother / Father / Aunt …" /></Field>
            <Field label="Mobile Number"><Input value={content.primary.mobile} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, mobile: v } }))} /></Field>
            <Field label="Alternate Number"><Input value={content.primary.altNumber ?? ''} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, altNumber: v } }))} /></Field>
            <Field label="Email Address"><Input type="email" value={content.primary.email} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, email: v } }))} /></Field>
            <Field label="Occupation"><Input value={content.primary.occupation ?? ''} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, occupation: v } }))} /></Field>
          </Grid2>
          <Field label="Home Address"><Input value={content.primary.homeAddress} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, homeAddress: v } }))} /></Field>
          <Field label="Office Address"><Input value={content.primary.officeAddress ?? ''} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, officeAddress: v } }))} /></Field>
          <Grid2>
            <Field label="Valid Government ID Presented"><Input value={content.primary.govtId ?? ''} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, govtId: v } }))} placeholder="e.g. UMID, Passport" /></Field>
            <Field label="ID Number"><Input value={content.primary.idNumber ?? ''} onChange={v => setContent(c => ({ ...c, primary: { ...c.primary, idNumber: v } }))} /></Field>
          </Grid2>

          <SubHead>Secondary Parent / Guardian (if applicable)</SubHead>
          <Grid2>
            <Field label="Full Name"><Input value={content.secondary?.fullName ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), fullName: v } }))} /></Field>
            <Field label="Relationship to Student"><Input value={content.secondary?.relationship ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), relationship: v } }))} /></Field>
            <Field label="Mobile Number"><Input value={content.secondary?.mobile ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), mobile: v } }))} /></Field>
            <Field label="Email Address"><Input type="email" value={content.secondary?.email ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), email: v } }))} /></Field>
          </Grid2>

          {/* 3. Fetchers */}
          <SectionHead n={3}>Authorized Fetchers / Pick-Up Persons</SectionHead>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] -mt-2 italic">
            Only persons listed below may drop off or pick up the child from the SCEI premises. SCEI staff may require valid ID before releasing the student.
          </p>
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Fetcher {i + 1}</div>
              <Grid2>
                <Field label="Name"><Input value={content.fetchers[i]?.name ?? ''} onChange={v => updateFetcher(i, 'name', v)} /></Field>
                <Field label="Relationship"><Input value={content.fetchers[i]?.relationship ?? ''} onChange={v => updateFetcher(i, 'relationship', v)} /></Field>
                <Field label="Mobile Number"><Input value={content.fetchers[i]?.mobile ?? ''} onChange={v => updateFetcher(i, 'mobile', v)} /></Field>
                <Field label="Valid ID Number"><Input value={content.fetchers[i]?.idNumber ?? ''} onChange={v => updateFetcher(i, 'idNumber', v)} /></Field>
              </Grid2>
            </div>
          ))}

          {/* 4. Emergency + medical */}
          <SectionHead n={4}>Emergency Contact &amp; Medical Disclosures</SectionHead>
          <SubHead>Emergency Contact (other than the Parent/Guardian above)</SubHead>
          <Grid2>
            <Field label="Full Name"><Input value={content.emergencyName} onChange={v => update('emergencyName', v)} /></Field>
            <Field label="Relationship"><Input value={content.emergencyRelationship} onChange={v => update('emergencyRelationship', v)} /></Field>
            <Field label="Mobile Number"><Input value={content.emergencyMobile} onChange={v => update('emergencyMobile', v)} /></Field>
            <Field label="Alternate Number"><Input value={content.emergencyAlt ?? ''} onChange={v => update('emergencyAlt', v)} /></Field>
          </Grid2>

          <SubHead>Preferred Hospital / Medical Facility</SubHead>
          <Grid2>
            <Field label="Hospital Name"><Input value={content.hospital} onChange={v => update('hospital', v)} /></Field>
            <Field label="Contact Number"><Input value={content.hospitalContact ?? ''} onChange={v => update('hospitalContact', v)} /></Field>
            <Field label="Attending Physician (if any)"><Input value={content.physician ?? ''} onChange={v => update('physician', v)} /></Field>
            <Field label="Physician's Contact"><Input value={content.physicianContact ?? ''} onChange={v => update('physicianContact', v)} /></Field>
          </Grid2>

          <SubHead>Medical &amp; Developmental Disclosures</SubHead>
          <Grid2>
            <Field label="Allergies (food, drug, other)"><Input value={content.allergies ?? ''} onChange={v => update('allergies', v)} /></Field>
            <Field label="Blood Type"><Input value={content.bloodType ?? ''} onChange={v => update('bloodType', v)} /></Field>
            <Field label="Current Medications"><Input value={content.medications ?? ''} onChange={v => update('medications', v)} /></Field>
            <Field label="Dosage & Schedule"><Input value={content.dosageSchedule ?? ''} onChange={v => update('dosageSchedule', v)} /></Field>
            <Field label="Existing Medical Conditions"><Input value={content.medicalConditions ?? ''} onChange={v => update('medicalConditions', v)} /></Field>
            <Field label="Treating Specialist"><Input value={content.treatingSpecialist ?? ''} onChange={v => update('treatingSpecialist', v)} /></Field>
            <Field label="Behavioural / Sensory Triggers"><Input value={content.behavioralTriggers ?? ''} onChange={v => update('behavioralTriggers', v)} /></Field>
            <Field label="Coping Strategies"><Input value={content.copingStrategies ?? ''} onChange={v => update('copingStrategies', v)} /></Field>
            <Field label="Dietary Restrictions"><Input value={content.dietaryRestrictions ?? ''} onChange={v => update('dietaryRestrictions', v)} /></Field>
            <Field label="Mobility Needs"><Input value={content.mobilityNeeds ?? ''} onChange={v => update('mobilityNeeds', v)} /></Field>
          </Grid2>

          {/* 5. Initials */}
          <SectionHead n={5}>Acknowledgments &amp; Consents — Please initial each clause</SectionHead>
          <div className="space-y-2.5">
            {CLAUSES.map(cl => (
              <div key={cl.key} className="flex items-start gap-3 p-3.5 rounded-xl border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
                    {cl.key} {cl.title}
                  </div>
                  <p className="text-[12.5px] text-[color:var(--ink)] leading-relaxed mt-1">{cl.body}</p>
                </div>
                <div className="shrink-0 flex flex-col items-center">
                  <input
                    aria-label={`Initials for ${cl.key}`}
                    className="input"
                    style={{ width: 72, padding: '8px 8px', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    maxLength={5}
                    value={content.initials[cl.key] ?? ''}
                    onChange={e => updateInitial(cl.key, e.target.value.toUpperCase())}
                  />
                  <span className="text-[10px] text-[color:var(--mid-gray)] mt-1 uppercase tracking-[0.1em]" style={{ fontFamily: 'var(--font-display)' }}>Initials</span>
                </div>
              </div>
            ))}
          </div>

          {/* 6. Photo release */}
          <SectionHead n={6}>Photo, Media, and Likeness Release (Optional)</SectionHead>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] -mt-2 italic">Choose one. Leaving both unchecked is treated as a denial of consent.</p>
          <div className="space-y-2.5">
            <label className="block p-3.5 rounded-xl border cursor-pointer" style={{ borderColor: content.photoRelease === 'GRANT' ? 'var(--sage)' : 'var(--paper-3)', background: content.photoRelease === 'GRANT' ? 'var(--sage-tint)' : '#fff' }}>
              <div className="flex items-start gap-3">
                <input type="radio" checked={content.photoRelease === 'GRANT'} onChange={() => update('photoRelease', 'GRANT')} className="mt-1" />
                <span className="text-[12.5px] text-[color:var(--ink)] leading-relaxed">
                  <b>I GRANT consent.</b> I authorise SCEI to capture, store, and use photographs, videos, recordings, artwork, and quotations involving my child for internal documentation, parent communications, social-media posts, marketing materials, and partnership announcements with LBCA. I may withdraw consent at any time by written request.
                </span>
              </div>
            </label>
            <label className="block p-3.5 rounded-xl border cursor-pointer" style={{ borderColor: content.photoRelease === 'DENY' ? 'var(--clay)' : 'var(--paper-3)', background: content.photoRelease === 'DENY' ? 'var(--clay-tint)' : '#fff' }}>
              <div className="flex items-start gap-3">
                <input type="radio" checked={content.photoRelease === 'DENY'} onChange={() => update('photoRelease', 'DENY')} className="mt-1" />
                <span className="text-[12.5px] text-[color:var(--ink)] leading-relaxed">
                  <b>I DO NOT grant consent.</b> SCEI shall not use my child&apos;s photo, video, voice, artwork, or quotations in any public-facing materials. Internal recordkeeping for clinical and academic purposes remains permitted.
                </span>
              </div>
            </label>
          </div>

          {/* 8. Signatures */}
          <SectionHead n={8}>Signatures</SectionHead>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] -mt-2 italic">
            Executed at Pasig City, Philippines. The witness section is signed by the assigned SCEI SPED teacher when she next logs in.
          </p>

          <div>
            <SubHead>Parent / Guardian *</SubHead>
            <label className="block">
              <span className="label">Printed name *</span>
              <input required name="parentPrinted" className="input" placeholder="As it appears on the signature line" />
            </label>
            <div className="mt-3">
              <span className="label">Signature *</span>
              <SignaturePad onChange={setParentSig} height={170} />
            </div>
          </div>

          <div>
            <SubHead>Secondary Parent / Guardian (optional)</SubHead>
            <label className="block">
              <span className="label">Printed name</span>
              <input name="secondaryPrinted" className="input" />
            </label>
            <div className="mt-3">
              <span className="label">Signature</span>
              <SignaturePad onChange={setSecondarySig} height={140} />
            </div>
          </div>

          <button type="submit" disabled={signing} className="btn-cta w-full">
            {signing ? 'Generating PDF…' : 'Sign & generate waiver PDF'}
          </button>
          <p className="text-[11px] text-[color:var(--mid-gray)] text-center" style={{ fontFamily: 'var(--font-display)' }}>
            The signed waiver downloads automatically. The assigned SPED teacher will counter-sign as witness from her dashboard.
          </p>
        </form>
      </div>
    </div>
  )
}

function seedFromDraft(d: Partial<import('@/lib/session').EnrollmentDraft>, level: EnrollmentLevel): WaiverContent {
  const studentFull = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ')
  const studentAge = d.dob ? ageFromDob(d.dob) : ''
  const homeAddress = [d.houseStreet, d.barangay].filter(Boolean).join(', ')
  const cityProv = d.cityProvinceCountry ?? ''
  const father = d.father, mother = d.mother
  const fatherName = father ? `${father.firstName} ${father.middleName} ${father.lastName}` : ''
  const motherName = mother ? `${mother.firstName} ${mother.middleName} ${mother.lastName}` : ''
  const primaryName = d.guardianOfRecord === 'MOTHER' ? motherName : d.guardianOfRecord === 'FATHER' ? fatherName : ''
  const primaryRelationship = d.guardianOfRecord === 'MOTHER' ? 'Mother' : d.guardianOfRecord === 'FATHER' ? 'Father' : ''
  const primaryOccupation = d.guardianOfRecord === 'MOTHER' ? (d.motherOccupation ?? '') : d.guardianOfRecord === 'FATHER' ? (d.fatherOccupation ?? '') : ''
  const secondaryName = d.guardianOfRecord === 'MOTHER' ? fatherName : d.guardianOfRecord === 'FATHER' ? motherName : ''
  const secondaryRelationship = d.guardianOfRecord === 'MOTHER' ? 'Father' : d.guardianOfRecord === 'FATHER' ? 'Mother' : ''

  return {
    studentFullName: studentFull,
    studentDob: d.dob ?? '',
    studentAge,
    studentGender: d.sex ?? '',
    gradeLevel: levelLabel(level),
    termOfEnrollment: d.schoolYearFrom && d.schoolYearTo ? `SY ${d.schoolYearFrom}–${d.schoolYearTo}` : '',
    studentNationality: d.nationality ?? '',
    studentReligion: d.religion ?? '',
    homeAddress,
    cityProvince: cityProv,
    previousSchool: d.previousSchoolName ?? '',
    schoolYearAttended: d.lastSchoolYearCompleted ?? '',
    diagnosis: d.diagnosis ?? '',
    dateOfDiagnosis: '',
    primary: {
      fullName: primaryName,
      relationship: primaryRelationship,
      mobile: d.cellphone ?? '',
      altNumber: d.telephone ?? '',
      email: d.email ?? '',
      occupation: primaryOccupation,
      homeAddress,
      officeAddress: '',
      govtId: '',
      idNumber: '',
    },
    secondary: secondaryName ? {
      fullName: secondaryName,
      relationship: secondaryRelationship,
      mobile: '',
      email: '',
    } : undefined,
    fetchers: [
      { name: '', relationship: '', mobile: '', idNumber: '' },
      { name: '', relationship: '', mobile: '', idNumber: '' },
      { name: '', relationship: '', mobile: '', idNumber: '' },
    ],
    emergencyName: '',
    emergencyRelationship: '',
    emergencyMobile: '',
    hospital: '',
    initials: {},
    photoRelease: null,
    executionDay: '',
    executionMonth: '',
    executionYear: '',
  }
}

/* ───────── Small inline UI helpers ───────── */

function SectionHead({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-bold tracking-tight text-[color:var(--narra)] flex items-center gap-2 mt-1" style={{ fontFamily: 'var(--font-display)' }}>
      <span className="inline-flex items-center justify-center rounded-full bg-[color:var(--narra)] text-white" style={{ width: 24, height: 24, fontSize: 12 }}>{n}</span>
      {children}
    </h2>
  )
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>{children}</div>
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}
function Input({ value, onChange, type, placeholder, readOnly }: { value: string; onChange?: (v: string) => void; type?: string; placeholder?: string; readOnly?: boolean }) {
  return <input className="input" type={type ?? 'text'} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} placeholder={placeholder} readOnly={readOnly} />
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select className="select" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  )
}
