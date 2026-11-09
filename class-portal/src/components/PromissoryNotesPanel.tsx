'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listPromissoryNotes, uploadPromissoryNote, deletePromissoryNote, fetchPromissoryNoteBlob,
  hydrateUsers, getUsers,
  branchLabel, levelLabel,
  type PromissoryNoteRecord, type StoredUser, type Branch,
} from '@/lib/session'
import {
  DashCard, RowsSkeleton, EmptyState, Banner, StatusPill, Icon,
  CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, SECONDARY_STYLE,
  SUBTLE_BG, DANGER,
} from '@/components/hub/ui'

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

  const studentsWithNotes = scopedStudents.filter(s => notesByStudent.has(s.id)).length

  return (
    <DashCard
      title="Promissory notes"
      icon={<Icon name="file" size={15} />}
      description={<>Signed PDF or photo notes a parent files when they can&rsquo;t settle a payment on time but commit to a specific catch-up schedule. Up to <strong>{MAX_PER_STUDENT} notes per student</strong>, max <strong>100 MB</strong> each. Teachers and students never see this section.</>}
      action={ready && notes.length > 0 ? <StatusPill tone="info">{notes.length} note{notes.length === 1 ? '' : 's'} · {studentsWithNotes} student{studentsWithNotes === 1 ? '' : 's'}</StatusPill> : undefined}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="relative flex-1 min-w-0 sm:max-w-[320px]">
          <span className="sr-only">Search promissory notes by student</span>
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          <input
            type="search"
            placeholder="Search student by name or email"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${CONTROL} w-full pl-8`}
            style={CONTROL_STYLE}
          />
        </label>
        <button
          type="button"
          className={BTN_SECONDARY}
          style={SECONDARY_STYLE}
          aria-expanded={addPickerOpen}
          aria-controls="promissory-add-picker"
          onClick={() => setAddPickerOpen(v => !v)}
        >
          {addPickerOpen ? <><Icon name="x" size={14} /> Hide picker</> : <><Icon name="plus" size={14} /> Add note for a student</>}
        </button>
      </div>

      {(err || info) && (
        <div className="space-y-2 mb-4">
          {err && <Banner tone="error">{err}</Banner>}
          {info && <Banner tone="success">{info}</Banner>}
        </div>
      )}

      {addPickerOpen && (
        <div id="promissory-add-picker" className="mb-4 p-3.5 rounded-xl" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          <label htmlFor="promissory-add-for" className={LABEL} style={LABEL_STYLE}>
            Pick a student to attach a note to
          </label>
          <select
            id="promissory-add-for"
            value={addFor}
            onChange={e => setAddFor(e.target.value)}
            className={`${CONTROL} w-full`}
            style={CONTROL_STYLE}
          >
            <option value="">— choose a student —</option>
            {scopedStudents.map(s => {
              const cnt = notesByStudent.get(s.id)?.length ?? 0
              const label = `${studentDisplay(s)}${s.email ? ` · ${s.email}` : ''}${s.level ? ` · ${levelLabel(s.level)}` : ''}${s.branch ? ` · ${branchLabel(s.branch)}` : ''}${cnt > 0 ? ` · ${cnt}/${MAX_PER_STUDENT} notes` : ''}`
              return <option key={s.id} value={s.id}>{label}</option>
            })}
          </select>
          <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>
            Picking a student makes their card appear below with an Upload button, even when they have no notes yet.
          </p>
        </div>
      )}

      {!ready ? (
        <div className="-mx-4 sm:-mx-5"><RowsSkeleton rows={3} label="Loading promissory notes" /></div>
      ) : visibleStudents.length === 0 ? (
        <EmptyState
          icon="file"
          title={`No promissory notes on file for ${viewerBranch ? branchLabel(viewerBranch) : 'any student'} yet.`}
          hint={<>Click <strong>Add note for a student</strong> to attach the first one.</>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleStudents.map(s => {
            const forStudent = notesByStudent.get(s.id) ?? []
            const atCap = forStudent.length >= MAX_PER_STUDENT
            return (
              <div key={s.id} className="rounded-xl bg-white" style={{ border: '1px solid var(--light-gray)' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold break-words" style={{ color: 'var(--charcoal)' }}>
                      {studentDisplay(s)}
                    </div>
                    <div className="text-[11px] break-all" style={{ color: 'var(--mid-gray)' }}>
                      {s.email}{s.level ? ` · ${levelLabel(s.level)}` : ''}{s.branch ? ` · ${branchLabel(s.branch)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={atCap ? 'warn' : 'neutral'}>
                      {forStudent.length}/{MAX_PER_STUDENT} notes
                    </StatusPill>
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
                      className={BTN_SM}
                      style={SECONDARY_STYLE}
                      disabled={atCap || busyUpload === s.id}
                      onClick={() => triggerUpload(s.id)}
                      title={atCap ? `Max ${MAX_PER_STUDENT} notes reached — delete one first.` : 'Upload a PDF or photo (max 100 MB).'}
                      aria-label={atCap || busyUpload === s.id ? undefined : `Upload a promissory note for ${studentDisplay(s)}`}
                    >
                      {busyUpload === s.id ? 'Uploading…' : atCap ? 'Max reached' : <><Icon name="upload" size={12} /> Upload note</>}
                    </button>
                  </div>
                </div>

                {forStudent.length === 0 ? (
                  <div className="text-xs italic px-3.5 pb-3" style={{ color: 'var(--mid-gray)' }}>No notes yet. Upload one above.</div>
                ) : (
                  <ul style={{ borderTop: '1px solid var(--light-gray)' }}>
                    {forStudent.map((n, i) => (
                      <li
                        key={n.id}
                        className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap text-sm px-3.5 py-2.5"
                        style={{ background: SUBTLE_BG, borderTop: i ? '1px solid var(--light-gray)' : undefined }}
                      >
                        <div className="min-w-0 flex-1 basis-56">
                          <div className="truncate font-medium flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }} title={n.fileName}>
                            <Icon name="file" size={14} style={{ color: 'var(--teal)' }} />
                            <span className="truncate">{n.fileName}</span>
                          </div>
                          <div className="text-[11px] break-words" style={{ color: 'var(--mid-gray)' }}>
                            {(n.fileSize / 1024).toFixed(0)} KB · {new Date(n.createdAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            {n.uploadedBy ? ` · uploaded by ${n.uploadedBy}` : ''}
                            {n.notes ? ` · ${n.notes}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            className={BTN_SM}
                            style={SECONDARY_STYLE}
                            disabled={busyNoteId === n.id}
                            onClick={() => void handleView(n, false)}
                            aria-label={`View ${n.fileName}`}
                          >
                            {busyNoteId === n.id ? '…' : <><Icon name="eye" size={12} /> View</>}
                          </button>
                          <button
                            type="button"
                            className={BTN_SM}
                            style={SECONDARY_STYLE}
                            disabled={busyNoteId === n.id}
                            onClick={() => void handleView(n, true)}
                            aria-label={`Download ${n.fileName}`}
                          >
                            <Icon name="download" size={12} /> Download
                          </button>
                          <button
                            type="button"
                            className={BTN_DANGER_GHOST}
                            style={{ color: DANGER }}
                            disabled={busyNoteId === n.id}
                            onClick={() => void handleDelete(n)}
                            aria-label={`Delete ${n.fileName}`}
                          >
                            <Icon name="trash" size={12} /> Delete
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
    </DashCard>
  )
}
