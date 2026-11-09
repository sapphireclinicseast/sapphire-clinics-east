'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/upload-limit'
import {
  User,
  FileText,
  ClipboardList,
  TrendingUp,
  FilePlus,
  Eye,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Mail,
  Bell,
  CheckCircle2,
  Send,
  Lock,
} from 'lucide-react'
import {
  BTN_PRIMARY, BTN_SECONDARY, CARD_STYLE, DANGER, Dialog, FILE_FOCUS, FOCUS, PRIMARY_STYLE, SECONDARY_STYLE,
  Skeleton, SUBTLE_BG, Tag,
} from '@/components/hub/ui'

const ICON_BTN = `w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors ${FOCUS}`
const FACT_LABEL = 'text-[10.5px] font-semibold uppercase tracking-wider'
const FACT_LABEL_STYLE = { color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' } as const

/** Sidebar card shell — white card, icon + title header. */
function SideCard({ icon, title, action, children, footer }: {
  icon: React.ReactNode; title: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode
}) {
  return (
    <section className="rounded-xl min-w-0" style={CARD_STYLE}>
      <header className="px-4 pt-3.5 pb-3 flex items-center gap-2" style={children ? { borderBottom: '1px solid var(--light-gray)' } : undefined}>
        <span className="shrink-0" style={{ color: 'var(--teal)' }}>{icon}</span>
        <h3 className="flex-1 min-w-0 text-[13.5px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</h3>
        {action}
      </header>
      {children && <div className="p-4">{children}</div>}
      {footer && (
        <div className="px-4 py-2.5 text-[11px] leading-snug rounded-b-xl flex items-start gap-1.5" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
          {footer}
        </div>
      )}
    </section>
  )
}

export interface PatientProfile {
  id: string
  firstName: string
  lastName: string
  dob?: string | null
  sex?: string | null
  patientType?: string | null
  diagnosis?: string | null
  city?: string | null
  address?: string | null
  email?: string | null
  phone?: string | null
  referralUrl?: string | null
}

interface PatientDocument {
  id: string
  documentType: 'INITIAL_EVALUATION' | 'PROGRESS_REPORT' | 'OTHER_DOCUMENT'
  fileName: string
  filePath: string
  mimeType: string
  description?: string | null
  createdAt: string
  sentToPatientAt?: string | null
  sentToPatientCc?: string | null
  informedFrontDeskAt?: string | null
  // Server-stamped freeze marker. Set when the uploader is endorsed
  // or discharged off the patient. Once set, the document is read-only
  // for everyone except admin (used to render Lock icon + disable
  // re-upload / delete affordances).
  lockedAt?: string | null
  // Server-computed: true iff (admin) OR (this user uploaded it AND
  // they're the active owner AND it isn't locked). Drives whether the
  // re-upload + delete buttons render at all for this row.
  canEdit?: boolean
  // Looser permission for operational actions (Send IE / Inform FD).
  // True for admin, or for any consultant with patient access when the
  // document isn't locked. Outgoing email is signed by the clinic
  // (main@), not the individual clinician, so non-uploaders can route
  // the document without claiming authorship of its contents.
  canSend?: boolean
}

interface Props {
  patient: PatientProfile
  // Whether the current user can manage docs (uploader/department match)
  canManage?: boolean
}

const TYPE_LABELS: Record<PatientDocument['documentType'], string> = {
  INITIAL_EVALUATION: 'Initial Evaluation/Re-evaluation',
  PROGRESS_REPORT: 'Progress Report',
  OTHER_DOCUMENT: 'Other Document',
}

const TYPE_DESCRIPTIONS: Record<PatientDocument['documentType'], string> = {
  INITIAL_EVALUATION: 'Initial Assessment or Re-evaluations done on patient',
  PROGRESS_REPORT: 'Progress Reports issued for patient',
  OTHER_DOCUMENT: 'Other reports or documents issued for patient including certifications, home programs, endorsement notes, etc.',
}

function calculateAge(dob: string | null | undefined): string {
  if (!dob) return '—'
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return '—'
  const ageMs = Date.now() - birth.getTime()
  const years = Math.floor(ageMs / 31557600000)
  return years >= 0 ? `${years} yrs` : '—'
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Delete Confirmation Modal ───────────────────────────────────────────────

function DeleteConfirmModal({
  fileName,
  onConfirm,
  onCancel,
}: {
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      labelId="doc-delete-title"
      title="Delete this document?"
      onClose={onCancel}
      footer={<>
        <button onClick={onCancel} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
        <button onClick={onConfirm} className={`${BTN_PRIMARY}`} style={{ background: DANGER }}>
          <Trash2 size={14} /> Yes, delete
        </button>
      </>}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FEF2F2', color: DANGER }}>
          <AlertTriangle size={18} />
        </span>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
          This will permanently remove <strong className="break-all" style={{ color: 'var(--charcoal)' }}>{fileName}</strong>. This action cannot be undone.
        </p>
      </div>
    </Dialog>
  )
}

// ─── Generic Document Section ────────────────────────────────────────────────

function DocumentSection({
  patientId,
  documentType,
  title,
  icon: Icon,
  description,
  documents,
  onChange,
  canManage,
}: {
  patientId: string
  documentType: PatientDocument['documentType']
  title: string
  icon: any
  description: string
  documents: PatientDocument[]
  onChange: () => void
  canManage: boolean
}) {
  const { data: authSession } = useSession()
  // Interns can upload documents but cannot send them to patients.
  const isIntern = authSession?.user?.accountType === 'INTERN'
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reuploadingId, setReuploadingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [pendingResend, setPendingResend] = useState<{ doc: PatientDocument; kind: 'IE' | 'PR' } | null>(null)
  const items = documents.filter((d) => d.documentType === documentType)

  async function sendIE(doc: PatientDocument) {
    setActioningId(doc.id)
    try {
      const res = await fetch(`/api/patients/${patientId}/documents/${doc.id}/send-to-patient`, {
        method: 'POST',
      })
      if (!res.ok) {
        const e = await res.json()
        alert(e.error ?? 'Failed to send email')
      } else {
        onChange()
      }
    } catch {
      alert('Failed to send email')
    }
    setActioningId(null)
    setPendingResend(null)
  }

  async function informFD(doc: PatientDocument) {
    setActioningId(doc.id)
    try {
      const res = await fetch(`/api/patients/${patientId}/documents/${doc.id}/inform-front-desk`, {
        method: 'POST',
      })
      if (!res.ok) {
        const e = await res.json()
        alert(e.error ?? 'Failed to inform front desk')
      } else {
        onChange()
      }
    } catch {
      alert('Failed to inform front desk')
    }
    setActioningId(null)
    setPendingResend(null)
  }

  async function handleUpload(file: File, replaceDocId?: string) {
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(`"${file.name}" is too large (max ${MAX_UPLOAD_MB}MB per file). Please compress or split it.`)
      return
    }
    setUploading(true)
    try {
      // If replacing, delete old first
      if (replaceDocId) {
        await fetch(`/api/patients/${patientId}/documents/${replaceDocId}`, { method: 'DELETE' })
      }
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        onChange()
        setOpen(true) // auto-expand after upload so user sees the file
      } else {
        const err = await res.json()
        alert(err.error ?? 'Upload failed')
      }
    } catch {
      alert('Upload failed')
    }
    setUploading(false)
    setReuploadingId(null)
  }

  async function performDelete(docId: string) {
    try {
      await fetch(`/api/patients/${patientId}/documents/${docId}`, { method: 'DELETE' })
      onChange()
    } catch {}
    setPendingDelete(null)
  }

  return (
    <section className="rounded-xl min-w-0" style={CARD_STYLE}>
      {pendingDelete && (
        <DeleteConfirmModal
          fileName={pendingDelete.fileName}
          onConfirm={() => performDelete(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Resend confirmation */}
      {pendingResend && (
        <Dialog
          labelId="doc-resend-title"
          title={`Already ${pendingResend.kind === 'IE' ? 'sent' : 'informed'}`}
          onClose={() => setPendingResend(null)}
          footer={<>
            <button onClick={() => setPendingResend(null)} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
            <button
              onClick={() => {
                if (pendingResend.kind === 'IE') sendIE(pendingResend.doc)
                else informFD(pendingResend.doc)
              }}
              className={BTN_PRIMARY}
              style={PRIMARY_STYLE}
            >
              {pendingResend.kind === 'IE' ? <Send size={14} /> : <Bell size={14} />}
              Yes, {pendingResend.kind === 'IE' ? 'send again' : 'inform again'}
            </button>
          </>}
        >
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FBF3E8', color: '#7A4E21' }}>
              <AlertTriangle size={18} />
            </span>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
              This was already {pendingResend.kind === 'IE' ? 'emailed to the patient' : 'flagged for front desk'} on{' '}
              <strong style={{ color: 'var(--charcoal)' }}>
                {formatDate(
                  pendingResend.kind === 'IE'
                    ? pendingResend.doc.sentToPatientAt
                    : pendingResend.doc.informedFrontDeskAt
                )}
              </strong>
              . Do you want to {pendingResend.kind === 'IE' ? 'send' : 'inform'} again?
            </p>
          </div>
        </Dialog>
      )}

      {/* Header — clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 px-4 py-3.5 text-left rounded-xl transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
      >
        <Icon size={16} className="shrink-0" style={{ color: 'var(--teal)' }} />
        <span className="flex-1 min-w-0 text-[13.5px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {title}
        </span>
        {items.length > 0 && <Tag tone="brand">{items.length}</Tag>}
        <span className="shrink-0" style={{ color: 'var(--mid-gray)' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Body — only when expanded */}
      {open && (
      <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <p className="text-[11.5px] leading-snug mb-3" style={{ color: 'var(--mid-gray)' }}>{description}</p>

      {/* Document list */}
      {items.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {items.map((doc) => {
            const isIE = documentType === 'INITIAL_EVALUATION'
            const isPR = documentType === 'PROGRESS_REPORT'
            const sentAt = doc.sentToPatientAt
            const informedAt = doc.informedFrontDeskAt
            return (
            <li
              key={doc.id}
              className="p-2.5 rounded-lg"
              style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="shrink-0" style={{ color: 'var(--mid-gray)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--charcoal)' }} title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{formatDate(doc.createdAt)}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <a
                    href={`/api/upload/${doc.filePath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${ICON_BTN} hover:bg-white`}
                    style={{ color: 'var(--teal)' }}
                    title="View"
                    aria-label={`View ${doc.fileName}`}
                  >
                    <Eye size={14} />
                  </a>
                  {/* Re-upload + delete are scoped per-document, not
                      blanket per-section. Only the original uploader
                      (who is currently the active owner AND whose
                      document isn't locked) sees these buttons. So
                      Caitlynn viewing Eloisa's IE/PR/Other uploads
                      gets the View icon only. Server (DELETE route)
                      enforces the same rules — these UI gates are
                      just the cosmetic mirror. */}
                  {doc.canEdit ? (
                    <>
                      <label
                        className={`${ICON_BTN} ${FILE_FOCUS} hover:bg-white`}
                        style={{ color: '#8C6A2D' }}
                        title="Re-upload"
                      >
                        <RefreshCw size={14} />
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                          className="sr-only"
                          aria-label={`Re-upload ${doc.fileName}`}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) {
                              setReuploadingId(doc.id)
                              handleUpload(f, doc.id)
                            }
                          }}
                        />
                      </label>
                      <button
                        onClick={() => setPendingDelete({ id: doc.id, fileName: doc.fileName })}
                        className={`${ICON_BTN} hover:bg-red-50`}
                        style={{ color: DANGER }}
                        title="Delete"
                        aria-label={`Delete ${doc.fileName}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : doc.lockedAt ? (
                    <span
                      className={ICON_BTN}
                      style={{ color: 'var(--mid-gray)' }}
                      title="Locked — frozen at endorsement; only admins can modify"
                    >
                      <Lock size={14} />
                    </span>
                  ) : null}
                </div>
              </div>

              {/* IE: Send Email to patient. Gated per-document on
                  canSend (looser than canEdit) — outgoing email goes
                  from the clinic inbox (main@), not the individual
                  clinician, so any consultant with patient access
                  can route the IE without claiming authorship. The
                  document itself remains immutable to non-uploaders
                  (see canEdit on re-upload / delete above). */}
              {isIE && doc.canSend && isIntern && (
                <p className="mt-2 text-[11px] italic flex items-center gap-1" style={{ color: 'var(--mid-gray)' }}><Mail size={11} /> Only your supervisor can send this to the patient.</p>
              )}
              {isIE && doc.canSend && !isIntern && (
                <button
                  onClick={() => {
                    if (sentAt) setPendingResend({ doc, kind: 'IE' })
                    else sendIE(doc)
                  }}
                  disabled={actioningId === doc.id}
                  className={`mt-2 w-full h-8 inline-flex items-center justify-center gap-1.5 px-2 rounded-lg text-[11.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${FOCUS}`}
                  style={sentAt
                    ? { background: '#EEF5E8', color: '#2F5A28', border: '1px solid #CFE0BF' }
                    : { background: 'var(--deep-teal)', color: '#fff' }}
                >
                  {actioningId === doc.id ? (
                    <><Loader2 size={12} className="animate-spin" /> Sending...</>
                  ) : sentAt ? (
                    <><CheckCircle2 size={12} /> Sent · {formatDate(sentAt)}</>
                  ) : (
                    <><Send size={12} /> Send Email to Patient</>
                  )}
                </button>
              )}

              {/* PR: Inform Front Desk. Same canSend gating as Send
                  IE — any consultant with patient access can flag a
                  PR for billing as long as the doc isn't locked. */}
              {isPR && doc.canSend && (
                <button
                  onClick={() => {
                    if (informedAt) setPendingResend({ doc, kind: 'PR' })
                    else informFD(doc)
                  }}
                  disabled={actioningId === doc.id}
                  className={`mt-2 w-full min-h-8 py-1.5 inline-flex items-center justify-center gap-1.5 px-2 rounded-lg text-[11.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${FOCUS}`}
                  style={informedAt
                    ? { background: '#EEF5E8', color: '#2F5A28', border: '1px solid #CFE0BF' }
                    : { background: '#FBF3E8', color: '#7A4E21', border: '1px solid #EBD3B4' }}
                >
                  {actioningId === doc.id ? (
                    <><Loader2 size={12} className="animate-spin" /> Notifying...</>
                  ) : informedAt ? (
                    <><CheckCircle2 size={12} /> Informed · {formatDate(informedAt)}</>
                  ) : (
                    <><Bell size={12} /> Inform Front Desk that PR is available</>
                  )}
                </button>
              )}
            </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs italic mb-3" style={{ color: 'var(--mid-gray)' }}>No documents uploaded yet.</p>
      )}

      {/* Upload button */}
      {canManage && (
        <>
        <label className={`flex items-center justify-center gap-1.5 w-full h-9 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer hover:bg-[#F8FAF2] ${FILE_FOCUS}`}
          style={{ border: '1px dashed var(--light-gray)', color: 'var(--teal)' }}>
          {uploading && !reuploadingId ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload size={13} /> Upload {items.length > 0 ? 'another' : 'document'}
            </>
          )}
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
            }}
          />
        </label>
        <p className="text-[10.5px] mt-1.5 text-center" style={{ color: 'var(--mid-gray)' }}>PDF, Word, or image · max {MAX_UPLOAD_MB}MB per file</p>
        </>
      )}
      </div>
      )}
    </section>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PatientWidgets({ patient, canManage = true }: Props) {
  const [documents, setDocuments] = useState<PatientDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDocuments()
  }, [patient.id])

  async function fetchDocuments() {
    setLoading(true)
    try {
      const res = await fetch(`/api/patients/${patient.id}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents ?? [])
      }
    } catch {}
    setLoading(false)
  }

  const facts: { label: string; value: string; wide?: boolean; pre?: boolean }[] = [
    { label: 'Full name', value: `${patient.firstName} ${patient.lastName}`, wide: true },
    { label: 'Date of birth', value: formatDate(patient.dob) },
    { label: 'Age', value: calculateAge(patient.dob) },
    { label: 'Sex', value: patient.sex ?? '—' },
    { label: 'Patient type', value: patient.patientType ?? '—' },
    { label: 'Diagnosis', value: patient.diagnosis ?? '—', wide: true, pre: true },
    { label: 'City', value: patient.city ?? '—', wide: true },
  ]

  return (
    <div className="space-y-3">
      {/* ── Patient Profile ──────────────────────────────────── */}
      <SideCard
        icon={<User size={16} />}
        title="Patient Profile"
        footer={<><AlertCircle size={12} className="mt-px shrink-0" /><span>To update Patient Profile, inform front desk to fill in the data in their Operations Hub.</span></>}
      >
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          {facts.map((f) => (
            <div key={f.label} className={f.wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
              <dt className={FACT_LABEL} style={FACT_LABEL_STYLE}>{f.label}</dt>
              <dd className={`text-[13px] font-medium mt-0.5 [overflow-wrap:anywhere] ${f.pre ? 'whitespace-pre-wrap' : ''}`} style={{ color: f.value === '—' ? 'var(--mid-gray)' : 'var(--charcoal)' }}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </SideCard>

      {/* ── Doctor's Referral ────────────────────────────────── */}
      <SideCard icon={<ClipboardList size={16} />} title="Doctor&apos;s Referral">
        <p className="text-[11.5px] leading-snug mb-2.5" style={{ color: 'var(--mid-gray)' }}>
          Uploaded by front desk in Patient CRM.
        </p>
        {patient.referralUrl ? (
          <a
            href={patient.referralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BTN_SECONDARY} w-full !justify-start`}
            style={SECONDARY_STYLE}
          >
            <FileText size={14} style={{ color: 'var(--teal)' }} />
            <span className="flex-1 text-left">View Referral</span>
            <Eye size={14} style={{ color: 'var(--teal)' }} />
          </a>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>No referral uploaded.</p>
        )}
      </SideCard>

      {/* ── Loading state for document sections ──────────── */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading documents">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl px-4 py-4 flex items-center gap-2" style={CARD_STYLE}>
              <Skeleton className="h-4 w-4" /><Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Initial Evaluation / Re-evaluation */}
          <DocumentSection
            patientId={patient.id}
            documentType="INITIAL_EVALUATION"
            title="Initial Evaluation/Re-evaluation"
            icon={ClipboardList}
            description={TYPE_DESCRIPTIONS.INITIAL_EVALUATION}
            documents={documents}
            onChange={fetchDocuments}
            canManage={canManage}
          />

          {/* Progress Report/s */}
          <DocumentSection
            patientId={patient.id}
            documentType="PROGRESS_REPORT"
            title="Progress Report/s"
            icon={TrendingUp}
            description={TYPE_DESCRIPTIONS.PROGRESS_REPORT}
            documents={documents}
            onChange={fetchDocuments}
            canManage={canManage}
          />

          {/* Other Documents/Reports */}
          <DocumentSection
            patientId={patient.id}
            documentType="OTHER_DOCUMENT"
            title="Other Documents/Reports"
            icon={FilePlus}
            description={TYPE_DESCRIPTIONS.OTHER_DOCUMENT}
            documents={documents}
            onChange={fetchDocuments}
            canManage={canManage}
          />
        </>
      )}
    </div>
  )
}
