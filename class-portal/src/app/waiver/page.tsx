'use client'

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  getDraft, setDraft, getSession, saveWaiver, uploadDocumentBlob,
  levelLabel, ageFromDob,
  type EnrollmentLevel, type WaiverContent, type WaiverRecord,
} from '@/lib/session'
import { downloadWaiverPdf, generateWaiverPdf } from '@/lib/waiver-pdf'
import SignaturePad from '@/components/SignaturePad'
import {
  Banner, Icon, PageHeader, StatusPill,
  BTN_PRIMARY, BTN_SECONDARY, CARD_STYLE, CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE,
  PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

const CLAUSES: Array<{ key: string; title: string; body: string }> = [
  { key: '5.1', title: 'Location of Classes', body: 'All academic classes, SPED instruction, therapy-integrated learning sessions, and intervention activities under the Program shall be conducted at the SCEI premises — and NOT at the LBCA campus.' },
  { key: '5.2', title: 'Nature of Services', body: 'I have been informed of the nature, scope, and methods of services (IEPs, behavioural support, sensory-integration approaches, therapy-integrated learning). I voluntarily assume the inherent risks on behalf of my child.' },
  { key: '5.3', title: 'Qualifications & Standards', body: "SCEI's SPED teachers, therapists, and specialists meet the minimum qualifications in the SCEI × LBCA Partnership Agreement (relevant degrees, valid PRC licenses, SPED training). Programs align with K–12 DepEd standards and my child's IEP." },
  { key: '5.4', title: 'Class Sizes', body: 'Max student-to-teacher ratios are 1:1 (high-support per IEP), 1:5 (small-group SPED), or 1:10 (inclusive academic with shadow teacher). Any deviation requires my prior written consent.' },
  { key: '5.5', title: 'Authority to Administer First Aid', body: 'I authorise SCEI personnel to administer basic first aid and to seek emergency medical attention when reasonably necessary. I agree to be responsible for any resulting medical costs.' },
  { key: '5.6', title: 'Data Privacy Consent (R.A. 10173)', body: "I consent to SCEI and LBCA's collection, use, storage, and limited sharing of my child's and my own personal information for enrollment, academic supervision, LIS registration, school records, billing, and parent communication, in line with the Data Privacy Act of 2012." },
  { key: '5.7', title: "LBCA's Limited Role", body: "LBCA's role is limited to academic supervision, enrollment, LIS registration, and issuance of school records (LRN, Form 137, Report Cards, certificates, transfer credentials). LBCA does NOT provide on-site supervision or custody at the SCEI premises." },
  { key: '5.8', title: 'Release of LBCA', body: "To the fullest extent permitted by law, I release, waive, and hold LBCA free and harmless from any claims arising solely from incidents that occur at the SCEI premises and within SCEI's exclusive control, save for LBCA's own gross negligence or willful misconduct." },
  { key: '5.9', title: 'Assumption of Risk for Clinic Premises', body: "I voluntarily assume the ordinary and reasonably foreseeable risks of my child's participation at SCEI premises (minor injuries, allergic reactions, behavioural incidents, illness exposure), except those caused by SCEI's gross negligence or willful misconduct." },
  { key: '5.10', title: 'Behavioural and Crisis Interventions', body: 'I authorise SCEI personnel to use developmentally appropriate, evidence-based, least-restrictive behavioural and crisis-management strategies when reasonably necessary to safeguard my child or others. SCEI shall notify me promptly of any significant incident.' },
  { key: '5.11', title: 'Communication & Reporting', body: 'I will maintain accurate and current contact information, respond promptly to communications about my child, and attend scheduled parent conferences, IEP reviews, and progress meetings to the best of my ability.' },
  { key: '5.12', title: 'Compliance with Program Policies', body: "My child and family will comply with SCEI's published policies (Child Protection Policy, attendance/tardiness, dress code, fee schedule, code of conduct). Material non-compliance may result in suspension or termination of enrollment." },
  { key: '5.13', title: 'Truthfulness of Information', body: "All information provided in this Waiver and the enrollment documents is true, accurate, and complete to the best of my knowledge. I will promptly inform SCEI of any material change." },
  { key: '5.14', title: 'Parent-Provided Shadow Teacher', body: "If I wish to assign a personal shadow teacher to accompany my child in class, I may do so but must (a) coordinate the engagement in advance with SCEI's front desk and the assigned SPED teacher, and (b) endorse and submit a copy of the shadow teacher's current PRC license before the shadow teacher attends any class session. The shadow teacher is engaged solely by me and is not an employee of SCEI or LBCA. SCEI and LBCA are NOT liable for the acts, omissions, qualifications, supervision, compensation, or conduct of the parent-provided shadow teacher." },
  { key: '5.15', title: 'Tuition Obligation on Withdrawal', body: "Tuition fees are payable in full for the entire school year regardless of when, or for what reason, my child stops attending. If I have chosen an installment plan (bi-annual or monthly), I remain obligated to pay the outstanding balance of tuition in full. The school will NOT issue clearance, Form 137 / SF10, transfer credentials, Report Card / SF9, or any other academic records until the full tuition balance has been settled." },
]

const noopSubscribe = () => () => {}

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
  // Mirror of the printed-name field for the "Before you sign" checklist;
  // handleSign still reads the value from the form.
  const [parentPrintedLive, setParentPrintedLive] = useState('')

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

      // Fire-and-forget on the parent flow — this page runs pre-sign-in
      // as part of the public enrollment path, so the server push is
      // expected to no-op until syncLocalWaiversToServer catches up on
      // the next sign-in. saveWaiver never rejects (it returns an
      // { ok, error? } shape), so `void` is safe here.
      void saveWaiver(record)
      setDraft({ waiverSignedAt: now.toISOString() })
      try { localStorage.setItem('scei_class_waiver_signature_v1', JSON.stringify({ parentName: parentPrinted, signedAt: now.toISOString(), level: levelParam })) } catch { /* ignore */ }
      setSigned(record)

      // Auto-download immediately so the parent has a copy.
      try { downloadWaiverPdf(record) } catch (e) { console.warn('PDF download failed', e) }

      // Also push the generated PDF up to the server right now (best
      // effort). The waiver is system-generated from the structured
      // WaiverRecord — there's no "parent uploads a file" step — so
      // we stage the PDF for admins viewing the student profile on
      // any device, even before the witness or SCEI-ACK signs.
      //
      // Fire-and-forget so we don't have to make handleSign async (it
      // doesn't currently need to be, and the parent doesn't care
      // about the upload result). uploadDocumentBlob silently no-ops
      // if no JWT is in localStorage yet (the standalone /waiver page
      // is reachable mid-enrollment, pre-signin) — in that case the
      // next signIn() will catch up via syncLocalWaiversToServer.
      try {
        const session = getSession()
        if (session?.studentId) {
          const pdfDoc = generateWaiverPdf(record)
          const blob = pdfDoc.output('blob')
          const file = new File([blob], 'parent-guardian-waiver.pdf', { type: 'application/pdf' })
          void uploadDocumentBlob(session.studentId, 'parent_waiver', file)
        }
      } catch (e) { console.warn('waiver PDF upload failed', e) }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSigning(false)
    }
  }

  // The form is seeded from the browser-only enrollment draft, so the server
  // render has empty fields. Tick the checklist only once hydrated, or the
  // server and client draw different icons.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const initialedCount = CLAUSES.filter(cl => (content.initials[cl.key] ?? '').trim()).length
  const rawChecks: Array<{ ok: boolean; label: string }> = [
    { ok: !!content.studentFullName.trim(), label: "Student's full name (section 1)" },
    { ok: !!content.primary.fullName.trim(), label: "Primary parent / guardian's full name (section 2)" },
    { ok: initialedCount === CLAUSES.length, label: `Initials on every clause — ${initialedCount} of ${CLAUSES.length} (section 5)` },
    { ok: !!content.photoRelease, label: 'Photo release: grant or deny (section 6)' },
    { ok: !!parentPrintedLive.trim(), label: 'Parent / guardian printed name (section 8)' },
    { ok: !!parentSig, label: 'Parent / guardian signature (section 8)' },
  ]
  const checks = rawChecks.map(c => ({ ...c, ok: hydrated && c.ok }))
  const readyToSign = checks.every(c => c.ok)

  if (signed) {
    return (
      <div className="max-w-xl mx-auto animate-fade-up">
        <section className="rounded-2xl px-6 py-8 sm:px-8 text-center" style={{ ...CARD_STYLE, boxShadow: CARD_SHADOW }}>
          <span className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-4" style={{ background: '#EEF5E8', color: '#2F5A28' }}>
            <Icon name="check" size={28} />
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
            SCEI × LBCA
          </p>
          <h1 className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Waiver signed
          </h1>
          <p className="text-sm mt-2 leading-relaxed max-w-md mx-auto" style={{ color: 'var(--mid-gray)' }}>
            A PDF copy was downloaded to your device. The assigned SCEI SPED teacher will counter-sign as witness when she next logs in.
          </p>
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-[12.5px]" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
            <Icon name="file" size={14} style={{ color: 'var(--teal)' }} />
            Filed for <span className="font-semibold">{signed.studentFirstName} {signed.studentLastName}</span> · {levelLabel(signed.level)}
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={() => downloadWaiverPdf(signed)}>
              <Icon name="download" size={14} /> Download again
            </button>
            <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => window.close()}>
              Close window
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-up space-y-5 min-w-0">
      <PageHeader
        eyebrow={<>SCEI × LBCA · {levelLabel(levelParam)}</>}
        title="Parent / Guardian Waiver, Acknowledgment, and Consent"
        description={<>Executed in favour of <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Sapphire Clinics East, Inc.</span> and <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Light Bearer Christian Academy</span> for the SCEI × LBCA SPED School Program. Review every clause and initial each one before signing. A PDF copy is generated automatically once signed.</>}
      />

      {err && <Banner tone="error">{err}</Banner>}

      <form onSubmit={handleSign} className="space-y-5">
        {/* 1. Student */}
        <Section n={1} title="Student Information" hint="Carried over from the enrollment form where we have it. Check and complete.">
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
        </Section>

        {/* 2. Parent / Guardian */}
        <Section n={2} title="Parent / Guardian Information">
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

          <div className="pt-2" style={{ borderTop: '1px solid var(--light-gray)' }} />
          <SubHead>Secondary Parent / Guardian (if applicable)</SubHead>
          <Grid2>
            <Field label="Full Name"><Input value={content.secondary?.fullName ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), fullName: v } }))} /></Field>
            <Field label="Relationship to Student"><Input value={content.secondary?.relationship ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), relationship: v } }))} /></Field>
            <Field label="Mobile Number"><Input value={content.secondary?.mobile ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), mobile: v } }))} /></Field>
            <Field label="Email Address"><Input type="email" value={content.secondary?.email ?? ''} onChange={v => setContent(c => ({ ...c, secondary: { ...(c.secondary ?? { fullName: '', relationship: '', mobile: '', email: '' }), email: v } }))} /></Field>
          </Grid2>
        </Section>

        {/* 3. Fetchers */}
        <Section n={3} title="Authorized Fetchers / Pick-Up Persons"
          hint="Only persons listed below may drop off or pick up the child from the SCEI premises. SCEI staff may require valid ID before releasing the student.">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl p-4" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                  <Icon name="users" size={13} />
                </span>
                <span className="text-[12px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Fetcher {i + 1}</span>
              </div>
              <Grid2>
                <Field label="Name"><Input value={content.fetchers[i]?.name ?? ''} onChange={v => updateFetcher(i, 'name', v)} /></Field>
                <Field label="Relationship"><Input value={content.fetchers[i]?.relationship ?? ''} onChange={v => updateFetcher(i, 'relationship', v)} /></Field>
                <Field label="Mobile Number"><Input value={content.fetchers[i]?.mobile ?? ''} onChange={v => updateFetcher(i, 'mobile', v)} /></Field>
                <Field label="Valid ID Number"><Input value={content.fetchers[i]?.idNumber ?? ''} onChange={v => updateFetcher(i, 'idNumber', v)} /></Field>
              </Grid2>
            </div>
          ))}
        </Section>

        {/* 4. Emergency + medical */}
        <Section n={4} title="Emergency Contact & Medical Disclosures">
          <SubHead>Emergency Contact (other than the Parent/Guardian above)</SubHead>
          <Grid2>
            <Field label="Full Name"><Input value={content.emergencyName} onChange={v => update('emergencyName', v)} /></Field>
            <Field label="Relationship"><Input value={content.emergencyRelationship} onChange={v => update('emergencyRelationship', v)} /></Field>
            <Field label="Mobile Number"><Input value={content.emergencyMobile} onChange={v => update('emergencyMobile', v)} /></Field>
            <Field label="Alternate Number"><Input value={content.emergencyAlt ?? ''} onChange={v => update('emergencyAlt', v)} /></Field>
          </Grid2>

          <div className="pt-2" style={{ borderTop: '1px solid var(--light-gray)' }} />
          <SubHead>Preferred Hospital / Medical Facility</SubHead>
          <Grid2>
            <Field label="Hospital Name"><Input value={content.hospital} onChange={v => update('hospital', v)} /></Field>
            <Field label="Contact Number"><Input value={content.hospitalContact ?? ''} onChange={v => update('hospitalContact', v)} /></Field>
            <Field label="Attending Physician (if any)"><Input value={content.physician ?? ''} onChange={v => update('physician', v)} /></Field>
            <Field label="Physician's Contact"><Input value={content.physicianContact ?? ''} onChange={v => update('physicianContact', v)} /></Field>
          </Grid2>

          <div className="pt-2" style={{ borderTop: '1px solid var(--light-gray)' }} />
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
        </Section>

        {/* 5. Initials */}
        <Section n={5} title="Acknowledgments & Consents" hint="Read each clause and type your initials beside it."
          action={<StatusPill tone={initialedCount === CLAUSES.length ? 'success' : 'neutral'}>{initialedCount} of {CLAUSES.length} initialed</StatusPill>}>
          <div className="space-y-2.5">
            {CLAUSES.map(cl => {
              const done = !!(content.initials[cl.key] ?? '').trim()
              return (
                <div key={cl.key} className="flex items-start gap-3 p-3.5 rounded-xl transition-colors"
                  style={{ border: `1px solid ${done ? '#CFE0BF' : 'var(--light-gray)'}`, background: done ? '#F6FAF2' : '#fff' }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-[13px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      <span className="tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{cl.key}</span>
                      <span>{cl.title}</span>
                    </div>
                    <p className="text-[12.5px] leading-relaxed mt-1.5" style={{ color: 'var(--charcoal)' }}>{cl.body}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="relative">
                      <input
                        aria-label={`Initials for ${cl.key}`}
                        className={`${CONTROL} h-10 text-center font-bold uppercase tracking-wider`}
                        style={{ ...CONTROL_STYLE, width: 72, ...(done ? { borderColor: '#9FC08A' } : null) }}
                        maxLength={5}
                        value={content.initials[cl.key] ?? ''}
                        onChange={e => updateInitial(cl.key, e.target.value.toUpperCase())}
                      />
                      {done && (
                        <span aria-hidden className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#fff', color: '#2F5A28' }}>
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] mt-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>Initials</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* 6. Photo release */}
        <Section n={6} title="Photo, Media, and Likeness Release" hint="Choose one. Leaving both unchecked is treated as a denial of consent.">
          <div className="space-y-2.5" role="radiogroup" aria-label="Photo release">
            {([
              { v: 'GRANT' as const, title: 'I GRANT consent.', body: 'I authorise SCEI to capture, store, and use photographs, videos, recordings, artwork, and quotations involving my child for internal documentation, parent communications, social-media posts, marketing materials, and partnership announcements with LBCA. I may withdraw consent at any time by written request.', on: { border: '#9FC08A', bg: '#F6FAF2' } },
              { v: 'DENY' as const, title: 'I DO NOT grant consent.', body: "SCEI shall not use my child's photo, video, voice, artwork, or quotations in any public-facing materials. Internal recordkeeping for clinical and academic purposes remains permitted.", on: { border: 'var(--clay)', bg: 'var(--clay-tint)' } },
            ]).map(opt => {
              const active = content.photoRelease === opt.v
              return (
                <label key={opt.v} className="flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[color:var(--teal)]"
                  style={{ border: `1px solid ${active ? opt.on.border : 'var(--light-gray)'}`, background: active ? opt.on.bg : '#fff' }}>
                  <input type="radio" name="photoRelease" checked={active} onChange={() => update('photoRelease', opt.v)} className="mt-1 accent-[color:var(--deep-teal)]" />
                  <span className="text-[12.5px] leading-relaxed" style={{ color: 'var(--charcoal)' }}>
                    <b>{opt.title}</b> {opt.body}
                  </span>
                </label>
              )
            })}
          </div>
        </Section>

        {/* 8. Signatures — numbered as on the printed waiver */}
        <Section n={8} title="Signatures" hint="Executed at Pasig City, Philippines. The witness section is signed by the assigned SCEI SPED teacher when she next logs in.">
          <SubHead>Parent / Guardian *</SubHead>
          <Field label="Printed name *">
            <input required name="parentPrinted" className={`${CONTROL} w-full h-10`} style={CONTROL_STYLE}
              placeholder="As it appears on the signature line" onChange={e => setParentPrintedLive(e.target.value)} />
          </Field>
          <div>
            <span className={LABEL} style={LABEL_STYLE}>Signature *</span>
            <SignaturePad onChange={setParentSig} height={170} />
          </div>

          <div className="pt-2" style={{ borderTop: '1px solid var(--light-gray)' }} />
          <SubHead>Secondary Parent / Guardian (optional)</SubHead>
          <Field label="Printed name">
            <input name="secondaryPrinted" className={`${CONTROL} w-full h-10`} style={CONTROL_STYLE} />
          </Field>
          <div>
            <span className={LABEL} style={LABEL_STYLE}>Signature</span>
            <SignaturePad onChange={setSecondarySig} height={140} />
          </div>
        </Section>

        {/* Ready-to-sign checklist + submit. The error repeats here because
            on a form this long the top banner is far off-screen. */}
        <section className="rounded-xl p-4 sm:p-5 space-y-4" style={CARD_STYLE}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>
              Before you sign
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5" aria-label="Required items">
              {checks.map(c => (
                <li key={c.label} className="flex items-start gap-1.5 text-[12.5px]" style={{ color: c.ok ? '#2F5A28' : 'var(--mid-gray)' }}>
                  {c.ok
                    ? <Icon name="check" size={14} className="mt-0.5" />
                    : <span aria-hidden className="w-3.5 h-3.5 mt-0.5 rounded-full flex-shrink-0" style={{ border: '1.5px solid var(--light-gray)' }} />}
                  <span>{c.label}</span>
                  <span className="sr-only">{c.ok ? '(done)' : '(missing)'}</span>
                </li>
              ))}
            </ul>
          </div>
          {err && <Banner tone="error">{err}</Banner>}
          <button type="submit" disabled={signing} className={`${BTN_PRIMARY} w-full h-11 text-[15px]`} style={PRIMARY_STYLE}>
            <Icon name="edit" size={16} /> {signing ? 'Generating PDF…' : 'Sign & generate waiver PDF'}
          </button>
          <p className="text-[12px] text-center" style={{ color: 'var(--mid-gray)' }}>
            {readyToSign
              ? 'The signed waiver downloads automatically. The assigned SPED teacher will counter-sign as witness from her dashboard.'
              : 'Complete the items above, then sign. The signed waiver downloads automatically.'}
          </p>
        </section>
      </form>
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
    // Title-case 'Male' / 'Female' to match the Gender select options below.
    studentGender: d.sex === 'MALE' ? 'Male' : d.sex === 'FEMALE' ? 'Female' : '',
    gradeLevel: levelLabel(level),
    termOfEnrollment: d.schoolYearFrom && d.schoolYearTo ? `SY ${d.schoolYearFrom}–${d.schoolYearTo}` : '',
    // Carried over from the enrollment form — parent doesn't re-enter.
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

const CARD_SHADOW = '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)'

/** One numbered waiver section as a card: number badge + title in the
 *  header, fields in the body. Numbers follow the printed waiver. */
function Section({ n, title, hint, action, children }: { n: number; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl min-w-0" style={CARD_STYLE} aria-labelledby={`waiver-s${n}`}>
      <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0 text-[12px] font-bold tabular-nums"
            style={{ width: 26, height: 26, background: 'var(--deep-teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>{n}</span>
          <div className="min-w-0">
            <h2 id={`waiver-s${n}`} className="text-[15px] font-bold leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</h2>
            {hint && <p className="text-[12px] mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </header>
      <div className="p-4 sm:p-5 space-y-3">{children}</div>
    </section>
  )
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-widest pt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>{children}</div>
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={LABEL} style={LABEL_STYLE}>{label}</span>
      {children}
    </label>
  )
}
function Input({ value, onChange, type, placeholder, readOnly }: { value: string; onChange?: (v: string) => void; type?: string; placeholder?: string; readOnly?: boolean }) {
  return (
    <input className={`${CONTROL} w-full h-10 ${readOnly ? 'cursor-default' : ''}`}
      style={readOnly ? { ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' } : CONTROL_STYLE}
      type={type ?? 'text'} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} placeholder={placeholder} readOnly={readOnly} />
  )
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select className={`${CONTROL} w-full h-10`} style={CONTROL_STYLE} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  )
}
