'use client'

import { useEffect, useState } from 'react'
import {
  getFile, putFile, deleteFile,
  getPaymentsForStudent, getWaivers, getGradeForStudent,
  updateUserEnrollment, saveHeadshot,
  levelLabel, lrnStatusLabel,
  type StoredUser, type PaymentRecord, type WaiverRecord, type GradeRecord,
  type EnrollmentDraft,
} from '@/lib/session'
import { downloadWaiverPdf, generateWaiverPdf } from '@/lib/waiver-pdf'
import { downloadEnrollmentPdf, generateEnrollmentPdf } from '@/lib/enrollment-pdf'
import { generateAffidavitPdf, type AffidavitInput } from '@/lib/affidavit-pdf'
import HeadshotEditor from './HeadshotEditor'
import EnrollmentEditor from './EnrollmentEditor'

interface Props {
  student: StoredUser
  /** When viewer is the student themselves, headshot is editable. */
  viewerRole: 'STUDENT' | 'TEACHER' | 'ADMIN'
  /** Optional callback when admin/teacher does something that should refresh upstream list. */
  onChange?: () => void
}

/**
 * Full read-only profile of a student — used by:
 *   - the student themselves on /profile
 *   - the teacher on /profile > Students tab
 *   - the main admin on /admin > Students tab
 * Headshot is editable when viewerRole === 'STUDENT'.
 */
