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

  async function handleCancel(m: MeetingRecord) {
    if (!confirm(`Cancel "${m.title}"? The meeting will show as CANCELLED and the join buttons disappear. Existing invitation links still verify until ${new Date(m.endsAt).toLocaleString()} — LiveKit can't recall signed tokens.`)) return
    const ok = await cancelMeeting(m.id)
    if (!ok) { setErr('Could not cancel the meeting. Please retry.'); return }
    setInfo(`"${m.title}" cancelled.`)
    void refresh()
  }

  async function handleDelete(m: MeetingRecord) {
    const warn = `PERMANENTLY DELETE "${m.title}"?\n\nThis wipes the meeting record and its ${m.participants.length} tagged student${m.participants.length === 1 ? '' : 's'} from the class portal — it will not appear in any history again. Cannot be undone.\n\nNote: if the join link was already shared, it still verifies on the meet app until ${new Date(m.endsAt).toLocaleString()} — LiveKit can't recall signed tokens.`
    if (!confirm(warn)) return
    const ok = await deleteMeeting(m.id)
    if (!ok) { setErr('Could not delete the meeting. Please retry.'); return }
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

  return (
    <div className="space-y-6">
      <div className="card-static">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[18px] leading-tight">Meetings</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1 max-w-xl">
              Video meetings hosted on <span className="font-semibold">meet.sapphireclinicseast.org</span>.
              Anyone with the link joins straight into the room — participants can start recording + open a
              whiteboard from the meeting toolbar. Tag students to keep the meeting visible on their own portal.
            </p>
          </div>
          {canCreate && (
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>+ New meeting</button>
          )}
        </div>

        {err && <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        {info && <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800 break-words">{info}</div>}

        <div className="overflow-auto mt-5 rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
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
              {meetings.map(m => {
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
                        <div className="flex items-center gap-1.5">
                          <a href={joinLink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--bright-teal)] underline">Open</a>
                          <button
                            type="button"
                            className="text-[10.5px] px-1.5 py-0.5 rounded bg-[color:var(--paper-2)] hover:bg-[color:var(--paper-3)]"
                            onClick={() => void copyToClipboard(joinLink, viewer.role === 'STUDENT' ? 'Guest link' : 'Host link')}
                          >Copy</button>
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
