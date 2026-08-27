'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { UserCog, Loader2, CheckCircle2, Clock, Calendar, Paperclip, Upload, FileText, ChevronDown, ChevronUp, ArrowUpDown, Trash2, Info, IdCard, Ban, Power, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LEARN_BEST_OPTIONS, FEEDBACK_OPTIONS, PREP_OPTIONS, type LearningProfileData } from '@/lib/learning-profile'
import InternProfileModal from '@/components/InternProfileModal'
import MeetingsHub from '@/components/MeetingsHub'
import NoteBody from '@/components/NoteBody'
import LearningOutcomesForm from '@/components/LearningOutcomesForm'
import BalikTanawForm from '@/components/BalikTanawForm'

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

function FourPointRubric() {
  const [open, setOpen] = useState(false)
  return (
    <div className="card-static !p-0 overflow-hidden mb-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--off-white)] transition-colors">
        <span className="text-[13px] font-bold text-[var(--charcoal)]">The 4-Point Scale — grading rubric</span>
        {open ? <ChevronUp size={16} className="text-[var(--mid-gray)]" /> : <ChevronDown size={16} className="text-[var(--mid-gray)]" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-[12px] text-[var(--mid-gray)] mb-3 leading-relaxed">
            Each criterion is scored 1–4. Assign intermediate scores in increments of 0.25 where performance falls between two adjacent levels.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-[var(--narra)] text-white text-left">
                  <th className="px-3 py-2 font-semibold">Score</th>
                  <th className="px-3 py-2 font-semibold">Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {SCALE_4PT.map((r, idx) => (
                  <tr key={r.score} className={idx % 2 ? 'bg-[var(--off-white)]' : 'bg-white'}>
                    <td className="px-3 py-2 font-bold text-[var(--charcoal)] whitespace-nowrap align-top">{r.score}</td>
                    <td className="px-3 py-2 text-[var(--charcoal)]">{r.interp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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

  return (
    <div className="card-static">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <p className="font-semibold text-[var(--charcoal)] text-[14px]">{intern.name}</p>
          <p className="text-[12px] text-[var(--mid-gray)]">{intern.department} · {intern.branch}</p>
        </div>
        {existing?.updatedAt && (
          <span className="text-[11px] text-[var(--mid-gray)]">Last graded {new Date(existing.updatedAt).toLocaleDateString()}{existing.gradedByName ? ` · ${existing.gradedByName}` : ''}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1.5">Grade (4-point scale)</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="input">
            <option value="">Select score…</option>
            {SCALE_4PT.map((r) => <option key={r.score} value={r.score}>{r.score}</option>)}
          </select>
          {grade && SCALE_MAP[grade] && <p className="text-[11px] text-[var(--mid-gray)] mt-1 leading-snug">{SCALE_MAP[grade]}</p>}
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1.5">Computation file (optional)</label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--light-gray)] text-[13px] font-semibold text-[var(--mid-gray)] hover:border-[var(--teal)] hover:text-[var(--teal)] cursor-pointer transition-colors whitespace-nowrap">
              <Upload size={14} /> {file ? 'Change' : 'Attach'} file
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            {file ? (
              <span className="text-[12px] text-[var(--charcoal)] truncate flex items-center gap-1"><Paperclip size={12} className="text-[var(--teal)]" />{file.name}</span>
            ) : existing?.filePath ? (
              <a href={`/api/upload/${existing.filePath}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--teal)] hover:underline truncate flex items-center gap-1"><FileText size={12} />{existing.fileName ?? 'file'}</a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1.5">Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-y !rounded-xl" placeholder="Remarks…" />
      </div>

      {progress !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--mid-gray)] mb-1"><span>Uploading…</span><span className="tabular-nums">{progress}%</span></div>
          <div className="h-2 rounded-full bg-[var(--light-gray)] overflow-hidden"><div className="h-full bg-[var(--teal)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <button onClick={save} disabled={saving} className="btn-primary mt-4 px-5 py-2.5 rounded-xl text-[13px]">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {progress !== null ? `Uploading… ${progress}%` : (existing ? 'Update grade' : 'Save grade')}
      </button>
    </div>
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
    return all.length ? all.map((c, i) => <span key={i} className="inline-block text-[12px] bg-[var(--pale-teal)] text-[var(--deep-teal)] px-2 py-0.5 rounded-full mr-1.5 mb-1.5">{c}</span>) : <span className="text-[12px] italic text-[var(--mid-gray)]">—</span>
  }
  const line = (label: string, val?: string) => (
    <div><p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-0.5">{label}</p><p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{val?.trim() || <span className="italic text-[var(--mid-gray)]">—</span>}</p></div>
  )
  return (
    <div className="space-y-3 pt-1">
      {line('Expectations for the rotation', data.outcomes?.expectations)}
      {line('Most looking forward to learning', data.outcomes?.lookingForward)}
      {line('Wants to improve on', data.outcomes?.improve)}
      <div><p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-1">Learns best by</p>{chips(data.learnBest, data.learnBestOther)}</div>
      <div><p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-1">Preferred feedback</p>{chips(data.feedback, data.feedbackOther)}</div>
      <div><p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-1">Prepares for duty by</p>{chips(data.prep)}</div>
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
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-2.5">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-blue-700 leading-relaxed">
          Upload only documents <span className="font-semibold">specific to the internship</span> (e.g. supervision guides). Please do <span className="font-semibold">not duplicate</span> template forms already available in the <span className="font-semibold">Templates &amp; Forms</span> section. These are shared with supervisors in your department.
        </p>
      </div>

      <div className="card-static">
        <h3 className="font-bold text-[var(--charcoal)] mb-3 text-[14px]" style={{ fontFamily: 'var(--font-display)' }}>Upload a document</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mb-2" placeholder="Title (e.g. PT Internship Supervision Guide)" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input resize-y !rounded-xl mb-2" placeholder="Description (optional)" />
        <div className="flex items-center gap-2 mb-3">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--light-gray)] text-[13px] font-semibold text-[var(--mid-gray)] hover:border-[var(--teal)] hover:text-[var(--teal)] cursor-pointer transition-colors whitespace-nowrap">
            <Upload size={14} /> {file ? 'Change' : 'Attach'} file
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }} />
          </label>
          {file && <span className="text-[12px] text-[var(--charcoal)] truncate flex items-center gap-1"><Paperclip size={12} className="text-[var(--teal)]" />{file.name}</span>}
        </div>
        {progress !== null && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--mid-gray)] mb-1"><span>Uploading…</span><span className="tabular-nums">{progress}%</span></div>
            <div className="h-2 rounded-full bg-[var(--light-gray)] overflow-hidden"><div className="h-full bg-[var(--teal)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        <button onClick={upload} disabled={saving} className="btn-primary px-5 py-2.5 rounded-xl text-[13px]">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {progress !== null ? `Uploading… ${progress}%` : 'Upload'}
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="card-static text-center py-10 text-[13px] text-[var(--mid-gray)]">No internship documents yet.</div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="card-static flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a href={`/api/upload/${d.filePath}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--teal)] hover:underline">
                  <FileText size={15} className="shrink-0" /> {d.title}
                </a>
                {d.description && <p className="text-[12.5px] text-[var(--mid-gray)] mt-0.5">{d.description}</p>}
                <p className="text-[11px] text-[var(--mid-gray)] mt-1">Uploaded by <span className="font-semibold text-[var(--charcoal)]">{d.uploadedByName}</span> · {new Date(d.createdAt).toLocaleDateString()}</p>
              </div>
              {(isAdmin || d.uploadedByAccountId === myAccountId) && (
                <button onClick={() => remove(d.id)} className="text-[var(--mid-gray)] hover:text-red-500 shrink-0" title="Remove"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
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
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" /></div>
  }

  // Non-participants (not a tagged supervisor, INTERN account, or admin) never
  // see this section — even by direct URL.
  if (authStatus === 'authenticated' && !canParticipate) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card-static text-center py-16">
          <Lock size={28} className="text-[var(--mid-gray)] mx-auto mb-3" />
          <p className="font-semibold text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Internship isn&apos;t available for your account</p>
          <p className="text-[13px] text-[var(--mid-gray)]">This section is only for internship supervisors and interns. If you should have access, ask HR to tag you in Staff Profiles.</p>
        </div>
      </div>
    )
  }

  const isActiveSupervisor = interns.length > 0

  return (
    <div className="max-w-4xl mx-auto">
      {toast && <div className="toast">{toast}</div>}
      {profileFor && <InternProfileModal internId={profileFor} onClose={() => setProfileFor(null)} />}

      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Internship</h1>
        <p className="text-white/60 text-sm mt-1">Interns decked to you, their Balik-Tanaw, and grades</p>
      </div>

      <>
          {/* Tabs — supervisor tabs are gated; Meetings is available to
              everyone (interns get invited to meetings too). */}
          <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-[var(--off-white)] border border-[var(--light-gray)] mb-6">
            {([
              ...(isActiveSupervisor ? [['interns', 'List of Interns']] as [Tab, string][] : []),
              ...(canSeeAllInterns ? [['all-interns', 'All Interns']] as [Tab, string][] : []),
              ...((isActiveSupervisor || canSeeAllInterns) ? [['balik-tanaw', 'Balik-Tanaw'], ['grades', 'Grades'], ['documents', 'Documents'], ['learning', 'Learning Profiles']] as [Tab, string][] : []),
              ...((isIntern && !(isActiveSupervisor || canSeeAllInterns)) ? [['my-learning', 'Learning Outcomes'], ['my-balik', 'Balik-Tanaw']] as [Tab, string][] : []),
              ['meeting', 'Meetings'],
            ] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => { setTab(t); if (t === 'all-interns') loadAllInterns() }}
                className={cn('flex-1 min-w-[110px] px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors',
                  tab === t ? 'bg-white text-[var(--teal)] shadow-sm' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]')}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'meeting' && <MeetingsHub context="INTERNSHIP" canSetAvailability={isActiveSupervisor || canSeeAllInterns} />}

          {/* Intern-facing forms (moved here from the standalone pages) */}
          {tab === 'my-learning' && <LearningOutcomesForm showHero={false} />}
          {tab === 'my-balik' && <BalikTanawForm showHero={false} />}

          {!isActiveSupervisor && !canSeeAllInterns && tab !== 'meeting' && tab !== 'my-learning' && tab !== 'my-balik' && (
            <div className="card-static text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-4">
                <UserCog size={24} className="text-[var(--teal)]" />
              </div>
              <p className="font-semibold text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>No interns assigned</p>
              <p className="text-[13px] text-[var(--mid-gray)] max-w-md mx-auto leading-relaxed">
                Only clinicians with an active supervision will have content here. When interns are decked to you in the
                Operations Hub, they&apos;ll appear here with their Balik-Tanaw reflections and grading.
              </p>
            </div>
          )}

          {tab === 'all-interns' && (
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--mid-gray)] mb-1">Every intern org-wide — Clinical Internship Supervisor view. Open an intern to read every note they've written, not just sessions decked to you.</p>
              {allInternsLoading ? (
                <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[var(--teal)]" /></div>
              ) : (allInterns ?? []).length === 0 ? (
                <div className="card-static text-center py-12 text-[13px] text-[var(--mid-gray)]">No interns found.</div>
              ) : (
                (allInterns ?? []).map((i) => {
                  const open = notesForIntern === i.id
                  const notes = notesByIntern[i.id]
                  return (
                    <div key={i.id} className="rounded-xl border border-[var(--light-gray)] bg-white overflow-hidden">
                      <button onClick={() => toggleNotes(i.id)}
                        className="w-full flex items-center justify-between gap-3 flex-wrap px-4 py-3 text-left hover:bg-[var(--off-white)]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--pale-teal)] flex items-center justify-center font-bold text-[var(--teal)] text-[13px]">
                            {i.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--charcoal)] text-[14px]">{i.name}</p>
                            <p className="text-[12px] text-[var(--mid-gray)]">{i.department} · {i.branch}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-2">
                          {notesLoading === i.id && <Loader2 size={14} className="animate-spin text-[var(--mid-gray)]" />}
                          {notes && <span className="text-[11px] text-[var(--mid-gray)]">{notes.length} note{notes.length === 1 ? '' : 's'}</span>}
                          {open ? <ChevronUp size={18} className="text-[var(--mid-gray)]" /> : <ChevronDown size={18} className="text-[var(--mid-gray)]" />}
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-[var(--light-gray)] p-2 space-y-2">
                          {notes && notes.length === 0 && (
                            <p className="text-[12px] text-[var(--mid-gray)] px-2 py-3">No session notes yet.</p>
                          )}
                          {(notes ?? []).map((n) => {
                            const nOpen = openNote === n.id
                            return (
                              <div key={n.id} className="rounded-lg border border-[var(--light-gray)] bg-white overflow-hidden">
                                <button onClick={() => setOpenNote(nOpen ? null : n.id)}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--off-white)]">
                                  <span className="flex items-center gap-2 flex-wrap">
                                    <FileText size={14} className="text-[var(--teal)]" />
                                    <span className="font-semibold text-[var(--charcoal)] text-[13.5px]">{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span className="text-[12px] text-[var(--mid-gray)]">{n.patientName}</span>
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--pale-teal)] text-[var(--teal)]">{n.status}</span>
                                    {n.lockedAt && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Locked</span>}
                                  </span>
                                  {nOpen ? <ChevronUp size={16} className="text-[var(--mid-gray)]" /> : <ChevronDown size={16} className="text-[var(--mid-gray)]" />}
                                </button>
                                {nOpen && (
                                  <div className="px-3 pb-3 border-t border-[var(--light-gray)] pt-3 space-y-2">
                                    {n.notes ? <NoteBody notes={n.notes} /> : <p className="text-[13px] italic text-[var(--mid-gray)]">No note text.</p>}
                                    {n.discontinuedRemarks && (
                                      <p className="text-[12px] text-[var(--mid-gray)]"><span className="font-semibold">Discontinued remarks:</span> {n.discontinuedRemarks}</p>
                                    )}
                                    <p className="text-[11px] text-[var(--mid-gray)]">Supervising clinician: <span className="font-semibold text-[var(--charcoal)]">{n.supervisorName}</span></p>
                                    {n.editHistory && n.editHistory.length > 0 && (
                                      <p className="text-[11px] text-[var(--mid-gray)]">
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
                    </div>
                  )
                })
              )}
            </div>
          )}

          {tab === 'interns' && (
            <div className="space-y-3">
              {interns.map((i) => (
                <div key={i.id} className="card-static flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--pale-teal)] flex items-center justify-center font-bold text-[var(--teal)] text-[13px]">
                      {i.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--charcoal)] text-[14px]">{i.name}</p>
                      <p className="text-[12px] text-[var(--mid-gray)]">{i.department} · {i.branch}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-[12px] text-[var(--mid-gray)]">
                      <Calendar size={13} />
                      {i.startMonth || '—'} to {i.endMonth || '—'}
                    </span>
                    {i.hasAccount && i.accountActive === false && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><Ban size={11} /> Access disabled</span>
                    )}
                    {i.hasAccount && i.accountActive === false && (
                      <button onClick={() => enableAccess(i.id)} disabled={enabling === i.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-50">
                        {enabling === i.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} Enable Access
                      </button>
                    )}
                    <button onClick={() => setProfileFor(i.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 text-[var(--teal)] text-[12.5px] font-semibold hover:bg-[var(--teal)]/5 transition-colors">
                      <IdCard size={14} /> Intern Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'balik-tanaw' && (
            bt.length === 0 ? (
              <div className="card-static text-center py-12 text-[13px] text-[var(--mid-gray)]">No Balik-Tanaw reflections submitted yet.</div>
            ) : (
              <>
                <div className="flex justify-end mb-3">
                  <button onClick={() => setBtSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--mid-gray)] hover:text-[var(--teal)] border border-[var(--light-gray)] rounded-lg px-3 py-1.5 transition-colors">
                    <ArrowUpDown size={13} /> {btSort === 'desc' ? 'Newest first' : 'Oldest first'}
                  </button>
                </div>
                <div className="space-y-2">
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
                    return weeks.map((w) => {
                      const wOpen = openWeek === w.label
                      const allSigned = w.signed === w.entries.length
                      return (
                        <div key={w.label} className="rounded-xl border border-[var(--light-gray)] bg-white overflow-hidden">
                          <button onClick={() => setOpenWeek(wOpen ? null : w.label)}
                            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[var(--off-white)]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Calendar size={14} className="text-[var(--teal)]" />
                              <span className="font-semibold text-[var(--charcoal)] text-[14px]">{w.label}</span>
                              <span className="text-[11px] text-[var(--mid-gray)]">{w.entries.length} intern{w.entries.length === 1 ? '' : 's'}</span>
                              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', allSigned ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200')}>{w.signed}/{w.entries.length} signed</span>
                            </div>
                            {wOpen ? <ChevronUp size={18} className="text-[var(--mid-gray)]" /> : <ChevronDown size={18} className="text-[var(--mid-gray)]" />}
                          </button>
                          {wOpen && (
                            <div className="border-t border-[var(--light-gray)] p-2 space-y-2">
                              {w.entries.map((e) => {
                                const eOpen = openEntry === e.id
                                return (
                                  <div key={e.id} className="rounded-lg border border-[var(--light-gray)] bg-white overflow-hidden">
                                    <button onClick={() => setOpenEntry(eOpen ? null : e.id)}
                                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--off-white)]">
                                      <span className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-[var(--charcoal)] text-[13.5px]">{e.internName}</span>
                                        {e.supervisorSignedName ? (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full"><CheckCircle2 size={11} /> Signed</span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><Clock size={11} /> Not signed</span>
                                        )}
                                      </span>
                                      {eOpen ? <ChevronUp size={16} className="text-[var(--mid-gray)]" /> : <ChevronDown size={16} className="text-[var(--mid-gray)]" />}
                                    </button>
                                    {eOpen && (
                                      <div className="px-3 pb-3 border-t border-[var(--light-gray)] pt-3 space-y-3">
                                        {e.answers.map((a, i) => (
                                          <div key={i}>
                                            <p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-1">{i + 1}. {a.question}</p>
                                            <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{a.answer || <span className="italic text-[var(--mid-gray)]">—</span>}</p>
                                          </div>
                                        ))}
                                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--light-gray)] flex-wrap">
                                          <p className="text-[11px] text-[var(--mid-gray)]">Intern's signature: <span className="font-semibold text-[var(--charcoal)]">{e.internSignedName}</span>
                                            {e.supervisorSignedName && <> · CT: <span className="font-semibold text-[var(--charcoal)]">{e.supervisorSignedName}</span></>}
                                          </p>
                                          {!e.supervisorSignedName && (
                                            <button onClick={() => sign(e.id)} disabled={signing === e.id}
                                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50">
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
                        </div>
                      )
                    })
                  })()}
                </div>
              </>
            )
          )}

          {tab === 'grades' && (
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--mid-gray)] mb-1">Encode each intern's grade on the 4-point scale (1.00–4.00, 0.25 increments) and attach a computation file (Excel, PDF, or Word).</p>
              <FourPointRubric />
              {interns.map((i) => (
                <GradeCard key={i.id} intern={i} existing={grades[i.id]} onSaved={load} onToast={showToast} />
              ))}
            </div>
          )}

          {tab === 'documents' && (
            <DocumentsPanel docs={docs} myAccountId={myAccountId} isAdmin={isAdmin} onChanged={load} onToast={showToast} />
          )}

          {tab === 'learning' && (
            <div className="space-y-2">
              <p className="text-[12px] text-[var(--mid-gray)] mb-1">Each intern's Learning Outcomes &amp; Preferences (self-submitted).</p>
              {interns.map((i) => {
                const prof = profiles[i.id]
                const open = openProfile === i.id
                return (
                  <div key={i.id} className="rounded-xl border border-[var(--light-gray)] bg-white overflow-hidden">
                    <button onClick={() => setOpenProfile(open ? null : i.id)} disabled={!prof}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[var(--off-white)] disabled:cursor-default">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--charcoal)] text-[14px]">{i.name}</span>
                        <span className="text-[11px] text-[var(--mid-gray)]">{i.department}</span>
                        {!prof && <span className="text-[10px] italic text-[var(--mid-gray)]">not submitted yet</span>}
                      </div>
                      {prof && (open ? <ChevronUp size={18} className="text-[var(--mid-gray)]" /> : <ChevronDown size={18} className="text-[var(--mid-gray)]" />)}
                    </button>
                    {open && prof && (
                      <div className="px-4 pb-4 border-t border-[var(--light-gray)]">
                        <LearningProfileView data={prof.data} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
    </div>
  )
}