export default function StudentDetail({ student: studentProp, viewerRole, onChange }: Props) {
  const [student, setStudent] = useState<StoredUser>(studentProp)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [waiver, setWaiver] = useState<WaiverRecord | null>(null)
  const [grade, setGrade] = useState<GradeRecord | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => { setStudent(studentProp) }, [studentProp])

  useEffect(() => {
    setPayments(getPaymentsForStudent(student.id))
    setWaiver(getWaivers().find(w => w.studentEmail.toLowerCase() === student.email.toLowerCase()) ?? null)
    setGrade(getGradeForStudent(student.id))
  }, [student.id, student.email])

  const e = student.enrollment ?? {}
  const isPaid = payments.some(p => p.status === 'PAID')

  return (
    <div className="space-y-6">
      {/* Identity card with headshot */}
      <div className="card-static">
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="flex items-start gap-5">
            <HeadshotEditor studentId={student.id} editable={viewerRole === 'STUDENT'} />
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Student profile</div>
              <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">
                {[student.firstName, student.lastName].filter(Boolean).join(' ') || student.email}
              </h1>
              <p className="text-sm text-[color:var(--mid-gray)] mt-1">{student.email}</p>
              {student.level && (
                <p className="text-sm text-[color:var(--mid-gray)] mt-0.5">
                  Enrolled in <span className="font-semibold text-[color:var(--narra)]">{levelLabel(student.level)}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`badge ${isPaid ? 'badge-paid' : 'badge-pending'}`}>
              {isPaid ? 'Tuition paid' : 'Payment pending'}
            </span>
            {viewerRole === 'STUDENT' && (
              <a href="/pay" className="btn-cta text-xs whitespace-nowrap">Pay tuition fee →</a>
            )}
          </div>
        </div>
      </div>

      {/* Learner profile */}
      <div className="card-static">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-[18px] leading-tight">Learner profile</h2>
          <div className="flex gap-2">
            {(viewerRole === 'ADMIN' || viewerRole === 'TEACHER') && (
              <LrnUpdater
                student={student}
                onSaved={updated => { setStudent(updated); onChange?.() }}
              />
            )}
            {(viewerRole === 'ADMIN' || viewerRole === 'STUDENT') && (
              <button type="button" className="btn-secondary text-xs" onClick={() => setEditorOpen(true)}>
                {viewerRole === 'STUDENT' ? 'Edit profile' : 'Edit enrollment'}
              </button>
            )}
          </div>
        </div>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          <Row label="School year" value={e.schoolYearFrom && e.schoolYearTo ? `${e.schoolYearFrom} to ${e.schoolYearTo}` : '—'} />
          <Row label="LRN status" value={lrnStatusLabel(e.lrnStatus)} />
          {e.lrn && <Row label="LRN" value={e.lrn} />}
          <Row label="PSA Birth Cert. No." value={e.psaBirthCertNo ?? '—'} />
          <Row label="Date of birth" value={e.dob ?? '—'} />
          <Row label="Sex" value={e.sex ?? '—'} />
          <Row label="Mother tongue" value={e.motherTongue ?? '—'} />
          <Row label="Religion" value={e.religion ?? '—'} />
          {e.diagnosis && <Row label="Diagnosis" value={e.diagnosis} />}
          <Row label="Address" value={[e.houseStreet, e.barangay, e.cityProvinceCountry, e.zipCode].filter(Boolean).join(', ') || '—'} />
          <Row label="Father" value={nameOf(e.father)} />
          {e.fatherOccupation && <Row label="Father's occupation" value={e.fatherOccupation} />}
          <Row label="Mother" value={nameOf(e.mother)} />
          {e.motherOccupation && <Row label="Mother's occupation" value={e.motherOccupation} />}
          {e.guardianOfRecord === 'OTHER' && <Row label="Guardian" value={nameOf(e.guardian)} />}
          <Row label="Telephone" value={e.telephone ?? '—'} />
          <Row label="Cellphone" value={e.cellphone ?? '—'} />
        </dl>

        {e.isReturningOrTransferee === 'YES' && (
          <>
            <h3 className="text-[13.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--bright-teal)] mt-6 mb-3" style={{ fontFamily: 'var(--font-display)' }}>Previous school</h3>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <Row label="Last grade completed" value={e.lastGradeCompleted ?? '—'} />
              <Row label="Last school year" value={e.lastSchoolYearCompleted ?? '—'} />
              <Row label="School name" value={e.previousSchoolName ?? '—'} />
              {e.previousSchoolId && <Row label="School ID" value={e.previousSchoolId} />}
              <Row label="School address" value={e.previousSchoolAddress ?? '—'} />
            </dl>
          </>
        )}
      </div>

      {/* Submitted documents — viewable + downloadable; the student can also
          re-upload any row (e.g. the original was blurry or the wrong file).
          Admin + teacher can upload school-endorsed records (Form 137 / SF10)
          and re-upload any row on behalf of the student. */}
      {(e.documents && Object.keys(e.documents).length > 0) || viewerRole === 'ADMIN' || viewerRole === 'TEACHER' ? (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-1">Submitted documents</h2>
          {viewerRole === 'STUDENT' && (
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-3">
              Need to replace a file? Click <span className="font-semibold">Re-upload</span> on the row.
            </p>
          )}
          {(viewerRole === 'ADMIN' || viewerRole === 'TEACHER') && (
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-3">
              Re-upload any row, or upload school-endorsed records like Form 137 / SF10 from the picker below.
            </p>
          )}
          <div className="space-y-2.5">
            {Object.entries(e.documents ?? {}).map(([k, v]) => (
              <DocumentRow
                key={k}
                docKey={k}
                title={docTitle(k)}
                fileName={v.name}
                size={v.size}
                fileId={v.fileId}
                mime={v.type}
                canReplace={viewerRole === 'STUDENT' || viewerRole === 'ADMIN' || viewerRole === 'TEACHER'}
                onReplace={async (file) => {
                  // Upload new blob, swap the IndexedDB entry, update the
                  // enrollment.documents metadata via the API. The 1x1 child
                  // photo also refreshes the headshot.
                  const newFileId = 'doc_' + Math.random().toString(36).slice(2, 12)
                  await putFile(newFileId, file)
                  if (v.fileId) { try { await deleteFile(v.fileId) } catch { /* ignore */ } }
                  const nextDocs = { ...(student.enrollment?.documents ?? {}) }
                  nextDocs[k] = { name: file.name, size: file.size, type: file.type, fileId: newFileId }
                  const updated = await updateUserEnrollment(student.id, { documents: nextDocs })
                  setStudent(updated)
                  onChange?.()
                  if (k === 'child_photo_1x1') {
                    const dataUrl = await downscaleToDataUrl(file, 500, 0.85)
                    if (dataUrl) saveHeadshot({ studentId: student.id, dataUrl, uploadedAt: new Date().toISOString() })
                    // Force the HeadshotEditor to refresh its src.
                    setStudent(prev => ({ ...prev }))
                  }
                }}
              />
            ))}
          </div>

          {(viewerRole === 'ADMIN' || viewerRole === 'TEACHER') && (
            <StaffDocUploader
              existing={e.documents ?? {}}
              onUpload={async (key, file) => {
                const fileId = 'doc_' + Math.random().toString(36).slice(2, 12)
                await putFile(fileId, file)
                const nextDocs = { ...(student.enrollment?.documents ?? {}) }
                nextDocs[key] = { name: file.name, size: file.size, type: file.type, fileId }
                const updated = await updateUserEnrollment(student.id, { documents: nextDocs })
                setStudent(updated)
                onChange?.()
              }}
            />
          )}
        </div>
      ) : null}

      {/* Generated PDFs */}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">Generated forms</h2>
        <p className="text-[12px] text-[color:var(--mid-gray)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          Tip: if the PDF doesn&apos;t reflect a recent change, click <span className="font-semibold">Regenerate</span> — it forces a fresh build of the latest layout.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <GeneratedFormCard
            title="Enrollment Form (Annex 2)"
            description="DepEd-style enrollment record auto-generated from the learner profile."
            onDownload={() => downloadEnrollmentPdf(student, student.enrollment ?? {})}
            onPreview={() => previewPdf(generateEnrollmentPdf(student, student.enrollment ?? {}))}
            onRegenerate={() => regenerateAndOpen(() => generateEnrollmentPdf(student, student.enrollment ?? {}))}
          />
          {waiver && (
            <GeneratedFormCard
              title="Parent / Guardian Waiver"
              description={waiver.witnessSig ? 'Signed by parent and witness (assigned SCEI teacher).' : 'Signed by parent. Awaiting witness signature.'}
              onDownload={() => downloadWaiverPdf(waiver)}
              onPreview={() => previewPdf(generateWaiverPdf(waiver))}
              onRegenerate={() => regenerateAndOpen(() => generateWaiverPdf(waiver))}
            />
          )}
          {!waiver && (
            <div className="rounded-2xl p-4 border text-sm" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <div className="font-semibold text-[color:var(--narra)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Parent / Guardian Waiver</div>
              <div className="text-[12.5px] text-[color:var(--mid-gray)]">Not yet signed.</div>
            </div>
          )}
          {viewerRole === 'ADMIN' && (
            <GeneratedFormCard
              title="Affidavit of Undertaking (Annex 3) — admin preview"
              description="Rebuilds the DepEd affidavit from the latest template using whatever data is on this record. Fields not captured here (parent govt ID, reason, signature) render blank. The signed copy in Documents is the official one — this preview is just to validate layout changes."
              onDownload={() => {
                const doc = generateAffidavitPdf(enrollmentToAffidavitInput(student))
                doc.save(`affidavit-${(student.lastName ?? 'student').toLowerCase()}.pdf`)
              }}
              onPreview={() => previewPdf(generateAffidavitPdf(enrollmentToAffidavitInput(student)))}
              onRegenerate={() => regenerateAndOpen(() => generateAffidavitPdf(enrollmentToAffidavitInput(student)))}
            />
          )}
        </div>
      </div>

      {/* Grades preview when teacher has filled */}
      {grade && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Grades</h2>
          <div className="grid grid-cols-5 gap-2 text-center">
            <Quarter label="Q1" value={grade.q1} />
            <Quarter label="Q2" value={grade.q2} />
            <Quarter label="Q3" value={grade.q3} />
            <Quarter label="Q4" value={grade.q4} />
            <Quarter label="Year Avg" value={grade.yearAvg} highlight />
          </div>
          {grade.proofFileId && (
            <div className="mt-3">
              <DownloadButton fileId={grade.proofFileId} label={`Proof document — ${grade.proofFileName ?? 'document'}`} />
            </div>
          )}
        </div>
      )}

      {editorOpen && (viewerRole === 'ADMIN' || viewerRole === 'STUDENT') && (
        <EnrollmentEditor
          student={student}
          headerLabel={viewerRole === 'STUDENT' ? 'Edit your profile' : undefined}
          onClose={() => setEditorOpen(false)}
          onSaved={updated => { setStudent(updated); setEditorOpen(false); onChange?.() }}
        />
      )}
    </div>
  )
}

