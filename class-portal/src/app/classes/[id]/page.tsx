'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getAuth, hydrateUsers, getUsers, fetchClassPhotoBlob,
  updateClass,
  listLessons, createLesson, updateLesson, deleteLesson, fetchLessonDetail,
  uploadLessonAttachment, deleteLessonAttachment, fetchLessonAttachmentBlob,
  uploadLessonOutput, fetchLessonOutputBlob,
  listLessonTests, createLessonTest, updateLessonTest, deleteLessonTest,
  uploadTestProof, fetchTestProofBlob,
  listProjects, createProject, updateProject, deleteProject,
  uploadProjectProof, fetchProjectProofBlob,
  listActivities, createActivity, updateActivity, deleteActivity,
  uploadActivityPhoto, deleteActivityPhoto, fetchActivityPhotoBlob,
  ACTIVITY_TYPE_SUGGESTIONS,
  getAssignments, hydrateAssignments,
  levelLabel, branchLabel, CLASS_DAY_OPTIONS,
  type AuthSession, type StoredUser,
  type ClassRecord, type LessonRecord, type LessonAttachmentMeta, type LessonOutputMeta,
  type AttendanceStatus, type LessonTestRecord, type ProjectRecord, type ActivityRecord, type ActivityPhotoMeta,
  type ClassDay,
} from '@/lib/session'
import { backendJson } from '@/lib/backend'
import { Portal } from '@/components/Modal'

/**
 * Open a blob in a new browser tab in a way that survives popup
 * blockers. window.open() is blocked across every modern browser
 * once the JS execution has yielded — symptom: user clicks View,
 * fetch resolves, nothing visible happens. We open a blank tab
 * synchronously inside the click handler (still inside the user
 * gesture), then redirect that tab to the blob URL once the fetch
 * resolves.
 *
 * Do NOT pass `noopener` to the pre-open: per the HTML spec, the
 * `noopener` feature forces window.open() to return `null`, which
 * means we lose the handle and can't redirect — the empty tab stays
 * open and a separate fallback anchor opens *another* tab, so the
 * user ends up with two windows. Same origin only, and we null out
 * `win.opener` after the redirect to harden it.
 */
