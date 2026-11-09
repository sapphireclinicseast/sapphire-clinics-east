'use client'

// Force per-request rendering instead of static prerender. The full route
// was being cached for s-maxage=31536000 (1 year), which made every deploy
// invisible to users until the cache TTL expired — symptom: bug fixes to
// the QR-upload flow kept "not landing" even after merge. Marking this
// route dynamic means each visit fetches a fresh shell that references
// the current build's chunk URLs.
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitDocuments } from '@/lib/api'
import { getSession, getDraft, setDraft, putFile, uploadDocumentBlob, levelLabel, getWaivers, type EnrollmentLevel } from '@/lib/session'
import { backendOrigin, backendJson } from '@/lib/backend'
import { generateAffidavitPdf, type AffidavitInput } from '@/lib/affidavit-pdf'
import { generateWaiverPdf } from '@/lib/waiver-pdf'
import SignaturePad from '@/components/SignaturePad'
import { Portal } from '@/components/Modal'
import {
  Banner, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, DashCard, Dialog,
  FILE_FOCUS, FOCUS, Icon, LABEL, LABEL_STYLE, PageHeader, PRIMARY_STYLE, SECONDARY_STYLE, Skeleton,
  StatusPill, SUBTLE_BG, Tag, TEXTAREA, type Tone,
} from '@/components/hub/ui'

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
  { key: 'medical_reports',  title: 'Medical / developmental / therapy reports', sub: 'If relevant — helps the school plan support. Includes developmental assessment, therapy evaluation and progress reports.', optional: true },
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
  { key: 'medical_reports',    title: 'Medical / developmental / therapy reports', sub: 'If relevant — helps the school plan support. Includes developmental assessment, therapy evaluation and progress reports.', optional: true },
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
    // Nursery + Kinder share the same document requirements (no prior
    // report card / good moral yet); Grade 1+ uses the expanded list.
    return (level === 'KINDER' || level === 'NURSERY') ? KINDER_DOCS : GRADED_DOCS
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
    const url = `/waiver?level=${level}`
    window.open(url, 'scei_waiver', 'width=720,height=860,resizable=yes,scrollbars=yes')
  }

  if (!ready || !level) return <DocumentsSkeleton />

  // Progress summary — display only. Mirrors handleSubmit's "missing" rule:
  // a required doc counts once a file is picked or it's ticked Not Available;
  // the signed waiver is the last required item.
  const requiredDocs = docs.filter(d => !d.optional)
  const requiredTotal = requiredDocs.length + 1
  const readyCount = requiredDocs.filter(d => !!files[d.key] || (!!d.notAvailableOption && !!naMarks[d.key])).length
    + (waiverSignedAt ? 1 : 0)
  const optionalDocs = docs.filter(d => d.optional)
  const optionalAdded = optionalDocs.filter(d => !!files[d.key]).length
  const allReady = readyCount === requiredTotal
  const pct = Math.round((readyCount / requiredTotal) * 100)

  return (
    <div className="max-w-2xl mx-auto animate-fade-up space-y-5 min-w-0">
      <StepBar step={3} />

      <PageHeader
        eyebrow="Enrollment · Step 3 of 4"
        title="Upload required documents"
        description={<>For <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>{levelLabel(level)}</span>. Accepted: PDF, JPG, PNG (max 30 MB each).</>}
      />

      {/* Progress summary */}
      <div className="rounded-xl px-4 py-3.5 min-w-0" style={CARD_STYLE}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
            Required items
          </p>
          <p className="text-sm" style={{ color: 'var(--charcoal)' }}>
            <span className="font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{readyCount} of {requiredTotal}</span> ready
            {optionalDocs.length > 0 && (
              <span style={{ color: 'var(--mid-gray)' }}> · {optionalAdded} of {optionalDocs.length} optional added</span>
            )}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Required items ready"
          aria-valuemin={0}
          aria-valuemax={requiredTotal}
          aria-valuenow={readyCount}
          aria-valuetext={`${readyCount} of ${requiredTotal} required items ready`}
          className="h-2 rounded-full mt-2.5 overflow-hidden"
          style={{ background: 'var(--paper-2)' }}
        >
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: allReady ? 'var(--sage)' : 'var(--teal)' }} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--mid-gray)' }}>
          {allReady
            ? affidavitNeeded
              ? 'All required items are in. Complete the Affidavit of Undertaking below, then submit.'
              : 'All required items are in. You can submit your enrollment.'
            : `${requiredTotal - readyCount} still needed — every required document plus the signed waiver.`}
        </p>
      </div>

      {/* Hard-copies notice */}
      <Banner tone="warn">
        Please bring <span className="font-semibold">hard copies (or photocopies) of the same documents</span> when you visit the clinic to complete enrollment. The online upload speeds up our review — the physical copies are kept on file with the school.
      </Banner>

      {err && <Banner tone="error">{err}</Banner>}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <DashCard
          title="Documents"
          icon={<Icon name="file" size={16} />}
          description="Upload from this device, or use QR upload to take a photo with your phone."
          flush
        >
          <ul>
            {docs.map((d, i) => (
              <DocRow
                key={d.key}
                first={i === 0}
                doc={d}
                file={files[d.key] ?? null}
                naMarked={!!naMarks[d.key]}
                onFile={f => onFile(d.key, f)}
                onToggleNa={on => toggleNa(d.key, on)}
                onQrUpload={(docKey, title) => setQrTarget({ docKey, title })}
              />
            ))}

            {/* Parent/Guardian Waiver — special row that opens the digital sign window */}
            <li className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <FileBadge icon="edit" done={!!waiverSignedAt} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Signed Parent/Guardian Waiver</p>
                    <StatusPill tone={waiverSignedAt ? 'success' : 'warn'}>{waiverSignedAt ? 'Signed' : 'Not signed'}</StatusPill>
                  </div>
                  <p className="text-xs mt-1 leading-snug break-words flex items-start gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                    {waiverSignedAt
                      ? <><Icon name="calendar" size={12} className="mt-px" /><span>Signed at {new Date(waiverSignedAt).toLocaleString()}.</span></>
                      : <>Opens a new window — sign on screen or upload an e-signature image.</>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-12 sm:pl-0 sm:shrink-0">
                <button
                  type="button"
                  className={waiverSignedAt ? BTN_SM : `${BTN_SM} text-white hover:opacity-90`}
                  style={waiverSignedAt ? SECONDARY_STYLE : PRIMARY_STYLE}
                  onClick={openWaiver}
                  aria-label={waiverSignedAt ? 'Re-sign the Parent/Guardian Waiver (opens a new window)' : 'Open the Parent/Guardian Waiver (opens a new window)'}
                >
                  <Icon name={waiverSignedAt ? 'edit' : 'external'} size={13} />
                  {waiverSignedAt ? 'Re-sign' : 'Open waiver'}
                </button>
              </div>
            </li>
          </ul>
        </DashCard>

        {/* Affidavit of Undertaking — only when an N/A is ticked */}
        {affidavitNeeded && (
          <AffidavitComposer
            value={affidavit}
            onChange={setAffidavit}
            branch={branch}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={() => router.push('/enroll')}>
            <Icon name="arrowLeft" size={14} /> Back
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={`${BTN_PRIMARY} flex-1 min-w-[180px]`} style={PRIMARY_STYLE}>
            {busy && <Spinner />}
            {busy ? 'Submitting…' : affidavitNeeded ? 'Generate affidavit + submit' : 'Submit enrollment'}
          </button>
        </div>
      </form>

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

/** Placeholder while the session + draft are read on mount. */
function DocumentsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-5" role="status" aria-label="Loading documents">
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="rounded-xl px-4 py-3.5" style={CARD_STYLE} aria-hidden>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2 w-full mt-3 rounded-full" />
      </div>
      <div className="rounded-xl" style={CARD_STYLE} aria-hidden>
        {Array.from({ length: 4 }).map((_, n) => (
          <div key={n} className="flex items-center gap-3 px-4 sm:px-5 py-3.5" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5" style={{ width: `${60 - n * 6}%` }} />
              <Skeleton className="h-2.5" style={{ width: `${45 - n * 5}%` }} />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return <span aria-hidden className="w-3.5 h-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />
}

/** QR glyph for the "QR upload" button — local so the shared kit stays untouched. */
function QrIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4" />
    </svg>
  )
}

/** File-type tile at the start of each row. Turns sage once the item is in. */
function FileBadge({ icon, done }: { icon: 'file' | 'image' | 'edit'; done: boolean }) {
  return (
    <span aria-hidden className="w-9 h-9 rounded-lg inline-flex items-center justify-center flex-shrink-0"
      style={done
        ? { background: 'var(--sage-tint)', color: 'var(--deep-teal)', border: '1px solid #CFE0BF' }
        : { background: SUBTLE_BG, color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
      <Icon name={icon} size={18} />
    </span>
  )
}

function DocRow({ doc, file, naMarked, onFile, onToggleNa, onQrUpload, first }: {
  doc: DocRequirement
  file: File | null
  naMarked: boolean
  onFile: (f: File | null) => void
  onToggleNa: (on: boolean) => void
  onQrUpload: (docKey: string, title: string) => void
  first?: boolean
}) {
  const fileSelected = !!file
  const status: { tone: Tone; label: string } = fileSelected
    ? { tone: 'success', label: 'Selected' }
    : naMarked
      ? { tone: 'info', label: 'Not available' }
      : doc.optional
        ? { tone: 'neutral', label: 'Not added' }
        : { tone: 'warn', label: 'Missing' }
  const titleId = `doc-${doc.key}-title`
  return (
    <li className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3" style={first ? undefined : { borderTop: '1px solid var(--light-gray)' }}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <FileBadge icon={doc.imageOnly ? 'image' : 'file'} done={fileSelected || naMarked} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p id={titleId} className="text-sm font-semibold leading-snug" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
              {doc.title}
            </p>
            {doc.optional && <Tag>Optional</Tag>}
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          <p className="text-xs mt-1 leading-snug break-words" style={{ color: 'var(--mid-gray)' }}>
            {file
              ? <>Selected: <span className="font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{file.name}</span> ({(file.size / 1024).toFixed(0)} KB)</>
              : naMarked
                ? 'You will sign the DepEd Affidavit of Undertaking below.'
                : doc.sub}
          </p>
          {doc.notAvailableOption && (
            <label className="flex items-start gap-2 mt-2 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
              <input
                type="checkbox"
                className={`w-4 h-4 mt-px flex-shrink-0 rounded ${FOCUS}`}
                style={{ accentColor: 'var(--deep-teal)' }}
                checked={naMarked}
                onChange={e => onToggleNa(e.target.checked)}
              />
              <span>Not available — I will sign the DepEd Affidavit of Undertaking</span>
            </label>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-12 sm:pl-0 sm:flex-col sm:shrink-0">
        <label
          className={`${BTN_SM} ${FILE_FOCUS} relative min-w-[104px] ${naMarked ? 'opacity-50' : ''}`}
          style={{ ...SECONDARY_STYLE, cursor: naMarked ? 'not-allowed' : 'pointer' }}
        >
          <Icon name="upload" size={13} />
          {file ? 'Replace' : 'Upload'}
          <input
            type="file"
            className="sr-only"
            aria-describedby={titleId}
            accept={doc.imageOnly ? 'image/*' : '.pdf,image/*'}
            disabled={naMarked}
            onChange={e => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className={`${BTN_SM} min-w-[104px]`}
          style={SECONDARY_STYLE}
          disabled={naMarked}
          onClick={() => onQrUpload(doc.key, doc.title)}
          title="Scan a QR with your phone to capture the file there"
          aria-describedby={titleId}
        >
          <QrIcon />
          QR upload
        </button>
      </div>
    </li>
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
  const input = `${CONTROL} w-full min-w-0`
  const locked = `${CONTROL} w-full min-w-0 flex items-center`
  const lockedStyle = { ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }
  const hint = 'text-[11px] mt-1'
  return (
    <DashCard
      title="Affidavit of Undertaking"
      icon={<Icon name="file" size={16} />}
      action={<Tag tone="warn">DepEd Annex 3 · DO 3 s.2018</Tag>}
      description={<>Because you ticked &quot;Not Available&quot; on a previous-school document, please complete the fields below so we can generate and attach the DepEd Affidavit of Undertaking to your enrollment.</>}
    >
      <div className="space-y-4">
        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Parent / Guardian full name</span>
          <input className={input} style={CONTROL_STYLE} value={value.parentName} onChange={e => patch('parentName', e.target.value)} placeholder="Juan Dela Cruz" />
        </label>
        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Address</span>
          <input className={input} style={CONTROL_STYLE} value={value.parentAddress} onChange={e => patch('parentAddress', e.target.value)} placeholder="123 Acacia St, Pasig City" />
        </label>
        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Learner full name (your child)</span>
          <input className={input} style={CONTROL_STYLE} value={value.learnerName} onChange={e => patch('learnerName', e.target.value)} placeholder="Maria Dela Cruz" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className={LABEL} style={LABEL_STYLE}>Name of School</div>
            <div className={locked} style={lockedStyle} aria-disabled="true">
              <span className="truncate">Light Bearer Christian Academy</span>
            </div>
            <p className={hint} style={{ color: 'var(--mid-gray)' }}>Locked.</p>
          </div>
          <label className="block min-w-0">
            <span className={LABEL} style={LABEL_STYLE}>Name of Previous School</span>
            <input className={input} style={CONTROL_STYLE} value={value.previousSchoolName} onChange={e => patch('previousSchoolName', e.target.value)} placeholder="St. Bernadette Learning Center" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className={LABEL} style={LABEL_STYLE}>Previous grade level passed</span>
            <input className={input} style={CONTROL_STYLE} value={value.previousGradeLevel} onChange={e => patch('previousGradeLevel', e.target.value)} placeholder="e.g. Grade 1" />
          </label>
          <div className="min-w-0">
            <div className={LABEL} style={LABEL_STYLE}>Submit credentials on or before</div>
            <div className={locked} style={lockedStyle} aria-disabled="true">
              August 15, 2026
            </div>
            <p className={hint} style={{ color: 'var(--mid-gray)' }}>Locked.</p>
          </div>
        </div>

        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Reason credentials cannot be submitted yet</span>
          <textarea className={TEXTAREA} style={CONTROL_STYLE} rows={2} value={value.reason} onChange={e => patch('reason', e.target.value)} placeholder="e.g. previous school is still processing records" />
        </label>

        <div>
          <div className={LABEL} style={LABEL_STYLE}>Attested at</div>
          <div className={locked} style={lockedStyle} aria-disabled="true">
            <span className="truncate">{city} · {new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
          <p className={hint} style={{ color: 'var(--mid-gray)' }}>City auto-detected from your enrollment branch; date is today.</p>
        </div>

        <details className="rounded-lg" style={{ border: '1px solid var(--light-gray)' }}>
          <summary className={`px-3 py-2 cursor-pointer select-none text-[13px] font-semibold rounded-lg ${FOCUS}`} style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', background: SUBTLE_BG }}>
            Government ID details (optional)
          </summary>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block min-w-0">
              <span className={LABEL} style={LABEL_STYLE}>ID type</span>
              <input className={input} style={CONTROL_STYLE} value={value.govtIdType} onChange={e => patch('govtIdType', e.target.value)} placeholder="e.g. Driver's License" />
            </label>
            <label className="block min-w-0">
              <span className={LABEL} style={LABEL_STYLE}>ID number</span>
              <input className={input} style={CONTROL_STYLE} value={value.govtIdNumber} onChange={e => patch('govtIdNumber', e.target.value)} placeholder="N01-23-456789" />
            </label>
            <label className="block min-w-0">
              <span className={LABEL} style={LABEL_STYLE}>Date issued</span>
              <input className={input} style={CONTROL_STYLE} value={value.govtIdDateIssued} onChange={e => patch('govtIdDateIssued', e.target.value)} placeholder="2024-05-10" />
            </label>
          </div>
        </details>

        <div>
          <span className={LABEL} style={LABEL_STYLE}>Signature</span>
          <SignaturePad onChange={s => patch('signatureDataUrl', s)} height={140} />
        </div>
      </div>
    </DashCard>
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

  // Sub-status surfaced in the UI so the user can see exactly where a
  // long-running fetch is stuck (previously the modal said "Receiving
  // file from your phone…" with no progress signal, masking server
  // hangs).
  const [ingestStep, setIngestStep] = useState<string>('')

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
    async function ingest(fileName: string | null, fileType: string | null) {
      try {
        setIngestStep('Downloading file from server…')
        // Hard timeout so a hung connection surfaces an error instead of
        // leaving the modal stuck on "Receiving…" forever.
        const blobRes = await fetch(
          `${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token!)}/file`,
          { cache: 'no-store', signal: AbortSignal.timeout(45_000) },
        )
        if (cancelled) return
        if (!blobRes.ok) throw new Error(`Server returned HTTP ${blobRes.status} fetching the upload.`)
        setIngestStep('Reading file bytes…')
        const blob = await blobRes.blob()
        if (cancelled) return
        const f = new File([blob], fileName ?? `${docKey}.jpg`, {
          type: fileType ?? blob.type ?? 'application/octet-stream',
        })
        setIngestStep('Cleaning up…')
        void fetch(
          `${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token!)}`,
          { method: 'DELETE' },
        ).catch(() => null)
        if (cancelled) return
        setStatus('DONE')
        onFileRef.current(f)
      } catch (e) {
        if (!cancelled) {
          const msg = (e as Error).name === 'TimeoutError'
            ? 'Timed out waiting for the file from the server. Try again, or upload from the desktop instead.'
            : (e as Error).message
          setErr(msg)
          setIngestStep('')
        }
      }
    }
    const interval = setInterval(async () => {
      if (pollDone || cancelled) return
      try {
        const res = await fetch(
          `${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token)}`,
          { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
        )
        if (!res.ok || cancelled) return
        const d = await res.json() as { uploadedAt: string | null; fileName: string | null; fileType: string | null }
        if (!d.uploadedAt || cancelled) return
        // Lock the poll loop so the next tick can't double-fetch while
        // we're mid-ingest.
        pollDone = true
        clearInterval(interval)
        setStatus('INGESTING')
        // Fire the ingest in a microtask so the INGESTING render commits
        // before we start awaiting bytes — gives the UI a chance to show
        // the spinner + step text immediately.
        void ingest(d.fileName, d.fileType)
      } catch (e) {
        // Polling errors are non-fatal — keep trying on the next tick.
        if ((e as Error).name !== 'TimeoutError') {
          console.warn('[qr-upload poll]', e)
        }
      }
    }, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [token, docKey])

  return (
    <Portal>
    <Dialog
      labelId="qr-upload-title"
      eyebrow="QR upload"
      title={title}
      onClose={onClose}
    >
      <div className="space-y-3">
        {err && <Banner tone="error">{err}</Banner>}

        {status === 'CREATING' && (
          <div role="status" className="flex flex-col items-center gap-3 py-4">
            <Skeleton className="w-[200px] h-[200px] rounded-xl" />
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Generating QR code…</p>
          </div>
        )}

        {status === 'WAITING' && qrDataUrl && (
          <>
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              On your phone, open the camera and point it at this QR code. Take a photo or pick a file — it&apos;ll appear here automatically.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={`QR code to upload ${title} from your phone`} width={256} height={256} className="rounded-xl max-w-full h-auto" style={{ border: '1px solid var(--light-gray)' }} />
            </div>
            {uploadUrl && (
              <div className="rounded-lg px-3 py-2 text-center" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Or open this on your phone</p>
                <p className="text-xs font-semibold mt-0.5 break-all" style={{ color: 'var(--deep-teal)' }}>{uploadUrl}</p>
              </div>
            )}
            <p role="status" className="text-xs flex items-center justify-center gap-2" style={{ color: 'var(--mid-gray)' }}>
              <span aria-hidden className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--sun)' }} />
              Waiting for upload… The link expires in 30 minutes.
            </p>
          </>
        )}

        {status === 'INGESTING' && !err && (
          <div role="status" className="py-6 flex flex-col items-center gap-2 text-center" style={{ color: 'var(--deep-teal)' }}>
            <Spinner />
            <p className="text-sm" style={{ color: 'var(--charcoal)' }}>Receiving file from your phone…</p>
            {ingestStep && (
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                {ingestStep}
              </p>
            )}
          </div>
        )}
        {status === 'INGESTING' && err && (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
              Couldn&apos;t pull the file from the server.
            </p>
            <p className="text-xs break-words" style={{ color: 'var(--mid-gray)' }}>
              {err}
            </p>
            <button
              type="button"
              className={BTN_SECONDARY}
              style={SECONDARY_STYLE}
              onClick={() => {
                // Reset the modal to its initial state — the parent will
                // remount us with a fresh token next time the user clicks
                // "QR upload" again.
                onClose()
              }}
            >
              <Icon name="refresh" size={13} /> Close &amp; try again
            </button>
          </div>
        )}

        {status === 'DONE' && (
          <Banner tone="success">Got it. Closing…</Banner>
        )}
      </div>
    </Dialog>
    </Portal>
  )
}