/* ─────────── helpers ─────────── */

/**
 * Compact LRN updater for admin + teacher. Appears as a button next to
 * "Edit enrollment"; expands to a small inline form when clicked. Use case:
 * the parent enrolled with NO_LRN, then DepEd issues an LRN — staff updates
 * the lrnStatus to WITH_LRN and types the 12-digit number here.
 */
function LrnUpdater({ student, onSaved }: { student: StoredUser; onSaved: (u: StoredUser) => void }) {
  const e = student.enrollment ?? {}
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<NonNullable<EnrollmentDraft['lrnStatus']>>(e.lrnStatus ?? 'NO_LRN')
  const [lrn, setLrn] = useState(e.lrn ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    setErr(null)
    const trimmed = lrn.trim()
    if (status === 'WITH_LRN' || status === 'RETURNING') {
      if (!/^\d{12}$/.test(trimmed)) {
        setErr('LRN must be 12 digits.')
        return
      }
    }
    setBusy(true)
    try {
      const updated = await updateUserEnrollment(student.id, {
        lrnStatus: status,
        lrn: status === 'NO_LRN' ? '' : trimmed,
      })
      onSaved(updated)
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        Update LRN
      </button>
    )
  }
  return (
    <div className="w-full rounded-xl p-3 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        Update LRN (after DepEd issuance)
      </div>
      {err && <div className="mb-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-800">{err}</div>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label text-[11px]">LRN status</span>
          <select
            className="select"
            value={status}
            onChange={ev => setStatus(ev.target.value as NonNullable<EnrollmentDraft['lrnStatus']>)}
            style={{ minWidth: 150 }}
          >
            <option value="NO_LRN">No LRN</option>
            <option value="WITH_LRN">With LRN</option>
            <option value="RETURNING">Returning (Balik-Aral)</option>
          </select>
        </label>
        <label className="block">
          <span className="label text-[11px]">LRN number (12 digits)</span>
          <input
            className="input"
            value={lrn}
            onChange={ev => setLrn(ev.target.value.replace(/[^\d]/g, '').slice(0, 12))}
            placeholder="123456789012"
            disabled={status === 'NO_LRN'}
            inputMode="numeric"
            style={{ minWidth: 180 }}
          />
        </label>
        <div className="flex gap-1.5 ml-auto">
          <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary text-xs" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[color:var(--mid-gray)] uppercase tracking-[0.06em] text-[11.5px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</dt>
      <dd className="text-[color:var(--ink)] mb-1">{value || '—'}</dd>
    </>
  )
}
function Quarter({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--paper-3)', background: highlight ? 'var(--sage-tint)' : 'var(--paper-2)' }}>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
      <div className={`text-[22px] font-bold mt-1 ${highlight ? 'text-[color:var(--narra)]' : 'text-[color:var(--ink)]'}`} style={{ fontFamily: 'var(--font-display)' }}>{value ?? '—'}</div>
    </div>
  )
}

