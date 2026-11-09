'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle2, Calendar, Paperclip, Upload, FileText, ChevronDown, ChevronUp, ArrowUpDown, Trash2, IdCard, Power } from 'lucide-react'
import { type LearningProfileData } from '@/lib/learning-profile'
import InternProfileModal from '@/components/InternProfileModal'
import MeetingsHub from '@/components/MeetingsHub'
import NoteBody from '@/components/NoteBody'
import LearningOutcomesForm from '@/components/LearningOutcomesForm'
import BalikTanawForm from '@/components/BalikTanawForm'
import {
  Avatar, Banner, BTN_DANGER_GHOST, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE,
  DashCard, DANGER, EmptyState, FILE_FOCUS, FOCUS, LABEL, LABEL_STYLE, PAGE, PageHeader, PillTabs,
  PRIMARY_STYLE, RowsSkeleton, SECONDARY_STYLE, Skeleton, StatusPill, SUBTLE_BG, TD, TEXTAREA, TH, TH_STYLE,
  TR_STYLE,
} from '@/components/hub/ui'

interface Intern { id: string; name: string; department: string; branch: string; startMonth: string | null; endMonth: string | null; hasAccount?: boolean; accountActive?: boolean | null; rotationLapsed?: boolean }
interface GradeInfo { grade: string; note: string | null; fileName: string | null; filePath: string | null; gradedByName: string | null; updatedAt: string }
interface Doc { id: string; title: string; description: string | null; fileName: string; filePath: string; uploadedByName: string; uploadedByAccountId: string; createdAt: string }

// Upload a file to a given folder with real progress (fetch has no upload
// progress event). Returns the saved attachment descriptor.
function uploadWithProgress(file: File, folder: string, onProgress: (pct: number) => void): Promise<{ fileName: string; filePath: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Bad response')) } }
      else { let m = `Upload failed (${xhr.status})`; try { m = JSON.parse(xhr.responseText).error ?? m } catch {} reject(new Error(m)) }
    }
    xhr.onerror = () => reject(new Error('Upload failed — network error'))
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', folder)
    xhr.send(fd)
  })
}

// ── 4-point clinical internship rubric (1.00–4.00, 0.25 increments) ──
const SCALE_4PT: { score: string; interp: string }[] = [
  { score: '4.00', interp: 'Consistently demonstrates all behaviors described under Level 4.' },
  { score: '3.75', interp: 'Performance is predominantly Level 4 with only minor inconsistencies.' },
  { score: '3.50', interp: 'Demonstrates approximately equal characteristics of Levels 3 and 4.' },
  { score: '3.25', interp: 'Meets all Level 3 expectations while consistently demonstrating several Level 4 behaviors.' },
  { score: '3.00', interp: 'Consistently demonstrates all behaviors described under Level 3.' },
  { score: '2.75', interp: 'Meets most Level 3 expectations but occasionally performs at Level 2.' },
  { score: '2.50', interp: 'Demonstrates approximately equal characteristics of Levels 2 and 3.' },
  { score: '2.25', interp: 'Meets all Level 2 expectations while demonstrating several Level 3 behaviors.' },
  { score: '2.00', interp: 'Consistently demonstrates all behaviors described under Level 2.' },
  { score: '1.75', interp: 'Meets most Level 2 expectations but still frequently demonstrates Level 1 behaviors.' },
  { score: '1.50', interp: 'Demonstrates approximately equal characteristics of Levels 1 and 2.' },
  { score: '1.25', interp: 'Meets all Level 1 expectations while demonstrating isolated Level 2 behaviors.' },
  { score: '1.00', interp: 'Demonstrates only the behaviors described under Level 1.' },
]
const SCALE_MAP: Record<string, string> = Object.fromEntries(SCALE_4PT.map((r) => [r.score, r.interp]))

// ── Local presentational helpers (page-only; not in the shared kit) ──
/** Row-button hover used by the accordion lists. */
const ROW_BTN = `w-full flex items-center justify-between gap-3 text-left transition-colors hover:bg-[#F8FAF2] ${FOCUS}`
const MUTED = { color: 'var(--mid-gray)' } as const
const INK = { color: 'var(--charcoal)' } as const

function Chevron({ open, size = 16 }: { open: boolean; size?: number }) {
  return open
    ? <ChevronUp size={size} aria-hidden style={MUTED} className="shrink-0" />
    : <ChevronDown size={size} aria-hidden style={MUTED} className="shrink-0" />
}

