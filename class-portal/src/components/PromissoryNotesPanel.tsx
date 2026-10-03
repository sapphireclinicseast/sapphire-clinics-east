'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listPromissoryNotes, uploadPromissoryNote, deletePromissoryNote, fetchPromissoryNoteBlob,
  hydrateUsers, getUsers,
  branchLabel, levelLabel,
  type PromissoryNoteRecord, type StoredUser, type Branch,
} from '@/lib/session'

const MAX_PER_STUDENT = 5
const MAX_BYTES = 100 * 1024 * 1024 // 100 MB
const ACCEPT = 'image/*,application/pdf,.pdf'

interface Props {
  /** Server-side the viewer's branch is already enforced; the prop is
   *  used only to label the empty state and skip the hydrate for a
   *  signed-out viewer. */
  viewerBranch?: Branch
}

/**
 * Promissory notes subsection — a student-indexed list of up to 5 signed
 * PDF/image notes per student. Visible to ADMIN, BRANCH_ADMIN, and
 * FRONTDESK only (the server also enforces this). Teachers and students
 * never see the component because it is not rendered on their pages.
 *
 * Layout: one card per student in the viewer's scope that has at least
 * one note on file OR is selected via the "+ Add note for a student"
 * dropdown. Each card lists the uploaded notes (View / Download /
 * Delete per row) and an Upload button when under the 5-note cap.
 */
