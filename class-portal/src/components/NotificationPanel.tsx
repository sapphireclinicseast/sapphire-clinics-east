'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  listAnnouncements, createAnnouncement, deleteAnnouncementServer, fetchAnnouncementPosterBlob,
  emailAnnouncement,
  getUsers, inferPaymentPlanFor, remindersForStudentOn,
  type AnnouncementRecord, type EnrollmentLevel, type PaymentReminder, levelLabel,
} from '@/lib/session'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

interface Props {
  viewer: { role: 'STUDENT' | 'TEACHER' | 'ADMIN'; level?: EnrollmentLevel; email: string; name: string; userId?: string }
}

export default function NotificationPanel({ viewer }: Props) {
  const [items, setItems] = useState<AnnouncementRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedLevels, setSelectedLevels] = useState<EnrollmentLevel[]>([])
  const [includeTeachers, setIncludeTeachers] = useState(false)
  const [poster, setPoster] = useState<File | null>(null)
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishErr, setPublishErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const all = await listAnnouncements()
      setItems(all)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [])

  // Manage the local preview URL for the staged poster so we don't leak.
  useEffect(() => {
    if (!poster) { setPosterPreviewUrl(null); return }
    const url = URL.createObjectURL(poster)
    setPosterPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [poster])

  // Date-driven payment reminders. STUDENT sees only their own; ADMIN sees
  // reminders for every enrolled student with an outstanding payment.
  const reminders = useMemo<PaymentReminder[]>(() => {
    if (viewer.role === 'STUDENT') {
      if (!viewer.userId) return []
      const plan = inferPaymentPlanFor(viewer.userId)
      if (!plan) return []
      return remindersForStudentOn(viewer.userId, viewer.email, viewer.name || viewer.email, plan)
    }
    if (viewer.role === 'ADMIN') {
      const students = getUsers().filter(u => u.role === 'STUDENT' && !u.disabledAt)
      const out: PaymentReminder[] = []
      for (const s of students) {
        const plan = inferPaymentPlanFor(s.id)
        if (!plan) continue
        const studentName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
        out.push(...remindersForStudentOn(s.id, s.email, studentName, plan))
      }
      return out.sort((a, b) => new Date(b.windowOpensAt).getTime() - new Date(a.windowOpensAt).getTime())
    }
    return []
  }, [viewer.role, viewer.userId, viewer.email, viewer.name])

  async function handlePublish() {
    if (!title.trim()) { setPublishErr('Title is required.'); return }
    if (!body.trim()) { setPublishErr('Body is required.'); return }
    setPublishBusy(true); setPublishErr(null)
    try {
      const created = await createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        levels: selectedLevels,
        // Teachers always also see what they publish (mirrors prior
        // behaviour); admin chooses explicitly.
        includeTeachers: viewer.role === 'ADMIN' ? includeTeachers : true,
        authorName: viewer.name || viewer.email,
        poster,
      })
      if (!created) { setPublishErr('Could not publish. Please retry.'); return }
      setTitle(''); setBody(''); setSelectedLevels([]); setIncludeTeachers(false); setPoster(null)
      setComposerOpen(false)
      await refresh()
    } finally { setPublishBusy(false) }
  }

  async function handleDelete(a: AnnouncementRecord) {
    if (!confirm(`Delete the announcement "${a.title}"?`)) return
    const ok = await deleteAnnouncementServer(a.id)
    if (ok) {
      setItems(prev => prev.filter(x => x.id !== a.id))
      if (openId === a.id) setOpenId(null)
    } else {
      alert('Could not delete. Please retry.')
    }
  }

  const canCompose = viewer.role === 'ADMIN' || viewer.role === 'TEACHER'
  const openItem = openId ? items.find(x => x.id === openId) ?? null : null

  return (
    <div className="space-y-4">
      {canCompose && (
        <div className="card-static">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[18px] leading-tight">Compose announcement</h2>
              <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
                Title + body, optional poster image. Filter by grade levels and (admin only) optionally include teachers.
              </p>
            </div>
            {!composerOpen && <button className="btn-cta text-xs" onClick={() => setComposerOpen(true)}>New announcement</button>}
          </div>

          {composerOpen && (
            <div className="mt-4 space-y-3">
              {publishErr && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{publishErr}</div>}

              <label className="block">
                <span className="label">Title</span>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mid-year IEP review schedule" disabled={publishBusy} />
              </label>

              <label className="block">
                <span className="label">Details</span>
                <textarea className="input" rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="What parents and teachers need to know…" disabled={publishBusy} />
              </label>

              <div>
                <span className="label">Poster image or PDF (optional)</span>
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  <label className="btn-secondary text-xs cursor-pointer inline-flex items-center" style={{ width: 'auto' }}>
                    {poster ? 'Replace attachment' : '+ Add poster or PDF'}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/*,application/pdf,.pdf"
                      onChange={e => {
                        const picked = e.target.files ? Array.from(e.target.files) : []
                        e.target.value = ''
                        setPoster(picked[0] ?? null)
                      }}
                      disabled={publishBusy}
                    />
                  </label>
                  {poster && (
                    <>
                      <span className="text-[11.5px] text-[color:var(--mid-gray)] truncate max-w-[260px]">
                        {poster.name} · {(poster.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]"
                        onClick={() => setPoster(null)}
                        disabled={publishBusy}
                      >Remove</button>
                    </>
                  )}
                </div>
                {posterPreviewUrl && poster && (
                  poster.type.startsWith('image/') ? (
                    <div className="mt-3 rounded-lg overflow-hidden border max-w-[280px]" style={{ borderColor: 'var(--paper-3)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={posterPreviewUrl} alt="Poster preview" className="w-full h-auto block" />
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border px-3 py-2 flex items-center gap-2 max-w-[320px] text-[12px] text-[color:var(--ink)]" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
                      <span className="font-semibold uppercase tracking-[0.08em] text-[10.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                        {poster.type === 'application/pdf' ? 'PDF' : 'File'}
                      </span>
                      <span className="truncate">{poster.name}</span>
                    </div>
                  )
                )}
              </div>

              <div>
                <span className="label">Grade levels (leave empty = all)</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_LEVELS.map(lvl => {
                    const active = selectedLevels.includes(lvl)
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSelectedLevels(s => active ? s.filter(x => x !== lvl) : [...s, lvl])}
                        className={`px-3 py-1.5 rounded-full text-xs border ${active ? 'bg-[color:var(--narra)] text-white border-transparent' : 'bg-white text-[color:var(--narra)]'}`}
                        style={{ borderColor: active ? 'transparent' : 'var(--paper-3)' }}
                        disabled={publishBusy}
                      >{levelLabel(lvl)}</button>
                    )
                  })}
                </div>
              </div>

              {viewer.role === 'ADMIN' && (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeTeachers} onChange={e => setIncludeTeachers(e.target.checked)} disabled={publishBusy} />
                  Also notify teachers
                </label>
              )}

              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary text-xs" onClick={() => setComposerOpen(false)} disabled={publishBusy}>Cancel</button>
                <button type="button" className="btn-primary text-xs" onClick={handlePublish} disabled={publishBusy}>
                  {publishBusy ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {reminders.length > 0 && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-1">Payment reminders</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-3">
            {viewer.role === 'STUDENT'
              ? 'Tuition due dates for your enrollment plan.'
              : 'Outstanding payments across all enrolled students.'}
          </p>
          <ul className="space-y-3">
            {reminders.map(r => (
              <li
                key={r.id}
                className="rounded-xl p-4 border"
                style={{
                  borderColor: r.severity === 'WARNING' ? '#fda4af' : 'var(--paper-3)',
                  background: r.severity === 'WARNING' ? '#fff1f2' : '#fffaf0',
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
                      {viewer.role === 'ADMIN' && <span className="text-[color:var(--mid-gray)] font-normal mr-1">[{r.studentName}]</span>}
                      {r.title}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-0.5">
                      <span className="uppercase tracking-[0.08em]">{r.plan}</span> plan · due {new Date(r.dueOn).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`badge ${r.severity === 'WARNING' ? 'badge-pending' : 'badge-approved'}`}>
                    {r.severity === 'WARNING' ? 'Past due' : 'Reminder'}
                  </span>
                </div>
                <p className="text-[13.5px] text-[color:var(--ink)] mt-3">{r.body}</p>
                {viewer.role === 'STUDENT' && (
                  <div className="mt-3">
                    <a href="/pay" className="btn-cta text-xs">Pay tuition fee →</a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">Announcements</h2>
        {loading ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No announcements yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            {items.map(a => (
              <li key={a.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpenId(a.id)}
                  className="w-full text-left flex items-start justify-between gap-3 flex-wrap hover:opacity-90"
                  title="Open announcement details"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[color:var(--narra)] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                      {a.title}
                      {a.hasPoster && <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)]">📎 Poster</span>}
                      {a.emailedAt && (
                        <span
                          className="ml-2 text-[10px] uppercase tracking-[0.08em] text-[color:var(--moss)]"
                          title={`Emailed to ${a.emailedCount ?? '?'} recipient(s) on ${new Date(a.emailedAt).toLocaleString()}`}
                        >
                          ✉ Emailed{a.emailedCount != null ? ` · ${a.emailedCount}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-0.5">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-[11.5px] text-[color:var(--mid-gray)] underline decoration-dotted">View</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {openItem && (
        <AnnouncementModal
          announcement={openItem}
          viewer={viewer}
          onClose={() => setOpenId(null)}
          onDelete={() => handleDelete(openItem)}
          onSent={(result) => {
            // Patch the cached item with the new emailed* fields so the
            // badge + button state updates without a full refetch.
            setItems(prev => prev.map(x => x.id === openItem.id
              ? { ...x, emailedAt: result.emailedAt ?? new Date().toISOString(), emailedBy: result.emailedBy ?? viewer.email, emailedCount: result.sent }
              : x))
          }}
        />
      )}
    </div>
  )
}

function AnnouncementModal({ announcement: a, viewer, onClose, onDelete, onSent }: {
  announcement: AnnouncementRecord
  viewer: Props['viewer']
  onClose: () => void
  onDelete: () => void | Promise<void>
  onSent: (result: { sent: number; emailedAt?: string; emailedBy?: string }) => void
}) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!a.hasPoster) return
    let cancelled = false
    let createdUrl: string | null = null
    void (async () => {
      const blob = await fetchAnnouncementPosterBlob(a.id)
      if (cancelled || !blob) return
      createdUrl = URL.createObjectURL(blob)
      setPosterUrl(createdUrl)
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [a.id, a.hasPoster])

  // The admin can delete anything. A teacher can delete what they
  // authored. Students never see a Delete button.
  const canDelete = viewer.role === 'ADMIN'
    || (viewer.role === 'TEACHER' && a.authorEmail === viewer.email)
  // Admin, teacher, and front desk can blast the announcement by email
  // to all targeted students (and teachers when includeTeachers is on).
  // Front desk emails are branch-scoped server-side.
  const canSendEmail = viewer.role === 'ADMIN' || viewer.role === 'TEACHER'

  async function handleSendEmail() {
    if (sending) return
    const confirmMsg = a.emailedAt
      ? `This announcement was already emailed on ${new Date(a.emailedAt).toLocaleString()}` +
        (a.emailedCount != null ? ` to ${a.emailedCount} recipient(s)` : '') +
        `.\n\nSend it again now?`
      : `Send this announcement by email to every targeted recipient` +
        (a.levels.length === 0 ? ' (all grade levels)' : ` (${a.levels.length} grade level(s))`) +
        (a.includeTeachers ? ' plus all teachers' : '') +
        `?`
    if (!confirm(confirmMsg)) return
    setSending(true)
    try {
      const result = await emailAnnouncement(a.id)
      if (!result) {
        alert('Could not send the emails. Please retry.')
        return
      }
      const note = result.note ? `\n\n${result.note}` : ''
      const failures = result.failed > 0 ? `\n\nFailed: ${result.failed}.` : ''
      // Show the per-grade breakdown so the sender can verify the
      // recipient set matched the announcement's level targeting.
      let breakdown = ''
      if (result.recipientBreakdown) {
        const byRole = result.recipientBreakdown.byRole
        const byLevel = result.recipientBreakdown.byLevel
        const studentCount = byRole.STUDENT ?? 0
        const teacherCount = byRole.TEACHER ?? 0
        const levelLines = Object.entries(byLevel)
          .filter(([k]) => k !== '(none)')
          .map(([level, count]) => `  • ${levelLabel(level as EnrollmentLevel)}: ${count}`)
          .join('\n')
        breakdown = '\n\nBreakdown:'
        if (studentCount > 0) breakdown += `\n${studentCount} student${studentCount === 1 ? '' : 's'}`
        if (levelLines) breakdown += `\n${levelLines}`
        if (teacherCount > 0) breakdown += `\n${teacherCount} teacher${teacherCount === 1 ? '' : 's'}`
      }
      alert(`Email sent to ${result.sent} recipient(s).${failures}${breakdown}${note}`)
      onSent({ sent: result.sent, emailedAt: result.emailedAt, emailedBy: result.emailedBy })
    } finally {
      setSending(false)
    }
  }

  return (
    // Lighter, non-blurred backdrop. The previous bg-black/40 +
    // backdrop-blur-sm fought the modal for attention and made the
    // poster image and surrounding body text feel cramped. A very
    // soft tint is enough to signal "modal on top" without competing.
    <div
      className="fixed inset-0 z-50 bg-black/15 overflow-y-auto p-2 sm:p-4"
      onClick={onClose}
    >
      {/* No max-width cap — the modal fills the entire viewport minus
          the wrapper's small padding. When a poster is attached we
          render poster + body side-by-side so the message text is
          visible immediately next to the image, no scroll needed for
          most content. */}
      <div
        className="w-full mx-auto my-2 sm:my-4 card-static"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              Announcement
            </div>
            <h2 className="text-[22px] leading-tight text-[color:var(--deep-teal)] mt-1">{a.title}</h2>
            <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-1">
              {a.authorName} · <span className="uppercase tracking-[0.08em]">{a.authorRole}</span> · {new Date(a.createdAt).toLocaleString()}
            </div>
          </div>
          <button className="btn-secondary text-xs whitespace-nowrap" onClick={onClose}>Close</button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {a.levels.length === 0
            ? <span className="badge badge-approved">All levels</span>
            : a.levels.map(l => <span key={l} className="badge badge-teletherapy">{levelLabel(l)}</span>)
          }
          {a.includeTeachers && <span className="badge badge-pending">+ Teachers</span>}
        </div>

        <div className={`grid gap-5 ${a.hasPoster ? 'md:grid-cols-2' : ''}`}>
          {a.hasPoster && (
            <div className="rounded-xl overflow-hidden border self-start" style={{ borderColor: 'var(--paper-3)' }}>
              {posterUrl ? (
                a.posterFileType?.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterUrl}
                    alt={a.posterFileName ?? 'Poster'}
                    // Cap the poster height so the body text is always
                    // visible next to it. object-contain preserves the
                    // aspect ratio even on tall portrait posters.
                    className="w-full h-auto block max-h-[75vh] object-contain bg-[color:var(--paper-2)]"
                  />
                ) : (
                  // PDF (typically parent-orientation slides). Render
                  // inline via iframe so parents can scroll/zoom
                  // without leaving the modal; provide an explicit
                  // "Open in new tab" link as a fallback for clients
                  // that block in-frame PDF rendering.
                  <div className="flex flex-col">
                    <iframe
                      src={posterUrl}
                      title={a.posterFileName ?? 'Attached PDF'}
                      className="w-full block bg-[color:var(--paper-2)]"
                      style={{ height: '75vh', border: 'none' }}
                    />
                    <div className="px-3 py-2 border-t flex items-center justify-between gap-2 text-[11.5px] text-[color:var(--mid-gray)]" style={{ borderColor: 'var(--paper-3)' }}>
                      <span className="truncate">{a.posterFileName ?? 'Attached PDF'}</span>
                      <a
                        href={posterUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[color:var(--narra)] whitespace-nowrap"
                      >Open in new tab →</a>
                    </div>
                  </div>
                )
              ) : (
                <div className="aspect-[16/9] flex items-center justify-center text-[12px] text-[color:var(--mid-gray)]">
                  Loading attachment…
                </div>
              )}
            </div>
          )}

          <p className="text-[14.5px] text-[color:var(--ink)] whitespace-pre-wrap leading-relaxed">{a.body}</p>
        </div>

        {(canSendEmail || canDelete) && (
          <div className="mt-5 pt-4 border-t flex flex-wrap items-center gap-3 justify-between" style={{ borderColor: 'var(--paper-3)' }}>
            <div className="text-[11.5px] text-[color:var(--mid-gray)]">
              {a.emailedAt
                ? <>✉ Last emailed by <span className="font-semibold">{a.emailedBy ?? 'unknown'}</span> on {new Date(a.emailedAt).toLocaleString()}{a.emailedCount != null ? ` · ${a.emailedCount} recipient(s)` : ''}.</>
                : 'Not yet emailed to recipients.'
              }
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {canSendEmail && (
                <button
                  type="button"
                  className="btn-cta text-xs"
                  onClick={() => void handleSendEmail()}
                  disabled={sending}
                  title="Email this announcement to every targeted student (and teachers if included)."
                >
                  {sending ? 'Sending…' : (a.emailedAt ? 'Send email again' : 'Send Email')}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]"
                  onClick={() => void onDelete()}
                >Delete announcement</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
