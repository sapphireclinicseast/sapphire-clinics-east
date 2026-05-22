'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitDocuments } from '@/lib/api'
import { getSession, getDraft, setDraft, putFile, uploadDocumentBlob, levelLabel, getWaivers, type EnrollmentLevel } from '@/lib/session'
import { backendOrigin, backendJson } from '@/lib/backend'
import { generateAffidavitPdf, type AffidavitInput } from '@/lib/affidavit-pdf'
import { generateWaiverPdf } from '@/lib/waiver-pdf'
import SignaturePad from '@/components/SignaturePad'

interface DocRequirement {
  key: string
  title: string
  sub: string
  optional?: boolean
  /** When true, only image files are accepted. */
  imageOnly?: boolean
  /** When true, parents may tick "Not Available" to skip the upload at this
   *  stage (they'll be asked to sign the DepEd Affidavit of Undertaking
   *  instead). Only the school-credential rows have this set. */
  notAvailableOption?: boolean
}

const CHILD_PHOTO_DOC: DocRequirement = {
  key: 'child_photo_1x1',
  title: 'Child’s 1x1 Photo (for student ID)',
  sub: 'Front-facing headshot, plain background, JPG or PNG. This will be used as the student’s profile photo.',
  imageOnly: true,
}

const PARENT_VALID_ID_DOC: DocRequirement = {
  key: 'parent_valid_id',
  title: 'Parent/Guardian Valid ID',
  sub: 'For the main signatory and contact person on the enrollment. PDF or photo.',
}

const PWD_ID_DOC: DocRequirement = {
  key: 'pwd_id',
  title: 'PWD ID (if applicable)',
  sub: 'Photo or scan of the child’s PWD ID, if any. Helps with discount eligibility on tuition + clinical services.',
  optional: true,
}

const KINDER_DOCS: DocRequirement[] = [
  { key: 'psa_birth_cert',   title: 'PSA Birth Certificate (photocopy)', sub: 'Clear scan or photo of the PSA-issued certificate.' },
  CHILD_PHOTO_DOC,
  PARENT_VALID_ID_DOC,
  PWD_ID_DOC,
  { key: 'medical_reports',  title: 'Medical / developmental / therapy reports', sub: 'If relevant — helps the school plan support.', optional: true },
]

// Form 137 / SF10 is intentionally NOT collected from parents here — that
// record is endorsed by the previous school directly to Aura Academy.
const GRADED_DOCS: DocRequirement[] = [
  { key: 'psa_birth_cert',     title: 'PSA Birth Certificate (photocopy)', sub: 'Clear scan or photo of the PSA-issued certificate.' },
  CHILD_PHOTO_DOC,
  PARENT_VALID_ID_DOC,
  PWD_ID_DOC,
  { key: 'report_card_sf9',    title: 'Latest Report Card / SF9 (Form 138)', sub: 'Most recent grading period.', notAvailableOption: true },
  { key: 'good_moral',         title: 'Certificate of Good Moral Character', sub: 'From the previous school.', notAvailableOption: true },
  { key: 'medical_reports',    title: 'Medical / developmental / therapy reports', sub: 'If relevant — helps the school plan support.', optional: true },
]

const AFFIDAVIT_KEYS = ['report_card_sf9', 'good_moral'] as const

