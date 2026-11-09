'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  listAnnouncements, createAnnouncement, deleteAnnouncementServer, fetchAnnouncementPosterBlob,
  emailAnnouncement,
  getUsers, inferPaymentPlanFor, remindersForStudentOn,
  type AnnouncementRecord, type EnrollmentLevel, type PaymentReminder, levelLabel,
} from '@/lib/session'
import RichTextEditor from '@/components/RichTextEditor'
import { renderAnnouncementBodyHtml, bodyLooksLikeHtml } from '@/lib/announcement-html'
import {
  PageHeader, DashCard, Banner, StatusPill, Tag, Icon, RowsSkeleton, EmptyState,
  CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, FILE_FOCUS, FOCUS, SUBTLE_BG,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE,
  TH, TH_STYLE, TD, TR, TR_STYLE, DANGER,
} from '@/components/hub/ui'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

interface Props {
  viewer: { role: 'STUDENT' | 'TEACHER' | 'ADMIN'; level?: EnrollmentLevel; email: string; name: string; userId?: string }
  /** Optional page header rendered above the panel, with the announcement
   *  count beside it. /profile leaves this off and keeps its own heading. */
  header?: { eyebrow?: string; title: string; description?: string }
}

// ── Display helpers (no data access) ─────────────────────────────────────────