function nameOf(n?: { lastName: string; firstName: string; middleName: string }) {
  if (!n) return '—'
  return [n.firstName, n.middleName, n.lastName].filter(Boolean).join(' ').trim() || '—'
}
/**
 * Compact uploader for admin/teacher to add missing document rows to a
 * student — typically Form 137 / SF10 endorsed directly by the previous
 * school. Picker only lists doc keys that aren't already on the student.
 */
function StaffDocUploader({
  existing, onUpload,
}: {
  existing: Record<string, { name: string; size: number; type?: string; fileId?: string }>
  onUpload: (key: string, file: File) => Promise<void>
}) {
  const STAFF_DOC_OPTIONS: Array<{ key: string; title: string; hint: string }> = [
    { key: 'form_137_sf10',  title: 'Form 137 / SF10',                   hint: 'School-endorsed permanent record from the prior school.' },
    { key: 'report_card_sf9', title: 'Report Card / SF9',                 hint: 'If parent did not upload it during enrollment.' },
    { key: 'good_moral',     title: 'Certificate of Good Moral Character', hint: 'If parent did not upload it during enrollment.' },
    { key: 'psa_birth_cert', title: 'PSA Birth Certificate',              hint: 'If parent did not upload it during enrollment.' },
    { key: 'parent_valid_id', title: 'Parent/Guardian Valid ID',          hint: 'For the main signatory and contact person.' },
    { key: 'affidavit_undertaking', title: 'DepEd Affidavit of Undertaking', hint: 'Signed Annex 3 if collected on paper.' },
    { key: 'medical_reports', title: 'Medical / therapy reports',          hint: 'If new reports come in after enrollment.' },
  ]
  // Default to the first slot the student doesn't yet have; falls back to Form 137.
  const firstMissing = STAFF_DOC_OPTIONS.find(o => !existing[o.key])?.key ?? 'form_137_sf10'
  const [selectedKey, setSelectedKey] = useState<string>(firstMissing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opt = STAFF_DOC_OPTIONS.find(o => o.key === selectedKey) ?? STAFF_DOC_OPTIONS[0]
  const alreadyOnFile = !!existing[selectedKey]

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 30 * 1024 * 1024) { setErr('File is larger than 30 MB.'); return }
    setErr(null); setBusy(true)
    try { await onUpload(selectedKey, f) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div
      className="mt-3 rounded-xl p-3 border"
      style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        Upload on the student&apos;s behalf
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="select"
          value={selectedKey}
          onChange={ev => setSelectedKey(ev.target.value)}
          style={{ minWidth: 240 }}
        >
          {STAFF_DOC_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>
              {o.title}{existing[o.key] ? ' (already on file)' : ''}
            </option>
          ))}
        </select>
        <label className={`btn-primary text-xs cursor-pointer ${busy ? 'opacity-60' : ''}`} style={{ width: 'auto' }}>
          {busy ? 'Uploading…' : alreadyOnFile ? 'Replace file' : 'Upload file'}
          <input type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx" onChange={handlePick} disabled={busy} />
        </label>
      </div>
      <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-2">{opt.hint}</p>
      {err && <div className="mt-2 text-[12px] text-rose-700">{err}</div>}
    </div>
  )
}