/** Intro line above a tab's content. */
function TabIntro({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed px-0.5" style={MUTED}>{children}</p>
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold mb-1" style={MUTED}><span>Uploading…</span><span className="tabular-nums">{progress}%</span></div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--light-gray)' }}>
        <div className="h-full transition-[width] duration-200" style={{ width: `${progress}%`, background: 'var(--teal)' }} />
      </div>
    </div>
  )
}

function FourPointRubric() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`${ROW_BTN} px-4 sm:px-5 py-3`}>
        <span className="text-[14px] font-bold" style={{ ...INK, fontFamily: 'var(--font-display)' }}>The 4-Point Scale — grading rubric</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4 pt-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <p className="text-[12px] mb-3 leading-relaxed" style={MUTED}>
            Each criterion is scored 1–4. Assign intermediate scores in increments of 0.25 where performance falls between two adjacent levels.
          </p>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--light-gray)' }}>
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={TH} style={TH_STYLE}>Score</th>
                  <th scope="col" className={TH} style={TH_STYLE}>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {SCALE_4PT.map((r, idx) => (
                  <tr key={r.score} style={idx ? TR_STYLE : undefined}>
                    <td className={`${TD} font-bold whitespace-nowrap tabular-nums`} style={INK}>{r.score}</td>
                    <td className={TD} style={INK}>{r.interp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function GradeCard({ intern, existing, onSaved, onToast }: { intern: Intern; existing?: GradeInfo; onSaved: () => void; onToast: (m: string) => void }) {
  const [grade, setGrade] = useState(existing?.grade ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!grade.trim()) { onToast('Please enter a grade.'); return }
    setSaving(true)
    try {
      let fileMeta: { fileName?: string; filePath?: string; mimeType?: string } = {}
      if (file) {
        setProgress(0)
        fileMeta = await uploadWithProgress(file, `intern-grades/${intern.id}`, setProgress)
        setProgress(100)
      }
      const res = await fetch('/api/intern-supervision/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internStaffId: intern.id, grade, note, ...fileMeta }),
      })
      if (res.ok) { onToast('Grade saved'); setFile(null); onSaved() }
      else { const d = await res.json().catch(() => ({})); onToast(d.error ?? 'Failed to save') }
    } catch (e) { onToast(e instanceof Error ? e.message : 'Failed to save') }
    setSaving(false)
    setTimeout(() => setProgress(null), 600)
  }

  const gid = `grade-${intern.id}`
  return (
    <DashCard
      title={intern.name}
      description={`${intern.department} · ${intern.branch}`}
      action={existing?.updatedAt ? (
        <span className="text-[11px]" style={MUTED}>Last graded {new Date(existing.updatedAt).toLocaleDateString()}{existing.gradedByName ? ` · ${existing.gradedByName}` : ''}</span>
      ) : undefined}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="min-w-0">
          <label htmlFor={`${gid}-score`} className={LABEL} style={LABEL_STYLE}>Grade (4-point scale)</label>
          <select id={`${gid}-score`} value={grade} onChange={(e) => setGrade(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
            <option value="">Select score…</option>
            {SCALE_4PT.map((r) => <option key={r.score} value={r.score}>{r.score}</option>)}
          </select>
          {grade && SCALE_MAP[grade] && <p className="text-[11px] mt-1 leading-snug" style={MUTED}>{SCALE_MAP[grade]}</p>}
        </div>
        <div className="min-w-0">
          <p className={LABEL} style={LABEL_STYLE}>Computation file (optional)</p>
          <div className="flex items-center gap-2 min-w-0">
            <label className={`${BTN_SECONDARY} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
              <Upload size={14} aria-hidden /> {file ? 'Change' : 'Attach'} file
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            {file ? (
              <span className="text-[12px] truncate flex items-center gap-1 min-w-0" style={INK}><Paperclip size={12} aria-hidden className="shrink-0" style={{ color: 'var(--teal)' }} /><span className="truncate">{file.name}</span></span>
            ) : existing?.filePath ? (
              <a href={`/api/upload/${existing.filePath}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold hover:underline truncate flex items-center gap-1 min-w-0" style={{ color: 'var(--teal)' }}><FileText size={12} aria-hidden className="shrink-0" /><span className="truncate">{existing.fileName ?? 'file'}</span></a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor={`${gid}-note`} className={LABEL} style={LABEL_STYLE}>Note (optional)</label>
        <textarea id={`${gid}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE} placeholder="Remarks…" />
      </div>

      {progress !== null && <div className="mt-3"><ProgressBar progress={progress} /></div>}

      <div className="mt-4 flex justify-end">
        <button onClick={save} disabled={saving} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {progress !== null ? `Uploading… ${progress}%` : (existing ? 'Update grade' : 'Save grade')}
        </button>
      </div>
    </DashCard>
  )
}
interface BT {
  id: string; internName: string; internStaffId: string; periodLabel: string
  answers: { question: string; answer: string }[]
  internSignedName: string; internSignedAt: string
  supervisorSignedName: string | null; supervisorSignedAt: string | null
  createdAt: string
}

// Sort key for a week group: parse "Week of <date>", else fall back to a timestamp.
function weekSortTs(label: string, fallbackIso: string): number {
  const t = new Date(label.replace(/^week of\s*/i, '')).getTime()
  return isNaN(t) ? (new Date(fallbackIso).getTime() || 0) : t
}

// Read-only display of one intern's Learning Outcomes & Preferences.
function LearningProfileView({ data }: { data: LearningProfileData }) {
  const chips = (arr: string[], other?: string) => {
    const all = [...(arr ?? []), ...(other?.trim() ? [`Others: ${other.trim()}`] : [])]
    return all.length
      ? <div className="flex flex-wrap gap-1.5">{all.map((c, i) => <span key={i} className="inline-block text-[12px] px-2 py-0.5 rounded-md" style={{ background: '#fff', color: 'var(--deep-teal)', border: '1px solid var(--light-gray)' }}>{c}</span>)}</div>
      : <span className="text-[12px] italic" style={MUTED}>—</span>
  }
  const line = (label: string, val?: string) => (
    <div><p className={LABEL} style={LABEL_STYLE}>{label}</p><p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={INK}>{val?.trim() || <span className="italic" style={MUTED}>—</span>}</p></div>
  )
  return (
    <div className="space-y-4">
      {line('Expectations for the rotation', data.outcomes?.expectations)}
      {line('Most looking forward to learning', data.outcomes?.lookingForward)}
      {line('Wants to improve on', data.outcomes?.improve)}
      <div><p className={LABEL} style={LABEL_STYLE}>Learns best by</p>{chips(data.learnBest, data.learnBestOther)}</div>
      <div><p className={LABEL} style={LABEL_STYLE}>Preferred feedback</p>{chips(data.feedback, data.feedbackOther)}</div>
      <div><p className={LABEL} style={LABEL_STYLE}>Prepares for duty by</p>{chips(data.prep)}</div>
      {line('Challenges in learning', data.challenges)}
    </div>
  )
}

// Department-scoped internship document library (supervisor uploads).
function DocumentsPanel({ docs, myAccountId, isAdmin, onChanged, onToast }: {
  docs: Doc[]; myAccountId?: string; isAdmin: boolean; onChanged: () => void; onToast: (m: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function upload() {
    if (!title.trim()) { onToast('Please add a title.'); return }
    if (!file) { onToast('Please attach a file.'); return }
    setSaving(true)
    try {
      setProgress(0)
      const meta = await uploadWithProgress(file, 'internship-documents', setProgress)
      setProgress(100)
      const res = await fetch('/api/intern-supervision/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, ...meta }),
      })
      if (res.ok) { onToast('Document uploaded'); setTitle(''); setDescription(''); setFile(null); onChanged() }
      else { const d = await res.json().catch(() => ({})); onToast(d.error ?? 'Failed to upload') }
    } catch (e) { onToast(e instanceof Error ? e.message : 'Failed to upload') }
    setSaving(false)
    setTimeout(() => setProgress(null), 600)
  }
  async function remove(id: string) {
    if (!confirm('Remove this document?')) return
    const res = await fetch(`/api/intern-supervision/documents/${id}`, { method: 'DELETE' })
    if (res.ok) onChanged(); else { const d = await res.json().catch(() => ({})); onToast(d.error ?? 'Failed to remove') }
  }

  return (
    <div className="space-y-5">
      <Banner tone="info">
        Upload only documents <span className="font-semibold">specific to the internship</span> (e.g. supervision guides). Please do <span className="font-semibold">not duplicate</span> template forms already available in the <span className="font-semibold">Templates &amp; Forms</span> section. These are shared with supervisors in your department.
      </Banner>

      <DashCard title="Upload a document" icon={<Upload size={16} aria-hidden />}>
        <div className="space-y-3">
          <div>
            <label htmlFor="isd-title" className={LABEL} style={LABEL_STYLE}>Title</label>
            <input id="isd-title" value={title} onChange={(e) => setTitle(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="Title (e.g. PT Internship Supervision Guide)" />
          </div>
          <div>
            <label htmlFor="isd-desc" className={LABEL} style={LABEL_STYLE}>Description</label>
            <textarea id="isd-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${TEXTAREA} resize-y`} style={CONTROL_STYLE} placeholder="Description (optional)" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <label className={`${BTN_SECONDARY} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
              <Upload size={14} aria-hidden /> {file ? 'Change' : 'Attach'} file
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            {file && <span className="text-[12px] truncate flex items-center gap-1 min-w-0" style={INK}><Paperclip size={12} aria-hidden className="shrink-0" style={{ color: 'var(--teal)' }} /><span className="truncate">{file.name}</span></span>}
          </div>
          {progress !== null && <ProgressBar progress={progress} />}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={upload} disabled={saving} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {progress !== null ? `Uploading… ${progress}%` : 'Upload'}
          </button>
        </div>
      </DashCard>

      <DashCard title="Internship documents" icon={<FileText size={16} aria-hidden />} flush
        action={docs.length > 0 ? <span className="text-[11px] tabular-nums" style={MUTED}>{docs.length}</span> : undefined}>
        {docs.length === 0 ? (
          <EmptyState icon="file" title="No internship documents yet." />
        ) : (
          <ul>
            {docs.map((d, idx) => (
              <li key={d.id} className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5" style={idx ? TR_STYLE : undefined}>
                <div className="min-w-0">
                  <a href={`/api/upload/${d.filePath}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-semibold hover:underline [overflow-wrap:anywhere]" style={{ color: 'var(--deep-teal)' }}>
                    <FileText size={15} aria-hidden className="shrink-0" style={{ color: 'var(--teal)' }} /> {d.title}
                  </a>
                  {d.description && <p className="text-[12.5px] mt-0.5 [overflow-wrap:anywhere]" style={MUTED}>{d.description}</p>}
                  <p className="text-[11px] mt-1" style={MUTED}>Uploaded by <span className="font-semibold" style={INK}>{d.uploadedByName}</span> · {new Date(d.createdAt).toLocaleDateString()}</p>
                </div>
                {(isAdmin || d.uploadedByAccountId === myAccountId) && (
                  <button onClick={() => remove(d.id)} className={`${BTN_DANGER_GHOST} shrink-0`} style={{ color: DANGER }} title="Remove" aria-label={`Remove ${d.title}`}><Trash2 size={15} aria-hidden /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  )
}

type Tab = 'interns' | 'all-interns' | 'balik-tanaw' | 'grades' | 'documents' | 'learning' | 'meeting' | 'my-learning' | 'my-balik'
interface InternNote {
  scheduleId: string
  date: string
  patientName: string
  supervisorName: string
  id: string
  status: string
  notes: string | null
  isInitialEvaluation: boolean
  discontinuedRemarks: string | null
  lockedAt: string | null
  editHistory: { name: string; accountType?: string; action: 'created' | 'edited'; at: string }[] | null
  createdAt: string
  updatedAt: string
}

const HEADER = { eyebrow: 'Programs', title: 'Internship', description: 'Interns decked to you, their Balik-Tanaw, and grades' }

/** Same two-letter initials the page always showed (first letter of the first two words). */
const nameInitials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('')

export default function InternSupervisionPage() {
  const [loading, setLoading] = useState(true)
  const [interns, setInterns] = useState<Intern[]>([])
  const [bt, setBt] = useState<BT[]>([])
  const [grades, setGrades] = useState<Record<string, GradeInfo>>({})
  const [docs, setDocs] = useState<Doc[]>([])
  const [profiles, setProfiles] = useState<Record<string, { data: LearningProfileData; updatedAt: string }>>({})
  const [tab, setTab] = useState<Tab>('interns')
  const [signing, setSigning] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [openProfile, setOpenProfile] = useState<string | null>(null)
  const [profileFor, setProfileFor] = useState<string | null>(null)
  // Balik-Tanaw browsing: sort weeks by date, drill week -> intern -> entry.
  const [btSort, setBtSort] = useState<'desc' | 'asc'>('desc')
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  // All Interns (Clinical Internship Supervisor / admin only) — org-wide
  // roster, loaded lazily the first time that tab is opened, plus a
  // per-intern notes panel expanded on demand.
  const [allInterns, setAllInterns] = useState<Intern[] | null>(null)
  const [allInternsLoading, setAllInternsLoading] = useState(false)
  const [notesForIntern, setNotesForIntern] = useState<string | null>(null)
  const [notesByIntern, setNotesByIntern] = useState<Record<string, InternNote[]>>({})
  const [notesLoading, setNotesLoading] = useState<string | null>(null)
  const [openNote, setOpenNote] = useState<string | null>(null)

  const { data: sess, status: authStatus } = useSession()
  const myAccountId = (sess?.user as { id?: string } | undefined)?.id
  const isAdmin = (sess?.user as { role?: string } | undefined)?.role === 'ADMIN'
  const isTaggedSupervisor = !!(sess?.user as { isInternshipSupervisor?: boolean } | undefined)?.isInternshipSupervisor
  const isIntern = (sess?.user as { accountType?: string } | undefined)?.accountType === 'INTERN'
  const canSeeAllInterns = isAdmin || isTaggedSupervisor
  // Only supervisors (tagged), INTERN accounts, and admins may see Internship.
  const canParticipate = canSeeAllInterns || isIntern

  async function loadAllInterns() {
    if (allInterns !== null) return // already loaded this session
    setAllInternsLoading(true)
    try {
      const res = await fetch('/api/intern-supervision/interns?scope=all')
      const data = await res.json()
      setAllInterns(res.ok ? (data.interns ?? []) : [])
    } catch { setAllInterns([]) }
    setAllInternsLoading(false)
  }

  async function toggleNotes(internId: string) {
    if (notesForIntern === internId) { setNotesForIntern(null); return }
    setNotesForIntern(internId)
    if (notesByIntern[internId]) return // cached
    setNotesLoading(internId)
    try {
      const res = await fetch(`/api/intern-supervision/interns/${internId}/notes`)
      const data = await res.json()
      setNotesByIntern((prev) => ({ ...prev, [internId]: res.ok ? (data.notes ?? []) : [] }))
    } catch { setNotesByIntern((prev) => ({ ...prev, [internId]: [] })) }
    setNotesLoading(null)
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 4000) }

  async function load() {
    setLoading(true)
    try {
      const [iRes, bRes, gRes, dRes, pRes] = await Promise.all([
        fetch('/api/intern-supervision/interns'),
        fetch('/api/intern-supervision/balik-tanaw'),
        fetch('/api/intern-supervision/grades'),
        fetch('/api/intern-supervision/documents'),
        fetch('/api/intern-supervision/learning-profiles'),
      ])
      if (iRes.ok) setInterns((await iRes.json()).interns ?? [])
      if (bRes.ok) setBt((await bRes.json()).entries ?? [])
      if (gRes.ok) setGrades((await gRes.json()).grades ?? {})
      if (dRes.ok) setDocs((await dRes.json()).documents ?? [])
      if (pRes.ok) setProfiles((await pRes.json()).profiles ?? {})
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  // Deep-link: /intern-supervision?tab=learning|documents|balik-tanaw (used by
  // the notification bell). Applied once on mount and given precedence over the
  // empty-state auto-switch below.
  const [deepLinked, setDeepLinked] = useState(false)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    const valid: Tab[] = ['interns', 'all-interns', 'balik-tanaw', 'grades', 'documents', 'learning', 'meeting', 'my-learning', 'my-balik']
    if (t && valid.includes(t as Tab)) { setTab(t as Tab); setDeepLinked(true) }
  }, [])
  // A tagged supervisor with zero decked interns would otherwise land on the
  // (button-less, empty) "interns" tab — default them straight to All Interns.
  useEffect(() => {
    if (deepLinked) return
    if (!loading && interns.length === 0) {
      if (canSeeAllInterns) { setTab('all-interns'); loadAllInterns() }
      else setTab('my-learning') // interns land on their Learning Outcomes form
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canSeeAllInterns])

  async function sign(id: string) {
    setSigning(id)
    try {
      const res = await fetch(`/api/balik-tanaw/${id}/sign`, { method: 'POST' })
      if (res.ok) { showToast('Signed'); load() }
      else { const d = await res.json().catch(() => ({})); showToast(d.error ?? 'Failed to sign') }
    } catch { showToast('Failed to sign') }
    setSigning(null)
  }

  const [enabling, setEnabling] = useState<string | null>(null)
  async function enableAccess(internId: string) {
    setEnabling(internId)
    try {
      const res = await fetch(`/api/intern-supervision/interns/${internId}/enable-access`, { method: 'POST' })
      if (res.ok) { showToast('Access re-enabled'); load() }
      else { const d = await res.json().catch(() => ({})); showToast(d.error ?? 'Failed to enable') }
    } catch { showToast('Failed to enable') }
    setEnabling(null)
  }

  if (loading) {
    return (
      <div className={PAGE} aria-busy="true">
        <PageHeader {...HEADER} />
        <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
        <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          <RowsSkeleton rows={4} label="Loading internship" />
        </section>
      </div>
    )
  }

  // Non-participants (not a tagged supervisor, INTERN account, or admin) never
  // see this section — even by direct URL.
  if (authStatus === 'authenticated' && !canParticipate) {
    return (
      <div className={PAGE}>
        <PageHeader eyebrow={HEADER.eyebrow} title={HEADER.title} />
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon="shield"
            title="Internship isn't available for your account"
            hint="This section is only for internship supervisors and interns. If you should have access, ask HR to tag you in Staff Profiles."
          />
        </section>
      </div>
    )
  }

  const isActiveSupervisor = interns.length > 0

  // Tabs — supervisor tabs are gated; Meetings is available to everyone
  // (interns get invited to meetings too).
  const tabList = ([
    ...(isActiveSupervisor ? [['interns', 'List of Interns']] as [Tab, string][] : []),
    ...(canSeeAllInterns ? [['all-interns', 'All Interns']] as [Tab, string][] : []),
    ...((isActiveSupervisor || canSeeAllInterns) ? [['balik-tanaw', 'Balik-Tanaw'], ['grades', 'Grades'], ['documents', 'Documents'], ['learning', 'Learning Profiles']] as [Tab, string][] : []),
    ...((isIntern && !(isActiveSupervisor || canSeeAllInterns)) ? [['my-learning', 'Learning Outcomes'], ['my-balik', 'Balik-Tanaw']] as [Tab, string][] : []),
    ['meeting', 'Meetings'],
  ] as [Tab, string][])

  return (
    <div className={PAGE}>
      {toast && <div className="toast" role="status">{toast}</div>}
      {profileFor && <InternProfileModal internId={profileFor} onClose={() => setProfileFor(null)} />}

      <PageHeader {...HEADER} />

      <PillTabs
        label="Internship sections"
        value={tab}
        onChange={(id) => { const t = id as Tab; setTab(t); if (t === 'all-interns') loadAllInterns() }}
        tabs={tabList.map(([t, label]) => ({ id: t, label }))}
      />

      {tab === 'meeting' && <MeetingsHub context="INTERNSHIP" canSetAvailability={isActiveSupervisor || canSeeAllInterns} />}

      {/* Intern-facing forms (moved here from the standalone pages) */}
      {tab === 'my-learning' && <LearningOutcomesForm showHero={false} />}
      {tab === 'my-balik' && <BalikTanawForm showHero={false} />}

      {!isActiveSupervisor && !canSeeAllInterns && tab !== 'meeting' && tab !== 'my-learning' && tab !== 'my-balik' && (
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon="users"
            title="No interns assigned"
            hint={<>Only clinicians with an active supervision will have content here. When interns are decked to you in the Operations Hub, they&apos;ll appear here with their Balik-Tanaw reflections and grading.</>}
          />
        </section>
      )}

      {tab === 'all-interns' && (
        <>
          <TabIntro>{isAdmin ? 'Every intern org-wide' : 'Every intern in your department'} — Clinical Internship Supervisor view. Open an intern to read every note they&apos;ve written, not just sessions decked to you.</TabIntro>
          <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
            {allInternsLoading ? (
              <RowsSkeleton rows={4} label="Loading interns" />
            ) : (allInterns ?? []).length === 0 ? (
              <EmptyState icon="users" title="No interns found." />
            ) : (
              <ul>
                {(allInterns ?? []).map((i, idx) => {
                  const open = notesForIntern === i.id
                  const notes = notesByIntern[i.id]
                  return (
                    <li key={i.id} style={idx ? TR_STYLE : undefined}>
                      <button onClick={() => toggleNotes(i.id)} aria-expanded={open}
                        className={`${ROW_BTN} px-4 sm:px-5 py-3`}>
                        <span className="flex items-center gap-3 min-w-0">
                          <Avatar text={nameInitials(i.name)} size={36} />
                          <span className="min-w-0">
                            <span className="block font-semibold text-[14px] truncate" style={INK}>{i.name}</span>
                            <span className="block text-[12px] truncate" style={MUTED}>{i.department} · {i.branch}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {notesLoading === i.id && <Loader2 size={14} className="animate-spin" style={MUTED} />}
                          {notes && <span className="text-[11px] tabular-nums" style={MUTED}>{notes.length} note{notes.length === 1 ? '' : 's'}</span>}
                          <Chevron open={open} size={18} />
                        </span>
                      </button>
                      {open && (
                        <div className="p-3 sm:px-5 space-y-2" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                          {notes && notes.length === 0 && (
                            <p className="text-[12px] px-1 py-2" style={MUTED}>No session notes yet.</p>
                          )}
                          {(notes ?? []).map((n) => {
                            const nOpen = openNote === n.id
                            return (
                              <div key={n.id} className="rounded-lg overflow-hidden" style={CARD_STYLE}>
                                <button onClick={() => setOpenNote(nOpen ? null : n.id)} aria-expanded={nOpen}
                                  className={`${ROW_BTN} px-3 py-2.5`}>
                                  <span className="flex items-center gap-2 flex-wrap min-w-0">
                                    <FileText size={14} aria-hidden style={{ color: 'var(--teal)' }} />
                                    <span className="font-semibold text-[13.5px]" style={INK}>{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span className="text-[12px]" style={MUTED}>{n.patientName}</span>
                                    <StatusPill tone="info">{n.status}</StatusPill>
                                    {n.lockedAt && <StatusPill tone="warn">Locked</StatusPill>}
                                  </span>
                                  <Chevron open={nOpen} />
                                </button>
                                {nOpen && (
                                  <div className="px-3 pb-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
                                    {n.notes ? <NoteBody notes={n.notes} /> : <p className="text-[13px] italic" style={MUTED}>No note text.</p>}
                                    {n.discontinuedRemarks && (
                                      <p className="text-[12px]" style={MUTED}><span className="font-semibold">Discontinued remarks:</span> {n.discontinuedRemarks}</p>
                                    )}
                                    <p className="text-[11px]" style={MUTED}>Supervising clinician: <span className="font-semibold" style={INK}>{n.supervisorName}</span></p>
                                    {n.editHistory && n.editHistory.length > 0 && (
                                      <p className="text-[11px]" style={MUTED}>
                                        {n.editHistory.map((e, idx) => (
                                          <span key={idx}>{idx > 0 ? ' · ' : ''}{e.name} {e.action} {new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                        ))}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === 'interns' && (
        <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          <ul>
            {interns.map((i, idx) => (
              <li key={i.id} className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-3.5" style={idx ? TR_STYLE : undefined}>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar text={nameInitials(i.name)} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[14px] truncate" style={INK}>{i.name}</p>
                    <p className="text-[12px] truncate" style={MUTED}>{i.department} · {i.branch}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-[12px] tabular-nums" style={MUTED}>
                    <Calendar size={13} aria-hidden />
                    {i.startMonth || '—'} to {i.endMonth || '—'}
                  </span>
                  {i.hasAccount && i.accountActive === false && (
                    <StatusPill tone="error">Access disabled</StatusPill>
                  )}
                  {i.hasAccount && i.accountActive === false && (
                    <button onClick={() => enableAccess(i.id)} disabled={enabling === i.id}
                      className={`${BTN_SM} text-white hover:opacity-90`} style={PRIMARY_STYLE}>
                      {enabling === i.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} Enable Access
                    </button>
                  )}
                  <button onClick={() => setProfileFor(i.id)} className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
                    <IdCard size={14} aria-hidden /> Intern Profile
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'balik-tanaw' && (
        bt.length === 0 ? (
          <section className="rounded-xl" style={CARD_STYLE}>
            <EmptyState icon="book" title="No Balik-Tanaw reflections submitted yet." />
          </section>
        ) : (
          <>
            <div className="flex justify-end">
              <button onClick={() => setBtSort((s) => (s === 'desc' ? 'asc' : 'desc'))} className={BTN_SM} style={SECONDARY_STYLE}>
                <ArrowUpDown size={13} aria-hidden /> {btSort === 'desc' ? 'Newest first' : 'Oldest first'}
              </button>
            </div>
            <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
              <ul>
                {(() => {
                  const map = new Map<string, BT[]>()
                  for (const e of bt) { const arr = map.get(e.periodLabel) ?? []; arr.push(e); map.set(e.periodLabel, arr) }
                  const weeks = [...map.entries()].map(([label, entries]) => ({
                    label,
                    entries: [...entries].sort((a, b) => a.internName.localeCompare(b.internName)),
                    ts: weekSortTs(label, entries[0]?.createdAt ?? entries[0]?.internSignedAt ?? ''),
                    signed: entries.filter((e) => e.supervisorSignedName).length,
                  }))
                  weeks.sort((a, b) => (btSort === 'desc' ? b.ts - a.ts : a.ts - b.ts))
                  return weeks.map((w, wIdx) => {
                    const wOpen = openWeek === w.label
                    const allSigned = w.signed === w.entries.length
                    return (
                      <li key={w.label} style={wIdx ? TR_STYLE : undefined}>
                        <button onClick={() => setOpenWeek(wOpen ? null : w.label)} aria-expanded={wOpen}
                          className={`${ROW_BTN} px-4 sm:px-5 py-3`}>
                          <span className="flex items-center gap-2 flex-wrap min-w-0">
                            <Calendar size={14} aria-hidden style={{ color: 'var(--teal)' }} />
                            <span className="font-semibold text-[14px]" style={INK}>{w.label}</span>
                            <span className="text-[11px]" style={MUTED}>{w.entries.length} intern{w.entries.length === 1 ? '' : 's'}</span>
                            <StatusPill tone={allSigned ? 'success' : 'warn'}>{w.signed}/{w.entries.length} signed</StatusPill>
                          </span>
                          <Chevron open={wOpen} size={18} />
                        </button>
                        {wOpen && (
                          <div className="p-3 sm:px-5 space-y-2" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                            {w.entries.map((e) => {
                              const eOpen = openEntry === e.id
                              return (
                                <div key={e.id} className="rounded-lg overflow-hidden" style={CARD_STYLE}>
                                  <button onClick={() => setOpenEntry(eOpen ? null : e.id)} aria-expanded={eOpen}
                                    className={`${ROW_BTN} px-3 py-2.5`}>
                                    <span className="flex items-center gap-2 flex-wrap min-w-0">
                                      <span className="font-semibold text-[13.5px]" style={INK}>{e.internName}</span>
                                      {e.supervisorSignedName ? (
                                        <StatusPill tone="success">Signed</StatusPill>
                                      ) : (
                                        <StatusPill tone="warn">Not signed</StatusPill>
                                      )}
                                    </span>
                                    <Chevron open={eOpen} />
                                  </button>
                                  {eOpen && (
                                    <div className="px-3 pb-3 pt-3 space-y-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
                                      {e.answers.map((a, i) => (
                                        <div key={i}>
                                          <p className="text-[12px] font-semibold mb-1" style={MUTED}>{i + 1}. {a.question}</p>
                                          <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={INK}>{a.answer || <span className="italic" style={MUTED}>—</span>}</p>
                                        </div>
                                      ))}
                                      <div className="flex items-center justify-between gap-2 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--light-gray)' }}>
                                        <p className="text-[11px]" style={MUTED}>Intern&apos;s signature: <span className="font-semibold" style={INK}>{e.internSignedName}</span>
                                          {e.supervisorSignedName && <> · CT: <span className="font-semibold" style={INK}>{e.supervisorSignedName}</span></>}
                                        </p>
                                        {!e.supervisorSignedName && (
                                          <button onClick={() => sign(e.id)} disabled={signing === e.id} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                                            {signing === e.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Sign as Coordinating Teacher
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </li>
                    )
                  })
                })()}
              </ul>
            </section>
          </>
        )
      )}

      {tab === 'grades' && (
        <>
          <TabIntro>Encode each intern&apos;s grade on the 4-point scale (1.00–4.00, 0.25 increments) and attach a computation file (Excel, PDF, or Word).</TabIntro>
          <FourPointRubric />
          {interns.map((i) => (
            <GradeCard key={i.id} intern={i} existing={grades[i.id]} onSaved={load} onToast={showToast} />
          ))}
        </>
      )}

      {tab === 'documents' && (
        <DocumentsPanel docs={docs} myAccountId={myAccountId} isAdmin={isAdmin} onChanged={load} onToast={showToast} />
      )}

      {tab === 'learning' && (
        <>
          <TabIntro>Each intern&apos;s Learning Outcomes &amp; Preferences (self-submitted).</TabIntro>
          <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
            <ul>
              {interns.map((i, idx) => {
                const prof = profiles[i.id]
                const open = openProfile === i.id
                return (
                  <li key={i.id} style={idx ? TR_STYLE : undefined}>
                    <button onClick={() => setOpenProfile(open ? null : i.id)} disabled={!prof} aria-expanded={prof ? open : undefined}
                      className={`${ROW_BTN} px-4 sm:px-5 py-3 disabled:cursor-default disabled:hover:bg-transparent`}>
                      <span className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-semibold text-[14px]" style={INK}>{i.name}</span>
                        <span className="text-[11px]" style={MUTED}>{i.department}</span>
                        {!prof && <StatusPill tone="neutral">Not submitted yet</StatusPill>}
                      </span>
                      {prof && <Chevron open={open} size={18} />}
                    </button>
                    {open && prof && (
                      <div className="px-4 sm:px-5 py-4" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                        <LearningProfileView data={prof.data} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
