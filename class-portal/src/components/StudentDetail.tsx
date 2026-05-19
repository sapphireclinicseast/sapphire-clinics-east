'use client'

import { useEffect, useState } from 'react'
import {
  getFile, getPaymentsForStudent, getWaivers, getGradeForStudent,
  updateUserEnrollment,
  levelLabel, type StoredUser, type PaymentRecord, type WaiverRecord, type GradeRecord,
  type EnrollmentDraft,
} from '@/lib/session'
import { downloadWaiverPdf, generateWaiverPdf } from '@/lib/waiver-pdf'
import { downloadEnrollmentPdf, generateEnrollmentPdf } from '@/lib/enrollment-pdf'
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
          <Row label="LRN status" value={e.lrnStatus ?? '—'} />
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

      {/* Submitted documents — viewable + downloadable */}
      {e.documents && Object.keys(e.documents).length > 0 && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Submitted documents</h2>
          <div className="space-y-2.5">
            {Object.entries(e.documents).map(([k, v]) => (
              <DocumentRow key={k} docKey={k} title={docTitle(k)} fileName={v.name} size={v.size} fileId={v.fileId} mime={v.type} />
            ))}
          </div>
        </div>
      )}

      {/* Generated PDFs */}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">Generated forms</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <GeneratedFormCard
            title="Enrollment Form (Annex 2)"
            description="DepEd-style enrollment record auto-generated from the learner profile."
            onDownload={() => downloadEnrollmentPdf(student, student.enrollment ?? {})}
            onPreview={() => previewPdf(generateEnrollmentPdf(student, student.enrollment ?? {}))}
          />
          {waiver && (
            <GeneratedFormCard
              title="Parent / Guardian Waiver"
              description={waiver.witnessSig ? 'Signed by parent and witness (assigned SCEI teacher).' : 'Signed by parent. Awaiting witness signature.'}
              onDownload={() => downloadWaiverPdf(waiver)}
              onPreview={() => previewPdf(generateWaiverPdf(waiver))}
            />
          )}
          {!waiver && (
            <div className="rounded-2xl p-4 border text-sm" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <div className="font-semibold text-[color:var(--narra)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Parent / Guardian Waiver</div>
              <div className="text-[12.5px] text-[color:var(--mid-gray)]">Not yet signed.</div>
            </div>
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

  function handleSave() {
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
      const updated = updateUserEnrollment(student.id, {
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
function docTitle(key: string): string {
  const map: Record<string, string> = {
    psa_birth_cert: 'PSA Birth Certificate',
    medical_reports: 'Medical / developmental / therapy reports',
    report_card_sf9: 'Report Card / SF9 (Form 138)',
    good_moral: 'Certificate of Good Moral Character',
    form_137_sf10: 'Form 137 / SF10',
  }
  return map[key] ?? key
}

function GeneratedFormCard({ title, description, onDownload, onPreview }: { title: string; description: string; onDownload: () => void; onPreview: () => void }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
      <div className="text-[12px] text-[color:var(--mid-gray)] mt-1">{description}</div>
      <div className="flex gap-2 mt-3">
        <button type="button" className="btn-secondary text-xs" onClick={onPreview}>Preview</button>
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

function DocumentRow({ docKey, title, fileName, size, fileId, mime }: { docKey: string; title: string; fileName: string; size: number; fileId?: string; mime?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="min-w-0">
        <div className="font-semibold text-[color:var(--narra)] text-sm" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
        <div className="text-[12px] text-[color:var(--mid-gray)] truncate">{fileName} · {(size / 1024).toFixed(0)} KB</div>
      </div>
      {fileId ? (
        <div className="flex gap-2 shrink-0">
          <button type="button" className="btn-secondary text-xs" onClick={() => openFile(fileId, fileName, mime)}>View</button>
          <button type="button" className="btn-primary text-xs" onClick={() => downloadFile(fileId, fileName, mime)}>Download</button>
        </div>
      ) : (
        <span className="badge badge-pending shrink-0" title="File content not stored in this browser">Metadata only</span>
      )}
      <span aria-hidden className="sr-only">{docKey}</span>
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