function openBlobInNewTab(getBlob: () => Promise<Blob | null>, missingMsg = 'Could not open file.') {
  if (typeof window === 'undefined') return
  const win = window.open('', '_blank')
  void getBlob().then(blob => {
    if (!blob) {
      if (win && !win.closed) { try { win.close() } catch { /* ignore */ } }
      alert(missingMsg)
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
  }).catch(() => {
    if (win && !win.closed) { try { win.close() } catch { /* ignore */ } }
    alert(missingMsg)
  })
}

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
        // Pull the assignments matrix so the teacher-name resolver
        // below can fall back to (branch × level → teacher) when the
        // class itself doesn't have a `teacherId` set.
        hydrateAssignments().catch(() => null),
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

  // Teacher-name resolution. Falls through in this order:
  //   1. Server-supplied `klass.teacherName` (works for every viewer
  //      role — students included — because the server resolves the
  //      name regardless of the caller's user-list scope).
  //   2. If the viewer IS the teacher → own auth row (still useful
  //      when the server didn't populate teacherName, e.g. legacy
  //      payloads from cache before this deploy).
  //   3. Look up the explicit teacherId in `teachers` (admin caller).
  //   4. Fall back to the Assignments matrix on the client (admin).
  //   5. Last resort: em-dash.
  const teacherName = (() => {
    if (klass.teacherName) return klass.teacherName
    const tid = klass.teacherId
    if (tid && auth && auth.userId === tid) {
      return [auth.firstName].filter(Boolean).join(' ') || auth.email
    }
    if (tid) {
      const t = teachers.find(x => x.id === tid)
      if (t) return [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email
    }
    const a = getAssignments().find(x => x.branch === klass.branch && x.level === klass.level)
    if (a) {
      if (auth && auth.userId === a.teacherId) {
        return [auth.firstName].filter(Boolean).join(' ') || auth.email
      }
      const t = teachers.find(x => x.id === a.teacherId)
      if (t) return [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email
    }
    return '—'
  })()

  // KPI numbers shown in the dashboard. Avg attendance is a weighted
  // average across every roster × lesson cell that's been marked —
  // un-marked cells are excluded so a lesson with no attendance taken
  // doesn't drag the percentage to 0. If nothing's been graded yet,
  // we render "—" instead of 0% so the empty state is honest.
  let presentTotal = 0
  let markedTotal = 0
  for (const l of lessons) {
    for (const s of roster) {
      const status = l.attendance[s.id]
      if (status === 'PRESENT') presentTotal += 1
      if (status === 'PRESENT' || status === 'ABSENT') markedTotal += 1
    }
  }
  const avgAttendancePct = markedTotal > 0 ? Math.round((presentTotal / markedTotal) * 100) : null

  return (
    <div
      className="animate-fade-up"
      style={{
        width: '100vw',
        maxWidth: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
      }}
    >
      <div className="px-3 sm:px-5 max-w-7xl mx-auto space-y-4">

      {/* ── Top row: 2/3 class-overview card (cover + meta + roster) +
          1/3 KPI strip (classes completed · students · avg attendance).
          Stacks vertically on < lg so mobile still reads cleanly. ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* LEFT — overview card */}
        <div className="lg:col-span-2 card-static p-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row">
            {/* Cover thumbnail — much smaller than the old hero strip
                (200px wide on sm+, full-width on xs) so the meta + roster
                can sit beside it without the photo dominating. */}
            <div className="bg-[color:var(--paper-2)] relative w-full sm:w-[200px] aspect-[16/10] sm:aspect-auto sm:min-h-[140px] shrink-0">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={klass.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[color:var(--mid-gray)] text-[11.5px]" style={{ fontFamily: 'var(--font-display)' }}>No cover photo</div>
              )}
            </div>
            <div className="px-4 py-3 sm:py-3.5 flex-1 min-w-0">
              <button className="btn-secondary text-[11px] mb-2" onClick={() => router.push('/classes')}>← All classes</button>
              <ClassMetaEditor
                klass={klass}
                canEdit={canEdit}
                teacherName={teacherName}
                onUpdated={(k) => { setKlass(k); void load() }}
              />
            </div>
          </div>

          {/* Student roster — collapsible on tall pages, scroll-locked
              above ~8 students so the card never grows past ~280px tall. */}
          <div className="border-t px-4 py-3" style={{ borderColor: 'var(--paper-3)' }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.10em] text-[color:var(--bright-teal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Students ({roster.length})
            </div>
            {roster.length === 0 ? (
              <p className="text-[12.5px] text-[color:var(--mid-gray)] py-1">No students enrolled yet.</p>
            ) : (
              <ul className="space-y-0.5 text-[13px] max-h-[180px] overflow-y-auto pr-1">
                {roster.map(s => (
                  <li key={s.id} className="flex items-center gap-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moss)] shrink-0" />
                    <span className="truncate font-medium text-[color:var(--narra)]">
                      {[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT — KPI strip. Stacks into a 3-col row on phones to stay
            compact; switches to a single column on lg+ to align with
            the taller overview card on its left. */}
        <div className="card-static p-3 sm:p-4 grid grid-cols-3 lg:grid-cols-1 gap-3 lg:gap-4">
          <KpiTile
            label="Classes completed"
            value={lessons.length}
            hint={lessons.length === 1 ? 'day’s lesson logged' : 'day’s lessons logged'}
          />
          <KpiTile
            label="Students"
            value={roster.length}
            hint={roster.length === 1 ? 'enrolled' : 'enrolled'}
          />
          <KpiTile
            label="Avg attendance"
            value={avgAttendancePct === null ? '—' : `${avgAttendancePct}%`}
            hint={avgAttendancePct === null ? 'no attendance yet' : 'across all lessons'}
          />
        </div>
      </div>

      {err && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

      {/* ── Lower section: 2-column dashboard ──────────────────────
            LEFT (3/5 on lg)  — Day's lessons widget. Scroll-locked
                                so a 42-week / ~84-lesson list never
                                pushes the right column off-screen.
            RIGHT (2/5)       — Projects (top) and Activities (below)
                                stacked. Compact card chrome to match
                                the 21st.dev clean-dashboard look. */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* LEFT — Day's lessons */}
        <section className="lg:col-span-3 card-static p-0 flex flex-col overflow-hidden">
          <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b flex items-start justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--paper-3)' }}>
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
                Day&apos;s lessons
              </div>
              <div className="text-[12px] text-[color:var(--mid-gray)] mt-0.5">
                {canEdit ? 'Add a lesson, take attendance, mark grades, collect proofs.' : 'Posted lessons appear here.'}
                <span className="ml-1 text-[color:var(--moss)] font-semibold">{lessons.length}</span>
              </div>
            </div>
            {canEdit && (
              <button className="btn-primary text-[11px] shrink-0" onClick={() => setEditingLesson('new')}>+ Add Day&apos;s Lesson</button>
            )}
          </div>

          {/* Scrollable feed — capped at ~70vh so the right column's
              cards stay reachable even on a packed semester. */}
          <div className="overflow-y-auto px-3 py-3 sm:px-4" style={{ maxHeight: '70vh' }}>
            {busy && lessons.length === 0 ? (
              <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
            ) : lessons.length === 0 ? (
              <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">
                {canEdit ? 'No lessons yet. Click + Add Day’s Lesson to create the first one.' : 'No lessons posted yet.'}
              </p>
            ) : (
              <ul className="space-y-2.5">
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
        </section>

        {/* RIGHT — Projects on top, Activities below */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
          <ProjectsSection
            classId={klass.id}
            roster={roster}
            canEdit={canEdit}
            isStudent={isStudent}
            viewerId={auth.userId}
          />
          <ActivitiesSection
            classId={klass.id}
            canEdit={canEdit}
          />
        </div>
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
    </div>
  )
}

/**
 * Compact KPI tile used in the class-detail dashboard sidebar.
 * One number, a short label above, and a one-line caption below.
 * Layout flips between row (mobile, 3 tiles across) and column (lg+)
 * by inheriting the parent grid's alignment.
 */
/**
 * Inline editor for the class header meta (name, section, schedule
 * days, start/end times). Read-only by default; admins and the
 * teacher of record can click "Edit" to toggle to inputs. Save calls
 * `updateClass()` and bubbles the fresh record up via `onUpdated`.
 *
 * Branch + level are deliberately NOT editable here — those carry
 * downstream implications (assignment-matrix scoping, student
 * filtering) and should remain locked to whatever was set at create
 * time. To change branch/level, delete the class and recreate.
 */
function ClassMetaEditor({ klass, canEdit, teacherName, onUpdated }: {
  klass: ClassRecord
  canEdit: boolean
  teacherName: string
  onUpdated: (next: ClassRecord) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(klass.name)
  const [section, setSection] = useState(klass.section ?? '')
  const [days, setDays] = useState<ClassDay[]>(klass.scheduleDays)
  const [startTime, setStartTime] = useState(klass.scheduleStartTime ?? '')
  const [endTime, setEndTime] = useState(klass.scheduleEndTime ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Re-seed state when the parent klass prop refreshes (e.g. another
  // tab edited the same class). Without this the form would keep its
  // stale draft after an external update.
  useEffect(() => {
    if (editing) return
    setName(klass.name)
    setSection(klass.section ?? '')
    setDays(klass.scheduleDays)
    setStartTime(klass.scheduleStartTime ?? '')
    setEndTime(klass.scheduleEndTime ?? '')
  }, [klass.id, klass.name, klass.section, klass.scheduleDays, klass.scheduleStartTime, klass.scheduleEndTime, editing])

  function toggleDay(d: ClassDay) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function save() {
    setErr(null)
    if (!name.trim()) { setErr('Class name is required.'); return }
    setBusy(true)
    try {
      const updated = await updateClass(klass.id, {
        name: name.trim(),
        section: section.trim() || null,
        scheduleDays: days,
        scheduleStartTime: startTime || null,
        scheduleEndTime: endTime || null,
      })
      if (!updated) { setErr('Could not save. Retry?'); return }
      onUpdated(updated)
      setEditing(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setName(klass.name)
    setSection(klass.section ?? '')
    setDays(klass.scheduleDays)
    setStartTime(klass.scheduleStartTime ?? '')
    setEndTime(klass.scheduleEndTime ?? '')
    setErr(null)
    setEditing(false)
  }

  const dayShorts = CLASS_DAY_OPTIONS.filter(o => klass.scheduleDays.includes(o.value)).map(o => o.short).join(', ')
  const time = klass.scheduleStartTime && klass.scheduleEndTime ? `${klass.scheduleStartTime}–${klass.scheduleEndTime}` : null

  if (!editing) {
    return (
      <>
        <div className="flex items-start gap-2 flex-wrap">
          <h1 className="text-[20px] leading-tight text-[color:var(--deep-teal)] min-w-0">
            {klass.name}{klass.section ? <span className="text-[color:var(--mid-gray)] font-normal"> · {klass.section}</span> : null}
          </h1>
          {canEdit && (
            <button
              type="button"
              className="text-[10.5px] px-2 py-0.5 rounded border text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] mt-1"
              style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}
              onClick={() => setEditing(true)}
            >Edit</button>
          )}
        </div>
        <p className="text-[12px] text-[color:var(--mid-gray)] mt-1 leading-relaxed">
          {levelLabel(klass.level)} · {branchLabel(klass.branch)}<br/>
          Teacher: <span className="font-semibold text-[color:var(--narra)]">{teacherName}</span><br/>
          Schedule: {dayShorts || '—'}{time ? ` · ${time}` : ''}
        </p>
      </>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.10em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
        Editing class
      </div>
      {err && <div className="px-3 py-1.5 rounded bg-rose-50 border border-rose-100 text-[12px] text-rose-800">{err}</div>}
      <div className="grid sm:grid-cols-[1fr_140px] gap-2">
        <label className="block">
          <span className="label text-[10.5px]">Class name</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Math A" disabled={busy} />
        </label>
        <label className="block">
          <span className="label text-[10.5px]">Section</span>
          <input className="input" value={section} onChange={e => setSection(e.target.value)} placeholder="(optional)" disabled={busy} />
        </label>
      </div>
      <div>
        <span className="label text-[10.5px]">Days</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {CLASS_DAY_OPTIONS.map(d => {
            const on = days.includes(d.value)
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                disabled={busy}
                className="text-[11px] px-2 py-1 rounded border transition-colors"
                style={{
                  borderColor: on ? 'var(--moss)' : 'var(--paper-3)',
                  background: on ? 'var(--paper-2)' : 'transparent',
                  color: on ? 'var(--moss)' : 'var(--mid-gray)',
                  fontFamily: 'var(--font-display)',
                }}
              >{d.short}</button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label text-[10.5px]">Start</span>
          <input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={busy} />
        </label>
        <label className="block">
          <span className="label text-[10.5px]">End</span>
          <input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={busy} />
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-primary text-[11px]" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-secondary text-[11px]" onClick={cancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

function KpiTile({ label, value, hint }: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-xl border bg-[color:var(--paper)] px-3 py-2.5" style={{ borderColor: 'var(--paper-3)' }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.10em] text-[color:var(--bright-teal)] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
        {label}
      </div>
      <div className="text-[26px] sm:text-[28px] leading-none font-semibold text-[color:var(--deep-teal)] mt-1.5" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      {hint && (
        <div className="text-[10.5px] text-[color:var(--mid-gray)] mt-1">{hint}</div>
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
  // Per-student proof files picked before the lesson row exists on
  // the server. Flushed in save() after createLesson, then cleared.
  const [pendingOutputs, setPendingOutputs] = useState<Record<string, File>>({})
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
        // Anchor at noon UTC so the calendar date round-trips identically no
        // matter the browser timezone. Sending `T00:00:00` (local) would shift
        // to the previous day when serialized via toISOString() east of UTC,
        // and break the server's day-of-week schedule check.
        lessonDate: `${lessonDate}T12:00:00.000Z`,
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
      // Flush any proof files the teacher picked before the lesson
      // had a server-side row. Each upload is independent — collect
      // failures, surface a count, and clear the queue regardless so
      // a second Save doesn't re-upload duplicates.
      const entries = Object.entries(pendingOutputs)
      if (entries.length) {
        const uploaded: LessonOutputMeta[] = []
        let failed = 0
        for (const [sid, file] of entries) {
          const meta = await uploadLessonOutput(saved.id, sid, file, grades[sid]?.makeupDate)
          if (meta) uploaded.push(meta); else failed += 1
        }
        if (uploaded.length) {
          setOutputs(prev => {
            const others = prev.filter(o => !uploaded.some(u => u.studentId === o.studentId))
            return [...others, ...uploaded]
          })
        }
        setPendingOutputs({})
        if (failed > 0) setErr(`${failed} proof upload${failed === 1 ? '' : 's'} failed. Re-pick from the row to retry.`)
      }
      await onSaved()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Snapshot before clearing — `e.target.files` is a live FileList,
    // so reading it after `value=''` returns nothing. See ActivityEditor
    // handleUpload for the full explanation.
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (picked.length === 0 || !lessonId) return
    for (const f of picked) {
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

  function openAttachment(att: LessonAttachmentMeta) {
    if (!lessonId) return
    // Sync wrapper so the window.open call happens inside the click
    // event (see openBlobInNewTab comment for why this matters).
    openBlobInNewTab(() => fetchLessonAttachmentBlob(lessonId, att.id), 'Could not open file.')
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

  // ProofPicker pick handler. If the lesson already exists, upload
  // straight away; otherwise queue the file so we can flush it after
  // the lesson row is created in save().
  function queueOrUploadProof(studentId: string, file: File, makeupDate?: string) {
    if (lessonId) {
      void uploadOutput(studentId, file, makeupDate)
    } else {
      setPendingOutputs(prev => ({ ...prev, [studentId]: file }))
    }
  }

  function viewOutput(studentId: string) {
    if (!lessonId) return
    openBlobInNewTab(() => fetchLessonOutputBlob(lessonId, studentId), 'No output available.')
  }

  const presentIds = roster.filter(s => attendance[s.id] === 'PRESENT').map(s => s.id)
  const absentIds  = roster.filter(s => attendance[s.id] === 'ABSENT').map(s => s.id)
  const editable = !isStudent

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-4" onClick={onClose}>
      <div className="max-w-6xl mx-auto my-2 sm:my-4 card-static min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
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

        {!isStudent && (
          <Section title="Class output / test">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasOutput} onChange={e => setHasOutput(e.target.checked)} disabled={!editable} />
              Has class output / test?
            </label>
            <p className="text-[12px] text-[color:var(--mid-gray)] mt-1">
              Tick this if today&apos;s lesson produced a graded output or test. You can set a total score and grade each student below; optional per-student file uploads appear once the lesson is saved.
            </p>
            {hasOutput && (
              <>
                {/* One unified grade row per student:
                      [Student name]   [score input]/[total]   [Proof file button]
                    Total points input lives at the top of the section, so
                    every row uses the same "/ X" denominator. Proof upload
                    is disabled (with a "Save lesson first" tooltip) until
                    the lesson row exists on the server — that's the only
                    point at which the upload endpoint can attach blobs.
                    Absent students render below with an extra makeup-date
                    input on the same line. */}
                <div className="mt-4">
                  <label className="block max-w-[160px]">
                    <span className="label">Total points</span>
                    <input type="number" className="input" value={gradeTotal} onChange={e => setGradeTotal(e.target.value)} placeholder="e.g. 100" disabled={!editable} />
                  </label>
                  {/* Student rows render immediately on tick, even
                      before Total points is filled. The score input
                      uses `gradeTotal` as max when set, otherwise
                      leaves it open. This way the teacher sees the
                      full roster the moment they confirm there's a
                      graded output, without having to remember to
                      type a number first. */}
                  <ul className="space-y-1.5 mt-3">
                      {presentIds.map(sid => {
                        const s = roster.find(r => r.id === sid)!
                        const g = grades[sid]
                        const out = outputs.find(o => o.studentId === sid)
                        const pending = pendingOutputs[sid]
                        return (
                          <li key={sid} className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm">
                            <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <input type="number" min={0} max={gradeTotal.trim() ? Number(gradeTotal) : undefined} className="input" style={{ width: 80 }} value={g?.score ?? ''} onChange={e => setGrade(sid, Number(e.target.value))} disabled={!editable} />
                              <span className="text-[11.5px] text-[color:var(--mid-gray)]">/ {gradeTotal || '—'}</span>
                              {editable && (
                                <ProofPicker
                                  hasUpload={!!out || !!pending}
                                  disabledHint={null}
                                  onPick={(f) => queueOrUploadProof(sid, f)}
                                />
                              )}
                              {pending && (
                                <span
                                  className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                                  title={`Will upload "${pending.name}" when you save the lesson.`}
                                >Pending</span>
                              )}
                              {out && lessonId && <button type="button" className="text-[10.5px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--paper-3)' }} onClick={() => viewOutput(sid)}>View</button>}
                            </span>
                          </li>
                        )
                      })}
                      {absentIds.length > 0 && (
                        <li className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
                          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Absent students — makeup grade + proof</div>
                          {absentIds.map(sid => {
                            const s = roster.find(r => r.id === sid)!
                            const g = grades[sid]
                            const out = outputs.find(o => o.studentId === sid)
                            const pending = pendingOutputs[sid]
                            return (
                              <div key={sid} className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm py-0.5">
                                <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
                                <span className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                  <input type="date" className="input" style={{ width: 140 }} value={g?.makeupDate ?? ''} onChange={e => setMakeup(sid, e.target.value)} disabled={!editable} title="Makeup date" />
                                  <input type="number" min={0} max={gradeTotal.trim() ? Number(gradeTotal) : undefined} className="input" style={{ width: 80 }} value={g?.score ?? ''} onChange={e => setGrade(sid, Number(e.target.value))} disabled={!editable} />
                                  <span className="text-[11.5px] text-[color:var(--mid-gray)]">/ {gradeTotal || '—'}</span>
                                  {editable && (
                                    <ProofPicker
                                      hasUpload={!!out || !!pending}
                                      disabledHint={null}
                                      onPick={(f) => queueOrUploadProof(sid, f, g?.makeupDate)}
                                    />
                                  )}
                                  {pending && (
                                    <span
                                      className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                                      title={`Will upload "${pending.name}" when you save the lesson.`}
                                    >Pending</span>
                                  )}
                                  {out && lessonId && <button type="button" className="text-[10.5px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--paper-3)' }} onClick={() => viewOutput(sid)}>View</button>}
                                </span>
                              </div>
                            )
                          })}
                        </li>
                      )}
                    </ul>
                </div>

                {/* OutputRow component is still used by older code paths
                    (e.g. read-only student-side rendering elsewhere); the
                    inline ProofPicker above replaces it for the teacher's
                    Add Lesson flow specifically. */}
              </>
            )}
          </Section>
        )}

        {lessonId && (
          <TestsSection lessonId={lessonId} roster={roster} canEdit={editable} viewerRole={isStudent ? 'STUDENT' : 'STAFF'} attendance={attendance} />
        )}

        {editable && (
          <div className="flex gap-2 justify-end mt-4 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
            <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary text-xs" onClick={save} disabled={busy}>{busy ? 'Saving…' : (existing ? 'Save changes' : 'Create lesson')}</button>
          </div>
        )}
      </div>
    </div>
    </Portal>
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

/**
 * Inline "Proof" button used by the unified grade-row in the Add
 * Lesson modal. Renders:
 *   • "Replace" if a proof has already been uploaded
 *   • "Proof"   if nothing yet
 *   • Disabled "Proof" with hint tooltip when no lessonId yet
 * The actual upload action lives in the parent — this is presentation +
 * file picker only.
 */
function ProofPicker({ hasUpload, disabledHint, onPick }: {
  hasUpload: boolean
  disabledHint: string | null
  onPick: (file: File) => void
}) {
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onPick(f)
  }
  if (disabledHint) {
    return (
      <span
        className="btn-secondary text-[10.5px] inline-flex items-center opacity-50 cursor-not-allowed"
        title={disabledHint}
        style={{ width: 'auto' }}
      >
        Proof
      </span>
    )
  }
  return (
    <label className="btn-secondary text-[10.5px] cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
      {hasUpload ? 'Replace' : 'Proof'}
      <input type="file" className="sr-only" accept="image/*,.pdf" onChange={handle} />
    </label>
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

/* ────────────────────────  TESTS  ──────────────────────── */

function TestsSection({ lessonId, roster, canEdit, viewerRole, attendance }: {
  lessonId: string
  roster: StoredUser[]
  canEdit: boolean
  viewerRole: 'STUDENT' | 'STAFF'
  attendance: Record<string, AttendanceStatus>
}) {
  const [tests, setTests] = useState<LessonTestRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPoints, setNewPoints] = useState('')

  async function load() {
    setBusy(true)
    try { setTests(await listLessonTests(lessonId)) } finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [lessonId])

  async function add() {
    if (!newTitle.trim() || !newPoints.trim()) return
    const t = await createLessonTest(lessonId, { title: newTitle.trim(), totalPoints: Number(newPoints) })
    if (t) { setTests(prev => [...prev, t]); setNewTitle(''); setNewPoints(''); setAdding(false) }
  }

  return (
    <Section title="Tests / Exams">
      {canEdit && !adding && (
        <button className="btn-secondary text-xs" onClick={() => setAdding(true)}>+ Add test / exam</button>
      )}
      {adding && (
        <div className="rounded-xl border p-3 mt-2 space-y-2" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
          <div className="grid sm:grid-cols-[1fr_120px] gap-2">
            <input className="input" placeholder="Test / exam title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <input className="input" type="number" placeholder="Total pts" value={newPoints} onChange={e => setNewPoints(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary text-xs" onClick={() => { setAdding(false); setNewTitle(''); setNewPoints('') }}>Cancel</button>
            <button className="btn-primary text-xs" onClick={add}>Add</button>
          </div>
        </div>
      )}
      {busy && tests.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] py-3">Loading tests…</p>
      ) : tests.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] py-3">No tests yet.</p>
      ) : (
        <ul className="space-y-3 mt-3">
          {tests.map(t => (
            <TestCard
              key={t.id}
              test={t}
              roster={roster}
              attendance={attendance}
              canEdit={canEdit}
              viewerRole={viewerRole}
              onChange={(updated) => setTests(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDelete={async () => {
                if (!confirm(`Delete "${t.title}"?`)) return
                const ok = await deleteLessonTest(t.id)
                if (ok) setTests(prev => prev.filter(x => x.id !== t.id))
              }}
            />
          ))}
        </ul>
      )}
    </Section>
  )
}

function TestCard({ test, roster, attendance, canEdit, viewerRole, onChange, onDelete }: {
  test: LessonTestRecord
  roster: StoredUser[]
  attendance: Record<string, AttendanceStatus>
  canEdit: boolean
  viewerRole: 'STUDENT' | 'STAFF'
  onChange: (t: LessonTestRecord) => void
  onDelete: () => void
}) {
  const presentIds = roster.filter(s => attendance[s.id] === 'PRESENT').map(s => s.id)
  const absentIds  = roster.filter(s => attendance[s.id] === 'ABSENT').map(s => s.id)
  const [drafts, setDrafts] = useState<Record<string, { score: number; makeupDate?: string }>>(test.scores ?? {})
  useEffect(() => { setDrafts(test.scores ?? {}) }, [test.scores])

  async function saveScores() {
    const updated = await updateLessonTest(test.id, { scores: drafts })
    if (updated) onChange(updated)
  }
  async function uploadProof(studentId: string, file: File) {
    await uploadTestProof(test.id, studentId, file)
  }
  function viewProof(studentId: string) {
    openBlobInNewTab(() => fetchTestProofBlob(test.id, studentId), 'No proof uploaded.')
  }

  return (
    <li className="rounded-xl border p-3" style={{ borderColor: 'var(--paper-3)' }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold text-[color:var(--narra)]">{test.title}</div>
          <div className="text-[11.5px] text-[color:var(--mid-gray)]">Out of {test.totalPoints} points</div>
        </div>
        {canEdit && <button className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={onDelete}>Delete</button>}
      </div>
      <ScoreList
        roster={roster}
        presentIds={presentIds}
        absentIds={absentIds}
        totalPoints={test.totalPoints}
        scores={drafts}
        setScores={setDrafts}
        canEdit={canEdit}
        viewerRole={viewerRole}
        onScoreBlur={saveScores}
        onUploadProof={canEdit ? uploadProof : undefined}
        onViewProof={viewProof}
        labelMakeup="Makeup test"
      />
    </li>
  )
}

/* ────────────────────  SHARED SCORE LIST  ──────────────────── */

function ScoreList({ roster, presentIds, absentIds, totalPoints, scores, setScores, canEdit, viewerRole, onScoreBlur, onUploadProof, onViewProof, labelMakeup }: {
  roster: StoredUser[]
  presentIds: string[]
  absentIds: string[]
  totalPoints: number
  scores: Record<string, { score: number; makeupDate?: string }>
  setScores: (next: Record<string, { score: number; makeupDate?: string }>) => void
  canEdit: boolean
  viewerRole: 'STUDENT' | 'STAFF'
  onScoreBlur: () => void
  onUploadProof?: (studentId: string, file: File) => Promise<void> | void
  onViewProof: (studentId: string) => void
  labelMakeup: string
}) {
  function setScore(id: string, score: number) {
    setScores({ ...scores, [id]: { ...(scores[id] ?? { score: 0 }), score } })
  }
  function setMakeup(id: string, makeupDate: string) {
    setScores({ ...scores, [id]: { ...(scores[id] ?? { score: 0 }), makeupDate } })
  }
  function rowForStudent(s: StoredUser, isAbsent: boolean) {
    if (viewerRole === 'STUDENT') {
      // Student should only ever see their own row when this list is
      // rendered. The caller already filters; nothing extra to do.
    }
    return (
      <div key={s.id} className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm py-1">
        <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAbsent && canEdit && (
            <input type="date" className="input" style={{ width: 140 }} value={scores[s.id]?.makeupDate ?? ''} onChange={e => setMakeup(s.id, e.target.value)} onBlur={onScoreBlur} title={labelMakeup} />
          )}
          <input type="number" min={0} max={totalPoints} className="input" style={{ width: 70 }} value={scores[s.id]?.score ?? ''} onChange={e => setScore(s.id, Number(e.target.value))} onBlur={onScoreBlur} disabled={!canEdit} />
          <span className="text-[11.5px] text-[color:var(--mid-gray)]">/ {totalPoints}</span>
          {onUploadProof && (
            <label className="btn-secondary text-[10.5px] cursor-pointer">
              Proof
              <input type="file" className="sr-only" accept="image/*,.pdf" onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (f) { await onUploadProof(s.id, f) }
              }} />
            </label>
          )}
          <button className="text-[10.5px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--paper-3)' }} onClick={() => onViewProof(s.id)}>View</button>
        </div>
      </div>
    )
  }
  // For a student viewer, render ONLY their own row.
  // The component receives full roster lists from the parent because
  // teachers + admins see everyone; we filter at this seam.
  return (
    <div className="mt-3">
      {presentIds.map(id => roster.find(s => s.id === id)).filter((s): s is StoredUser => !!s).map(s => rowForStudent(s, false))}
      {absentIds.length > 0 && (
        <>
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] font-bold mt-3 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Absent — makeup</div>
          {absentIds.map(id => roster.find(s => s.id === id)).filter((s): s is StoredUser => !!s).map(s => rowForStudent(s, true))}
        </>
      )}
    </div>
  )
}

/* ────────────────────────  PROJECTS  ──────────────────────── */

function ProjectsSection({ classId, roster, canEdit, isStudent, viewerId }: {
  classId: string
  roster: StoredUser[]
  canEdit: boolean
  isStudent: boolean
  viewerId?: string
}) {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [busy, setBusy] = useState(false)
  // `editing` holds the row we're working on; `mode` decides whether the
  // editor opens read-only ("View") or read-write ("Edit"). Splitting the
  // mode out keeps both buttons clickable on the card without having to
  // duplicate the editor instance.
  const [editing, setEditing] = useState<ProjectRecord | 'new' | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit')

  async function load() {
    setBusy(true)
    try { setProjects(await listProjects(classId)) } finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [classId])

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Projects</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            {canEdit ? 'Standalone graded projects with deadlines and per-student proof uploads.' : 'Projects assigned to this class.'}
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary text-xs" onClick={() => { setMode('edit'); setEditing('new') }}>+ Add Project</button>
        )}
      </div>

      {busy && projects.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] py-3">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] py-3">No projects yet.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              viewerIsStudent={isStudent}
              viewerId={viewerId}
              onView={() => { setMode('view'); setEditing(p) }}
              onEdit={() => { setMode('edit'); setEditing(p) }}
              onDelete={async () => {
                if (!confirm(`Delete "${p.title}"?`)) return
                const ok = await deleteProject(p.id)
                if (ok) await load()
              }}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}

      {editing && (
        <ProjectEditor
          classId={classId}
          roster={roster}
          existing={editing === 'new' ? null : editing}
          readOnly={mode === 'view'}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
          viewerIsStudent={isStudent}
          viewerId={viewerId}
        />
      )}
    </div>
  )
}

function ProjectCard({ project, viewerIsStudent, viewerId, onView, onEdit, onDelete, canEdit }: {
  project: ProjectRecord
  viewerIsStudent: boolean
  viewerId?: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
}) {
  const myScore = viewerIsStudent && viewerId ? project.grades[viewerId]?.score : undefined
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: 'var(--paper-3)' }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-[color:var(--narra)]">{project.title}</h3>
          <p className="text-[11.5px] text-[color:var(--mid-gray)]">
            Total: {project.totalScore} pts
            {project.deadline ? ` · Due ${new Date(project.deadline).toLocaleDateString()}` : ''}
            {viewerIsStudent && typeof myScore === 'number' ? ` · Your score: ${myScore}/${project.totalScore}` : ''}
          </p>
          {project.description && <p className="text-[13px] mt-1 whitespace-pre-line">{project.description}</p>}
        </div>
        {/* View is always available so teachers can inspect a project
            without entering edit mode (and accidentally changing grades
            mid-class). Edit + Delete only when the viewer has rights. */}
        <div className="flex gap-1.5 shrink-0">
          <button className="btn-secondary text-xs" onClick={onView}>View</button>
          {canEdit && <button className="btn-secondary text-xs" onClick={onEdit}>Edit</button>}
          {canEdit && <button className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </li>
  )
}

function ProjectEditor({ classId, roster, existing, readOnly, onClose, onSaved, viewerIsStudent, viewerId }: {
  classId: string
  roster: StoredUser[]
  existing: ProjectRecord | null
  readOnly?: boolean
  onClose: () => void
  onSaved: () => void | Promise<void>
  viewerIsStudent: boolean
  viewerId?: string
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [deadline, setDeadline] = useState(existing?.deadline ? existing.deadline.slice(0, 10) : '')
  const [totalScore, setTotalScore] = useState<string>(existing?.totalScore != null ? String(existing.totalScore) : '')
  const [grades, setGrades] = useState<Record<string, { score: number; makeupDate?: string }>>(existing?.grades ?? {})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(existing?.id ?? null)
  // Students never edit; teachers/admins can edit unless the parent
  // opened us in "View" mode (read-only inspection).
  const canEdit = !viewerIsStudent && !readOnly

  function setGrade(id: string, score: number) {
    setGrades({ ...grades, [id]: { ...(grades[id] ?? { score: 0 }), score } })
  }
  function setMakeup(id: string, makeupDate: string) {
    setGrades({ ...grades, [id]: { ...(grades[id] ?? { score: 0 }), makeupDate } })
  }

  async function save() {
    setErr(null)
    if (!title.trim()) { setErr('Title is required.'); return }
    if (!totalScore.trim()) { setErr('Total score is required.'); return }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline ? new Date(deadline + 'T00:00:00').toISOString() : null,
        totalScore: Number(totalScore),
        grades,
      }
      const saved = existing
        ? await updateProject(existing.id, payload)
        : await createProject(classId, payload)
      if (!saved) { setErr('Could not save.'); return }
      setProjectId(saved.id)
      await onSaved()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  function viewProof(studentId: string) {
    if (!projectId) return
    openBlobInNewTab(() => fetchProjectProofBlob(projectId, studentId), 'No proof uploaded.')
  }

  // For a student viewer, restrict the table to their own row.
  const visibleStudents = viewerIsStudent && viewerId
    ? roster.filter(s => s.id === viewerId)
    : roster

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-4" onClick={onClose}>
      <div className="max-w-6xl mx-auto my-2 sm:my-4 card-static min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              {readOnly ? 'View project' : existing ? 'Edit project' : 'Add project'}
            </div>
            <h2 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">{title || 'New project'}</h2>
          </div>
          <button className="btn-secondary text-xs" onClick={onClose}>Close</button>
        </div>
        {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

        <Section title="Details">
          <div className="grid sm:grid-cols-[1fr_160px] gap-3">
            <label className="block">
              <span className="label">Title</span>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} disabled={!canEdit} />
            </label>
            <label className="block">
              <span className="label">Total score</span>
              <input type="number" className="input" value={totalScore} onChange={e => setTotalScore(e.target.value)} disabled={!canEdit} />
            </label>
          </div>
          <label className="block mt-3 max-w-[200px]">
            <span className="label">Deadline (optional)</span>
            <input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={!canEdit} />
          </label>
          <label className="block mt-3">
            <span className="label">Description</span>
            <textarea className="input" rows={3} value={description ?? ''} onChange={e => setDescription(e.target.value)} disabled={!canEdit} />
          </label>
        </Section>

        {/* Grades + proof — shown immediately on open, even before the
            project has been saved. Score/makeup inputs work against
            local state; the per-student Proof upload + View buttons
            need a `projectId` (a saved row to attach blobs against),
            so we gate JUST those two controls and show a one-line
            hint while the project is still a draft. */}
        <Section title={viewerIsStudent ? 'Your grade' : 'Grades + proof'}>
          {visibleStudents.length === 0 ? (
            <p className="text-sm text-[color:var(--mid-gray)] py-3">
              {viewerIsStudent ? 'You are not on this roster.' : 'No students enrolled in this class yet.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleStudents.map(s => (
                <div key={s.id} className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm py-1">
                  <span className="truncate font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canEdit && (
                      <input type="date" className="input" style={{ width: 140 }} value={grades[s.id]?.makeupDate ?? ''} onChange={e => setMakeup(s.id, e.target.value)} onBlur={projectId ? save : undefined} title="Makeup date (optional)" />
                    )}
                    <input type="number" min={0} max={Number(totalScore) || undefined} className="input" style={{ width: 70 }} value={grades[s.id]?.score ?? ''} onChange={e => setGrade(s.id, Number(e.target.value))} onBlur={projectId ? save : undefined} disabled={!canEdit} />
                    <span className="text-[11.5px] text-[color:var(--mid-gray)]">/ {totalScore || '—'}</span>
                    {/* Proof upload + View require a saved project row. */}
                    {canEdit && projectId && (
                      <label className="btn-secondary text-[10.5px] cursor-pointer">
                        Proof
                        <input type="file" className="sr-only" accept="image/*,.pdf" onChange={async e => {
                          const f = e.target.files?.[0]; e.target.value = ''
                          if (f && projectId) await uploadProjectProof(projectId, s.id, f)
                        }} />
                      </label>
                    )}
                    {projectId && (
                      <button className="text-[10.5px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--paper-3)' }} onClick={() => viewProof(s.id)}>View</button>
                    )}
                  </div>
                </div>
              ))}
            </ul>
          )}
          {canEdit && !projectId && visibleStudents.length > 0 && (
            <p className="text-[12px] text-[color:var(--mid-gray)] mt-3 italic">
              Tip: scores save when the project is created. Click <span className="font-semibold">Create project</span> below — proof uploads become available right after.
            </p>
          )}
        </Section>

        {canEdit && (
          <div className="flex gap-2 justify-end mt-4 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
            <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary text-xs" onClick={save} disabled={busy}>{busy ? 'Saving…' : (existing ? 'Save changes' : 'Create project')}</button>
          </div>
        )}
      </div>
    </div>
    </Portal>
  )
}

/* ────────────────────────  ACTIVITIES  ──────────────────────── */

function ActivitiesSection({ classId, canEdit }: {
  classId: string
  canEdit: boolean
}) {
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<ActivityRecord | 'new' | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit')

  async function load() {
    setBusy(true)
    try { setActivities(await listActivities(classId)) } finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [classId])

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Activities</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            School events, field trips, IEP reviews, holidays — anything that&apos;s not a graded lesson. Upload a photo gallery so students and parents can see what happened.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary text-xs" onClick={() => { setMode('edit'); setEditing('new') }}>+ Add Activity</button>
        )}
      </div>

      {busy && activities.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] py-3">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] py-3">No activities yet.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map(a => (
            <ActivityCard
              key={a.id}
              activity={a}
              canEdit={canEdit}
              onView={() => { setMode('view'); setEditing(a) }}
              onEdit={() => { setMode('edit'); setEditing(a) }}
              onDelete={async () => {
                if (!confirm(`Delete "${a.name}"?`)) return
                const ok = await deleteActivity(a.id)
                if (ok) await load()
              }}
            />
          ))}
        </ul>
      )}

      {editing && (
        <ActivityEditor
          classId={classId}
          existing={editing === 'new' ? null : editing}
          canEdit={canEdit && mode === 'edit'}
          onClose={() => setEditing(null)}
          // Don't auto-close on save. After the first save the editor
          // now holds an `activityId`, which unlocks the "+ Add photos"
          // workflow inside the same modal — closing here would force
          // the teacher to re-open the activity from the list before
          // they can attach any photos. The user explicitly clicks
          // Close / Cancel to dismiss instead. We still re-load() so
          // the parent's activity list and photo counts refresh.
          onSaved={async () => { await load() }}
        />
      )}
    </div>
  )
}

function ActivityCard({ activity, canEdit, onView, onEdit, onDelete }: {
  activity: ActivityRecord
  canEdit: boolean
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const dateLine = (() => {
    if (!activity.fromDate && !activity.toDate) return null
    const from = activity.fromDate ? new Date(activity.fromDate).toLocaleDateString() : null
    const to = activity.toDate ? new Date(activity.toDate).toLocaleDateString() : null
    if (from && to && from === to) return from
    if (from && to) return `${from} – ${to}`
    return from ?? to
  })()
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: 'var(--paper-3)' }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[color:var(--narra)]">{activity.name}</h3>
            {activity.type && (
              <span className="text-[10.5px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-[color:var(--paper-2)] text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                {activity.type}
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-0.5">
            {dateLine ?? 'No date set'} · {activity.photos.length} photo{activity.photos.length === 1 ? '' : 's'}
          </p>
          {activity.description && (
            <p className="text-[13px] mt-1 whitespace-pre-line">{activity.description}</p>
          )}
        </div>
        {/* Two buttons so the teacher can browse the photo gallery
            without entering edit mode. "+N more" thumbnail also routes
            to view, not edit. */}
        <div className="flex gap-1.5 shrink-0">
          <button className="btn-secondary text-xs" onClick={onView}>View</button>
          {canEdit && <button className="btn-secondary text-xs" onClick={onEdit}>Edit</button>}
          {canEdit && (
            <button className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={onDelete}>Delete</button>
          )}
        </div>
      </div>
      {activity.photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-3">
          {activity.photos.slice(0, 6).map(p => (
            <ActivityPhotoThumb key={p.id} activityId={activity.id} photo={p} />
          ))}
          {activity.photos.length > 6 && (
            <button
              type="button"
              className="aspect-square rounded-lg bg-[color:var(--paper-2)] text-[color:var(--mid-gray)] text-xs font-semibold hover:bg-[color:var(--paper-3)]"
              onClick={onView}
              style={{ fontFamily: 'var(--font-display)' }}
            >+{activity.photos.length - 6} more</button>
          )}
        </div>
      )}
    </li>
  )
}

function ActivityPhotoThumb({ activityId, photo }: { activityId: string; photo: ActivityPhotoMeta }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    ;(async () => {
      const blob = await fetchActivityPhotoBlob(activityId, photo.id)
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activityId, photo.id])
  function openFull() {
    if (url) window.open(url, '_blank', 'noopener')
  }
  return (
    <button
      type="button"
      onClick={openFull}
      className="aspect-square rounded-lg overflow-hidden bg-[color:var(--paper-2)] hover:opacity-90"
      title={photo.fileName}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.fileName} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full" />
      )}
    </button>
  )
}

function ActivityEditor({ classId, existing, canEdit, onClose, onSaved }: {
  classId: string
  existing: ActivityRecord | null
  canEdit: boolean
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState(existing?.type ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [fromDate, setFromDate] = useState(existing?.fromDate ? existing.fromDate.slice(0, 10) : '')
  const [toDate, setToDate] = useState(existing?.toDate ? existing.toDate.slice(0, 10) : '')
  const [photos, setPhotos] = useState<ActivityPhotoMeta[]>(existing?.photos ?? [])
  // Pending photos picked BEFORE the activity row exists on the
  // server. We hold the raw File objects + local blob URLs for
  // preview, then flush them through uploadActivityPhoto on Save.
  // The teacher can drop in photos the moment the modal opens —
  // no "save first" round-trip required.
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; previewUrl: string; localId: string }>>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activityId, setActivityId] = useState<string | null>(existing?.id ?? null)

  // Revoke the blob preview URLs on unmount so we don't leak memory
  // (one URL per pending file, freed when the queue clears or the
  // modal closes).
  useEffect(() => {
    return () => {
      for (const p of pendingFiles) {
        try { URL.revokeObjectURL(p.previewUrl) } catch { /* ignore */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setErr(null)
    if (!name.trim()) { setErr('Activity name is required.'); return }
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        type: type.trim() || null,
        description: description.trim() || null,
        fromDate: fromDate ? new Date(fromDate + 'T00:00:00').toISOString() : null,
        toDate: toDate ? new Date(toDate + 'T00:00:00').toISOString() : null,
      }
      const saved = existing
        ? await updateActivity(existing.id, payload)
        : await createActivity(classId, payload)
      if (!saved) { setErr('Could not save.'); return }
      setActivityId(saved.id)
      // Flush any pending photos now that the activity row exists.
      // We don't block the save callback on this — failures just leave
      // the file in the queue so the user can retry.
      if (pendingFiles.length > 0) {
        let failed = 0
        for (const p of pendingFiles) {
          const meta = await uploadActivityPhoto(saved.id, p.file)
          if (meta) {
            setPhotos(prev => [...prev, meta])
            try { URL.revokeObjectURL(p.previewUrl) } catch { /* ignore */ }
            setPendingFiles(prev => prev.filter(x => x.localId !== p.localId))
          } else {
            failed += 1
          }
        }
        if (failed > 0) {
          setErr(`${failed} photo${failed === 1 ? '' : 's'} failed to upload — they're still queued. Click Save changes to retry.`)
        }
      }
      await onSaved()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Snapshot the FileList into a real array BEFORE clearing the
    // input. `e.target.files` is a *live* FileList bound to the input;
    // assigning value='' empties it, so reading via the captured
    // reference afterwards yields zero files — symptom was "I click
    // + Add photos, pick a photo, nothing appears, no error".
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (picked.length === 0) return
    setErr(null)
    if (!activityId) {
      // No saved row yet → stage locally for upload on Save. Skip any
      // file > 15 MB up front so the user sees the error here instead
      // of mid-flush. Image-only by file.type, but accept files whose
      // browser-reported type is empty (Safari does this for HEIC) —
      // the server validates again on POST.
      const additions: typeof pendingFiles = []
      let rejected = 0
      for (const f of picked) {
        if (f.size > 15 * 1024 * 1024) { rejected += 1; continue }
        if (f.type && !f.type.startsWith('image/')) { rejected += 1; continue }
        additions.push({
          file: f,
          previewUrl: URL.createObjectURL(f),
          localId: 'pf_' + Math.random().toString(36).slice(2, 10),
        })
      }
      if (additions.length > 0) setPendingFiles(prev => [...prev, ...additions])
      if (rejected > 0) {
        setErr(`${rejected} file${rejected === 1 ? '' : 's'} skipped — must be image; under 15 MB.`)
      }
      return
    }
    // Activity already exists → upload immediately.
    let failed = 0
    for (const f of picked) {
      const meta = await uploadActivityPhoto(activityId, f)
      if (meta) setPhotos(prev => [...prev, meta])
      else failed += 1
    }
    if (failed > 0) {
      setErr(`${failed} photo${failed === 1 ? '' : 's'} failed to upload — please retry (must be image; under 15 MB).`)
    }
  }
  async function handleDeletePhoto(p: ActivityPhotoMeta) {
    if (!activityId) return
    if (!confirm(`Delete this photo?`)) return
    const ok = await deleteActivityPhoto(activityId, p.id)
    if (ok) setPhotos(prev => prev.filter(x => x.id !== p.id))
  }
  function handleDeletePending(localId: string) {
    setPendingFiles(prev => {
      const target = prev.find(x => x.localId === localId)
      if (target) { try { URL.revokeObjectURL(target.previewUrl) } catch { /* ignore */ } }
      return prev.filter(x => x.localId !== localId)
    })
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-4" onClick={onClose}>
      <div className="max-w-6xl mx-auto my-2 sm:my-4 card-static min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              {!canEdit && (existing || activityId) ? 'View activity' : (existing || activityId) ? 'Edit activity' : 'Add activity'}
            </div>
            <h2 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">{name || 'New activity'}</h2>
          </div>
          <button className="btn-secondary text-xs" onClick={onClose}>Close</button>
        </div>

        {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

        <Section title="Details">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Name</span>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Manila Ocean Park field trip" disabled={!canEdit} />
            </label>
            <label className="block">
              <span className="label">Type</span>
              <input className="input" value={type ?? ''} onChange={e => setType(e.target.value)} list="activity-type-suggestions" placeholder="School Event" disabled={!canEdit} />
              <datalist id="activity-type-suggestions">
                {ACTIVITY_TYPE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
              </datalist>
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="label">From</span>
              <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} disabled={!canEdit} />
            </label>
            <label className="block">
              <span className="label">To</span>
              <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} disabled={!canEdit} />
            </label>
          </div>
          <label className="block mt-3">
            <span className="label">Description</span>
            <textarea className="input" rows={4} value={description ?? ''} onChange={e => setDescription(e.target.value)} disabled={!canEdit} />
          </label>
        </Section>

        {/* Photo gallery — photo picker is always live. Picking
            files BEFORE the activity is saved stages them locally
            (with blob-URL previews); they flush to the server the
            moment the user clicks Create activity. After save, the
            picker uploads immediately like before. */}
        <Section title="Photo gallery">
          {canEdit && (
            <label className="btn-secondary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
              + Add photos
              <input type="file" className="sr-only" accept="image/*" multiple onChange={handleUpload} />
            </label>
          )}
          {canEdit && !activityId && pendingFiles.length > 0 && (
            <p className="text-[12px] text-[color:var(--mid-gray)] mt-2 italic">
              {pendingFiles.length} photo{pendingFiles.length === 1 ? '' : 's'} queued — will upload when you click <span className="font-semibold">Create activity</span>.
            </p>
          )}
          {photos.length === 0 && pendingFiles.length === 0 ? (
            <p className="text-sm text-[color:var(--mid-gray)] py-3">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
              {photos.map(p => (
                <div key={p.id} className="relative group">
                  {activityId && <ActivityPhotoThumb activityId={activityId} photo={p} />}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(p)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete photo"
                    >×</button>
                  )}
                </div>
              ))}
              {pendingFiles.map(p => (
                <div key={p.localId} className="relative group aspect-square rounded-lg overflow-hidden border" style={{ borderColor: 'var(--paper-3)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                  {/* "Pending" badge so the user understands these
                      haven't yet been uploaded — flush happens on Save. */}
                  <span
                    className="absolute bottom-1 left-1 text-[9.5px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontFamily: 'var(--font-display)' }}
                  >Pending</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeletePending(p.localId)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from queue"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {canEdit && (
          <div className="flex gap-2 justify-end mt-4 pt-3 border-t" style={{ borderColor: 'var(--paper-3)' }}>
            <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            {/* Once `activityId` is set we've persisted the row at
                least once — flip the label so a teacher returning to
                edit fields after their initial save sees "Save
                changes" instead of the original "Create activity". */}
            <button className="btn-primary text-xs" onClick={save} disabled={busy}>{busy ? 'Saving…' : (activityId ? 'Save changes' : 'Create activity')}</button>
          </div>
        )}
      </div>
    </div>
    </Portal>
  )
}