function docTitle(key: string): string {
  const map: Record<string, string> = {
    psa_birth_cert: 'PSA Birth Certificate',
    child_photo_1x1: 'Child’s 1x1 Photo (for student ID)',
    parent_valid_id: 'Parent/Guardian Valid ID',
    medical_reports: 'Medical / developmental / therapy reports',
    report_card_sf9: 'Report Card / SF9 (Form 138)',
    good_moral: 'Certificate of Good Moral Character',
    form_137_sf10: 'Form 137 / SF10',
    affidavit_undertaking: 'DepEd Affidavit of Undertaking (Annex 3)',
  }
  return map[key] ?? key
}

function GeneratedFormCard({ title, description, onDownload, onPreview, onRegenerate }: { title: string; description: string; onDownload: () => void; onPreview: () => void; onRegenerate?: () => void }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">{description}</div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button type="button" className="btn-secondary text-xs" onClick={onPreview}>View</button>
        {onRegenerate && (
          <button type="button" className="btn-secondary text-xs" onClick={onRegenerate} title="Force a fresh build of the latest PDF layout (clears browser cache)">↻ Regenerate</button>
        )}
        <button type="button" className="btn-primary text-xs" onClick={onDownload}>Download PDF</button>
      </div>
    </div>
  )
}

async function previewPdf(doc: import('jspdf').jsPDF) {
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  // Revoke after a delay so the new tab can load it first.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Build an AffidavitInput from a student record for the admin layout-preview
 * button. Most fields are derivable from the enrollment draft. The few that
 * only live in the /documents composer (parent govt ID, reason for missing
 * credentials, signature image) come back blank — the PDF generator already
 * handles empty strings cleanly, so the layout still renders correctly.
 */
function enrollmentToAffidavitInput(student: StoredUser): AffidavitInput {
  const e = student.enrollment ?? {}
  const fullName = (n?: { lastName?: string; firstName?: string; middleName?: string }): string => {
    if (!n) return ''
    return [n.lastName, n.firstName, n.middleName].filter(Boolean).join(', ').trim()
  }
  const learner = [
    e.firstName ?? student.firstName ?? '',
    e.middleName ?? '',
    e.lastName ?? student.lastName ?? '',
    e.extensionName ?? '',
  ].map(s => s.trim()).filter(Boolean).join(' ')

  // Primary parent name → father / mother / guardian per guardianOfRecord.
  let parentName = ''
  switch (e.guardianOfRecord) {
    case 'FATHER': parentName = fullName(e.father)   || fullName(e.mother) || fullName(e.guardian); break
    case 'MOTHER': parentName = fullName(e.mother)   || fullName(e.father) || fullName(e.guardian); break
    case 'OTHER':  parentName = fullName(e.guardian) || fullName(e.father) || fullName(e.mother);   break
    default:       parentName = fullName(e.father)   || fullName(e.mother) || fullName(e.guardian); break
  }

  const parentAddress = [e.houseStreet, e.barangay, e.cityProvinceCountry, e.zipCode]
    .filter(Boolean).join(', ')

  const today = new Date()
  const monthName = today.toLocaleString('en-US', { month: 'long' })
  // Affidavits are typically attested at the school branch's city.
  const attestedCity = student.branch === 'GREENHILLS' ? 'San Juan City' : 'Antipolo City'

  return {
    parentName,
    parentAddress,
    learnerName: learner,
    previousSchoolName: e.previousSchoolName ?? '',
    previousGradeLevel: e.lastGradeCompleted ?? '',
    reason: '',
    attestedDay: String(today.getDate()),
    attestedMonth: monthName,
    attestedCity,
    signatureDataUrl: e.certSignatureDataUrl,
  }
}

/**
 * Force the freshest possible PDF: clear the service-worker / HTTP cache for
 * the class-portal bundle, then re-run the generator against the new code
 * and pop the result in a new tab. This is the escape hatch for parents who
 * are looking at a stale layout because their browser cached the old JS.
 */
async function regenerateAndOpen(build: () => import('jspdf').jsPDF) {
  try {
    // Try to wipe any cached service-worker assets so the next page load uses
    // the freshest bundle. Best-effort — ignore errors on browsers without SW.
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => [])
      await Promise.all(regs.map(r => r.unregister().catch(() => null)))
    }
    if ('caches' in window) {
      const keys = await caches.keys().catch(() => [])
      await Promise.all(keys.map(k => caches.delete(k).catch(() => null)))
    }
  } catch { /* ignore cache-clearing failures */ }
  // Build with the currently-loaded generator; the cache flush takes effect
  // on the *next* page load, so users who still see old output can hit
  // Regenerate, then hard-reload (Cmd-Shift-R) to pick up new code.
  const doc = build()
  await previewPdf(doc)
}

