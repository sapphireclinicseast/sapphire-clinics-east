'use client'

// Force dynamic — same SSG-cache fix applied to /admin and /documents.
// Without it the page state (auth, list, etc) would be served from a
// year-old prerendered shell and reflect zero deploys.
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, hydrateUsers, getUsers,
  listClasses, createClass, updateClass, deleteClass,
  uploadClassPhoto, fetchClassPhotoBlob,
  levelLabel, branchLabel,
  CLASS_DAY_OPTIONS,
  type AuthSession, type StoredUser, type ClassRecord, type ClassDay,
  type EnrollmentLevel, type Branch,
} from '@/lib/session'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10']
const ALL_BRANCHES: Branch[] = ['EAST', 'GREENHILLS']

/**
 * Phase 1 of the Class section. Lists every class the viewer can see,
 * with full CRUD for teachers (their own classes) + admins. Students
 * and (eventually) branch admins / main admin get read-only.
 *
 * Front desk hits this page and is bounced back to /frontdesk — class
 * management is intentionally out of scope for that role.
 */
export default function ClassesPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [ready, setReady] = useState(false)
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [teachers, setTeachers] = useState<StoredUser[]>([])
  const [students, setStudents] = useState<StoredUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ClassRecord | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const a = getAuth()
    if (!a) { router.replace('/sign-in'); return }
    if (a.role === 'FRONTDESK') { router.replace('/frontdesk'); return }
    setAuth(a)
    setReady(true)
  }, [router])

  async function load() {
    setBusy(true)
    try {
      const [list, allUsers] = await Promise.all([
        listClasses(),
        hydrateUsers().catch(() => getUsers()),
      ])
      setClasses(list)
      setTeachers(allUsers.filter(u => u.role === 'TEACHER'))
      setStudents(allUsers.filter(u => u.role === 'STUDENT'))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { if (ready) void load() }, [ready])

  const isTeacher = auth?.role === 'TEACHER'
  const isAdmin = auth?.role === 'ADMIN' || auth?.role === 'BRANCH_ADMIN'
  const canCreate = isTeacher || isAdmin

  function teacherName(id: string): string {
    const t = teachers.find(x => x.id === id)
    return [t?.firstName, t?.lastName].filter(Boolean).join(' ') || t?.email || id
  }

  async function handleDelete(c: ClassRecord) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return
    setErr(null); setInfo(null)
    const ok = await deleteClass(c.id)
    if (!ok) { setErr('Could not delete the class. Retry?'); return }
    setInfo(`Deleted "${c.name}".`)
    await load()
  }

  if (!ready) return null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Aura Academy · Classes
            </div>
            <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">Classes</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1">
              {isTeacher && 'Your assigned classes. Click any card to open the dashboard, set the schedule, and manage the roster.'}
              {isAdmin && 'Every class across your scope. Branch admins see only their own branch; main admin sees everything.'}
              {!isTeacher && !isAdmin && 'Classes you’re enrolled in. Lessons, projects, exams, and activities appear here as your teacher publishes them.'}
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              className="btn-primary text-xs whitespace-nowrap"
              onClick={() => { setEditing(null); setShowForm(true) }}
            >+ Add Class</button>
          )}
        </div>

        {err && <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        {info && <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">{info}</div>}
      </div>

      {busy && classes.length === 0 ? (
        <div className="card-static"><p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p></div>
      ) : classes.length === 0 ? (
        <div className="card-static">
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">
            {canCreate ? 'No classes yet. Click + Add Class to create your first one.' : 'No classes available to you yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map(c => (
            <ClassCard
              key={c.id}
              c={c}
              teacherName={teacherName(c.teacherId)}
              canEdit={isAdmin || (isTeacher && c.teacherId === auth?.userId)}
              onEdit={() => { setEditing(c); setShowForm(true) }}
              onDelete={() => void handleDelete(c)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ClassEditor
          existing={editing}
          students={students}
          defaultBranch={auth?.branch}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={async () => { setShowForm(false); setEditing(null); await load() }}
        />
      )}
    </div>
  )
}

function ClassCard({ c, teacherName, canEdit, onEdit, onDelete }: {
  c: ClassRecord
  teacherName: string
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const router = useRouter()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!c.hasPhoto) return
    let url: string | null = null
    let cancelled = false
    ;(async () => {
      const blob = await fetchClassPhotoBlob(c.id)
      if (cancelled || !blob) return
      url = URL.createObjectURL(blob)
      setPhotoUrl(url)
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [c.id, c.hasPhoto, c.updatedAt])

  const dayShorts = CLASS_DAY_OPTIONS.filter(o => c.scheduleDays.includes(o.value)).map(o => o.short).join(', ')
  const time = c.scheduleStartTime && c.scheduleEndTime ? `${c.scheduleStartTime}–${c.scheduleEndTime}` : null

  return (
    <div className="card-static overflow-hidden p-0">
      <button
        type="button"
        onClick={() => router.push(`/classes/${c.id}`)}
        className="block w-full text-left aspect-[16/9] bg-[color:var(--paper-2)] relative hover:opacity-90 transition-opacity"
        aria-label={`Open ${c.name}`}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={c.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[color:var(--mid-gray)] text-[12.5px]" style={{ fontFamily: 'var(--font-display)' }}>
            No cover photo
          </div>
        )}
      </button>
      <div className="p-4 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 text-left" onClick={() => router.push(`/classes/${c.id}`)}>
            <h3 className="text-[18px] leading-tight text-[color:var(--narra)] font-semibold truncate hover:underline" style={{ fontFamily: 'var(--font-display)' }}>
              {c.name}{c.section ? <span className="text-[color:var(--mid-gray)] font-normal"> · {c.section}</span> : null}
            </h3>
            <p className="text-[12px] text-[color:var(--mid-gray)] mt-0.5">
              {levelLabel(c.level)} · {branchLabel(c.branch)} · {teacherName}
            </p>
          </button>
        </div>
        <p className="text-[12px] text-[color:var(--mid-gray)]">
          {dayShorts || 'No schedule set'}{time ? ` · ${time}` : ''} · {c.studentIds.length} student{c.studentIds.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button type="button" className="btn-primary text-xs" onClick={() => router.push(`/classes/${c.id}`)}>Open</button>
          {canEdit && (
            <>
              <button type="button" className="btn-secondary text-xs" onClick={onEdit}>Edit</button>
              <button type="button" className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={onDelete}>Delete</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ClassEditor({ existing, students, defaultBranch, onClose, onSaved }: {
  existing: ClassRecord | null
  students: StoredUser[]
  defaultBranch?: Branch
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [branch, setBranch] = useState<Branch>(existing?.branch ?? defaultBranch ?? 'EAST')
  const [level, setLevel] = useState<EnrollmentLevel>(existing?.level ?? 'NURSERY')
  const [name, setName] = useState(existing?.name ?? '')
  const [section, setSection] = useState(existing?.section ?? '')
  const [days, setDays] = useState<ClassDay[]>(existing?.scheduleDays ?? [])
  const [startTime, setStartTime] = useState(existing?.scheduleStartTime ?? '')
  const [endTime, setEndTime] = useState(existing?.scheduleEndTime ?? '')
  const [roster, setRoster] = useState<string[]>(existing?.studentIds ?? [])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Filter the student picker by the selected branch + level so the
  // teacher isn't scrolling through every kid in the system.
  const eligible = useMemo(
    () => students.filter(s => s.branch === branch && s.level === level),
    [students, branch, level],
  )

  function toggleDay(d: ClassDay) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }
  function toggleStudent(id: string) {
    setRoster(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    setErr(null)
    if (!name.trim()) { setErr('Please enter a class name.'); return }
    setBusy(true)
    try {
      const saved = existing
        ? await updateClass(existing.id, {
            name: name.trim(),
            section: section.trim() || null,
            level,
            studentIds: roster,
            scheduleDays: days,
            scheduleStartTime: startTime || null,
            scheduleEndTime: endTime || null,
          })
        : await createClass({
            branch, level,
            name: name.trim(),
            section: section.trim() || null,
            studentIds: roster,
            scheduleDays: days,
            scheduleStartTime: startTime || null,
            scheduleEndTime: endTime || null,
          })
      if (!saved) { setErr('Could not save. Retry?'); return }
      if (photoFile) {
        const ok = await uploadClassPhoto(saved.id, photoFile)
        if (!ok) console.warn('Photo upload failed; class still saved')
      }
      await onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="max-w-6xl mx-auto my-2 sm:my-4 card-static min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              {existing ? 'Edit class' : 'Add class'}
            </div>
            <h2 className="text-[22px] leading-tight text-[color:var(--deep-teal)]">{name || 'New class'}</h2>
          </div>
          <button className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
        </div>

        {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Class name</span>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Math A" />
            </label>
            <label className="block">
              <span className="label">Section (optional)</span>
              <input className="input" value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. Falcons" />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Branch</span>
              <select className="select" value={branch} onChange={e => setBranch(e.target.value as Branch)} disabled={!!existing}>
                {ALL_BRANCHES.map(b => <option key={b} value={b}>{branchLabel(b)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Grade level</span>
              <select className="select" value={level} onChange={e => setLevel(e.target.value as EnrollmentLevel)}>
                {ALL_LEVELS.map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="label">Schedule</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {CLASS_DAY_OPTIONS.map(o => {
                const active = days.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleDay(o.value)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${active ? 'bg-[color:var(--narra)] text-white border-transparent' : 'bg-white text-[color:var(--narra)]'}`}
                    style={{ borderColor: active ? 'transparent' : 'var(--paper-3)' }}
                  >{o.short}</button>
                )
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className="label">Start time</span>
                <input type="time" className="input" value={startTime ?? ''} onChange={e => setStartTime(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">End time</span>
                <input type="time" className="input" value={endTime ?? ''} onChange={e => setEndTime(e.target.value)} />
              </label>
            </div>
          </div>

          <div>
            <span className="label">Cover photo (optional)</span>
            <input type="file" accept="image/*" className="block mt-1 text-xs" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
            {photoFile && (
              <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-1">
                {photoFile.name} · {(photoFile.size / 1024).toFixed(0)} KB
              </p>
            )}
            {existing?.hasPhoto && !photoFile && (
              <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-1">
                Current: {existing.photoFileName}. Picking a new file replaces it.
              </p>
            )}
          </div>

          <div>
            <span className="label">Roster — {roster.length} selected</span>
            <p className="text-[11.5px] text-[color:var(--mid-gray)] mb-2">
              Showing students enrolled at {branchLabel(branch)} · {levelLabel(level)}. Change branch or level above to see other learners.
            </p>
            {eligible.length === 0 ? (
              <p className="text-sm text-[color:var(--mid-gray)] py-3">No students match this branch + level yet.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-xl border p-2" style={{ borderColor: 'var(--paper-3)' }}>
                {eligible.map(s => {
                  const checked = roster.includes(s.id)
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-[color:var(--paper-2)] rounded">
                      <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)} />
                      <span className="font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}</span>
                      <span className="text-[11.5px] text-[color:var(--mid-gray)] ml-auto">{s.email}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : (existing ? 'Save changes' : 'Create class')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
