'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getNotifications, notificationsForStudent, notificationsForTeacher,
  saveNotification, deleteNotification,
  getUsers, inferPaymentPlanFor, remindersForStudentOn,
  type NotificationRecord, type EnrollmentLevel, type PaymentReminder, levelLabel,
} from '@/lib/session'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10']

interface Props {
  viewer: { role: 'STUDENT' | 'TEACHER' | 'ADMIN'; level?: EnrollmentLevel; email: string; name: string; userId?: string }
}

export default function NotificationPanel({ viewer }: Props) {
  const [items, setItems] = useState<NotificationRecord[]>([])
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedLevels, setSelectedLevels] = useState<EnrollmentLevel[]>([])
  const [includeTeachers, setIncludeTeachers] = useState(false)

  function refresh() {
    if (viewer.role === 'STUDENT') setItems(viewer.level ? notificationsForStudent(viewer.level) : [])
    else if (viewer.role === 'TEACHER') setItems(notificationsForTeacher(viewer.email))
    else setItems(getNotifications())
  }
  useEffect(refresh, [viewer.role, viewer.level, viewer.email])

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
      const students = getUsers().filter(u => u.role === 'STUDENT')
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

  function handlePublish() {
    if (!title.trim()) { alert('Title is required.'); return }
    if (!body.trim()) { alert('Body is required.'); return }
    saveNotification({
      id: 'ntf_' + Math.random().toString(36).slice(2, 10),
      title: title.trim(),
      body: body.trim(),
      authorRole: viewer.role === 'ADMIN' ? 'ADMIN' : 'TEACHER',
      authorName: viewer.name || viewer.email,
      authorId: viewer.userId,
      levels: selectedLevels,
      // Only admin can choose to include teachers; teacher-authored notifications
      // are visible to all teachers by default (since teacher === author role).
      includeTeachers: viewer.role === 'ADMIN' ? includeTeachers : true,
      createdAt: new Date().toISOString(),
    })
    setTitle(''); setBody(''); setSelectedLevels([]); setIncludeTeachers(false)
    setComposerOpen(false)
    refresh()
  }

  const canCompose = viewer.role === 'ADMIN' || viewer.role === 'TEACHER'

  return (
    <div className="space-y-4">
      {canCompose && (
        <div className="card-static">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[18px] leading-tight">Compose notification</h2>
              <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
                Filter by grade levels and optionally include teachers in the audience.
              </p>
            </div>
            {!composerOpen && <button className="btn-cta text-xs" onClick={() => setComposerOpen(true)}>New announcement</button>}
          </div>

          {composerOpen && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="label">Title</span>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mid-year IEP review schedule" />
              </label>
              <label className="block">
                <span className="label">Message</span>
                <textarea className="input" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Details for parents…" />
              </label>
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
                      >{levelLabel(lvl)}</button>
                    )
                  })}
                </div>
              </div>
              {viewer.role === 'ADMIN' && (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeTeachers} onChange={e => setIncludeTeachers(e.target.checked)} />
                  Also notify teachers
                </label>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary text-xs" onClick={() => setComposerOpen(false)}>Cancel</button>
                <button type="button" className="btn-primary text-xs" onClick={handlePublish}>Publish</button>
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
        {items.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No announcements yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map(n => (
              <li key={n.id} className="rounded-xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{n.title}</div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-0.5">
                      {n.authorName} · <span className="uppercase tracking-[0.08em]">{n.authorRole}</span> · {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {n.levels.length === 0 ? (
                      <span className="badge badge-approved">All levels</span>
                    ) : (
                      n.levels.map(l => <span key={l} className="badge badge-teletherapy">{levelLabel(l)}</span>)
                    )}
                    {n.includeTeachers && <span className="badge badge-pending">+ Teachers</span>}
                  </div>
                </div>
                <p className="text-[13.5px] text-[color:var(--ink)] mt-3 whitespace-pre-wrap">{n.body}</p>
                {viewer.role === 'ADMIN' && (
                  <div className="mt-3 text-right">
                    <button className="text-xs text-[color:var(--clay)] hover:underline" onClick={() => { if (confirm('Delete this announcement?')) { deleteNotification(n.id); refresh() } }}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