export default function DocumentsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [level, setLevel] = useState<EnrollmentLevel | null>(null)
  const [token, setToken] = useState('')
  const [files, setFiles] = useState<Record<string, File | null>>({})
  /** Keys flagged "Not Available" by the parent. */
  const [naMarks, setNaMarks] = useState<Record<string, boolean>>({})
  const [waiverSignedAt, setWaiverSignedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Affidavit composer state — only used when an affidavit is needed.
  const [affidavit, setAffidavit] = useState<{
    parentName: string
    parentAddress: string
    learnerName: string
    previousSchoolName: string
    previousGradeLevel: string
    reason: string
    govtIdType: string
    govtIdNumber: string
    govtIdDateIssued: string
    signatureDataUrl: string
  }>({
    parentName: '', parentAddress: '', learnerName: '',
    previousSchoolName: '', previousGradeLevel: '', reason: '',
    govtIdType: '', govtIdNumber: '', govtIdDateIssued: '',
    signatureDataUrl: '',
  })
  // Branch is loaded from draft on mount; controls the affidavit city.
  const [branch, setBranch] = useState<'EAST' | 'GREENHILLS' | null>(null)
  // QR-from-phone upload modal state.
  const [qrTarget, setQrTarget] = useState<{ docKey: string; title: string } | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/?expired=1'); return }
    setLevel(s.level); setToken(s.token)
    const draft = getDraft()
    if (draft?.waiverSignedAt) setWaiverSignedAt(draft.waiverSignedAt)
    if (draft?.branch) setBranch(draft.branch)
    // Pre-fill the affidavit fields from the draft so parents don't have to
    // re-type things they already entered on /enroll.
    if (draft) {
      const guardianName = draft.guardianOfRecord === 'FATHER'
        ? nameOf(draft.father)
        : draft.guardianOfRecord === 'MOTHER'
          ? nameOf(draft.mother)
          : nameOf(draft.guardian) || nameOf(draft.father) || nameOf(draft.mother)
      const learnerName = [draft.firstName, draft.middleName, draft.lastName].filter(Boolean).join(' ')
      const addr = [draft.houseStreet, draft.barangay, draft.cityProvinceCountry, draft.zipCode].filter(Boolean).join(', ')
      setAffidavit(a => ({
        ...a,
        parentName: guardianName,
        parentAddress: addr,
        learnerName,
        previousSchoolName: draft.previousSchoolName ?? '',
        previousGradeLevel: draft.lastGradeCompleted ?? '',
      }))
    }
    setReady(true)
  }, [router])

  // Refresh waiver state if the user signed it in the popup and returned.
  useEffect(() => {
    function onFocus() {
      const d = getDraft()
      if (d?.waiverSignedAt) setWaiverSignedAt(d.waiverSignedAt)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const docs = useMemo<DocRequirement[]>(() => {
    if (!level) return []
    return level === 'KINDER' ? KINDER_DOCS : GRADED_DOCS
  }, [level])

  /** True if any "notAvailable"-eligible doc is currently ticked as N/A. */
  const affidavitNeeded = AFFIDAVIT_KEYS.some(k => naMarks[k])

  function onFile(key: string, f: File | null) {
    if (f && f.size > 30 * 1024 * 1024) {
      setErr(`${f.name} is larger than 30 MB. Please upload a smaller version.`)
      return
    }
    setErr(null)
    // Picking a file auto-clears the Not Available flag for that key.
    setNaMarks(prev => ({ ...prev, [key]: false }))
    setFiles(prev => ({ ...prev, [key]: f }))
  }

  function toggleNa(key: string, on: boolean) {
    setErr(null)
    // Marking N/A also clears any previously-selected file for that key.
    if (on) setFiles(prev => ({ ...prev, [key]: null }))
    setNaMarks(prev => ({ ...prev, [key]: on }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const draft = getDraft()
    if (!draft?.certSignatureDataUrl) {
      setErr('Missing learner profile signature. Please go back and complete the profile.')
      setBusy(false); return
    }
    // A doc is "satisfied" when either a file is selected OR it's marked Not Available.
    const missing = docs.filter(d =>
      !d.optional &&
      !files[d.key] &&
      !(d.notAvailableOption && naMarks[d.key])
    ).map(d => d.title)
    if (missing.length) {
      setErr('Please upload (or mark Not Available where allowed): ' + missing.join(', '))
      setBusy(false); return
    }
    if (!waiverSignedAt) {
      setErr('Please sign the Parent/Guardian Waiver before submitting.')
      setBusy(false); return
    }
    // Validate the affidavit form if any N/A is set.
    if (affidavitNeeded) {
      const fail = validateAffidavit(affidavit)
      if (fail) { setErr(fail); setBusy(false); return }
    }
    try {
      const session = getSession()
      const documents: Record<string, { name: string; size: number; type?: string; fileId?: string }> = {}
      for (const [k, f] of Object.entries(files)) {
        if (!f) continue
        const fileId = 'doc_' + Math.random().toString(36).slice(2, 12)
        try { await putFile(fileId, f) } catch (e) { console.warn('IndexedDB put failed', e) }
        // Also persist to the marketing-app blob store so the partner-school
        // /admission view can download it. Best-effort — IndexedDB stays the
        // source of truth for the parent's own UI.
        if (session?.studentId) {
          try { await uploadDocumentBlob(session.studentId, k, f) } catch (e) { console.warn('Server blob put failed', e) }
        }
        documents[k] = { name: f.name, size: f.size, type: f.type, fileId }
      }

      // Generate the affidavit if needed, persist as a regular document blob.
      if (affidavitNeeded) {
        const now = new Date()
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
        const input: AffidavitInput = {
          parentName: affidavit.parentName.trim(),
          parentAddress: affidavit.parentAddress.trim(),
          learnerName: affidavit.learnerName.trim(),
          schoolName: 'Light Bearer Christian Academy',
          previousSchoolName: affidavit.previousSchoolName.trim(),
          previousGradeLevel: affidavit.previousGradeLevel.trim(),
          reason: affidavit.reason.trim(),
          submitCredentialsBy: 'August 15, 2026',
          attestedDay: String(now.getDate()),
          attestedMonth: `${months[now.getMonth()]} ${now.getFullYear()}`,
          attestedCity: branch === 'GREENHILLS' ? 'San Juan City' : 'Pasig City',
          signatureDataUrl: affidavit.signatureDataUrl || undefined,
          govtIdType: affidavit.govtIdType.trim() || undefined,
          govtIdNumber: affidavit.govtIdNumber.trim() || undefined,
          govtIdDateIssued: affidavit.govtIdDateIssued.trim() || undefined,
        }
        const pdfDoc = generateAffidavitPdf(input)
        const blob = pdfDoc.output('blob')
        const fileId = 'doc_' + Math.random().toString(36).slice(2, 12)
        const file = new File([blob], 'deped-affidavit-of-undertaking.pdf', { type: 'application/pdf' })
        try { await putFile(fileId, file) } catch (e) { console.warn('IndexedDB put failed', e) }
        if (session?.studentId) {
          try { await uploadDocumentBlob(session.studentId, 'affidavit_undertaking', file) } catch (e) { console.warn('Server blob put failed', e) }
        }
        documents['affidavit_undertaking'] = {
          name: file.name, size: file.size, type: file.type, fileId,
        }
      }

      // Render the Parent Waiver PDF from the WaiverRecord the parent
      // signed in /waiver and push it to the server blob store so the
      // partner-school /admission tracker can download it. WaiverRecord
      // lives in localStorage so we look it up by the email tagged on it.
      if (session?.studentId && waiverSignedAt) {
        try {
          const draftEmail = (draft.email ?? '').trim().toLowerCase()
          const waiver = getWaivers().find(w => w.studentEmail.toLowerCase() === draftEmail)
          if (waiver) {
            const waiverDoc = generateWaiverPdf(waiver)
            const waiverBlob = waiverDoc.output('blob')
            const waiverFile = new File([waiverBlob], 'parent-guardian-waiver.pdf', { type: 'application/pdf' })
            await uploadDocumentBlob(session.studentId, 'parent_waiver', waiverFile)
          }
        } catch (e) {
          console.warn('Parent waiver server sync failed:', e)
        }
      }

      await submitDocuments(token, { documents, waiverSignedAt })
      setDraft({ documents })
      router.push('/account-setup')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openWaiver() {
    const url = level === 'KINDER' ? '/waiver?level=KINDER' : `/waiver?level=${level}`
    window.open(url, 'scei_waiver', 'width=720,height=860,resizable=yes,scrollbars=yes')
  }

  if (!ready || !level) return null

  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      <StepBar step={3} />

      <div className="card-static">
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-1">Upload required documents</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-3">
          For <span className="font-semibold text-[color:var(--narra)]">{levelLabel(level)}</span>. Accepted: PDF, JPG, PNG (max 30 MB each).
        </p>

        {/* Hard-copies notice */}
        <div
          className="mb-5 rounded-xl p-3 border flex items-start gap-2"
          style={{ borderColor: '#fcd34d', background: '#fffbeb' }}
        >
          <span aria-hidden className="text-[16px] leading-none mt-0.5">📎</span>
          <p className="text-[13px] text-[color:var(--ink)] leading-relaxed">
            Please bring <span className="font-semibold">hard copies (or photocopies) of the same documents</span> when you visit the clinic to complete enrollment. The online upload speeds up our review — the physical copies are kept on file with the school.
          </p>
        </div>

        {err && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
            {err}
          </div>
        )}

        <form className="space-y-3" onSubmit={handleSubmit}>
          {docs.map(d => (
            <DocRow
              key={d.key}
              doc={d}
              file={files[d.key] ?? null}
              naMarked={!!naMarks[d.key]}
              onFile={f => onFile(d.key, f)}
              onToggleNa={on => toggleNa(d.key, on)}
              onQrUpload={(docKey, title) => setQrTarget({ docKey, title })}
            />
          ))}

          {/* Parent/Guardian Waiver — special row that opens the digital sign window */}
          <div className="doc-row" style={waiverSignedAt ? { borderStyle: 'solid', borderColor: 'var(--sage)', background: 'var(--sage-tint)' } : undefined}>
            <div className="min-w-0">
              <div className="doc-row-title">Signed Parent/Guardian Waiver</div>
              <div className="doc-row-sub">
                {waiverSignedAt
                  ? <>Signed at {new Date(waiverSignedAt).toLocaleString()}.</>
                  : <>Opens a new window — sign on screen or upload an e-signature image.</>}
              </div>
            </div>
            <button type="button" className={waiverSignedAt ? 'btn-secondary' : 'btn-cta'} onClick={openWaiver}>
              {waiverSignedAt ? 'Re-sign' : 'Open waiver →'}
            </button>
          </div>

          {/* Affidavit of Undertaking — only when an N/A is ticked */}
          {affidavitNeeded && (
            <AffidavitComposer
              value={affidavit}
              onChange={setAffidavit}
              branch={branch}
            />
          )}

          <div className="flex items-center gap-2 pt-3">
            <button type="button" className="btn-secondary" onClick={() => router.push('/enroll')}>← Back</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? 'Submitting…' : affidavitNeeded ? 'Generate affidavit + submit' : 'Submit enrollment'}
            </button>
          </div>
        </form>
      </div>

      {qrTarget && (
        <QRUploadModal
          docKey={qrTarget.docKey}
          title={qrTarget.title}
          onClose={() => setQrTarget(null)}
          onFile={f => { onFile(qrTarget.docKey, f); setQrTarget(null) }}
        />
      )}
    </div>
  )
}

function DocRow({ doc, file, naMarked, onFile, onToggleNa, onQrUpload }: {
  doc: DocRequirement
  file: File | null
  naMarked: boolean
  onFile: (f: File | null) => void
  onToggleNa: (on: boolean) => void
  onQrUpload: (docKey: string, title: string) => void
}) {
  const fileSelected = !!file
  const greenBorder = fileSelected || naMarked
  return (
    <div
      className="doc-row"
      style={greenBorder ? { borderStyle: 'solid', borderColor: 'var(--sage)', background: 'var(--sage-tint)' } : undefined}
    >
      <div className="min-w-0">
        <div className="doc-row-title">
          {doc.title}
          {doc.optional && <span className="ml-2 text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold">optional</span>}
          {naMarked && <span className="ml-2 text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--clay)] font-semibold">not available</span>}
        </div>
        <div className="doc-row-sub">
          {file
            ? `Selected: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`
            : naMarked
              ? 'You will sign the DepEd Affidavit of Undertaking below.'
              : doc.sub}
        </div>
        {doc.notAvailableOption && (
          <label className="inline-flex items-center gap-1.5 mt-2 text-[12px] text-[color:var(--ink)] cursor-pointer">
            <input
              type="checkbox"
              checked={naMarked}
              onChange={e => onToggleNa(e.target.checked)}
            />
            <span>Not available — I will sign the DepEd Affidavit of Undertaking</span>
          </label>
        )}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <label className={`btn-secondary cursor-pointer inline-flex items-center justify-center text-xs ${naMarked ? 'opacity-50' : ''}`} style={{ minWidth: 84 }}>
          {file ? 'Change' : 'Upload'}
          <input
            type="file"
            className="hidden"
            accept={doc.imageOnly ? 'image/*' : '.pdf,image/*'}
            disabled={naMarked}
            onChange={e => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="btn-secondary text-xs"
          style={{ minWidth: 84 }}
          disabled={naMarked}
          onClick={() => onQrUpload(doc.key, doc.title)}
          title="Scan a QR with your phone to capture the file there"
        >
          QR upload
        </button>
      </div>
    </div>
  )
}

function AffidavitComposer({
  value, onChange, branch,
}: {
  value: {
    parentName: string; parentAddress: string; learnerName: string
    previousSchoolName: string; previousGradeLevel: string; reason: string
    govtIdType: string; govtIdNumber: string; govtIdDateIssued: string
    signatureDataUrl: string
  }
  onChange: (next: typeof value) => void
  branch: 'EAST' | 'GREENHILLS' | null
}) {
  const city = branch === 'GREENHILLS' ? 'San Juan City' : 'Pasig City'
  function patch<K extends keyof typeof value>(k: K, v: typeof value[K]) {
    onChange({ ...value, [k]: v })
  }
  return (
    <div className="rounded-2xl p-4 border-2" style={{ borderColor: '#fcd34d', background: '#fffbeb' }}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--clay)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>DepEd Annex 3 · DO 3 s.2018</div>
      <h3 className="text-[16px] leading-tight text-[color:var(--narra)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Affidavit of Undertaking</h3>
      <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-4">
        Because you ticked &quot;Not Available&quot; on a previous-school document, please complete the fields below so we can generate and attach the DepEd Affidavit of Undertaking to your enrollment.
      </p>

      <div className="space-y-3">
        <label className="block">
          <span className="label">Parent / Guardian full name</span>
          <input className="input" value={value.parentName} onChange={e => patch('parentName', e.target.value)} placeholder="Juan Dela Cruz" />
        </label>
        <label className="block">
          <span className="label">Address</span>
          <input className="input" value={value.parentAddress} onChange={e => patch('parentAddress', e.target.value)} placeholder="123 Acacia St, Pasig City" />
        </label>
        <label className="block">
          <span className="label">Learner full name (your child)</span>
          <input className="input" value={value.learnerName} onChange={e => patch('learnerName', e.target.value)} placeholder="Maria Dela Cruz" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="label">Name of School</div>
            <div className="input flex items-center" style={{ background: 'var(--paper-2)' }} aria-disabled="true">
              Light Bearer Christian Academy
            </div>
            <p className="text-[11px] text-[color:var(--mid-gray)] mt-1">Locked.</p>
          </div>
          <label className="block">
            <span className="label">Name of Previous School</span>
            <input className="input" value={value.previousSchoolName} onChange={e => patch('previousSchoolName', e.target.value)} placeholder="St. Bernadette Learning Center" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Previous grade level passed</span>
            <input className="input" value={value.previousGradeLevel} onChange={e => patch('previousGradeLevel', e.target.value)} placeholder="e.g. Grade 1" />
          </label>
          <div>
            <div className="label">Submit credentials on or before</div>
            <div className="input flex items-center" style={{ background: 'var(--paper-2)' }} aria-disabled="true">
              August 15, 2026
            </div>
            <p className="text-[11px] text-[color:var(--mid-gray)] mt-1">Locked.</p>
          </div>
        </div>

        <label className="block">
          <span className="label">Reason credentials cannot be submitted yet</span>
          <textarea className="input" rows={2} value={value.reason} onChange={e => patch('reason', e.target.value)} placeholder="e.g. previous school is still processing records" />
        </label>

        <div>
          <div className="label">Attested at</div>
          <div className="input flex items-center" style={{ background: 'var(--paper-2)' }} aria-disabled="true">
            {city} · {new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
          <p className="text-[11px] text-[color:var(--mid-gray)] mt-1">City auto-detected from your enrollment branch; date is today.</p>
        </div>

        <details className="rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <summary className="px-3 py-2 cursor-pointer select-none text-[12.5px] font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
            Government ID details (optional)
          </summary>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="label">ID type</span>
              <input className="input" value={value.govtIdType} onChange={e => patch('govtIdType', e.target.value)} placeholder="e.g. Driver's License" />
            </label>
            <label className="block">
              <span className="label">ID number</span>
              <input className="input" value={value.govtIdNumber} onChange={e => patch('govtIdNumber', e.target.value)} placeholder="N01-23-456789" />
            </label>
            <label className="block">
              <span className="label">Date issued</span>
              <input className="input" value={value.govtIdDateIssued} onChange={e => patch('govtIdDateIssued', e.target.value)} placeholder="2024-05-10" />
            </label>
          </div>
        </details>

        <div>
          <span className="label">Signature</span>
          <SignaturePad onChange={s => patch('signatureDataUrl', s)} height={140} />
        </div>
      </div>
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

function nameOf(n?: { lastName: string; firstName: string; middleName: string }) {
  if (!n) return ''
  return [n.firstName, n.middleName, n.lastName].filter(Boolean).join(' ')
}

function validateAffidavit(a: {
  parentName: string; parentAddress: string; learnerName: string
  previousSchoolName: string; previousGradeLevel: string; reason: string
  signatureDataUrl: string
}): string | null {
  if (!a.parentName.trim()) return 'Affidavit: parent / guardian name is required.'
  if (!a.parentAddress.trim()) return 'Affidavit: address is required.'
  if (!a.learnerName.trim()) return 'Affidavit: learner name is required.'
  if (!a.previousSchoolName.trim()) return 'Affidavit: previous school is required.'
  if (!a.previousGradeLevel.trim()) return 'Affidavit: previous grade level is required.'
  if (!a.reason.trim()) return 'Affidavit: please state why credentials cannot be submitted yet.'
  if (!a.signatureDataUrl) return 'Affidavit: please sign before submitting.'
  return null
}

/**
 * QR-from-phone upload modal. On mount: requests a one-time upload token
 * from the marketing API, encodes the resulting /upload/<token> URL into
 * a QR code (data URL), and polls the same token's status every 2s. Once
 * the phone uploads a file, the desktop pulls the blob, hands it to the
 * parent via `onFile`, and deletes the token.
 */
function QRUploadModal({ docKey, title, onClose, onFile }: {
  docKey: string
  title: string
  onClose: () => void
  onFile: (f: File) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState<'CREATING' | 'WAITING' | 'INGESTING' | 'DONE'>('CREATING')

  // Keep onFile in a ref so the polling effect doesn't re-run (and tear
  // itself down) every time the parent recreates the callback.
  const onFileRef = useRef(onFile)
  useEffect(() => { onFileRef.current = onFile }, [onFile])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = getSession()
        const draft = getDraft()
        const { token: tk } = await backendJson<{ token: string }>('/api/public/class-portal/upload-tokens', {
          method: 'POST',
          body: JSON.stringify({
            docKey,
            studentId: session?.studentId ?? 'pending',
            studentEmail: draft?.email ?? 'pending',
          }),
        })
        if (cancelled) return
        // Build the upload URL pointing at the class-portal subdomain so
        // the QR opens this same site on the phone. In dev we just point
        // to the current origin.
        const portalOrigin = window.location.origin
        const url = `${portalOrigin}/upload/${encodeURIComponent(tk)}`
        const qr = (await import('qrcode')).default
        const data = await qr.toDataURL(url, { margin: 1, width: 256, color: { dark: '#3D6B62', light: '#FFFFFF' } })
        if (cancelled) return
        setToken(tk)
        setUploadUrl(url)
        setQrDataUrl(data)
        setStatus('WAITING')
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [docKey])

  // Poll for upload completion. NOTE: `status` is intentionally NOT in
  // the deps — when we call setStatus('INGESTING') mid-fetch, React
  // re-runs the effect, fires the cleanup (cancelled=true), and the
  // in-flight blob fetch then bails on the next `cancelled` check.
  // Symptom: modal stuck at "Receiving file from your phone…". By
  // depending on `token` only, the effect runs exactly once per token
  // and the status changes don't tear it down.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    let pollDone = false
    const interval = setInterval(async () => {
      if (pollDone || cancelled) return
      try {
        const res = await fetch(`${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token)}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const d = await res.json() as { uploadedAt: string | null; fileName: string | null; fileType: string | null }
        if (!d.uploadedAt || cancelled) return
        // Lock the poll loop so the next tick can't double-fetch while
        // we're mid-ingest.
        pollDone = true
        clearInterval(interval)
        setStatus('INGESTING')
        const blobRes = await fetch(`${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token)}/file`, { cache: 'no-store' })
        if (cancelled) return
        if (!blobRes.ok) throw new Error(`Could not fetch uploaded file (HTTP ${blobRes.status}).`)
        const blob = await blobRes.blob()
        const f = new File([blob], d.fileName ?? `${docKey}.jpg`, { type: d.fileType ?? blob.type ?? 'application/octet-stream' })
        // Best-effort cleanup; doesn't block the parent handoff.
        void fetch(`${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => null)
        if (cancelled) return
        setStatus('DONE')
        onFileRef.current(f)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      }
    }, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [token, docKey])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="card-static w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>QR upload</div>
            <h2 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-[color:var(--mid-gray)] hover:text-[color:var(--clay)] text-lg leading-none">×</button>
        </div>

        {err && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 mb-3">{err}</div>
        )}

        {status === 'CREATING' && (
          <p className="text-sm text-[color:var(--mid-gray)] py-6 text-center">Generating QR code…</p>
        )}

        {status === 'WAITING' && qrDataUrl && (
          <>
            <p className="text-sm text-[color:var(--mid-gray)] mb-3">
              On your phone, open the camera and point it at this QR code. Take a photo or pick a file — it&apos;ll appear here automatically.
            </p>
            <div className="flex justify-center my-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR code" width={256} height={256} className="rounded-xl border" style={{ borderColor: 'var(--paper-3)' }} />
            </div>
            {uploadUrl && (
              <p className="text-[11.5px] text-[color:var(--mid-gray)] text-center break-all" style={{ fontFamily: 'var(--font-display)' }}>
                Or open this on your phone:<br />
                <span className="text-[color:var(--narra)] font-semibold">{uploadUrl}</span>
              </p>
            )}
            <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-3 text-center" style={{ fontFamily: 'var(--font-display)' }}>
              Waiting for upload… The link expires in 30 minutes.
            </p>
          </>
        )}

        {status === 'INGESTING' && !err && (
          <p className="text-sm text-[color:var(--mid-gray)] py-6 text-center">Receiving file from your phone…</p>
        )}
        {status === 'INGESTING' && err && (
          <p className="text-sm text-[color:var(--clay)] py-6 text-center">
            Couldn&apos;t pull the file from the server. Try uploading again.
          </p>
        )}

        {status === 'DONE' && (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
            ✓ Got it. Closing…
          </p>
        )}
      </div>
    </div>
  )
}
