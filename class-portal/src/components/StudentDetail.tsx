'use client'

import { useEffect, useState } from 'react'
import {
  getFile, putFile, deleteFile, uploadDocumentBlob,
  getPaymentsForStudent, getWaivers, hydrateWaiverForStudent,
  hasServerWaiverPdf, fetchServerWaiverPdfBlob,
  getGradeForStudent,
  updateUserEnrollment, updateUser, saveHeadshot,
  levelLabel, lrnStatusLabel, lsenClassificationLabel,
  LSEN_CLASSIFICATION_GROUPS,
  recordPayMongoPayment,
  hydrateFrontDeskPayments,
  type StoredUser, type PaymentRecord, type WaiverRecord, type GradeRecord,
  type EnrollmentDraft, type LsenClassification, type EnrollmentLevel,
  type PaymentPlan,
} from '@/lib/session'
import { backendOrigin, getToken } from '@/lib/backend'
import { downloadWaiverPdf, generateWaiverPdf } from '@/lib/waiver-pdf'
import { downloadEnrollmentPdf, generateEnrollmentPdf } from '@/lib/enrollment-pdf'
import { downloadRegistrationLetterPdf, openRegistrationLetterPdf } from '@/lib/registration-letter-pdf'
import { downloadFeeSchedulePdf, openFeeSchedulePdf } from '@/lib/fee-schedule-pdf'
import { fetchFeeSummary, issueRegistrationLetter, type FeeSummary, type IssuedRegistrationLetter } from '@/lib/session'
// Removed `generateAffidavitPdf` / `AffidavitInput` imports — the
// admin-preview Annex 3 card was deleted (regenerated affidavit had
// blank fields that confused users into thinking it was the official
// document). The actual signed Annex 3 still appears as a regular
// row under Submitted documents.
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
  // Fallback flag: true when the server has a `parent_waiver` PDF on
  // file but no structured `waiver_record` JSON yet. This is the
  // common state for any waiver signed BEFORE PR #169 — the SCEI-ACK
  // flow uploaded the PDF but the structured JSON only started
  // shipping to the server post-PR-#169.
  const [waiverPdfOnServer, setWaiverPdfOnServer] = useState(false)
  const [grade, setGrade] = useState<GradeRecord | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => { setStudent(studentProp) }, [studentProp])

  useEffect(() => {
    setPayments(getPaymentsForStudent(student.id))
    // First paint from this device's local cache so the card renders
    // immediately. Then hydrate from the server in two passes:
    //   1. Try `waiver_record` (structured JSON, post PR #169) →
    //      if found, the full signing log + signature snapshots are
    //      available and the regenerate-PDF action works.
    //   2. Else probe `parent_waiver` (PDF, populated by the SCEI-ACK
    //      flow since the original feature shipped) → if found,
    //      surface a "Signed (PDF on file)" card with download going
    //      straight to the server PDF.
    // This covers waivers signed BEFORE PR #169 deployed, whose
    // structured JSON was never persisted server-side.
    setWaiver(getWaivers().find(w => w.studentEmail.toLowerCase() === student.email.toLowerCase()) ?? null)
    setWaiverPdfOnServer(false)
    setGrade(getGradeForStudent(student.id))
    let cancelled = false
    void hydrateWaiverForStudent(student.id).then(async remote => {
      if (cancelled) return
      if (remote) { setWaiver(remote); return }
      // No structured record on the server — check for the legacy PDF.
      const pdfExists = await hasServerWaiverPdf(student.id)
      if (!cancelled) setWaiverPdfOnServer(pdfExists)
    })
    return () => { cancelled = true }
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
                <LevelEditor
                  student={student}
                  viewerRole={viewerRole}
                  onUpdated={u => { setStudent(u); onChange?.() }}
                />
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
            {viewerRole === 'ADMIN' && !isPaid && (
              <PayMongoRecorder
                student={student}
                onRecorded={async () => {
                  // Re-hydrate from the server so this device's local cache
                  // picks up the new PENDING row immediately (it'll flip to
                  // PAID once the cashier converts to order).
                  await hydrateFrontDeskPayments()
                  setPayments(getPaymentsForStudent(student.id))
                  onChange?.()
                }}
              />
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
            {(viewerRole === 'ADMIN' || viewerRole === 'TEACHER') && (
              <LsenUpdater
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
          {e.lsenClassification && <Row label="LSEN classification" value={lsenClassificationLabel(e.lsenClassification)} />}
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
          re-upload any row (e.g. the original was blurry or the wrong file)
          and upload any missing required document from the picker below.
          Admin + teacher can do the same on behalf of the student. */}
      {(
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-1">Submitted documents</h2>
          {viewerRole === 'STUDENT' && (
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-3">
              Need to replace a file? Click <span className="font-semibold">Re-upload</span> on the row.
              Missing a required document? Use the picker at the bottom of this card to upload it.
            </p>
          )}
          {(viewerRole === 'ADMIN' || viewerRole === 'TEACHER') && (
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-3">
              Re-upload any row, or upload school-endorsed records like Form 137 / SF10 from the picker below.
            </p>
          )}
          {viewerRole === 'STUDENT' && (!e.documents || Object.keys(e.documents).length === 0) && (
            <p className="text-[12.5px] italic text-[color:var(--mid-gray)] mb-3">
              No documents on file yet. Upload your required documents from the picker below.
            </p>
          )}
          <div className="space-y-2.5">
            {Object.entries(e.documents ?? {}).map(([k, v]) => (
              <DocumentRow
                key={k}
                docKey={k}
                studentId={student.id}
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
                  // Also push to the server blob store so /admission can pull it.
                  try { await uploadDocumentBlob(student.id, k, file) } catch { /* ignore */ }
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

          {(viewerRole === 'ADMIN' || viewerRole === 'TEACHER' || viewerRole === 'STUDENT') && (
            <StaffDocUploader
              viewerRole={viewerRole}
              studentLevel={student.level ?? null}
              existing={e.documents ?? {}}
              onUpload={async (key, file) => {
                const fileId = 'doc_' + Math.random().toString(36).slice(2, 12)
                await putFile(fileId, file)
                try { await uploadDocumentBlob(student.id, key, file) } catch { /* ignore */ }
                const nextDocs = { ...(student.enrollment?.documents ?? {}) }
                nextDocs[key] = { name: file.name, size: file.size, type: file.type, fileId }
                const updated = await updateUserEnrollment(student.id, { documents: nextDocs })
                setStudent(updated)
                onChange?.()
                if (key === 'child_photo_1x1') {
                  const dataUrl = await downscaleToDataUrl(file, 500, 0.85)
                  if (dataUrl) saveHeadshot({ studentId: student.id, dataUrl, uploadedAt: new Date().toISOString() })
                  setStudent(prev => ({ ...prev }))
                }
              }}
            />
          )}
        </div>
      )}

      {/* Other Documents — auto-generated PDFs + school-issued docs */}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">Other Documents</h2>
        <p className="text-[12px] text-[color:var(--mid-gray)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          Each <span className="font-semibold">View</span> opens a freshly rebuilt PDF using the latest template — no stale cached copies.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <GeneratedFormCard
            title="Enrollment Form (Annex 2)"
            description="DepEd-style enrollment record auto-generated from the learner profile."
            onDownload={() => downloadEnrollmentPdf(student, student.enrollment ?? {})}
            onPreview={() => regenerateAndOpen(() => generateEnrollmentPdf(student, student.enrollment ?? {}))}
          />
          {waiver && (
            <GeneratedFormCard
              title="Parent / Guardian Waiver"
              description={waiver.witnessSig ? 'Signed by parent and witness (assigned SCEI teacher).' : 'Signed by parent. Awaiting witness signature.'}
              onDownload={() => downloadWaiverPdf(waiver)}
              onPreview={() => regenerateAndOpen(() => generateWaiverPdf(waiver))}
            />
          )}
          {/* The waiver is system-generated from the structured
              WaiverRecord (signatures, dates, content clauses). When
              the parent signed it on /waiver, the generated PDF was
              archived to the server's document store. We stream that
              archived PDF here when the structured record isn't on
              this device — there is NO concept of a "parent re-upload"
              for this document. */}
          {!waiver && waiverPdfOnServer && (
            <GeneratedFormCard
              title="Parent / Guardian Waiver"
              description="Signed. The system-generated PDF (with embedded signatures) is on file — View / Download stream the archived copy."
              onDownload={() => void downloadServerWaiverPdf(student.id, student.lastName ?? 'student')}
              onPreview={() => openServerWaiverPdf(student.id)}
            />
          )}
          {!waiver && !waiverPdfOnServer && (
            <div className="rounded-2xl p-4 border text-sm" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <div className="font-semibold text-[color:var(--narra)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Parent / Guardian Waiver</div>
              <div className="text-[12.5px] text-[color:var(--mid-gray)]">Not yet signed.</div>
              {/* Direct path to /waiver for the parent themselves. This
                  is the only way they can get there once enrollment is
                  done — the standalone /waiver page is reachable by
                  URL but there was no nav link from inside the
                  student portal. Admin/teacher viewers see a hint
                  pointing the parent at this same flow. */}
              {viewerRole === 'STUDENT' && student.level ? (
                <a
                  href={`/waiver?level=${encodeURIComponent(student.level)}`}
                  className="btn-primary text-xs inline-block mt-3"
                  style={{ width: 'auto' }}
                >
                  Sign waiver →
                </a>
              ) : (
                <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-2 italic">
                  Ask the parent to sign in and click <span className="font-semibold">Sign waiver</span> on this card. The system regenerates the PDF from their signatures and stores it on the server.
                </div>
              )}
            </div>
          )}
          {/* The Annex 3 admin-preview card was removed — it regenerated
              the affidavit from raw enrollment data and left several
              fields blank (parent govt ID, reason, signature), which
              confused users into thinking it was the official document.
              The actual signed Annex 3 still appears as a regular doc
              row under "Submitted documents" with the correct content. */}
          <SchoolIdCard
            student={student}
            viewerRole={viewerRole}
            onUpdated={(updated) => { setStudent(updated); onChange?.() }}
          />
          {/* Registration letter + fee schedule — admin viewers (which
              includes front desk; the front-desk page passes role=ADMIN
              to this component) can issue an official school
              registration letter and a matching schedule of fees the
              parent can submit to their employer for reimbursement. */}
          {viewerRole === 'ADMIN' && (
            <RegistrationLetterCard student={student} />
          )}
          {viewerRole === 'ADMIN' && (
            <FeeScheduleCard student={student} />
          )}
          <StaffUploadedDocCard
            docKey="form_137_sf10"
            title="Form 137 / SF10"
            description="Permanent school record endorsed by the prior school. Uploaded by the teacher or admin once received."
            student={student}
            viewerRole={viewerRole}
            onUpdated={(updated) => { setStudent(updated); onChange?.() }}
          />
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

/**
 * Compact LSEN classification updater for admin + teacher. Mirrors the
 * LrnUpdater pattern: a single button that expands inline to a grouped
 * dropdown sourced from the DepEd LIS rubric, then writes back to the
 * student's enrollment record. Parents never touch this — it's a staff-
 * level classification assigned after the school assesses the learner.
 */
function LsenUpdater({ student, onSaved }: { student: StoredUser; onSaved: (u: StoredUser) => void }) {
  const e = student.enrollment ?? {}
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<LsenClassification | ''>(e.lsenClassification ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    setErr(null)
    setBusy(true)
    try {
      const updated = await updateUserEnrollment(student.id, {
        lsenClassification: value || undefined,
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
        {e.lsenClassification ? 'Update LSEN classification' : 'Set LSEN classification'}
      </button>
    )
  }
  return (
    <div className="w-full rounded-xl p-3 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        LSEN classification (Learners Information System)
      </div>
      {err && <div className="mb-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-800">{err}</div>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1" style={{ minWidth: 260 }}>
          <span className="label text-[11px]">Classification</span>
          <select
            className="select"
            value={value}
            onChange={ev => setValue((ev.target.value || '') as LsenClassification | '')}
          >
            <option value="">— Not classified —</option>
            {LSEN_CLASSIFICATION_GROUPS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
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
  viewerRole, studentLevel, existing, onUpload,
}: {
  viewerRole: 'STUDENT' | 'TEACHER' | 'ADMIN'
  studentLevel: EnrollmentLevel | null
  existing: Record<string, { name: string; size: number; type?: string; fileId?: string }>
  onUpload: (key: string, file: File) => Promise<void>
}) {
  // Master option list. Each entry tags which viewers may pick it via
  // `audiences`. For STUDENT we additionally filter by grade level so
  // the picker mirrors the enrollment funnel exactly (KINDER vs GRADED
  // doc set, no Form 137/SF10 because that is endorsed school-to-school).
  type Audience = 'STUDENT' | 'STAFF'
  type Opt = {
    key: string
    title: string
    hint: string
    studentHint?: string
    audiences: Audience[]
    /** Restrict student picker to a grade-level cohort. Undefined means show for all. */
    studentLevels?: 'KINDER' | 'GRADED'
  }
  const ALL_OPTIONS: Opt[] = [
    { key: 'psa_birth_cert', title: 'PSA Birth Certificate', audiences: ['STUDENT', 'STAFF'],
      hint: 'If parent did not upload it during enrollment.',
      studentHint: 'PSA-issued birth certificate (photocopy is fine).' },
    { key: 'child_photo_1x1', title: 'Child’s 1x1 Photo (for student ID)', audiences: ['STUDENT', 'STAFF'],
      hint: 'Used for the student ID and headshot.',
      studentHint: 'A clear 1x1 photo. This also becomes your headshot on the portal.' },
    { key: 'parent_valid_id', title: 'Parent/Guardian Valid ID', audiences: ['STUDENT', 'STAFF'],
      hint: 'For the main signatory and contact person.',
      studentHint: 'A government-issued ID of your parent or guardian.' },
    { key: 'pwd_id', title: 'PWD ID (if applicable)', audiences: ['STUDENT', 'STAFF'],
      hint: 'If the child has a PWD ID — helps with discount eligibility.',
      studentHint: 'PWD ID, if applicable.' },
    { key: 'report_card_sf9', title: 'Latest Report Card / SF9 (Form 138)', audiences: ['STUDENT', 'STAFF'], studentLevels: 'GRADED',
      hint: 'If parent did not upload it during enrollment.',
      studentHint: 'Your most recent report card.' },
    { key: 'good_moral', title: 'Certificate of Good Moral Character', audiences: ['STUDENT', 'STAFF'], studentLevels: 'GRADED',
      hint: 'If parent did not upload it during enrollment.',
      studentHint: 'Certificate of Good Moral Character from your prior school.' },
    { key: 'medical_reports', title: 'Medical / developmental / therapy reports', audiences: ['STUDENT', 'STAFF'],
      hint: 'If new reports come in after enrollment.',
      studentHint: 'Medical, developmental, or therapy reports (optional).' },
    { key: 'affidavit_undertaking', title: 'DepEd Affidavit of Undertaking (Annex 3)', audiences: ['STUDENT', 'STAFF'],
      hint: 'Signed Annex 3 if collected on paper.',
      studentHint: 'Signed Annex 3, if you have a hard copy. (Normally auto-generated during enrollment.)' },
    { key: 'form_137_sf10', title: 'Form 137 / SF10', audiences: ['STAFF'],
      hint: 'School-endorsed permanent record from the prior school.' },
  ]
  const isStudent = viewerRole === 'STUDENT'
  // Kinder cohort = NURSERY, KINDER. Everything else is GRADED (Grades 1–12).
  const cohort: 'KINDER' | 'GRADED' = studentLevel === 'NURSERY' || studentLevel === 'KINDER' ? 'KINDER' : 'GRADED'
  const STAFF_DOC_OPTIONS = ALL_OPTIONS.filter(o => {
    if (!isStudent) return o.audiences.includes('STAFF')
    if (!o.audiences.includes('STUDENT')) return false
    if (o.studentLevels && o.studentLevels !== cohort) return false
    return true
  })
  const firstMissing = STAFF_DOC_OPTIONS.find(o => !existing[o.key])?.key ?? STAFF_DOC_OPTIONS[0].key
  const [selectedKey, setSelectedKey] = useState<string>(firstMissing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opt = STAFF_DOC_OPTIONS.find(o => o.key === selectedKey) ?? STAFF_DOC_OPTIONS[0]
  const alreadyOnFile = !!existing[selectedKey]
  const heading = isStudent ? 'Upload a document' : 'Upload on the student’s behalf'
  const hint = isStudent ? (opt.studentHint ?? opt.hint) : opt.hint

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
        {heading}
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
      <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-2">{hint}</p>
      {err && <div className="mt-2 text-[12px] text-rose-700">{err}</div>}
    </div>
  )
}

function docTitle(key: string): string {
  const map: Record<string, string> = {
    psa_birth_cert: 'PSA Birth Certificate',
    child_photo_1x1: 'Child’s 1x1 Photo (for student ID)',
    parent_valid_id: 'Parent/Guardian Valid ID',
    pwd_id: 'PWD ID',
    medical_reports: 'Medical / developmental / therapy reports',
    report_card_sf9: 'Report Card / SF9 (Form 138)',
    good_moral: 'Certificate of Good Moral Character',
    form_137_sf10: 'Form 137 / SF10',
    affidavit_undertaking: 'DepEd Affidavit of Undertaking (Annex 3)',
    school_id: 'School ID',
  }
  return map[key] ?? key
}

/**
 * School ID card — appears in Generated forms. Branch admin / main admin
 * uploads the ID (image or PDF); student + teacher viewers can only View
 * or Download. The file is stored alongside other enrollment documents
 * in the IndexedDB blob store, keyed under `enrollment.documents.school_id`.
 */
function SchoolIdCard({ student, viewerRole, onUpdated }: {
  student: StoredUser
  viewerRole: 'STUDENT' | 'TEACHER' | 'ADMIN'
  onUpdated: (updated: StoredUser) => void
}) {
  const idDoc = student.enrollment?.documents?.school_id
  const canEdit = viewerRole === 'ADMIN'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { setErr('School ID is larger than 10 MB.'); return }
    setErr(null); setBusy(true)
    try {
      const newFileId = 'doc_' + Math.random().toString(36).slice(2, 12)
      await putFile(newFileId, f)
      if (idDoc?.fileId) { try { await deleteFile(idDoc.fileId) } catch { /* ignore */ } }
      try { await uploadDocumentBlob(student.id, 'school_id', f) } catch { /* ignore */ }
      const nextDocs = { ...(student.enrollment?.documents ?? {}) }
      nextDocs.school_id = { name: f.name, size: f.size, type: f.type, fileId: newFileId }
      const updated = await updateUserEnrollment(student.id, { documents: nextDocs })
      onUpdated(updated)
    } catch (ex) { setErr((ex as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>School ID</div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">
        {idDoc?.fileId
          ? `${idDoc.name} · ${(idDoc.size / 1024).toFixed(0)} KB`
          : (canEdit ? 'Upload the student’s printed school ID (image or PDF).' : 'Not yet issued by the school.')}
      </div>
      {err && <div className="text-[11.5px] text-rose-700 mt-1">{err}</div>}
      <div className="flex gap-2 mt-3 flex-wrap">
        {idDoc?.fileId ? (
          <>
            <button type="button" className="btn-secondary text-xs" onClick={() => openFile(idDoc.fileId!, idDoc.name, idDoc.type, student.id, 'school_id')}>View</button>
            <button type="button" className="btn-primary text-xs" onClick={() => downloadFile(idDoc.fileId!, idDoc.name, idDoc.type, student.id, 'school_id')}>Download</button>
            {canEdit && (
              <label className="btn-secondary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
                {busy ? 'Uploading…' : 'Replace'}
                <input type="file" className="sr-only" accept=".pdf,image/*" onChange={handleUpload} disabled={busy} />
              </label>
            )}
          </>
        ) : canEdit ? (
          <label className="btn-primary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
            {busy ? 'Uploading…' : 'Upload School ID'}
            <input type="file" className="sr-only" accept=".pdf,image/*" onChange={handleUpload} disabled={busy} />
          </label>
        ) : (
          <span className="badge badge-pending">Pending</span>
        )}
      </div>
    </div>
  )
}

/**
 * Generic staff-uploaded document card — used for school-issued records like
 * Form 137 / SF10 that the student themselves can't produce. Upload is
 * restricted to ADMIN + TEACHER; everyone can view / download once uploaded.
 * Stored under `enrollment.documents[docKey]` (IndexedDB fileId + metadata)
 * and pushed to the server blob store so /admission can pull it.
 */
function StaffUploadedDocCard({ docKey, title, description, student, viewerRole, onUpdated }: {
  docKey: string
  title: string
  description: string
  student: StoredUser
  viewerRole: 'STUDENT' | 'TEACHER' | 'ADMIN'
  onUpdated: (updated: StoredUser) => void
}) {
  const doc = student.enrollment?.documents?.[docKey]
  const canEdit = viewerRole === 'ADMIN' || viewerRole === 'TEACHER'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 15 * 1024 * 1024) { setErr(`${title} is larger than 15 MB.`); return }
    setErr(null); setBusy(true)
    try {
      const newFileId = 'doc_' + Math.random().toString(36).slice(2, 12)
      await putFile(newFileId, f)
      if (doc?.fileId) { try { await deleteFile(doc.fileId) } catch { /* ignore */ } }
      try { await uploadDocumentBlob(student.id, docKey, f) } catch { /* ignore */ }
      const nextDocs = { ...(student.enrollment?.documents ?? {}) }
      nextDocs[docKey] = { name: f.name, size: f.size, type: f.type, fileId: newFileId }
      const updated = await updateUserEnrollment(student.id, { documents: nextDocs })
      onUpdated(updated)
    } catch (ex) { setErr((ex as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">
        {doc?.fileId
          ? `${doc.name} · ${(doc.size / 1024).toFixed(0)} KB`
          : (canEdit ? description : 'Not yet uploaded by the school.')}
      </div>
      {err && <div className="text-[11.5px] text-rose-700 mt-1">{err}</div>}
      <div className="flex gap-2 mt-3 flex-wrap">
        {doc?.fileId ? (
          <>
            <button type="button" className="btn-secondary text-xs" onClick={() => openFile(doc.fileId!, doc.name, doc.type, student.id, docKey)}>View</button>
            <button type="button" className="btn-primary text-xs" onClick={() => downloadFile(doc.fileId!, doc.name, doc.type, student.id, docKey)}>Download</button>
            {canEdit && (
              <label className="btn-secondary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
                {busy ? 'Uploading…' : 'Replace'}
                <input type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx" onChange={handleUpload} disabled={busy} />
              </label>
            )}
          </>
        ) : canEdit ? (
          <label className="btn-primary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
            {busy ? 'Uploading…' : `Upload ${title}`}
            <input type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx" onChange={handleUpload} disabled={busy} />
          </label>
        ) : (
          <span className="badge badge-pending">Pending</span>
        )}
      </div>
    </div>
  )
}

function GeneratedFormCard({ title, description, onDownload, onPreview }: { title: string; description: string; onDownload: () => void; onPreview: () => void }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">{description}</div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button type="button" className="btn-secondary text-xs" onClick={onPreview} title="Open a freshly rebuilt PDF in a new tab">View</button>
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
 * Registration-letter card. Each press of Download/View mints a fresh
 * AURA-REG-YYYY-NNNN reference number, snapshots the current annual
 * fees from the server, and renders the PDF client-side using jsPDF.
 * Front desk + main admin only — surfaced when viewerRole is ADMIN
 * (the front-desk page calls this component with role=ADMIN).
 */
function RegistrationLetterCard({ student }: { student: StoredUser }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lastIssued, setLastIssued] = useState<IssuedRegistrationLetter | null>(null)
  // Free-text purpose. Whatever the staff types here lands verbatim in
  // the certifying line ("…for [purpose] only and not for any other
  // intent."). Default covers the most common case — reimbursement.
  const [purpose, setPurpose] = useState('reimbursement purposes')
  // Early bird 30% discount toggle. When on, the breakdown shows
  // base → less 30% → net tuition (reverse-derived from the recorded
  // tuition, which is assumed to already reflect the discount).
  const [appliedEarlyBird, setAppliedEarlyBird] = useState(false)

  async function buildInput(): Promise<{ summary: FeeSummary; letter: IssuedRegistrationLetter } | null> {
    setErr(null)
    if (!purpose.trim()) { setErr('Please fill in the purpose for the letter.'); return null }
    setBusy(true)
    try {
      const summary = await fetchFeeSummary(student.id)
      if (!summary) { setErr('Could not pull the fee summary. Please retry.'); return null }
      if (summary.paymentRowCount === 0) {
        setErr('No payment records yet for this student in the current school year. Record a payment first, then generate the letter.')
        return null
      }
      const letter = await issueRegistrationLetter(student.id)
      if (!letter) { setErr('Could not assign a reference number. Please retry.'); return null }
      setLastIssued(letter)
      return { summary, letter }
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    const r = await buildInput()
    if (!r) return
    downloadRegistrationLetterPdf({
      referenceNumber: r.letter.referenceNumber,
      studentFullName: r.summary.student.fullName,
      studentEmail: r.summary.student.email,
      branch: r.summary.student.branch,
      level: r.summary.student.level,
      schoolYear: r.summary.schoolYear,
      annualTuitionCentavos: r.summary.annualTuitionCentavos,
      annualMiscCentavos: r.summary.annualMiscCentavos,
      annualTotalCentavos: r.summary.annualTotalCentavos,
      plan: r.summary.plan,
      paidTotalCentavos: r.summary.paidTotalCentavos,
      appliedEarlyBird,
      issuedAt: new Date(r.letter.issuedAt),
      issuedBy: r.letter.issuedBy,
      purpose: purpose.trim(),
    })
  }

  async function handlePreview() {
    const r = await buildInput()
    if (!r) return
    openRegistrationLetterPdf({
      referenceNumber: r.letter.referenceNumber,
      studentFullName: r.summary.student.fullName,
      studentEmail: r.summary.student.email,
      branch: r.summary.student.branch,
      level: r.summary.student.level,
      schoolYear: r.summary.schoolYear,
      annualTuitionCentavos: r.summary.annualTuitionCentavos,
      annualMiscCentavos: r.summary.annualMiscCentavos,
      annualTotalCentavos: r.summary.annualTotalCentavos,
      plan: r.summary.plan,
      paidTotalCentavos: r.summary.paidTotalCentavos,
      appliedEarlyBird,
      issuedAt: new Date(r.letter.issuedAt),
      issuedBy: r.letter.issuedBy,
      purpose: purpose.trim(),
    })
  }

  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
        School Registration Letter
      </div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">
        Official enrollment certification signed by HANNAH JARA (CEO and President). Auto-pulls the student&apos;s current annual tuition + ₱5,000 misc, mints a fresh AURA-REG reference number, and generates a one-page PDF.
      </div>
      <label className="block mt-3">
        <span className="label">Purpose (appears in the certification line)</span>
        <input
          type="text"
          className="input"
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          placeholder="e.g. reimbursement purposes / scholarship application / visa requirement"
          disabled={busy}
        />
        <span className="text-[11px] text-[color:var(--mid-gray)] block mt-1">
          The letter will read: &quot;…issued upon the request of the parent / guardian for{' '}
          <span className="font-semibold text-[color:var(--narra)]">{purpose.trim() || '[purpose]'}</span> only and not for any other intent.&quot;
        </span>
      </label>

      <label className="flex items-start gap-2 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={appliedEarlyBird}
          onChange={e => setAppliedEarlyBird(e.target.checked)}
          disabled={busy}
          className="mt-0.5"
        />
        <span className="text-[12.5px] text-[color:var(--ink)]">
          <span className="font-semibold">Student availed of the 30% Early Bird Discount.</span>
          <span className="block text-[11px] text-[color:var(--mid-gray)] mt-0.5">
            When ticked, the breakdown shows the base tuition, the 30% deduction, and the net tuition — so the parent&apos;s employer can see how the discount was applied. Untick for the simple 1-line tuition presentation.
          </span>
        </span>
      </label>
      {lastIssued && (
        <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-2">
          Last issued: <span className="font-semibold text-[color:var(--narra)]">{lastIssued.referenceNumber}</span> on {new Date(lastIssued.issuedAt).toLocaleString()}
        </div>
      )}
      {err && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-[12px] text-rose-800">{err}</div>
      )}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button type="button" className="btn-secondary text-xs" onClick={() => void handlePreview()} disabled={busy}>
          {busy ? 'Issuing…' : 'View'}
        </button>
        <button type="button" className="btn-primary text-xs" onClick={() => void handleDownload()} disabled={busy}>
          {busy ? 'Issuing…' : 'Download PDF'}
        </button>
      </div>
    </div>
  )
}

/**
 * Schedule-of-fees card. Same data source as the registration letter
 * but shows the breakdown PLUS payment-plan tranches (annual /
 * bi-annual / monthly). Does NOT mint a reference number — this is
 * informational, not a certifying document.
 */
function FeeScheduleCard({ student }: { student: StoredUser }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function buildInput(): Promise<FeeSummary | null> {
    setErr(null)
    setBusy(true)
    try {
      const summary = await fetchFeeSummary(student.id)
      if (!summary) { setErr('Could not pull the fee summary. Please retry.'); return null }
      if (summary.paymentRowCount === 0) {
        setErr('No payment records yet for this student in the current school year.')
        return null
      }
      return summary
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    const s = await buildInput()
    if (!s) return
    downloadFeeSchedulePdf({
      studentFullName: s.student.fullName,
      branch: s.student.branch,
      level: s.student.level,
      schoolYear: s.schoolYear,
      annualTuitionCentavos: s.annualTuitionCentavos,
      annualMiscCentavos: s.annualMiscCentavos,
      annualTotalCentavos: s.annualTotalCentavos,
      issuedAt: new Date(),
      issuedBy: 'admin', // discreet footer; we don't need the auth email here
    })
  }
  async function handlePreview() {
    const s = await buildInput()
    if (!s) return
    openFeeSchedulePdf({
      studentFullName: s.student.fullName,
      branch: s.student.branch,
      level: s.student.level,
      schoolYear: s.schoolYear,
      annualTuitionCentavos: s.annualTuitionCentavos,
      annualMiscCentavos: s.annualMiscCentavos,
      annualTotalCentavos: s.annualTotalCentavos,
      issuedAt: new Date(),
      issuedBy: 'admin',
    })
  }

  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
        Schedule of Fees
      </div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">
        Annual breakdown (Tuition + ₱5,000 Miscellaneous) plus the three payment plan options — Annual, Bi-annual, Monthly — with each tranche pre-computed. Pull this for the parent when they ask &quot;how much do I owe in total this year?&quot;.
      </div>
      {err && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-[12px] text-rose-800">{err}</div>
      )}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button type="button" className="btn-secondary text-xs" onClick={() => void handlePreview()} disabled={busy}>
          {busy ? 'Loading…' : 'View'}
        </button>
        <button type="button" className="btn-primary text-xs" onClick={() => void handleDownload()} disabled={busy}>
          {busy ? 'Loading…' : 'Download PDF'}
        </button>
      </div>
    </div>
  )
}

// `enrollmentToAffidavitInput` removed alongside the admin-preview
// Annex 3 card. Reintroduce only if a real "preview the PDF that
// would be generated from this record" surface comes back.

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
  docKey, studentId, title, fileName, size, fileId, mime, canReplace, onReplace,
}: {
  docKey: string
  /** Passed through to openFile/downloadFile so the helper can fall
   *  back to the server-side blob when this device's IDB cache is empty
   *  (e.g. main admin viewing a doc the parent uploaded from their phone). */
  studentId: string
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
            <button type="button" className="btn-secondary text-xs" onClick={() => openFile(fileId, fileName, mime, studentId, docKey)}>View</button>
            <button type="button" className="btn-primary text-xs" onClick={() => downloadFile(fileId, fileName, mime, studentId, docKey)}>Download</button>
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

/**
 * Inline grade-level editor. Renders as read-only text for students;
 * teachers + admins see a "Change" button next to the current level
 * that toggles a select. We use `updateUser({ level })` which the
 * server already supports — no DB migration needed. Branch/grade
 * scoping for teachers (StudentListPanel) automatically re-runs after
 * the parent prop refreshes via `onUpdated`.
 */
const LEVEL_OPTIONS: EnrollmentLevel[] = [
  'NURSERY', 'KINDER',
  'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5',
  'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10',
  'GRADE_11', 'GRADE_12',
]
function LevelEditor({ student, viewerRole, onUpdated }: {
  student: StoredUser
  viewerRole: 'STUDENT' | 'TEACHER' | 'ADMIN'
  onUpdated: (u: StoredUser) => void
}) {
  const canEdit = viewerRole === 'ADMIN' || viewerRole === 'TEACHER'
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function commit(next: EnrollmentLevel) {
    if (next === student.level) { setEditing(false); return }
    setErr(null); setBusy(true)
    try {
      const updated = await updateUser(student.id, { level: next })
      onUpdated(updated)
      setEditing(false)
    } catch (e) {
      setErr((e as Error).message || 'Could not update grade level.')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <p className="text-sm text-[color:var(--mid-gray)] mt-0.5 flex items-center gap-2 flex-wrap">
        <span>Enrolled in <span className="font-semibold text-[color:var(--narra)]">{student.level ? levelLabel(student.level) : '—'}</span></span>
        {canEdit && (
          <button
            type="button"
            className="text-[11px] px-2 py-0.5 rounded border text-[color:var(--moss)] hover:bg-[color:var(--paper-2)]"
            style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        )}
      </p>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap">
      <span className="text-sm text-[color:var(--mid-gray)]">Enrolled in</span>
      <select
        className="select"
        value={student.level ?? ''}
        disabled={busy}
        onChange={e => void commit(e.target.value as EnrollmentLevel)}
        style={{ minWidth: 160 }}
      >
        {LEVEL_OPTIONS.map(l => (
          <option key={l} value={l}>{levelLabel(l)}</option>
        ))}
      </select>
      <button
        type="button"
        className="text-[11px] px-2 py-0.5 rounded text-[color:var(--mid-gray)] hover:bg-[color:var(--paper-2)]"
        onClick={() => setEditing(false)}
        disabled={busy}
      >
        Cancel
      </button>
      {busy && <span className="text-[11px] text-[color:var(--mid-gray)]">Saving…</span>}
      {err && <span className="text-[11px] text-rose-700">{err}</span>}
    </div>
  )
}

function DownloadButton({ fileId, label }: { fileId: string; label: string }) {
  return (
    <button type="button" className="btn-secondary text-xs" onClick={() => downloadFile(fileId, label.replace(/[^a-z0-9.\-]+/gi, '-'))}>
      {label}
    </button>
  )
}

/**
 * Resolve a document blob by trying local IDB first, then the
 * server-side document store as a fallback. The local IDB only
 * contains blobs uploaded ON THIS device — so a main admin opening
 * a student's documents from their own machine will miss everything
 * the parent uploaded from their phone unless we fetch from the
 * server. The server route is auth-scoped: STUDENT can only pull
 * their own, TEACHER + ADMIN + BRANCH_ADMIN can pull any.
 */
async function fetchBlob(fileId: string, studentId?: string, docKey?: string): Promise<Blob | null> {
  // Try local cache first — it's instant and works offline.
  const local = await getFile(fileId).catch(() => null)
  if (local) return local
  if (!studentId || !docKey) return null
  try {
    const tok = getToken()
    const res = await fetch(
      `${backendOrigin()}/api/public/class-portal/document-blobs/${encodeURIComponent(studentId)}/${encodeURIComponent(docKey)}`,
      { headers: tok ? { authorization: `Bearer ${tok}` } : undefined },
    )
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

async function openFile(fileId: string, fileName: string, mime?: string, studentId?: string, docKey?: string) {
  // CRITICAL — open the new tab SYNCHRONOUSLY here, BEFORE any awaits.
  //
  // Chrome / Safari / Firefox all block window.open() once the JS
  // execution has yielded to async work — the click is no longer
  // considered "user-initiated" by the time the fetch resolves.
  // Symptom: user clicks View, blob loads successfully, but nothing
  // visible happens (no tab, no alert).
  //
  // Workaround: open a blank tab now while we're still inside the
  // click handler, keep a handle, then redirect it to the blob URL
  // once we have the bytes. Do NOT pass `noopener` here — per the
  // HTML spec it forces window.open() to return null, which leaves
  // the empty tab orphaned and triggers the anchor-click fallback,
  // so the user ends up with two windows (about:blank + blob:).
  // We null `win.opener` after redirect to harden it.
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
  const blob = await fetchBlob(fileId, studentId, docKey)
  if (!blob) {
    if (win && !win.closed) try { win.close() } catch { /* ignore */ }
    alert('Could not load this file. The original upload may have been from another device and the server copy is missing. Ask the parent to re-upload.')
    return
  }
  const url = URL.createObjectURL(blob)
  void mime; void fileName
  if (win && !win.closed) {
    try { win.opener = null } catch { /* ignore */ }
    try { win.location.replace(url) } catch { /* ignore — fall through to anchor click below */ }
  } else {
    // Popup blocker won the race — fall back to an anchor click.
    // Same gesture-loss caveat applies, but anchor activations are
    // far more permissive than window.open().
    const a = document.createElement('a')
    a.href = url; a.target = '_blank'; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
async function downloadFile(fileId: string, fileName: string, mime?: string, studentId?: string, docKey?: string) {
  const blob = await fetchBlob(fileId, studentId, docKey)
  if (!blob) { alert('Could not load this file. The original upload may have been from another device and the server copy is missing. Ask the parent to re-upload.'); return }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
  void mime
}

/** Open the server-stored signed-waiver PDF in a new tab. Same popup-
 *  blocker dance as openFile() — pre-open a blank tab synchronously
 *  inside the click handler, redirect once the fetch resolves. Used
 *  by the "Signed (PDF on file)" fallback card for waivers whose
 *  structured JSON record didn't make it to the server.
 *
 *  Do NOT pass `noopener` to the pre-open: per the HTML spec it
 *  forces window.open() to return null, orphaning the blank tab and
 *  triggering the anchor-click fallback — the user gets two windows.
 *  We null `win.opener` after the redirect to harden it.
 */
function openServerWaiverPdf(studentId: string) {
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
  void fetchServerWaiverPdfBlob(studentId).then(blob => {
    if (!blob) {
      if (win && !win.closed) { try { win.close() } catch { /* ignore */ } }
      alert('Could not load the signed waiver PDF. The server copy is missing.')
      return
    }
    const url = URL.createObjectURL(blob)
    if (win && !win.closed) {
      try { win.opener = null } catch { /* ignore */ }
      try { win.location.replace(url) } catch { /* fall through */ }
    } else {
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  })
}

async function downloadServerWaiverPdf(studentId: string, lastName: string): Promise<void> {
  const blob = await fetchServerWaiverPdfBlob(studentId)
  if (!blob) { alert('Could not load the signed waiver PDF. The server copy is missing.'); return }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `parent-guardian-waiver-${lastName.toLowerCase()}.pdf`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

/**
 * Admin/branch-admin/frontdesk affordance for logging a PayMongo payment
 * that didn't auto-record (e.g. the parent paid on a different device,
 * never landed on /pay/success, or otherwise left no server-side trail).
 *
 * Creates a queued row that the cashier converts to an Order via the
 * accounting hub — matching exactly how a bank-deposit row behaves. We
 * intentionally do NOT mark the row CONVERTED here: the cashier still
 * needs to issue the OR/receipt and let the accounting ledger create the
 * Order. Once they do, the student's profile flips to PAID.
 */
function PayMongoRecorder({ student, onRecorded }: {
  student: StoredUser
  onRecorded: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [plan, setPlan] = useState<PaymentPlan>('ANNUAL')
  const [period, setPeriod] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const studentBranch = (student.branch as 'EAST' | 'GREENHILLS' | null) ?? null
  const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email

  async function submit() {
    setErr(null)
    if (!studentBranch) { setErr('Student has no branch on file — set the branch first.'); return }
    const peso = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(peso) || peso <= 0) { setErr('Enter the amount paid (in PHP).'); return }
    if (!period.trim()) { setErr('Period covered is required (e.g. "AY 2026–2027").'); return }
    setBusy(true)
    try {
      const ok = await recordPayMongoPayment({
        studentId: student.id,
        studentEmail: student.email,
        studentName,
        branch: studentBranch,
        plan,
        tuitionCentavos: Math.round(peso * 100),
        miscCentavos: 0,
        period: period.trim(),
        notes: reference.trim()
          ? `PayMongo ref: ${reference.trim()} · logged by admin`
          : 'PayMongo · logged by admin',
      })
      if (!ok) { setErr('Could not record the payment. Retry?'); return }
      await onRecorded()
      setOpen(false)
      setAmount(''); setReference(''); setPeriod('')
      alert(`Recorded ${studentName}'s PayMongo payment. The cashier will see it in the POS queue and can Convert to Order.`)
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-secondary text-[11px] whitespace-nowrap"
        onClick={() => setOpen(true)}
        title="Use this if the parent already paid via PayMongo but the system never recorded it (e.g. they paid on a different device)."
      >
        Record PayMongo payment
      </button>
    )
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 flex items-start justify-center" onClick={() => !busy && setOpen(false)}>
      <div
        className="card-static w-full max-w-md mt-10 sm:mt-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Record PayMongo payment
        </div>
        <h3 className="text-[18px] leading-tight mb-3">{studentName}</h3>
        <p className="text-[12px] text-[color:var(--mid-gray)] mb-4">
          Use this when the parent already paid via PayMongo but the system didn&apos;t record it (different device, cleared browser, etc.).
          A pending tuition row is created so the cashier can <span className="font-semibold">Convert to Order</span> in the accounting hub —
          the student&apos;s profile flips to PAID once the cashier converts.
        </p>

        {err && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-[12.5px] text-rose-800">{err}</div>
        )}

        <label className="block mb-3">
          <span className="label">Amount paid (PHP)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="input"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 5000"
            disabled={busy}
          />
        </label>

        <label className="block mb-3">
          <span className="label">Plan</span>
          <select
            className="select"
            value={plan}
            onChange={e => setPlan(e.target.value as PaymentPlan)}
            disabled={busy}
          >
            <option value="ANNUAL">Annual</option>
            <option value="BIANNUAL">Bi-annual</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>

        <label className="block mb-3">
          <span className="label">Period covered</span>
          <input
            type="text"
            className="input"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            placeholder='e.g. "AY 2026–2027" or "Aug 2026"'
            disabled={busy}
          />
        </label>

        <label className="block mb-4">
          <span className="label">PayMongo reference / receipt no. (optional)</span>
          <input
            type="text"
            className="input"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Paste from the PayMongo email"
            disabled={busy}
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary text-xs" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn-primary text-xs" onClick={submit} disabled={busy}>
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
