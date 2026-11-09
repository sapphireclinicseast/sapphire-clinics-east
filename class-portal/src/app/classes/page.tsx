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
  getAssignments, hydrateAssignments,
  levelLabel, branchLabel, ALL_BRANCHES,
  CLASS_DAY_OPTIONS, signOut,
  type AuthSession, type StoredUser, type ClassRecord, type ClassDay,
  type EnrollmentLevel, type Branch,
} from '@/lib/session'
import { getToken } from '@/lib/backend'
import { Portal } from '@/components/Modal'
import {
  PAGE, PageHeader, GroupLabel, Banner, Skeleton, EmptyState, Tag, Icon, Dialog,
  CARD_STYLE, FOCUS, DANGER, CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, FILE_FOCUS, TR_STYLE,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE,
  type IconName,
} from '@/components/hub/ui'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

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
    // Gate for the auth/token desync case: if the AuthSession record is
    // populated but the Bearer token has been cleared (by an earlier
    // 401 whose redirect the browser deferred, or by a sign-out in a
    // second tab), every authenticated fetch on this page would come
    // back "Missing bearer token." Wipe the stale AuthSession and force
    // a fresh sign-in instead of letting the user fill a form that
    // will silently fail (the SPED-teacher class-create bug).
    if (!getToken()) { signOut(); router.replace('/sign-in'); return }
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
        // Pull the assignments matrix so teacherName() can fall back
        // to (branch × level → teacher) when a class has no explicit
        // teacherId set.
        hydrateAssignments().catch(() => null),
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

  // Teacher-name resolution shared with /classes/[id]. Falls through:
  //   1. Explicit teacherId, viewer is self → own auth row.
  //   2. Explicit teacherId, look in `teachers` list.
  //   3. No teacherId (or not found) → Assignments matrix lookup
  //      (branch × level → first matching teacher row). This is what
  //      the main admin configured under /admin → Assignments and is
  //      the user-intended default.
  //   4. Last resort: "Teacher" placeholder so the card never shows
  //      a raw cuid.
  function teacherNameForClass(c: ClassRecord): string {
    // Server now ships a resolved name on the class row (works for
    // students whose user-list scope is just their own row). Always
    // prefer it — the client-side fallbacks below only run for old
    // cached payloads from before this deploy landed.
    if (c.teacherName) return c.teacherName
    const tid = c.teacherId
    if (tid && auth?.userId === tid) {
      return [auth.firstName].filter(Boolean).join(' ') || auth.email
    }
    if (tid) {
      const t = teachers.find(x => x.id === tid)
      if (t) return [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email
    }
    const a = getAssignments().find(x => x.branch === c.branch && x.level === c.level)
    if (a) {
      if (auth?.userId === a.teacherId) {
        return [auth.firstName].filter(Boolean).join(' ') || auth.email
      }
      const t = teachers.find(x => x.id === a.teacherId)
      if (t) return [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email
    }
    return 'Teacher'
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

  const description = isTeacher
    ? 'Your assigned classes. Click any card to open the dashboard, set the schedule, and manage the roster.'
    : isAdmin
      ? 'Every class across your scope. Branch admins see only their own branch; main admin sees everything.'
      : 'Classes you’re enrolled in. Lessons, projects, exams, and activities appear here as your teacher publishes them.'

  return (
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        eyebrow="Aura Academy · Classes"
        title="Classes"
        description={description}
        actions={canCreate && (
          <button
            type="button"
            className={BTN_PRIMARY}
            style={PRIMARY_STYLE}
            onClick={() => { setEditing(null); setShowForm(true) }}
          ><Icon name="plus" size={15} /> Add class</button>
        )}
      />

      {err && <Banner tone="error">{err}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      {busy && classes.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading classes">
          {Array.from({ length: 3 }).map((_, n) => (
            <div key={n} className="rounded-xl overflow-hidden" style={CARD_STYLE} aria-hidden>
              <Skeleton className="aspect-[16/7] rounded-none" />
              <div className="p-4 space-y-2.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex gap-2 pt-2"><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-16" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon="book"
            title={canCreate ? 'No classes yet.' : 'No classes available to you yet.'}
            hint={canCreate ? 'Click Add class to create your first one.' : 'Classes appear here once your teacher adds you to a roster.'}
          />
        </div>
      ) : (
        <>
          <GroupLabel hint={busy ? 'Refreshing…' : undefined}>
            {classes.length} class{classes.length === 1 ? '' : 'es'}
          </GroupLabel>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map(c => (
              <ClassCard
                key={c.id}
                c={c}
                teacherName={teacherNameForClass(c)}
                canEdit={isAdmin || (isTeacher && c.teacherId === auth?.userId)}
                onEdit={() => { setEditing(c); setShowForm(true) }}
                onDelete={() => void handleDelete(c)}
              />
            ))}
          </ul>
        </>
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

/** One icon + text line on a class card (teacher, schedule, roster size). */
function MetaLine({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] leading-snug min-w-0" style={{ color: 'var(--charcoal)' }}>
      <Icon name={icon} size={14} className="mt-[2px]" style={{ color: 'var(--teal)' }} />
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
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
    <li className="rounded-xl overflow-hidden flex flex-col min-w-0" style={CARD_STYLE}>
      <button
        type="button"
        onClick={() => router.push(`/classes/${c.id}`)}
        className={`block w-full text-left aspect-[16/7] relative hover:opacity-90 transition-opacity ${FOCUS}`}
        style={{ background: 'var(--paper-2)' }}
        aria-label={`Open ${c.name}`}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={c.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[12px]" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
            <Icon name="image" size={20} style={{ color: 'var(--light-gray)' }} />
            No cover photo
          </div>
        )}
      </button>
      <div className="p-4 flex-1 flex flex-col gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Tag tone="brand">{levelLabel(c.level)}</Tag>
            <Tag>{branchLabel(c.branch)}</Tag>
          </div>
          <button type="button" className={`min-w-0 max-w-full text-left rounded ${FOCUS}`} onClick={() => router.push(`/classes/${c.id}`)}>
            <h3 className="text-[16px] leading-tight font-bold hover:underline break-words" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', letterSpacing: 0 }}>
              {c.name}{c.section ? <span className="font-normal" style={{ color: 'var(--mid-gray)' }}> · {c.section}</span> : null}
            </h3>
          </button>
        </div>
        <div className="space-y-1.5">
          <MetaLine icon="teacher" label="Teacher">{teacherName}</MetaLine>
          <MetaLine icon="calendar" label="Schedule">
            {dayShorts || <span style={{ color: 'var(--mid-gray)' }}>No schedule set</span>}{time ? ` · ${time}` : ''}
          </MetaLine>
          <MetaLine icon="users" label="Roster">
            <span className="tabular-nums font-semibold">{c.studentIds.length}</span> student{c.studentIds.length === 1 ? '' : 's'}
          </MetaLine>
        </div>
        <div className="flex gap-2 mt-auto pt-1 flex-wrap">
          <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => router.push(`/classes/${c.id}`)}>
            Open <Icon name="chevronRight" size={14} />
          </button>
          {canEdit && (
            <>
              <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onEdit}><Icon name="edit" size={14} /> Edit</button>
              <button type="button" className={`${BTN_DANGER_GHOST} h-9 ml-auto`} style={{ color: DANGER }} onClick={onDelete}><Icon name="trash" size={14} /> Delete</button>
            </>
          )}
        </div>
      </div>
    </li>
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
      // createClass/updateClass now throw with the real server message
      // on failure, so the catch below renders it into the red banner.
      // No null-guard needed here.
      if (photoFile) {
        const ok = await uploadClassPhoto(saved.id, photoFile)
        if (!ok) console.warn('Photo upload failed; class still saved')
      }
      await onSaved()
    } catch (e) {
      setErr((e as Error).message || 'Could not save. Retry?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Portal>
    <Dialog
      labelId="class-editor-title"
      size="xl"
      eyebrow={existing ? 'Edit class' : 'Add class'}
      title={name || 'New class'}
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : (existing ? 'Save changes' : 'Create class')}
        </button>
      </>}
    >
        {err && <div className="mb-4"><Banner tone="error">{err}</Banner></div>}

        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL} style={LABEL_STYLE}>Class name</span>
              <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Math A" />
            </label>
            <label className="block">
              <span className={LABEL} style={LABEL_STYLE}>Section (optional)</span>
              <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. Falcons" />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL} style={LABEL_STYLE}>Branch</span>
              <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={branch} onChange={e => setBranch(e.target.value as Branch)} disabled={!!existing}>
                {ALL_BRANCHES.map(b => <option key={b} value={b}>{branchLabel(b)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL} style={LABEL_STYLE}>Grade level</span>
              <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={level} onChange={e => setLevel(e.target.value as EnrollmentLevel)}>
                {ALL_LEVELS.map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className={LABEL} style={LABEL_STYLE}>Schedule</legend>
            <DayPicker days={days} onToggle={toggleDay} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className={LABEL} style={LABEL_STYLE}>Start time</span>
                <input type="time" className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={startTime ?? ''} onChange={e => setStartTime(e.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL} style={LABEL_STYLE}>End time</span>
                <input type="time" className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={endTime ?? ''} onChange={e => setEndTime(e.target.value)} />
              </label>
            </div>
          </fieldset>

          <div>
            <span className={LABEL} style={LABEL_STYLE}>Cover photo (optional)</span>
            <div className="flex items-center gap-2 flex-wrap">
              <label className={`${BTN_SECONDARY} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
                <Icon name="upload" size={14} />
                {photoFile || existing?.hasPhoto ? 'Replace photo' : 'Choose photo'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {photoFile && (
                <button
                  type="button"
                  className={BTN_SM}
                  style={{ color: 'var(--mid-gray)' }}
                  onClick={() => setPhotoFile(null)}
                >Clear</button>
              )}
            </div>
            {photoFile && (
              <p className="text-xs mt-2 break-all" style={{ color: 'var(--mid-gray)' }}>
                {photoFile.name} · {(photoFile.size / 1024).toFixed(0)} KB
              </p>
            )}
            {existing?.hasPhoto && !photoFile && (
              <p className="text-xs mt-2 break-all" style={{ color: 'var(--mid-gray)' }}>
                Current: {existing.photoFileName}. Picking a new file replaces it.
              </p>
            )}
          </div>

          <fieldset>
            <legend className={LABEL} style={LABEL_STYLE}>Roster — {roster.length} selected</legend>
            <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>
              Showing students enrolled at {branchLabel(branch)} · {levelLabel(level)}. Change branch or level above to see other learners.
            </p>
            {eligible.length === 0 ? (
              <div className="rounded-xl" style={{ border: '1px dashed var(--light-gray)' }}>
                <EmptyState icon="student" title="No students match this branch + level yet." />
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded-xl" style={{ border: '1px solid var(--light-gray)' }}>
                {eligible.map((s, i) => {
                  const checked = roster.includes(s.id)
                  return (
                    <li key={s.id} style={i ? TR_STYLE : undefined}>
                      <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[#FBF9F5]">
                        <input type="checkbox" className="w-4 h-4 flex-shrink-0 accent-[color:var(--deep-teal)]" checked={checked} onChange={() => toggleStudent(s.id)} />
                        <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                          <span className="block text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}</span>
                          <span className="block text-xs truncate sm:ml-auto" style={{ color: 'var(--mid-gray)' }}>{s.email}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>
        </div>
    </Dialog>
    </Portal>
  )
}

/** Mon–Sun toggles. Selected days carry a check mark and aria-pressed, not just a fill. */
function DayPicker({ days, onToggle, disabled }: { days: ClassDay[]; onToggle: (d: ClassDay) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CLASS_DAY_OPTIONS.map(o => {
        const active = days.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            aria-label={o.label}
            disabled={disabled}
            onClick={() => onToggle(o.value)}
            className={`inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-semibold transition-colors disabled:opacity-60 ${FOCUS}`}
            style={active
              ? { background: 'var(--deep-teal)', color: '#fff', border: '1px solid var(--deep-teal)' }
              : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}
          >
            {active && <Icon name="check" size={12} />}
            {o.short}
          </button>
        )
      })}
    </div>
  )
}