function DocumentRow({
  docKey, title, fileName, size, fileId, mime, canReplace, onReplace,
}: {
  docKey: string
  title: string
  fileName: string
  size: number
  fileId?: string
  mime?: string
  canReplace?: boolean
  onReplace?: (file: File) => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isPhoto = docKey === 'child_photo_1x1'
  const accept = isPhoto ? 'image/*' : '.pdf,image/*'
  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !onReplace) return
    if (f.size > 30 * 1024 * 1024) { setErr('File is larger than 30 MB.'); return }
    setErr(null); setBusy(true)
    try { await onReplace(f) } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="min-w-0">
        <div className="font-semibold text-[color:var(--narra)] text-sm" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
        <div className="text-[12px] text-[color:var(--mid-gray)] truncate">{fileName} · {(size / 1024).toFixed(0)} KB</div>
        {err && <div className="text-[11.5px] text-rose-700 mt-1">{err}</div>}
      </div>
      <div className="flex gap-2 shrink-0">
        {fileId ? (
          <>
            <button type="button" className="btn-secondary text-xs" onClick={() => openFile(fileId, fileName, mime)}>View</button>
            <button type="button" className="btn-primary text-xs" onClick={() => downloadFile(fileId, fileName, mime)}>Download</button>
          </>
        ) : (
          <span className="badge badge-pending" title="File content not stored in this browser">Metadata only</span>
        )}
        {canReplace && (
          <label className="btn-secondary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
            {busy ? 'Uploading…' : 'Re-upload'}
            <input type="file" className="sr-only" accept={accept} onChange={handlePick} disabled={busy} />
          </label>
        )}
      </div>
      <span aria-hidden className="sr-only">{docKey}</span>
    </div>
  )
}

/** Same downscale routine the account-setup page uses for the headshot sync. */
function downscaleToDataUrl(file: Blob, maxEdge: number, jpegQuality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const longer = Math.max(img.width, img.height)
        const scale = longer > maxEdge ? maxEdge / longer : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(url); resolve(null); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', jpegQuality))
      } catch { resolve(null) }
      finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

function DownloadButton({ fileId, label }: { fileId: string; label: string }) {
  return (
    <button type="button" className="btn-secondary text-xs" onClick={() => downloadFile(fileId, label.replace(/[^a-z0-9.\-]+/gi, '-'))}>
      {label}
    </button>
  )
}

async function openFile(fileId: string, fileName: string, mime?: string) {
  const blob = await getFile(fileId)
  if (!blob) { alert('File not found in browser storage.'); return }
  const url = URL.createObjectURL(blob)
  void mime; void fileName
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
async function downloadFile(fileId: string, fileName: string, mime?: string) {
  const blob = await getFile(fileId)
  if (!blob) { alert('File not found in browser storage.'); return }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
  void mime
}
