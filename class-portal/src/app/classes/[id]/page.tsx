'use client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getAuth, hydrateUsers, getUsers, fetchClassPhotoBlob,
  listLessons, createLesson, updateLesson, deleteLesson, fetchLessonDetail,
  uploadLessonAttachment, deleteLessonAttachment, fetchLessonAttachmentBlob,
  uploadLessonOutput, fetchLessonOutputBlob,
  levelLabel, branchLabel, CLASS_DAY_OPTIONS,
  type AuthSession, type StoredUser,
  type ClassRecord, type LessonRecord, type LessonAttachmentMeta, type LessonOutputMeta,
  type AttendanceStatus,
} from '@/lib/session'
import { backendJson } from '@/lib/backend'

/**
 * Class detail dashboard. Header (cover, name, schedule, roster) +
 * lessons feed. Future phases (tests, projects, activities) plug into
 * additional sections on this page.
 */
export default function ClassDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const classId = params.id
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [klass, setKlass] = useState<ClassRecord | null>(null)
  const [students, setStudents] = useState<StoredUser[]>([])
  const [teachers, setTeachers] = useState<StoredUser[]>([])
  const [lessons, setLessons] = useState<LessonRecord[]>([])
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingLesson, setEditingLesson] = useState<LessonRecord | 'new' | null>(null)

  useEffect(() => {
    const a = getAuth()
    if (!a) { router.replace('/sign-in'); return }
    if (a.role === 'FRONTDESK') { router.replace('/frontdesk'); return }
    setAuth(a)
  }, [router])

  async function load() {
    if (!classId) return
    setBusy(true)
    try {
      const [{ class: k }, ls, us] = await Promise.all([
        backendJson<{ class: ClassRecord }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}`),
        listLessons(classId),
        hydrateUsers().catch(() => getUsers()),
      ])
      setKlass(k)
      setLessons(ls)
      setStudents(us.filter((u: StoredUser) => u.role === 'STUDENT'))
      setTeachers(us.filter((u: StoredUser) => u.role === 'TEACHER'))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { if (auth && classId) void load() }, [auth, classId])

  useEffect(() => {
    if (!klass?.hasPhoto) { setPhotoUrl(null); return }
    let url: string | null = null
    let cancelled = false
    ;(async () => {
      const blob = await fetchClassPhotoBlob(klass.id)
      if (cancelled || !blob) return
      url = URL.createObjectURL(blob)
      setPhotoUrl(url)
    })()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [klass?.id, klass?.hasPhoto, klass?.updatedAt])

  if (!auth) return null
  if (!klass) {
    return <div className="max-w-4xl mx-auto"><div className="card-static">{busy ? 'Loading…' : err || 'Class not found.'}</div></div>
  }

  const isTeacher = auth.role === 'TEACHER' && klass.teacherId === auth.userId
  const isAdmin = auth.role === 'ADMIN' || (auth.role === 'BRANCH_ADMIN' && (!auth.branch || klass.branch === auth.branch))
  const canEdit = isTeacher || isAdmin
  const isStudent = auth.role === 'STUDENT'

  const roster = students.filter(s => klass.studentIds.includes(s.id))
  const teacher = teachers.find(t => t.id === klass.teacherId)
  const teacherName = [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || teacher?.email || '—'
  const dayShorts = CLASS_DAY_OPTIONS.filter(o => klass.scheduleDays.includes(o.value)).map(o => o.short).join(', ')
  const time = klass.scheduleStartTime && klass.scheduleEndTime ? `${klass.scheduleStartTime}–${klass.scheduleEndTime}` : null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static p-0 overflow-hidden">
        <div className="aspect-[16/6] bg-[color:var(--paper-2)] relative">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={klass.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[color:var(--mid-gray)] text-[12.5px]" style={{ fontFamily: 'var(--font-display)' }}>No cover photo</div>
          )}
        </div>
        <div className="p-5">
          <button className="btn-secondary text-xs mb-3" onClick={() => router.push('/classes')}>← All classes</button>
          <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">
            {klass.name}{klass.section ? <span className="text-[color:var(--mid-gray)] font-normal"> · {klass.section}</span> : null}
          </h1>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">
            {levelLabel(klass.level)} · {branchLabel(klass.branch)} · Teacher: {teacherName}
          </p>
          <p className="text-sm text-[color:var(--mid-gray)] mt-0.5">
            Schedule: {dayShorts || '—'}{time ? ` · ${time}` : ''} · {roster.length} student{roster.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {err && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Day&apos;s lessons</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              {canEdit
                ? 'Add a lesson for any scheduled day. Attach reference materials, take attendance, mark grades, and (optionally) collect student outputs.'
                : 'Every lesson published by the teacher appears here. You can download the materials and see your own attendance + grade.'}
            </p>
          </div>
          {canEdit && (
            <button className="btn-primary text-xs" onClick={() => setEditingLesson('new')}>+ Add Day&apos;s Lesson</button>
          )}
        </div>

        {busy && lessons.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
        ) : lessons.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">
            {canEdit ? 'No lessons yet. Click + Add Day’s Lesson to create the first one.' : 'No lessons posted yet.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {lessons.map(l => (
              <LessonCard
                key={l.id}
                lesson={l}
                roster={roster}
                viewerRole={auth.role}
                viewerId={auth.userId}
                canEdit={canEdit}
                onEdit={() => setEditingLesson(l)}
                onDelete={async () => {
                  if (!confirm(`Delete "${l.title}"?`)) return
                  const ok = await deleteLesson(l.id)
                  if (ok) await load()
                  else setErr('Could not delete lesson.')
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {editingLesson && (
        <LessonEditor
          klass={klass}
          roster={roster}
          existing={editingLesson === 'new' ? null : editingLesson}
          onClose={() => setEditingLesson(null)}
          onSaved={async () => { setEditingLesson(null); await load() }}
          isStudent={isStudent}
        />
      )}
    </div>
  )
}

function LessonCard({ lesson, roster, viewerRole, viewerId, canEdit, onEdit, onDelete }: {
  lesson: LessonRecord
  roster: StoredUser[]
  viewerRole: string
  viewerId?: string
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const presentIds = useMemo(() => roster.filter(s => lesson.attendance[s.id] === 'PRESENT').map(s => s.id), [roster, lesson.attendance])
  const myGrade = viewerRole === 'STUDENT' && viewerId ? lesson.grades[viewerId]?.score : undefined
  const myAttendance = viewerRole === 'STUDENT' && viewerId ? lesson.attendance[viewerId] : undefined

  return (
    <li className="rounded-xl border p-4" style={{ borderColor: 'var(--paper-3)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
            {new Date(lesson.lessonDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <h3 className="text-[17px] leading-tight text-[color:var(--narra)] font-semibold mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>{lesson.title}</h3>
          {lesson.description && (
            <p className="text-[13px] text-[color:var(--ink)] mt-1 whitespace-pre-line">{lesson.description}</p>
          )}
          <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-2">
            {viewerRole === 'STUDENT' ? (
              <>
                Your attendance: <span className="font-semibold">{myAttendance ?? 'Not recorded'}</span>
                {typeof myGrade === 'number' && lesson.gradeTotal && <> · Your grade: <span className="font-semibold">{myGrade}/{lesson.gradeTotal}</span></>}
                {lesson.hasStudentOutput && <> · Student output collected</>}
              </>
            ) : (
              <>
                {presentIds.length}/{roster.length} present
                {lesson.gradeTotal && <> · Graded out of {lesson.gradeTotal}</>}
                {lesson.hasStudentOutput && <> · Outputs collected</>}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn-secondary text-xs" onClick={onEdit}>{canEdit ? 'Edit' : 'View'}</button>
          {canEdit && <button className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </li>
  )
}

function LessonEditor({ klass, roster, existing, onClose, onSaved, isStudent }: {
  klass: ClassRecord
  roster: StoredUser[]
  existing: LessonRecord | null
  onClose: () => void
  onSaved: () => void | Promise<void>
  isStudent: boolean
}) {
  const [lessonDate, setLessonDate] = useState(existing ? existing.lessonDate.slice(0, 10) : '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(existing?.attendance ?? {})
  const [hasOutput, setHasOutput] = useState(!!existing?.hasStudentOutput)
  const [gradeTotal, setGradeTotal] = useState<string>(existing?.gradeTotal != null ? String(existing.gradeTotal) : '')
  const [grades, setGrades] = useState<Record<string, { score: number; makeupDate?: string }>>(existing?.grades ?? {})
  const [attachments, setAttachments] = useState<LessonAttachmentMeta[]>([])
  const [outputs, setOutputs] = useState<LessonOutputMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(existing?.id ?? null)

  useEffect(() => {
    if (!existing) return
    void (async () => {
      const d = await fetchLessonDetail(existing.id)
      if (d) { setAttachments(d.attachments); setOutputs(d.outputs) }
    })()
  }, [existing])

  function setStatus(studentId: string, s: AttendanceStatus) {
    setAttendance(prev => ({ ...prev, [studentId]: s }))
  }
  function setGrade(studentId: string, score: number) {
    setGrades(prev => ({ ...prev, [studentId]: { ...prev[studentId], score } }))
  }
  function setMakeup(studentId: string, makeupDate: string) {
    setGrades(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? { score: 0 }), makeupDate } }))
  }

  async function save() {
    setErr(null)
    if (!title.trim()) { setErr('Title is required.'); return }
    if (!lessonDate) { setErr('Lesson date is required.'); return }
    setBusy(true)
    try {
      const payload = {
        lessonDate: new Date(lessonDate + 'T00:00:00').toISOString(),
        title: title.trim(),
        description: description.trim() || null,
        attendance,
        hasStudentOutput: hasOutput,
        gradeTotal: gradeTotal.trim() ? Number(gradeTotal) : null,
        grades,
      }
      const saved = existing
        ? await updateLesson(existing.id, payload)
        : await createLesson(klass.id, payload)
      if (!saved) { setErr('Could not save. Retry?'); return }
      setLessonId(saved.id)
      await onSaved()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    e.target.value = ''
    if (!files || !lessonId) return
    for (const f of Array.from(files)) {
      const att = await uploadLessonAttachment(lessonId, f)
      if (att) setAttachments(prev => [...prev, att])
    }
  }

  async function handleAttachmentDelete(att: LessonAttachmentMeta) {
    if (!lessonId) return
    if (!confirm(`Delete attachment "${att.fileName}"?`)) return
    const ok = await deleteLessonAttachment(lessonId, att.id)
    if (ok) setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  async function openAttachment(att: LessonAttachmentMeta) {
    if (!lessonId) return
    const blob = await fetchLessonAttachmentBlob(lessonId, att.id)
    if (!blob) { alert('Could not open file.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function uploadOutput(studentId: string, file: File, makeupDate?: string) {
    if (!lessonId) return
    const meta = await uploadLessonOutput(lessonId, studentId, file, makeupDate)
    if (!meta) { alert('Could not upload output.'); return }
    setOutputs(prev => {
      const others = prev.filter(o => o.studentId !== studentId)
      return [...others, meta]
    })
  }

  async function viewOutput(studentId: string) {
    if (!lessonId) return
    const blob = await fetchLessonOutputBlob(lessonId, studentId)
    if (!blob) { alert('No output available.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const presentIds = roster.filter(s => attendance[s.id] === 'PRESENT').map(s => s.id)
  const absentIds  = roster.filter(s => attendance[s.id] === 'ABSENT').map(s => s.id)
  const editable = !isStudent

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-4" onClick={onClose}>
      <div className="max-w-3xl mx-auto my-4 card-static" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              {existing ? 'Edit lesson' : 'Add day’s lesson'}
            </div>
            <h2 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">{title || 'New lesson'}</h2>
          </div>
          <button className="btn-secondary text-xs" onClick={onClose}>Close</button>
        </div>

        {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

        <Section title="Details">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Date</span>
              <input type="date" className="input" value={lessonDate} onChange={e => setLessonDate(e.target.value)} disabled={!editable} />
              <span className="text-[10.5px] text-[color:var(--mid-gray)]">Schedule: {CLASS_DAY_OPTIONS.filter(o => klass.scheduleDays.includes(o.value)).map(o => o.short).join(', ') || '—'}</span>
            </label>
            <label className="block">
              <span className="label">Title</span>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Place values" disabled={!editable} />
            </label>
          </div>
          <label className="block mt-3">
            <span className="label">Description</span>
            <textarea className="input" rows={3} value={description ?? ''} onChange={e => setDescription(e.target.value)} disabled={!editable} />
          </label>
        </Section>

        {lessonId && (
          <Section title="Attachments (PDF / Word / Excel — multiple allowed)">
            {editable && (
              <label className="btn-secondary text-xs cursor-pointer inline-block">
                + Add files
                <input type="file" className="sr-only" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleAttachmentUpload} />
              </label>
            )}
            {attachments.length === 0 ? (
              <p className="text-sm text-[color:var(--mid-gray)] py-2">No attachments yet.</p>
            ) : (
              <ul className="space-y-1.5 mt-2">
                {attachments.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate"><span className="font-semibold text-[color:var(--narra)]">{a.fileName}</span> <span className="text-[color:var(--mid-gray)] text-[11px]">· {(a.fileSize / 1024).toFixed(0)} KB</span></span>
                    <div className="flex gap-1.5 shrink-0">
                      <button className="text-[10.5px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--paper-3)' }} onClick={() => openAttachment(a)}>View</button>
                      {editable && <button className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={() => handleAttachmentDelete(a)}>Delete</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {!isStudent && (
          <Section title="Attendance">
            <ul className="space-y-1.5">
              {roster.map(s => {
                const v = attendance[s.id]
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" disabled={!editable} className={`text-[11px] px-2 py-0.5 rounded ${v === 'PRESENT' ? 'bg-[color:var(--moss)] text-white' : 'border text-[color:var(--moss)]'}`} style={{ borderColor: v === 'PRESENT' ? 'transparent' : 'var(--paper-3)' }} onClick={() => setStatus(s.id, 'PRESENT')}>Present</button>
                      <button type="button" disabled={!editable} className={`text-[11px] px-2 py-0.5 rounded ${v === 'ABSENT' ? 'bg-[color:var(--clay)] text-white' : 'border text-[color:var(--clay)]'}`} style={{ borderColor: v === 'ABSENT' ? 'transparent' : 'var(--paper-3)' }} onClick={() => setStatus(s.id, 'ABSENT')}>Absent</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        {!isStudent && lessonId && (
          <Section title="Student output">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasOutput} onChange={e => setHasOutput(e.target.checked)} disabled={!editable} />
              Has student output? (upload one photo per student)
            </label>
            {hasOutput && (
              <ul className="space-y-2 mt-3">
                {presentIds.map(sid => <OutputRow key={sid} student={roster.find(s => s.id === sid)!} output={outputs.find(o => o.studentId === sid)} onUpload={uploadOutput} onView={() => viewOutput(sid)} editable={editable} />)}
                {absentIds.length > 0 && (
                  <li className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
                    <div className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Absent students — makeup uploads</div>
                    {absentIds.map(sid => <OutputRow key={sid} student={roster.find(s => s.id === sid)!} output={outputs.find(o => o.studentId === sid)} onUpload={uploadOutput} onView={() => viewOutput(sid)} editable={editable} requireMakeup />)}
                  </li>
                )}
              </ul>
            )}
          </Section>
        )}

        {!isStudent && (
          <Section title="Grade">
            <label className="block max-w-[160px]">
              <span className="label">Total points</span>
              <input type="number" className="input" value={gradeTotal} onChange={e => setGradeTotal(e.target.value)} placeholder="e.g. 100" disabled={!editable} />
            </label>
            {gradeTotal.trim() && (
              <ul className="space-y-1.5 mt-3">
                {presentIds.map(sid => {
                  const s = roster.find(r => r.id === sid)!
                  const g = grades[sid]
                  return (
                    <li key={sid} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <input type="number" min={0} max={Number(gradeTotal)} className="input" style={{ width: 80 }} value={g?.score ?? ''} onChange={e => setGrade(sid, Number(e.target.value))} disabled={!editable} />
                        <span className="text-[11.5px] text-[color:var(--mid-gray)]">/ {gradeTotal}</span>
                      </span>
                    </li>
                  )
                })}
                {absentIds.length > 0 && (
                  <li className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
                    <div className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Absent students — makeup grade</div>
                    {absentIds.map(sid => {
                      const s = roster.find(r => r.id === sid)!
                      const g = grades[sid]
                      return (
                        <div key={sid} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-sm py-0.5">
                          <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
                          <input type="date" className="input" style={{ width: 150 }} value={g?.makeupDate ?? ''} onChange={e => setMakeup(sid, e.target.value)} disabled={!editable} />
                          <span className="flex items-center gap-1">
                            <input type="number" min={0} max={Number(gradeTotal)} className="input" style={{ width: 80 }} value={g?.score ?? ''} onChange={e => setGrade(sid, Number(e.target.value))} disabled={!editable} />
                            <span className="text-[11.5px] text-[color:var(--mid-gray)]">/ {gradeTotal}</span>
                          </span>
                        </div>
                      )
                    })}
                  </li>
                )}
              </ul>
            )}
          </Section>
        )}

        {editable && (
          <div className="flex gap-2 justify-end mt-4 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
            <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary text-xs" onClick={save} disabled={busy}>{busy ? 'Saving…' : (existing ? 'Save changes' : 'Create lesson')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 pt-4 border-t first:border-t-0 first:mt-0 first:pt-0" style={{ borderColor: 'var(--paper-3)' }}>
      <h3 className="text-[13px] font-bold uppercase tracking-[0.10em] text-[color:var(--bright-teal)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      {children}
    </div>
  )
}

function OutputRow({ student, output, onUpload, onView, editable, requireMakeup }: {
  student: StoredUser
  output?: LessonOutputMeta
  onUpload: (studentId: string, file: File, makeupDate?: string) => void | Promise<void>
  onView: () => void
  editable: boolean
  requireMakeup?: boolean
}) {
  const [makeupDate, setMakeupDate] = useState(output?.makeupDate ? output.makeupDate.slice(0, 10) : '')
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    void onUpload(student.id, f, requireMakeup ? makeupDate : undefined)
  }
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm">
      <div className="min-w-0">
        <div className="truncate font-semibold text-[color:var(--narra)]">{[student.firstName, student.lastName].filter(Boolean).join(' ') || student.email}</div>
        <div className="text-[11px] text-[color:var(--mid-gray)] truncate">
          {output ? <>Uploaded {new Date(output.updatedAt).toLocaleDateString()}{output.makeupDate ? ` · makeup ${new Date(output.makeupDate).toLocaleDateString()}` : ''}</> : 'No output yet'}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {requireMakeup && editable && (
          <input type="date" className="input" style={{ width: 140 }} value={makeupDate} onChange={e => setMakeupDate(e.target.value)} title="Makeup date" />
        )}
        {output && <button className="text-[10.5px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--paper-3)' }} onClick={onView}>View</button>}
        {editable && (
          <label className="btn-secondary text-[10.5px] cursor-pointer">
            {output ? 'Replace' : 'Upload'}
            <input type="file" className="sr-only" accept="image/*,.pdf" onChange={pick} />
          </label>
        )}
      </div>
    </div>
  )
}
