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

  return (
    <div className="space-y-6">
      <div className="card-static">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[18px] leading-tight">Meetings</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1 max-w-2xl">
              Video meetings hosted on <span className="font-semibold">meet.sapphireclinicseast.org</span>.
              Anyone with the link joins straight into the room; the in-meeting toolbar offers
              <span className="font-semibold"> Cloud Record</span> (server-side, saved to the meet app),
              <span className="font-semibold"> Broadcast</span> (host only), and a
              <span className="font-semibold"> Whiteboard</span>. Tag students to keep the meeting visible on
              their own portal.
            </p>
          </div>
          {canCreate && (
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>+ New meeting</button>
          )}
        </div>

        {err && <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        {info && <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800 break-words">{info}</div>}

        <div className="flex flex-wrap items-end gap-3 mt-5">
          <label className="block flex-1 min-w-[240px]">
            <span className="label">Search</span>
            <input
              className="input"
              placeholder="Title, teacher, tagged student, or date"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          {cancelledCount > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ink)] pb-2">
              <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
              Show cancelled ({cancelledCount})
            </label>
          )}
        </div>

        <div className="overflow-auto mt-3 rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Title</th>
                <th className="py-2 px-3">Scheduled</th>
                <th className="py-2 px-3">Teacher</th>
                <th className="py-2 px-3">Tagged</th>
                <th className="py-2 px-3">Link</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">Loading meetings…</td></tr>}
              {!loading && meetings.length === 0 && (
                <tr><td colSpan={6} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">
                  {canCreate ? 'No meetings yet. Click + New meeting to create one.' : "You haven't been tagged into any meetings yet."}
                </td></tr>
              )}
              {!loading && meetings.length > 0 && filteredMeetings.length === 0 && (
                <tr><td colSpan={6} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">
                  No meetings match this search{!showCancelled && cancelledCount > 0 ? ' — try Show cancelled if you\'re looking for a cancelled one' : ''}.
                </td></tr>
              )}
              {filteredMeetings.map(m => {
                const scheduled = new Date(m.scheduledAt)
                const isCancelled = !!m.cancelledAt
                const isMine = viewer.role !== 'STUDENT' && m.teacherId === viewer.userId
                const canCancel = !isCancelled && (isMine || viewer.role === 'ADMIN' || viewer.role === 'BRANCH_ADMIN')
                const joinLink = viewer.role === 'STUDENT' ? m.guestLink : (m.hostLink ?? m.guestLink)
                return (
                  <tr key={m.id} className={`border-b hover:bg-[color:var(--paper-2)] ${isCancelled ? 'opacity-55' : ''}`} style={{ borderColor: 'var(--paper-3)' }}>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold">{m.title}</div>
                      {m.notes && <div className="text-[11.5px] text-[color:var(--mid-gray)]">{m.notes}</div>}
                      {isCancelled && <span className="ml-0 mt-1 inline-block text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">Cancelled</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[12.5px]">
                      {scheduled.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      <div className="text-[11px] text-[color:var(--mid-gray)]">{scheduled.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px]">{m.teacherName}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">
                      {m.participants.length === 0 ? <span className="text-[color:var(--mid-gray)]">— everyone with link</span> : (
                        <span title={m.participants.map(p => p.studentName).join(', ')}>{m.participants.length} student{m.participants.length === 1 ? '' : 's'}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px] whitespace-nowrap">
                      {joinLink ? (
                        <div className="flex flex-col items-start gap-1">
                          <a href={joinLink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--bright-teal)] underline">Open meeting</a>
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
                              className="text-[10.5px] px-1.5 py-0.5 rounded bg-[color:var(--paper-2)] hover:bg-[color:var(--paper-3)]"
                              title="Guest link — join the meeting and use Cloud Record from the toolbar."
                              onClick={() => void copyToClipboard(m.guestLink!, 'Guest link')}
                            >Copy guest link</button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {m.hostLink && (
                                <button
                                  type="button"
                                  className="text-[10.5px] px-1.5 py-0.5 rounded bg-[color:var(--sage-tint)] hover:bg-[color:var(--sage)] text-[color:var(--deep-teal)] font-semibold"
                                  title="Host link (KEEP PRIVATE): join as moderator — unlocks Broadcast + Cloud Record + Whiteboard controls."
                                  onClick={() => void copyToClipboard(m.hostLink!, 'Host link (keep private)')}
                                >🎥 Copy host link</button>
                              )}
                              {m.guestLink && (
                                <button
                                  type="button"
                                  className="text-[10.5px] px-1.5 py-0.5 rounded bg-[color:var(--paper-2)] hover:bg-[color:var(--paper-3)]"
                                  title="Guest link — safe to share with students/parents. They can Cloud Record from inside the meeting."
                                  onClick={() => void copyToClipboard(m.guestLink!, 'Guest link (share with students)')}
                                >Copy guest link</button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : <span className="text-[color:var(--mid-gray)]">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {canCancel && (
                        <button
                          className="text-xs px-2 py-1 rounded-md text-[color:var(--mid-gray)] hover:bg-[color:var(--paper-2)]"
                          title="Mark as cancelled — keeps the row in history but hides join buttons."
                          onClick={() => void handleCancel(m)}
                        >Cancel</button>
                      )}
                      {/* Delete is available on active AND cancelled rows,
                          so a teacher who cancelled by mistake or wants to
                          scrub a row entirely can. Same role gate as
                          cancel (creator + admin) — enforced server-side. */}
                      {(isMine || viewer.role === 'ADMIN' || viewer.role === 'BRANCH_ADMIN') && (
                        <button
                          className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] ml-1"
                          title="Permanently delete this meeting from the class portal."
                          onClick={() => void handleDelete(m)}
                        >Delete</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
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
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 flex items-start justify-center"
      onClick={() => !busy && onClose()}
    >
      <div className="card-static w-full max-w-lg mt-6 sm:mt-12" onClick={e => e.stopPropagation()}>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          New meeting · meet.sapphireclinicseast.org
        </div>
        <h3 className="text-[18px] leading-tight mb-4">Schedule a video meeting</h3>

        <label className="block mb-3">
          <span className="label">Title</span>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Grade 1 Math review" disabled={busy} />
        </label>

        <label className="block mb-3">
          <span className="label">Notes (optional)</span>
          <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything students should know before joining" rows={2} disabled={busy} />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="label">Starts at</span>
            <input type="datetime-local" className="input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} disabled={busy} />
          </label>
          <label className="block">
            <span className="label">Duration</span>
            <select className="select" value={durationMin} onChange={e => setDurationMin(Number(e.target.value))} disabled={busy}>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1½ hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
            </select>
          </label>
        </div>

        <div className="block mb-3">
          <span className="label">Tag students (optional)</span>
          <p className="text-[10.5px] text-[color:var(--mid-gray)] mb-2">
            Tagged students see this meeting on their own class portal. Leave empty to share the link manually.
          </p>
          <div className="max-h-56 overflow-auto rounded-lg border p-2 space-y-1" style={{ borderColor: 'var(--paper-3)' }}>
            {eligibleStudents.length === 0 ? (
              <div className="text-[12px] text-[color:var(--mid-gray)] px-2 py-3 text-center">No eligible students in your assigned classes.</div>
            ) : eligibleStudents.map(s => {
              const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
              return (
                <label key={s.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[color:var(--paper-2)] rounded text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={participantIds.has(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={busy}
                  />
                  <span className="flex-1">{name}</span>
                  <span className="text-[11px] text-[color:var(--mid-gray)]">{s.branch ?? ''}{s.level ? ` · ${s.level}` : ''}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary text-xs" onClick={() => void submit()} disabled={busy}>{busy ? 'Creating…' : 'Create meeting'}</button>
        </div>
      </div>
    </div>
  )
}