/** "Just now" / "5 min ago" / "Yesterday" / "3 days ago", then a plain date. */
function relativeDate(iso: string): string {
  const then = new Date(iso)
  const t = then.getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.round(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.floor(diff / 86400000)
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: then.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

/** One-line plain-text preview of an announcement body. DOMParser builds an
 *  inert document (no scripts, no image loads), and the result is rendered
 *  as text, never as HTML. */
function previewText(body: string): string {
  let text = body
  if (bodyLooksLikeHtml(body)) {
    text = typeof DOMParser !== 'undefined'
      ? (new DOMParser().parseFromString(body, 'text/html').body.textContent ?? '')
      : body.replace(/<[^>]+>/g, ' ')
  }
  return text.replace(/\s+/g, ' ').trim()
}

function audienceLabel(a: AnnouncementRecord): string {
  const lv = a.levels.length === 0 ? 'All levels'
    : a.levels.length <= 2 ? a.levels.map(l => levelLabel(l)).join(', ')
    : `${a.levels.length} levels`
  return a.includeTeachers ? `${lv} + teachers` : lv
}

export default function NotificationPanel({ viewer, header }: Props) {
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
    // body is HTML from the rich-text editor — an "empty" editor can
    // still produce <p><br></p>, so check visible text content, not
    // just string length.
    const visibleBody = bodyLooksLikeHtml(body)
      ? (typeof document !== 'undefined'
          ? (() => { const d = document.createElement('div'); d.innerHTML = body; return (d.textContent || '').trim() })()
          : body.replace(/<[^>]+>/g, '').trim())
      : body.trim()
    if (!visibleBody) { setPublishErr('Body is required.'); return }
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

  const isInbox = viewer.role === 'STUDENT'
  const countLabel = `${items.length} announcement${items.length === 1 ? '' : 's'}`

  return (
    <div className="space-y-5 min-w-0">
      {header && (
        <PageHeader
          eyebrow={header.eyebrow}
          title={header.title}
          description={header.description}
          actions={!loading ? <StatusPill tone="info">{countLabel}</StatusPill> : undefined}
        />
      )}

      {canCompose && (
        <DashCard
          title="Compose announcement"
          icon={<Icon name="edit" size={15} />}
          description={viewer.role === 'ADMIN'
            ? 'Title and details, an optional poster image or PDF, then choose the grade levels and whether teachers are included.'
            : 'Title and details, an optional poster image or PDF, then choose the grade levels.'}
          action={!composerOpen
            ? <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => setComposerOpen(true)}><Icon name="plus" size={14} /> New announcement</button>
            : undefined}
        >
          {!composerOpen ? (
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              Recipients see new announcements here and in their inbox. You can email an announcement after posting it, from its detail view.
            </p>
          ) : (
            <div className="space-y-4">
              {publishErr && <Banner tone="error">{publishErr}</Banner>}

              <label className="block">
                <span className={LABEL} style={LABEL_STYLE}>Title</span>
                <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mid-year IEP review schedule" disabled={publishBusy} />
              </label>

              <div className="block">
                <span className={LABEL} style={LABEL_STYLE}>Details</span>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="What parents and teachers need to know… use the toolbar for bold, italic, underline, lists, and links."
                  disabled={publishBusy}
                  minHeight={160}
                  ariaLabel="Announcement details"
                />
              </div>

              <div>
                <span className={LABEL} style={LABEL_STYLE}>Poster image or PDF <span className="normal-case tracking-normal font-normal">(optional)</span></span>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className={`${BTN_SECONDARY} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
                    <Icon name="upload" size={14} />
                    {poster ? 'Replace attachment' : 'Add poster or PDF'}
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
                      <span className="text-xs min-w-0 truncate max-w-full sm:max-w-[260px]" style={{ color: 'var(--mid-gray)' }}>
                        {poster.name} · {(poster.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        className={BTN_DANGER_GHOST}
                        style={{ color: DANGER }}
                        onClick={() => setPoster(null)}
                        disabled={publishBusy}
                        aria-label={`Remove attachment ${poster.name}`}
                      ><Icon name="x" size={12} /> Remove</button>
                    </>
                  )}
                </div>
                {posterPreviewUrl && poster && (
                  poster.type.startsWith('image/') ? (
                    <div className="mt-3 rounded-lg overflow-hidden max-w-[280px]" style={{ border: '1px solid var(--light-gray)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={posterPreviewUrl} alt="Poster preview" className="w-full h-auto block" />
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg px-3 py-2 flex items-center gap-2 max-w-[320px] text-xs" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--charcoal)' }}>
                      <Icon name="file" size={14} style={{ color: 'var(--mid-gray)' }} />
                      <Tag>{poster.type === 'application/pdf' ? 'PDF' : 'File'}</Tag>
                      <span className="truncate min-w-0">{poster.name}</span>
                    </div>
                  )
                )}
              </div>

              <fieldset className="min-w-0">
                <legend className={LABEL} style={LABEL_STYLE}>
                  Grade levels <span className="normal-case tracking-normal font-normal">(leave empty for all levels)</span>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_LEVELS.map(lvl => {
                    const active = selectedLevels.includes(lvl)
                    return (
                      <button
                        key={lvl}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedLevels(s => active ? s.filter(x => x !== lvl) : [...s, lvl])}
                        className={`inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${active ? '' : 'hover:bg-[color:var(--paper)]'} ${FOCUS}`}
                        style={active
                          ? { background: 'var(--deep-teal)', color: '#fff', border: '1px solid var(--deep-teal)' }
                          : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}
                        disabled={publishBusy}
                      >
                        {active && <Icon name="check" size={12} />}
                        {levelLabel(lvl)}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                  {selectedLevels.length === 0 ? 'Audience: all grade levels.' : `Audience: ${selectedLevels.length} grade level${selectedLevels.length === 1 ? '' : 's'} selected.`}
                </p>
              </fieldset>

              {viewer.role === 'ADMIN' && (
                <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" className={`w-4 h-4 accent-[color:var(--deep-teal)] ${FOCUS}`} checked={includeTeachers} onChange={e => setIncludeTeachers(e.target.checked)} disabled={publishBusy} />
                  Also notify teachers
                </label>
              )}

              <div className="flex flex-wrap gap-2 justify-end pt-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
                <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={() => setComposerOpen(false)} disabled={publishBusy}>Cancel</button>
                <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={handlePublish} disabled={publishBusy}>
                  {publishBusy ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </div>
          )}
        </DashCard>
      )}

      {reminders.length > 0 && (
        <DashCard
          flush
          title="Payment reminders"
          icon={<Icon name="wallet" size={15} />}
          description={viewer.role === 'STUDENT'
            ? 'Tuition due dates for your enrollment plan.'
            : 'Outstanding payments across all enrolled students.'}
        >
          <ul>
            {reminders.map((r, i) => (
              <li
                key={r.id}
                className="px-4 sm:px-5 py-3.5 flex items-start gap-3"
                style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}
              >
                <span className="mt-0.5" style={{ color: r.severity === 'WARNING' ? DANGER : 'var(--teal)' }}>
                  <Icon name={r.severity === 'WARNING' ? 'alert' : 'clock'} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-x-3 gap-y-1 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold break-words" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                        {viewer.role === 'ADMIN' && <span className="font-normal mr-1" style={{ color: 'var(--mid-gray)' }}>{r.studentName} ·</span>}
                        {r.title}
                      </div>
                      <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        <span className="uppercase tracking-[0.08em]">{r.plan}</span> plan · due {new Date(r.dueOn).toLocaleDateString()}
                      </div>
                    </div>
                    <StatusPill tone={r.severity === 'WARNING' ? 'error' : 'info'}>
                      {r.severity === 'WARNING' ? 'Past due' : 'Reminder'}
                    </StatusPill>
                  </div>
                  <p className="text-[13.5px] mt-2 break-words" style={{ color: 'var(--charcoal)' }}>{r.body}</p>
                  {viewer.role === 'STUDENT' && (
                    <div className="mt-3">
                      <a
                        href="/pay"
                        className={BTN_PRIMARY} style={PRIMARY_STYLE}>Pay tuition fee <Icon name="chevronRight" size={14} /></a>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </DashCard>
      )}

      <DashCard
        flush
        title={isInbox ? 'Announcements' : canCompose ? 'Posted announcements' : 'Announcements'}
        icon={<Icon name="info" size={15} />}
        description={isInbox
          ? 'News and updates from the school. Select one to read it in full.'
          : 'Everything posted so far, newest first. Open one to read it, email it to recipients or delete it.'}
        action={!loading && items.length > 0 && !header ? <StatusPill tone="info">{countLabel}</StatusPill> : undefined}
      >
        {loading ? (
          <RowsSkeleton rows={4} label="Loading announcements" />
        ) : items.length === 0 ? (
          isInbox
            ? <EmptyState icon="check" title="You’re all caught up" hint="No announcements yet. New ones from the school will appear here." />
            : <EmptyState icon="info" title="No announcements yet." hint={canCompose ? 'Use New announcement above to post the first one.' : undefined} />
        ) : isInbox ? (
          <ul aria-label="Announcements">
            {items.map((a, i) => {
              const preview = previewText(a.body)
              return (
                <li key={a.id} style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(a.id)}
                    className={`w-full text-left px-4 sm:px-5 py-3.5 flex items-start gap-3 transition-colors hover:bg-[#FBF9F5] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]`}
                    title="Open announcement details"
                  >
                    <span aria-hidden className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                      <Icon name={a.hasPoster ? (a.posterFileType?.startsWith('image/') ? 'image' : 'file') : 'info'} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold truncate min-w-0" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{a.title}</span>
                        <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()} className="text-[11.5px] whitespace-nowrap flex-shrink-0 tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                          {relativeDate(a.createdAt)}
                        </time>
                      </span>
                      {preview && (
                        <span className="block text-[12.5px] truncate mt-0.5" style={{ color: 'var(--mid-gray)' }}>{preview}</span>
                      )}
                      {a.hasPoster && (
                        <span className="flex flex-wrap gap-1.5 mt-1.5">
                          <Tag>{a.posterFileType?.startsWith('image/') ? 'Poster' : 'Attachment'}</Tag>
                        </span>
                      )}
                    </span>
                    <Icon name="chevronRight" size={16} className="mt-2 hidden sm:block" style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col" className={TH} style={TH_STYLE}>Announcement</th>
                  <th scope="col" className={TH} style={TH_STYLE}>Audience</th>
                  <th scope="col" className={TH} style={TH_STYLE}>Posted</th>
                  <th scope="col" className={TH} style={TH_STYLE}>Email</th>
                  <th scope="col" className={TH} style={TH_STYLE}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map(a => {
                  const preview = previewText(a.body)
                  return (
                    <tr key={a.id} className={TR} style={TR_STYLE}>
                      <td className={TD} style={{ maxWidth: 340 }}>
                        <div className="font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{a.title}</div>
                        {preview && <div className="text-[11.5px] truncate" style={{ color: 'var(--mid-gray)' }}>{preview}</div>}
                        {a.hasPoster && <div className="mt-1"><Tag>{a.posterFileType?.startsWith('image/') ? 'Poster' : 'Attachment'}</Tag></div>}
                      </td>
                      <td className={`${TD} text-[12.5px]`} style={{ color: 'var(--charcoal)' }}>
                        <span title={a.levels.length > 2 ? a.levels.map(l => levelLabel(l)).join(', ') : undefined}>{audienceLabel(a)}</span>
                      </td>
                      <td className={`${TD} text-[12.5px] whitespace-nowrap`}>
                        <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()} style={{ color: 'var(--charcoal)' }}>{relativeDate(a.createdAt)}</time>
                        <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{a.authorName}</div>
                      </td>
                      <td className={TD}>
                        {a.emailedAt ? (
                          <StatusPill
                            tone="success"
                            title={`Emailed to ${a.emailedCount ?? '?'} recipient(s) on ${new Date(a.emailedAt).toLocaleString()}`}
                          >Emailed{a.emailedCount != null ? ` · ${a.emailedCount}` : ''}</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">Not emailed</StatusPill>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        <button
                          type="button"
                          onClick={() => setOpenId(a.id)}
                          className={BTN_SM}
                          style={SECONDARY_STYLE}
                          title="Open announcement details"
                          aria-label={`View announcement ${a.title}`}
                        ><Icon name="eye" size={13} /> View</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

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
  // Gate the portal on client-mount so SSR doesn't trip on `document`.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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

  if (!mounted) return null
  const labelId = `announcement-title-${a.id}`
  // Portal to document.body so the modal escapes any ancestor that
  // applies `transform` / `filter` / `backdrop-filter` (e.g. the page's
  // `animate-fade-up` wrapper). Per CSS spec, those properties make
  // the element a containing block for descendants with position:fixed,
  // which was trapping the modal inside the right-of-sidebar area with
  // dead space below. Rendering through document.body puts `fixed
  // inset-0` back on the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-white overflow-y-auto overflow-x-hidden"
      onClick={onClose}
    >
      {/* Full-bleed modal: no backdrop gutter, no rounded card edge,
          no border — the announcement occupies the entire viewport,
          edge to edge, so the body is the only thing the reader sees.
          The header and action bar use the kit's Dialog chrome (sticky,
          hairline rules) so it reads as part of the same system. When a
          poster is attached we still render poster + body side-by-side. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="w-full min-h-screen bg-white flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-white px-4 sm:px-8 pt-4 pb-3 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
              Announcement
            </p>
            <h2 id={labelId} className="text-[18px] sm:text-[22px] font-bold leading-tight mt-1 break-words" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{a.title}</h2>
            <p className="text-[11.5px] mt-1 break-words" style={{ color: 'var(--mid-gray)' }}>
              {a.authorName} · <span className="uppercase tracking-[0.08em]">{a.authorRole}</span> · <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString()}</time>
            </p>
          </div>
          <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onClose}>
            <Icon name="x" size={14} /> Close
          </button>
        </header>

        <div className="flex-1 px-4 sm:px-8 py-5 min-w-0">
          {/* Audience chips — only the sender's view needs these. Students
              already see only announcements targeting their own grade level,
              so showing a 2-row GRADE_1 … GRADE_12 + TEACHERS chip bar just
              pushed the actual message below the fold. */}
          {viewer.role !== 'STUDENT' && (
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              <span className={`${LABEL} mb-0 mr-1`} style={LABEL_STYLE}>Audience</span>
              {a.levels.length === 0
                ? <Tag tone="brand">All levels</Tag>
                : a.levels.map(l => <Tag key={l} tone="brand">{levelLabel(l)}</Tag>)
              }
              {a.includeTeachers && <Tag tone="info">+ Teachers</Tag>}
            </div>
          )}

          <div className={`grid gap-5 ${a.hasPoster ? 'md:grid-cols-2' : ''}`}>
            {a.hasPoster && (
              <div className="rounded-xl overflow-hidden self-start min-w-0" style={{ border: '1px solid var(--light-gray)' }}>
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
                      <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11.5px]" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
                        <span className="truncate min-w-0">{a.posterFileName ?? 'Attached PDF'}</span>
                        <a
                          href={posterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}
                        ><Icon name="external" size={12} /> Open in new tab</a>
                      </div>
                    </div>
                  )
                ) : (
                  <div role="status" className="aspect-[16/9] flex items-center justify-center text-[12px]" style={{ color: 'var(--mid-gray)', background: SUBTLE_BG }}>
                    Loading attachment…
                  </div>
                )}
              </div>
            )}

            {/* Rich-text announcement body. Legacy plain-text bodies render
                through plainTextToHtml so paragraphs + line breaks still
                survive. Server also sanitizes before storage; this is
                defense in depth. */}
            <div
              className="rt-body text-[14.5px] text-[color:var(--ink)] leading-relaxed min-w-0 break-words max-w-[72ch]"
              dangerouslySetInnerHTML={{ __html: renderAnnouncementBodyHtml(a.body) }}
            />
            <style>{`
              .rt-body p { margin: 0 0 0.6em; }
              .rt-body p:last-child { margin-bottom: 0; }
              /* Tailwind's preflight resets list-style on ul/ol, so bullets
                 and numbers never render. Put them back explicitly. */
              .rt-body ul { list-style: disc outside; margin: 0.4em 0 0.4em 1.4em; padding-left: 0.2em; }
              .rt-body ol { list-style: decimal outside; margin: 0.4em 0 0.4em 1.4em; padding-left: 0.2em; }
              .rt-body li { margin: 0.15em 0; }
              .rt-body a { color: var(--sage); text-decoration: underline; }
            `}</style>
          </div>
        </div>

        {(canSendEmail || canDelete) && (
          <div className="sticky bottom-0 px-4 sm:px-8 py-3 flex flex-wrap items-center gap-3 justify-between" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] min-w-0" style={{ color: 'var(--mid-gray)' }}>
              {a.emailedAt
                ? <>
                    <StatusPill tone="success">Emailed</StatusPill>
                    <span className="break-words">by <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{a.emailedBy ?? 'unknown'}</span> on {new Date(a.emailedAt).toLocaleString()}{a.emailedCount != null ? ` · ${a.emailedCount} recipient(s)` : ''}.</span>
                  </>
                : <><StatusPill tone="neutral">Not emailed</StatusPill><span>Not yet emailed to recipients.</span></>
              }
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {canDelete && (
                <button
                  type="button"
                  className={BTN_DANGER_GHOST}
                  style={{ color: DANGER }}
                  onClick={() => void onDelete()}
                ><Icon name="trash" size={14} /> Delete announcement</button>
              )}
              {canSendEmail && (
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  style={PRIMARY_STYLE}
                  onClick={() => void handleSendEmail()}
                  disabled={sending}
                  title="Email this announcement to every targeted student (and teachers if included)."
                >
                  {sending ? 'Sending…' : (a.emailedAt ? 'Send email again' : 'Send Email')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
