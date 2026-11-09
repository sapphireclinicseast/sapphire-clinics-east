'use client'

/**
 * MeetingsPanel — teacher creates video meetings on
 * meet.sapphireclinicseast.org, optionally tags students from their
 * assigned branch+level roster. Server generates a signed compact-token
 * URL so the room verifier accepts the link without a moderator login.
 *
 * Recording + whiteboard are provided by the LiveKit meet app itself
 * (participants trigger them from the meeting UI). This panel is just
 * the mint + roster + list surface — not a wrapper around the video.
 *
 * Visible to TEACHER (own meetings), ADMIN + BRANCH_ADMIN (all
 * meetings), and STUDENT (meetings they were tagged into — read-only).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  listMeetings, createMeeting, cancelMeeting, deleteMeeting,
  getUsers, hydrateUsers, teacherAssignedPairs,
  type MeetingRecord, type StoredUser, type AuthSession, type Branch, type EnrollmentLevel,
} from '@/lib/session'
import { Portal } from '@/components/Modal'
import {
  PageHeader, DashCard, RowsSkeleton, EmptyState, Banner, StatusPill, Tag, Avatar, Icon, Dialog,
  displayName, initials,
  CONTROL, CONTROL_STYLE, TEXTAREA, LABEL, LABEL_STYLE, DANGER,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE,
} from '@/components/hub/ui'

interface Props {
  viewer: AuthSession
  /** Optional branch scope for BRANCH_ADMIN/FRONTDESK viewers. */
  viewerBranch?: Branch
}

