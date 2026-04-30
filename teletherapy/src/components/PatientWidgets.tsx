'use client'

import { useEffect, useState } from 'react'
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
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
} from 'lucide-react'

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-gate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[var(--charcoal)] text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>
              Delete this document?
            </h3>
            <p className="text-[13px] text-[var(--mid-gray)] mt-1">
              This will permanently remove <strong className="text-[var(--charcoal)] break-all">{fileName}</strong>. This action cannot be undone.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-[var(--mid-gray)] hover:text-[var(--charcoal)] transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-3 pt-2 border-t border-[var(--light-gray)]">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 py-2.5 rounded-xl text-[13px]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-danger flex-1 py-2.5 rounded-xl text-[13px]"
          >
            <Trash2 size={14} />
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
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
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reuploadingId, setReuploadingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(null)
  const items = documents.filter((d) => d.documentType === documentType)

  async function handleUpload(file: File, replaceDocId?: string) {
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
    <div className="card-static p-4">
      {pendingDelete && (
        <DeleteConfirmModal
          fileName={pendingDelete.fileName}
          onConfirm={() => performDelete(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Header — clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-2 mb-0 text-left group"
      >
        <Icon size={16} className="text-[var(--teal)] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-bold text-[var(--charcoal)] flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            {title}
            {items.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--teal)] text-white text-[10px] font-bold">
                {items.length}
              </span>
            )}
          </h4>
          {open && (
            <p className="text-[11px] text-[var(--mid-gray)] leading-snug mt-0.5">{description}</p>
          )}
        </div>
        <div className="text-[var(--mid-gray)] group-hover:text-[var(--teal)] transition-colors shrink-0">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Body — only when expanded */}
      {open && (
      <div className="mt-3">
      {/* Document list */}
      {items.length > 0 ? (
        <div className="space-y-1.5 mb-2">
          {items.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-[var(--off-white)] border border-[var(--light-gray)]"
            >
              <FileText size={14} className="text-[var(--mid-gray)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[var(--charcoal)] truncate" title={doc.fileName}>
                  {doc.fileName}
                </p>
                <p className="text-[10px] text-[var(--mid-gray)]">{formatDate(doc.createdAt)}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <a
                  href={`/api/upload/${doc.filePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-[var(--teal)] hover:bg-[var(--pale-teal)] transition-colors"
                  title="View"
                >
                  <Eye size={13} />
                </a>
                {canManage && (
                  <>
                    <label
                      className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                      title="Re-upload"
                    >
                      <RefreshCw size={13} />
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                        className="hidden"
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
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--mid-gray)] italic mb-2">No documents uploaded yet.</p>
      )}

      {/* Upload button */}
      {canManage && (
        <label className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg border border-dashed border-[var(--light-gray)] text-[11px] font-medium text-[var(--teal)] hover:border-[var(--teal)] hover:bg-[var(--pale-teal)] transition-all cursor-pointer">
          {uploading && !reuploadingId ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload size={12} /> Upload {items.length > 0 ? 'another' : 'document'}
            </>
          )}
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
            }}
          />
        </label>
      )}
      </div>
      )}
    </div>
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

  return (
    <div className="space-y-3">
      {/* ── Patient Profile ──────────────────────────────────── */}
      <div className="card-static p-4">
        <div className="flex items-center gap-2 mb-3">
          <User size={16} className="text-[var(--teal)]" />
          <h4 className="text-[13px] font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Patient Profile
          </h4>
        </div>

        <div className="space-y-2 text-[12px]">
          <div>
            <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">Full Name</p>
            <p className="font-medium text-[var(--charcoal)]">
              {patient.firstName} {patient.lastName}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">Date of Birth</p>
              <p className="font-medium text-[var(--charcoal)]">{formatDate(patient.dob)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">Age</p>
              <p className="font-medium text-[var(--charcoal)]">{calculateAge(patient.dob)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">Sex</p>
              <p className="font-medium text-[var(--charcoal)]">{patient.sex ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">Patient Type</p>
              <p className="font-medium text-[var(--charcoal)]">{patient.patientType ?? '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">Diagnosis</p>
            <p className="font-medium text-[var(--charcoal)] whitespace-pre-wrap">{patient.diagnosis ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--mid-gray)] uppercase tracking-wider font-semibold">City</p>
            <p className="font-medium text-[var(--charcoal)]">{patient.city ?? '—'}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--light-gray)] flex items-start gap-1.5">
          <AlertCircle size={11} className="text-[var(--mid-gray)] mt-0.5 shrink-0" />
          <p className="text-[10px] text-[var(--mid-gray)] italic leading-snug">
            To update Patient Profile, inform front desk to fill in the data in their Operations Hub.
          </p>
        </div>
      </div>

      {/* ── Doctor's Referral ────────────────────────────────── */}
      <div className="card-static p-4">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList size={16} className="text-[var(--teal)]" />
          <h4 className="text-[13px] font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Doctor&apos;s Referral
          </h4>
        </div>
        <p className="text-[11px] text-[var(--mid-gray)] leading-snug mb-2">
          Uploaded by front desk in Patient CRM.
        </p>
        {patient.referralUrl ? (
          <a
            href={patient.referralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 rounded-lg bg-[var(--pale-teal)] border border-[var(--light-gray)] hover:border-[var(--teal)] transition-colors"
          >
            <FileText size={14} className="text-[var(--teal)]" />
            <span className="text-[12px] font-medium text-[var(--deep-teal)] flex-1">View Referral</span>
            <Eye size={13} className="text-[var(--teal)]" />
          </a>
        ) : (
          <p className="text-[11px] text-[var(--mid-gray)] italic">No referral uploaded.</p>
        )}
      </div>

      {/* ── Loading state for document sections ──────────── */}
      {loading ? (
        <div className="card-static p-6 flex items-center justify-center">
          <Loader2 size={18} className="animate-spin text-[var(--teal)]" />
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