export default function PromissoryNotesPanel({ viewerBranch }: Props) {
  const [notes, setNotes] = useState<PromissoryNoteRecord[]>([])
  const [students, setStudents] = useState<StoredUser[]>([])
  const [search, setSearch] = useState('')
  const [addFor, setAddFor] = useState('')
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [busyUpload, setBusyUpload] = useState<string | null>(null) // studentId mid-upload
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null) // noteId mid-delete / view
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    void (async () => {
      try {
        const [serverNotes, allUsers] = await Promise.all([
          listPromissoryNotes(),
          hydrateUsers().catch(() => getUsers()),
        ])
        setNotes(serverNotes)
        setStudents(allUsers.filter(u => u.role === 'STUDENT' && !u.disabledAt))
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const scopedStudents = useMemo(() => {
    const scoped = viewerBranch ? students.filter(s => s.branch === viewerBranch) : students
    return [...scoped].sort((a, b) => {
      const an = `${a.lastName || ''} ${a.firstName || ''}`.trim().toLowerCase()
      const bn = `${b.lastName || ''} ${b.firstName || ''}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })
  }, [students, viewerBranch])

  /** Index notes by studentId so we can render per-student cards. */
  const notesByStudent = useMemo(() => {
    const map = new Map<string, PromissoryNoteRecord[]>()
    for (const n of notes) {
      const arr = map.get(n.studentId) ?? []
      arr.push(n)
      map.set(n.studentId, arr)
    }
    // Sort each student's notes newest-first.
    for (const arr of map.values()) arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return map
  }, [notes])

  /** Students shown in the main list = anyone with ≥1 note on file,
   *  plus the one the user explicitly picked via Add. */
  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    const withNotes = scopedStudents.filter(s => notesByStudent.has(s.id))
    const explicit = addFor ? scopedStudents.filter(s => s.id === addFor && !notesByStudent.has(s.id)) : []
    const combined = [...withNotes, ...explicit]
    if (!q) return combined
    return combined.filter(s => {
      const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase()
      return name.includes(q) || s.email.toLowerCase().includes(q)
    })
  }, [scopedStudents, notesByStudent, addFor, search])

  function studentDisplay(s: StoredUser): string {
    const n = `${s.firstName || ''} ${s.lastName || ''}`.trim()
    return n || s.email
  }

  async function handleUpload(studentId: string, file: File) {
    setErr(null); setInfo(null)
    if (file.size > MAX_BYTES) {
      setErr(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 100 MB. Scan at a lower resolution and try again.`)
      return
    }
    const existingCount = notesByStudent.get(studentId)?.length ?? 0
    if (existingCount >= MAX_PER_STUDENT) {
      setErr(`This student already has ${existingCount} notes on file (max ${MAX_PER_STUDENT}). Delete one before uploading another.`)
      return
    }
    setBusyUpload(studentId)
    try {
      const row = await uploadPromissoryNote({ studentId, file })
      setNotes(prev => [row, ...prev])
      setInfo(`Uploaded "${row.fileName}" (${(row.fileSize / 1024).toFixed(0)} KB).`)
      // If this was the student we explicitly added, clear the picker.
      if (addFor === studentId) setAddFor('')
    } catch (e) {
      setErr((e as Error).message || 'Upload failed.')
    } finally {
      setBusyUpload(null)
      // Reset the file input so re-picking the same filename re-triggers onChange.
      const el = inputRefs.current[studentId]
      if (el) el.value = ''
    }
  }

  async function handleDelete(note: PromissoryNoteRecord) {
    const name = note.fileName
    if (!window.confirm(`Delete promissory note "${name}" for ${note.studentName}? This cannot be undone.`)) return
    setErr(null); setInfo(null)
    setBusyNoteId(note.id)
    try {
      const ok = await deletePromissoryNote(note.id)
      if (!ok) throw new Error('Delete rejected by server.')
      setNotes(prev => prev.filter(n => n.id !== note.id))
      setInfo(`Removed "${name}".`)
    } catch (e) {
      setErr((e as Error).message || 'Delete failed.')
    } finally {
      setBusyNoteId(null)
    }
  }

  async function handleView(note: PromissoryNoteRecord, download: boolean) {
    setErr(null)
    setBusyNoteId(note.id)
    try {
      const blob = await fetchPromissoryNoteBlob(note.id)
      if (!blob) throw new Error('Could not fetch the file.')
      const url = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = note.fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      // Revoke after a tick so the new tab has time to read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setErr((e as Error).message || 'Could not open file.')
    } finally {
      setBusyNoteId(null)
    }
  }

  function triggerUpload(studentId: string) {
    inputRefs.current[studentId]?.click()
  }

  return (
    <section className="card-static" style={{ padding: '1.1rem 1.3rem' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--sage)] mb-1">Payments</div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--deep-teal)' }}>Promissory notes</h2>
          <p className="text-xs text-[color:var(--mid-gray)] mt-1" style={{ maxWidth: 640 }}>
            Signed PDF or photo notes a parent files when they can&rsquo;t settle a payment on time
            but commit to a specific catch-up schedule. Up to <strong>{MAX_PER_STUDENT} notes per student</strong>,
            max <strong>100 MB</strong> each. Teachers and students never see this section.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search student by name or email"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-md border"
            style={{ borderColor: 'var(--paper-3)', minWidth: 240 }}
          />
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setAddPickerOpen(v => !v)}
          >
            {addPickerOpen ? 'Hide picker' : '+ Add note for a student'}
          </button>
        </div>
      </div>

      {err && <div className="mb-3 text-xs rounded-md px-3 py-2" style={{ background: '#fee2e2', color: '#9f1239' }}>{err}</div>}
      {info && <div className="mb-3 text-xs rounded-md px-3 py-2" style={{ background: '#dcfce7', color: '#166534' }}>{info}</div>}

      {addPickerOpen && (
        <div className="mb-4 p-3 rounded-md border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--mid-gray)] mb-1">
            Pick a student to attach a note to
          </label>
          <select
            value={addFor}
            onChange={e => setAddFor(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-md border bg-white"
            style={{ borderColor: 'var(--paper-3)' }}
          >
            <option value="">— choose a student —</option>
            {scopedStudents.map(s => {
              const cnt = notesByStudent.get(s.id)?.length ?? 0
              const label = `${studentDisplay(s)}${s.email ? ` · ${s.email}` : ''}${s.level ? ` · ${levelLabel(s.level)}` : ''}${s.branch ? ` · ${branchLabel(s.branch)}` : ''}${cnt > 0 ? ` · ${cnt}/${MAX_PER_STUDENT} notes` : ''}`
              return <option key={s.id} value={s.id}>{label}</option>
            })}
          </select>
          <p className="text-[11px] text-[color:var(--mid-gray)] mt-2">
            Picking a student makes their card appear below with an Upload button, even when they have no notes yet.
          </p>
        </div>
      )}

      {!ready ? (
        <div className="text-sm text-[color:var(--mid-gray)]">Loading…</div>
      ) : visibleStudents.length === 0 ? (
        <div className="text-sm text-[color:var(--mid-gray)]">
          No promissory notes on file for {viewerBranch ? branchLabel(viewerBranch) : 'any student'} yet.
          Click <strong>+ Add note for a student</strong> to attach the first one.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleStudents.map(s => {
            const forStudent = notesByStudent.get(s.id) ?? []
            const atCap = forStudent.length >= MAX_PER_STUDENT
            return (
              <div key={s.id} className="rounded-lg border bg-white p-3" style={{ borderColor: 'var(--paper-3)' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <div className="font-semibold" style={{ color: 'var(--deep-teal)' }}>
                      {studentDisplay(s)}
                    </div>
                    <div className="text-[11px] text-[color:var(--mid-gray)]">
                      {s.email}{s.level ? ` · ${levelLabel(s.level)}` : ''}{s.branch ? ` · ${branchLabel(s.branch)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[color:var(--mid-gray)]">
                      {forStudent.length}/{MAX_PER_STUDENT} notes
                    </span>
                    <input
                      type="file"
                      accept={ACCEPT}
                      ref={el => { inputRefs.current[s.id] = el }}
                      hidden
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) void handleUpload(s.id, file)
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={atCap || busyUpload === s.id}
                      onClick={() => triggerUpload(s.id)}
                      title={atCap ? `Max ${MAX_PER_STUDENT} notes reached — delete one first.` : 'Upload a PDF or photo (max 100 MB).'}
                    >
                      {busyUpload === s.id ? 'Uploading…' : atCap ? 'Max reached' : '+ Upload note'}
                    </button>
                  </div>
                </div>

                {forStudent.length === 0 ? (
                  <div className="text-xs text-[color:var(--mid-gray)] italic">No notes yet. Upload one above.</div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {forStudent.map(n => (
                      <li
                        key={n.id}
                        className="flex items-center justify-between gap-3 text-sm rounded-md px-2.5 py-2"
                        style={{ background: 'var(--paper-2)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium" style={{ color: 'var(--deep-teal)' }}>
                            {n.fileName}
                          </div>
                          <div className="text-[11px] text-[color:var(--mid-gray)]">
                            {(n.fileSize / 1024).toFixed(0)} KB · {new Date(n.createdAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            {n.uploadedBy ? ` · uploaded by ${n.uploadedBy}` : ''}
                            {n.notes ? ` · ${n.notes}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            disabled={busyNoteId === n.id}
                            onClick={() => void handleView(n, false)}
                          >
                            {busyNoteId === n.id ? '…' : 'View'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            disabled={busyNoteId === n.id}
                            onClick={() => void handleView(n, true)}
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold"
                            style={{ color: 'var(--clay)' }}
                            disabled={busyNoteId === n.id}
                            onClick={() => void handleDelete(n)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