/** Local ISO shape for <input type="datetime-local"> — keeps the
 *  wall-clock the staff sees intact. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localInputToIso(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}
/** Two-letter avatar text from a single display-name string. */
function nameInitials(name: string): string {
  const parts = displayName(name).split(/[\s,]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
function nowLocalInput(): string {
  return isoToLocalInput(new Date(Date.now() + 5 * 60_000).toISOString())
}

export default function MeetingsPanel({ viewer, viewerBranch }: Props) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([])
  const [students, setStudents] = useState<StoredUser[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const canCreate = viewer.role === 'TEACHER' || viewer.role === 'ADMIN' || viewer.role === 'BRANCH_ADMIN'

  async function refresh() {
    setLoading(true)
    try {
      const [m] = await Promise.all([listMeetings()])
      setMeetings(m)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    void refresh()
    // Hydrate the user list so the student picker has something to show
    // even on a fresh device.
    hydrateUsers().then(setStudents).catch(() => setStudents(getUsers()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.role, viewer.userId])

  /** Student roster available for tagging into a meeting.
   *  - TEACHER: their assigned branch+level pairs (fail-closed to just
   *    branch if assignments haven't loaded yet, same shape as
   *    StudentListPanel).
   *  - ADMIN / BRANCH_ADMIN: all students in scope. */
  const eligibleStudents = useMemo(() => {
    let pool = students.filter(u => u.role === 'STUDENT' && !u.disabledAt)
    if (viewer.role === 'TEACHER' && viewer.userId) {
      const me = students.find(u => u.id === viewer.userId)
      if (me?.branch) pool = pool.filter(u => u.branch === me.branch)
      const pairs = teacherAssignedPairs(viewer.userId)
      if (pairs.length > 0) {
        const allowed = new Set(pairs.map(p => `${p.branch}|${p.level}`))
        pool = pool.filter(u =>
          !!u.level && !!u.branch && allowed.has(`${u.branch as Branch}|${u.level as EnrollmentLevel}`),
        )
      }
    }
    if (viewerBranch) pool = pool.filter(u => u.branch === viewerBranch)
    return pool.sort((a, b) => {
      const an = [a.lastName, a.firstName].filter(Boolean).join(', ') || a.email
      const bn = [b.lastName, b.firstName].filter(Boolean).join(', ') || b.email
      return an.localeCompare(bn)
    })
  }, [students, viewer.role, viewer.userId, viewerBranch])

  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  // Cancelled meetings pile up over time; hide them from the default
  // view. Toggle stays checked for the session — useful while
  // reviewing what a colleague cancelled.
  const [showCancelled, setShowCancelled] = useState(false)

  async function handleCancel(m: MeetingRecord) {
    if (!confirm(`Cancel "${m.title}"? The meeting will show as CANCELLED and the join buttons disappear. Existing invitation links still verify until ${new Date(m.endsAt).toLocaleString()} — LiveKit can't recall signed tokens.`)) return
    // Optimistic: flip the row's cancelledAt locally so the badge +
    // hidden-by-default filter reflect it before the server round-trip.
    // If the server fails we roll back below.
    const snapshot = meetings
    const now = new Date().toISOString()
    setMeetings(prev => prev.map(x => x.id === m.id ? { ...x, cancelledAt: now, hostLink: null, guestLink: null } : x))
    const ok = await cancelMeeting(m.id)
    if (!ok) {
      setMeetings(snapshot)
      setErr('Could not cancel the meeting. Please retry.')
      return
    }
    setInfo(`"${m.title}" cancelled.`)
    // Re-fetch in the background so any concurrent changes land too.
    void refresh()
  }

  async function handleDelete(m: MeetingRecord) {
    const warn = `PERMANENTLY DELETE "${m.title}"?\n\nThis wipes the meeting record and its ${m.participants.length} tagged student${m.participants.length === 1 ? '' : 's'} from the class portal — it will not appear in any history again. Cannot be undone.\n\nNote: if the join link was already shared, it still verifies on the meet app until ${new Date(m.endsAt).toLocaleString()} — LiveKit can't recall signed tokens.`
    if (!confirm(warn)) return
    // Optimistic remove: drop the row from local state before the
    // server round trip. Without this the deleted row lingered until
    // the async refresh() came back (and sometimes appeared to hang
    // because the parent state didn't update visibly). Roll back on
    // failure so nothing gets silently lost.
    const snapshot = meetings
    setMeetings(prev => prev.filter(x => x.id !== m.id))
    const ok = await deleteMeeting(m.id)
    if (!ok) {
      setMeetings(snapshot)
      setErr('Could not delete the meeting. Please retry.')
      return
    }
    setInfo(`"${m.title}" deleted.`)
    void refresh()
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setInfo(`${label} copied to clipboard.`)
      setTimeout(() => setInfo(null), 2500)
    } catch { setErr('Could not copy — highlight and copy manually.') }
  }

  // Filter: search matches title / notes / teacher / any tagged
  // student name/email, plus the scheduled-date short label so a
  // teacher can type "aug 30" or the year and get their meeting. Hides
  // cancelled rows unless the "Show cancelled" toggle is ticked.
  const filteredMeetings = useMemo(() => {
    const q = search.trim().toLowerCase()
    return meetings.filter(m => {
      if (!showCancelled && m.cancelledAt) return false
      if (!q) return true
      if (m.title.toLowerCase().includes(q)) return true
      if ((m.notes ?? '').toLowerCase().includes(q)) return true
      if (m.teacherName.toLowerCase().includes(q)) return true
      if (m.teacherEmail.toLowerCase().includes(q)) return true
      if (m.participants.some(p =>
        p.studentName.toLowerCase().includes(q) || p.studentEmail.toLowerCase().includes(q))) return true
      const d = new Date(m.scheduledAt)
      const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase()
      if (dateLabel.includes(q)) return true
      return false
    })
  }, [meetings, search, showCancelled])

  const cancelledCount = meetings.filter(m => m.cancelledAt).length

  // Display grouping only: a meeting sits under "Upcoming" until its end
  // time passes, then moves to "Past". Soonest first / most recent first.
  // Nothing here changes which meetings are listed or what they link to.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const { upcoming, past } = useMemo(() => {
    const up: MeetingRecord[] = []
    const done: MeetingRecord[] = []
    for (const m of filteredMeetings) {
      const end = new Date(m.endsAt).getTime()
      if (Number.isFinite(end) && end < now) done.push(m); else up.push(m)
    }
    const at = (m: MeetingRecord) => new Date(m.scheduledAt).getTime() || 0
    up.sort((a, b) => at(a) - at(b))
    done.sort((a, b) => at(b) - at(a))
    return { upcoming: up, past: done }
  }, [filteredMeetings, now])

  function renderRow(m: MeetingRecord) {
    const scheduled = new Date(m.scheduledAt)
    const ends = new Date(m.endsAt)
    const isCancelled = !!m.cancelledAt
    const isMine = viewer.role !== 'STUDENT' && m.teacherId === viewer.userId
    const canCancel = !isCancelled && (isMine || viewer.role === 'ADMIN' || viewer.role === 'BRANCH_ADMIN')
    const joinLink = viewer.role === 'STUDENT' ? m.guestLink : (m.hostLink ?? m.guestLink)

    const startMs = scheduled.getTime()
    const endMs = ends.getTime()
    const isPast = Number.isFinite(endMs) && endMs < now
    const isLive = !isPast && Number.isFinite(startMs) && startMs <= now
    const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
    const dateLabel = scheduled.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    const timeLabel = scheduled.toLocaleTimeString(undefined, timeOpts)
      + (Number.isFinite(endMs) ? ` – ${ends.toLocaleTimeString(undefined, timeOpts)}` : '')
    const muted = isCancelled || isPast
    const tagged = m.participants.map(p => displayName(p.studentName))

    return (
      <li key={m.id} className="px-4 sm:px-5 py-4 flex gap-3 sm:gap-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
        {/* Calendar tile — the full date is spelled out in text beside it. */}
        <div aria-hidden className={`w-12 sm:w-14 flex-shrink-0 rounded-lg overflow-hidden text-center self-start ${isCancelled ? 'opacity-55' : ''}`}
          style={{ border: '1px solid var(--light-gray)', background: '#fff', fontFamily: 'var(--font-display)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest py-0.5"
            style={muted ? { background: 'var(--paper-2)', color: 'var(--mid-gray)' } : { background: 'var(--deep-teal)', color: '#fff' }}>
            {scheduled.toLocaleDateString(undefined, { month: 'short' })}
          </div>
          <div className="text-xl sm:text-[22px] font-bold leading-none py-1.5" style={{ color: muted ? 'var(--mid-gray)' : 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
            {scheduled.getDate()}
          </div>
        </div>

        <div className="min-w-0 flex-1 flex flex-col lg:flex-row lg:items-start gap-3">
          <div className={`min-w-0 flex-1 ${isCancelled ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[14.5px] font-bold leading-snug break-words" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {m.title}
              </h3>
              {isCancelled
                ? <StatusPill tone="error">Cancelled</StatusPill>
                : isLive
                  ? <StatusPill tone="success">In progress</StatusPill>
                  : isPast
                    ? <StatusPill tone="neutral">Ended</StatusPill>
                    : <StatusPill tone="info">Scheduled</StatusPill>}
              {isMine && <Tag tone="brand">You’re hosting</Tag>}
            </div>

            <p className="mt-1 flex items-start gap-1.5 text-[12.5px]" style={{ color: 'var(--charcoal)' }}>
              <Icon name="clock" size={13} className="mt-0.5" style={{ color: 'var(--mid-gray)' }} />
              <span className="min-w-0 break-words"><span className="font-semibold">{dateLabel}</span> · {timeLabel}</span>
            </p>

            {m.notes && <p className="mt-1 text-[12px] leading-relaxed break-words" style={{ color: 'var(--mid-gray)' }}>{m.notes}</p>}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]" style={{ color: 'var(--mid-gray)' }}>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Avatar text={nameInitials(m.teacherName)} size={24} />
                <span className="min-w-0 break-words">Host: <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{displayName(m.teacherName)}</span></span>
              </span>
              <span className="inline-flex items-center gap-1.5 min-w-0" title={m.participants.map(p => p.studentName).join(', ') || undefined}>
                {m.participants.length === 0 ? (
                  <><Icon name="users" size={14} /> <span>Everyone with the link</span></>
                ) : (
                  <>
                    <span className="flex items-center flex-shrink-0">
                      {m.participants.slice(0, 3).map((p, i) => (
                        <span key={p.id} className={`rounded-full ring-2 ring-white ${i ? '-ml-1.5' : ''}`}>
                          <Avatar text={nameInitials(p.studentName)} size={22} />
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0 break-words">
                      {m.participants.length} student{m.participants.length === 1 ? '' : 's'}
                      <span className="hidden sm:inline">: {tagged.slice(0, 2).join(', ')}{tagged.length > 2 ? ` +${tagged.length - 2} more` : ''}</span>
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:max-w-[300px]">
            {joinLink ? (
              <>
                <a href={joinLink} target="_blank" rel="noopener noreferrer"
                  className={isPast ? BTN_SM : BTN_PRIMARY}
                  style={isPast ? SECONDARY_STYLE : PRIMARY_STYLE}>
                  <Icon name="external" size={isPast ? 12 : 14} />
                  {isPast ? 'Open meeting' : 'Join meeting'}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                {/* Students see just a Guest link — they don't need
                    the host token. Staff (teacher/admin/branch admin)
                    see both so they can share the guest link with
                    parents/students and keep the host link private.
                    Host unlocks Broadcast + moderator controls; Cloud
                    Record is available from ANY link once inside the
                    meeting. */}
                {viewer.role === 'STUDENT' ? (
                  m.guestLink && <button
                    type="button"
                    className={BTN_SM}
                    style={SECONDARY_STYLE}
                    title="Guest link — join the meeting and use Cloud Record from the toolbar."
                    onClick={() => void copyToClipboard(m.guestLink!, 'Guest link')}
                  ><Icon name="users" size={12} /> Copy guest link</button>
                ) : (
                  <>
                    {m.hostLink && (
                      <button
                        type="button"
                        className={BTN_SM}
                        style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}
                        title="Host link (KEEP PRIVATE): join as moderator — unlocks Broadcast + Cloud Record + Whiteboard controls."
                        onClick={() => void copyToClipboard(m.hostLink!, 'Host link (keep private)')}
                      ><Icon name="shield" size={12} /> Copy host link</button>
                    )}
                    {m.guestLink && (
                      <button
                        type="button"
                        className={BTN_SM}
                        style={SECONDARY_STYLE}
                        title="Guest link — safe to share with students/parents. They can Cloud Record from inside the meeting."
                        onClick={() => void copyToClipboard(m.guestLink!, 'Guest link (share with students)')}
                      ><Icon name="users" size={12} /> Copy guest link</button>
                    )}
                  </>
                )}
              </>
            ) : (
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{isCancelled ? 'No join link — cancelled' : 'No join link'}</span>
            )}
            {canCancel && (
              <button
                type="button"
                className={BTN_SM}
                style={{ color: 'var(--mid-gray)' }}
                title="Mark as cancelled — keeps the row in history but hides join buttons."
                onClick={() => void handleCancel(m)}
              ><Icon name="x" size={12} /> Cancel</button>
            )}
            {/* Delete is available on active AND cancelled rows,
                so a teacher who cancelled by mistake or wants to
                scrub a row entirely can. Same role gate as
                cancel (creator + admin) — enforced server-side. */}
            {(isMine || viewer.role === 'ADMIN' || viewer.role === 'BRANCH_ADMIN') && (
              <button
                type="button"
                className={BTN_DANGER_GHOST}
                style={{ color: DANGER }}
                title="Permanently delete this meeting from the class portal."
                onClick={() => void handleDelete(m)}
              ><Icon name="trash" size={12} /> Delete</button>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Aura Academy · Meetings"
        title="Meetings"
        description={<>Video meetings hosted on <span className="font-semibold">meet.sapphireclinicseast.org</span>. Anyone with the link joins straight into the room.</>}
        actions={canCreate && (
          <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={15} /> New meeting
          </button>
        )}
      />

      {err && <Banner tone="error">{err}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="block flex-1 min-w-0 basis-[240px]">
          <span className={LABEL} style={LABEL_STYLE}>Search</span>
          <span className="relative block">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input
              type="search"
              className={`${CONTROL} w-full pl-9`}
              style={CONTROL_STYLE}
              placeholder="Title, teacher, tagged student, or date"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </span>
        </label>
        {cancelledCount > 0 && (
          <label className="inline-flex items-center gap-2 h-9 text-sm" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" className="w-4 h-4" style={{ accentColor: 'var(--deep-teal)' }} checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
            Show cancelled ({cancelledCount})
          </label>
        )}
      </div>

      {loading ? (
        <DashCard title="Meetings" icon={<Icon name="calendar" size={15} />} flush>
          <RowsSkeleton rows={3} label="Loading meetings" />
        </DashCard>
      ) : meetings.length === 0 ? (
        <DashCard title="Meetings" icon={<Icon name="calendar" size={15} />} flush>
          <EmptyState
            icon="calendar"
            title="No meetings scheduled"
            hint={canCreate ? 'Click New meeting to create one.' : "You haven't been tagged into any meetings yet."}
          />
        </DashCard>
      ) : filteredMeetings.length === 0 ? (
        <DashCard title="Meetings" icon={<Icon name="calendar" size={15} />} flush>
          <EmptyState
            icon="search"
            title="No meetings match this search"
            hint={!showCancelled && cancelledCount > 0 ? 'Try Show cancelled if you’re looking for a cancelled one.' : 'Try a title, teacher, student name, or date like “aug 30”.'}
          />
        </DashCard>
      ) : (
        <>
          <DashCard
            title="Upcoming"
            description="Soonest first. Join opens the room in a new tab."
            icon={<Icon name="calendar" size={15} />}
            action={<Tag tone="brand">{upcoming.length} meeting{upcoming.length === 1 ? '' : 's'}</Tag>}
            flush
          >
            {upcoming.length === 0 ? (
              <EmptyState icon="calendar" title="No meetings scheduled" hint={canCreate ? 'Click New meeting to schedule the next one.' : 'New meetings you’re tagged into will show here.'} />
            ) : (
              <ul className="-mt-px">{upcoming.map(renderRow)}</ul>
            )}
          </DashCard>

          {past.length > 0 && (
            <DashCard
              title="Past meetings"
              description="Most recent first."
              icon={<Icon name="clock" size={15} />}
              action={<Tag>{past.length}</Tag>}
              flush
            >
              <ul className="-mt-px">{past.map(renderRow)}</ul>
            </DashCard>
          )}
        </>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed px-0.5" style={{ color: 'var(--mid-gray)' }}>
        <Icon name="info" size={14} className="mt-0.5" />
        <span>
          In the meeting toolbar:
          <span className="font-semibold"> Cloud Record</span> (server-side, saved to the meet app),
          <span className="font-semibold"> Broadcast</span> (host only), and a
          <span className="font-semibold"> Whiteboard</span>. Tag students to keep the meeting visible on
          their own portal.
        </span>
      </p>

      {showCreate && canCreate && (
        <CreateMeetingModal
          eligibleStudents={eligibleStudents}
          onClose={() => setShowCreate(false)}
          busy={creating}
          setBusy={setCreating}
          onCreated={(m) => {
            setShowCreate(false)
            setInfo(`Meeting "${m.title}" created. Share the link with your students or copy it from the row.`)
            void refresh()
          }}
          onError={setErr}
        />
      )}
    </>
  )
}

function CreateMeetingModal({
  eligibleStudents, onClose, onCreated, onError, busy, setBusy,
}: {
  eligibleStudents: StoredUser[]
  onClose: () => void
  onCreated: (m: MeetingRecord) => void
  onError: (s: string) => void
  busy: boolean
  setBusy: (b: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [scheduledAt, setScheduledAt] = useState<string>(() => nowLocalInput())
  const [durationMin, setDurationMin] = useState<number>(60)
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setParticipantIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!title.trim()) { onError('Give the meeting a title.'); return }
    const iso = localInputToIso(scheduledAt)
    if (!iso) { onError('Pick a valid start date and time.'); return }
    const endsIso = new Date(new Date(iso).getTime() + durationMin * 60_000).toISOString()
    setBusy(true)
    try {
      const m = await createMeeting({
        title: title.trim(),
        scheduledAt: iso,
        endsAt: endsIso,
        notes: notes.trim() || undefined,
        participantIds: Array.from(participantIds),
      })
      if (!m) { onError('Could not create the meeting. Retry?'); return }
      onCreated(m)
    } finally { setBusy(false) }
  }

  return (
    <Portal>
    <Dialog
      labelId="meeting-create-title"
      eyebrow="New meeting · meet.sapphireclinicseast.org"
      title="Schedule a video meeting"
      onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => void submit()} disabled={busy}>{busy ? 'Creating…' : 'Create meeting'}</button>
      </>}
    >
      <div className="space-y-4">
        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Title</span>
          <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Grade 1 Math review" disabled={busy} />
        </label>

        <label className="block">
          <span className={LABEL} style={LABEL_STYLE}>Notes (optional)</span>
          <textarea className={TEXTAREA} style={CONTROL_STYLE} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything students should know before joining" rows={2} disabled={busy} />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className={LABEL} style={LABEL_STYLE}>Starts at</span>
            <input type="datetime-local" className={`${CONTROL} w-full min-w-0`} style={CONTROL_STYLE} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} disabled={busy} />
          </label>
          <label className="block min-w-0">
            <span className={LABEL} style={LABEL_STYLE}>Duration</span>
            <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={durationMin} onChange={e => setDurationMin(Number(e.target.value))} disabled={busy}>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1½ hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
            </select>
          </label>
        </div>

        <fieldset className="min-w-0">
          <legend className={LABEL} style={LABEL_STYLE}>
            Tag students (optional){participantIds.size > 0 ? ` — ${participantIds.size} selected` : ''}
          </legend>
          <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>
            Tagged students see this meeting on their own class portal. Leave empty to share the link manually.
          </p>
          <div className="max-h-56 overflow-auto rounded-lg p-1" style={{ border: '1px solid var(--light-gray)' }}>
            {eligibleStudents.length === 0 ? (
              <EmptyState icon="users" title="No eligible students" hint="No eligible students in your assigned classes." />
            ) : eligibleStudents.map(s => {
              const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
              return (
                <label key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] cursor-pointer hover:bg-[color:var(--paper)]">
                  <input
                    type="checkbox"
                    className="w-4 h-4 flex-shrink-0"
                    style={{ accentColor: 'var(--deep-teal)' }}
                    checked={participantIds.has(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={busy}
                  />
                  <Avatar text={initials(s.firstName, s.lastName)} size={24} />
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--charcoal)' }}>{displayName(name)}</span>
                  <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{s.branch ?? ''}{s.level ? ` · ${s.level}` : ''}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>
    </Dialog>
    </Portal>
  )
}
