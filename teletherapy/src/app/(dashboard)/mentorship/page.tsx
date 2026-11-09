'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, ChevronDown, ChevronUp, FileText, Lock } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import MeetingsHub from '@/components/MeetingsHub'
import NoteBody from '@/components/NoteBody'
import {
  Avatar, CARD_STYLE, EmptyState, PAGE, PageHeader, PillTabs, RowsSkeleton, StatusPill, SUBTLE_BG, Tag,
} from '@/components/hub/ui'

interface Mentee { id: string; name: string; department: string; branch: string }
interface MenteeNote {
  scheduleId: string
  date: string
  patientName: string
  id: string
  status: string
  notes: string | null
  isInitialEvaluation: boolean
  discontinuedRemarks: string | null
  lockedAt: string | null
  editHistory?: { name: string; action: string; at: string }[] | null
}

type Tab = 'mentees' | 'meeting'

export default function MentorshipPage() {
  const { data: sess, status } = useSession()
  const isAdmin = (sess?.user as { role?: string } | undefined)?.role === 'ADMIN'
  const isClinicalMentor = !!(sess?.user as { isClinicalMentor?: boolean } | undefined)?.isClinicalMentor
  const isMentee = !!(sess?.user as { isMentee?: boolean } | undefined)?.isMentee
  const canSeeMentees = isAdmin || isClinicalMentor
  // Only Clinical Mentors, their mentees, and admins may see Mentorship at all.
  const canParticipate = canSeeMentees || isMentee

  const [tab, setTab] = useState<Tab>(canSeeMentees ? 'mentees' : 'meeting')

  const [mentees, setMentees] = useState<Mentee[] | null>(null)
  const [menteesLoading, setMenteesLoading] = useState(false)
  const [openMentee, setOpenMentee] = useState<string | null>(null)
  const [notesByMentee, setNotesByMentee] = useState<Record<string, MenteeNote[]>>({})
  const [notesLoading, setNotesLoading] = useState<string | null>(null)
  const [openNote, setOpenNote] = useState<string | null>(null)

  useEffect(() => {
    if (!canSeeMentees) return
    setMenteesLoading(true)
    fetch('/api/mentorship/mentees')
      .then((r) => r.json())
      .then((d) => setMentees(d.mentees ?? []))
      .catch(() => setMentees([]))
      .finally(() => setMenteesLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeMentees])

  async function toggleMentee(id: string) {
    if (openMentee === id) { setOpenMentee(null); return }
    setOpenMentee(id)
    if (notesByMentee[id]) return // cached
    setNotesLoading(id)
    try {
      const res = await fetch(`/api/mentorship/mentees/${id}/notes`)
      const data = await res.json()
      setNotesByMentee((prev) => ({ ...prev, [id]: res.ok ? (data.notes ?? []) : [] }))
    } catch { setNotesByMentee((prev) => ({ ...prev, [id]: [] })) }
    setNotesLoading(null)
  }

  // Non-participants (not a mentor, mentee, or admin) never see this section.
  if (status === 'authenticated' && !canParticipate) {
    return (
      <div className={PAGE}>
        <PageHeader eyebrow="Programs" title="Mentorship" />
        <section className="rounded-xl" style={CARD_STYLE}>
          <Lock size={24} className="mx-auto mt-10" style={{ color: 'var(--mid-gray)' }} aria-hidden />
          <EmptyState
            title="Mentorship isn't available for your account"
            hint="This section is only for Clinical Mentors and their mentees. If you should have access, ask HR to tag you in Staff Profiles."
          />
        </section>
      </div>
    )
  }

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Programs"
        title="Mentorship"
        description={canSeeMentees ? 'Your mentees’ session notes, and your mentorship meetings.' : 'Schedule and join your mentorship meetings.'}
      />

      {canSeeMentees && (
        <PillTabs
          label="Mentorship sections"
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            { id: 'mentees', label: 'Mentees', count: mentees?.length },
            { id: 'meeting', label: 'Meetings' },
          ]}
        />
      )}

      {tab === 'meeting' && <MeetingsHub context="MENTORSHIP" canSetAvailability={canSeeMentees} />}

      {tab === 'mentees' && canSeeMentees && (
        <div className="space-y-3">
          <p className="text-xs px-0.5" style={{ color: 'var(--mid-gray)' }}>People picked into your mentee list in HR Staff Profiles. Open a mentee to read every session note they’ve written.</p>
          {menteesLoading ? (
            <div className="rounded-xl" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading mentees" /></div>
          ) : (mentees ?? []).length === 0 ? (
            <section className="rounded-xl" style={CARD_STYLE}>
              <EmptyState
                icon="users"
                title="No mentees yet"
                hint="When people are picked into your mentee list in HR Staff Profiles, they’ll appear here with their session notes."
              />
            </section>
          ) : (
            (mentees ?? []).map((m) => {
              const open = openMentee === m.id
              const notes = notesByMentee[m.id]
              return (
                <div key={m.id} className="rounded-xl overflow-hidden" style={CARD_STYLE}>
                  <button onClick={() => toggleMentee(m.id)} aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8FAF2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar text={m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')} size={38} />
                      <div className="min-w-0">
                        <p className="font-semibold text-[14px] truncate" style={{ color: 'var(--charcoal)' }}>{m.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--mid-gray)' }}>{m.department} · {branchLabel(m.branch)}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      {notesLoading === m.id && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
                      {notes && <Tag>{notes.length} note{notes.length === 1 ? '' : 's'}</Tag>}
                      {open ? <ChevronUp size={18} style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={18} style={{ color: 'var(--mid-gray)' }} />}
                    </span>
                  </button>
                  {open && (
                    <div className="p-2 sm:p-3 space-y-2" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                      {notes && notes.length === 0 && (
                        <p className="text-xs px-2 py-3" style={{ color: 'var(--mid-gray)' }}>No session notes yet.</p>
                      )}
                      {(notes ?? []).map((n) => {
                        const nOpen = openNote === n.id
                        return (
                          <div key={n.id} className="rounded-lg overflow-hidden" style={CARD_STYLE}>
                            <button onClick={() => setOpenNote(nOpen ? null : n.id)} aria-expanded={nOpen}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#F8FAF2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]">
                              <span className="flex items-center gap-2 flex-wrap min-w-0">
                                <FileText size={14} style={{ color: 'var(--teal)' }} aria-hidden />
                                <span className="font-semibold text-[13.5px]" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{n.patientName}</span>
                                <StatusPill tone="info">{n.status}</StatusPill>
                                {n.lockedAt && <StatusPill tone="warn">Locked</StatusPill>}
                              </span>
                              {nOpen ? <ChevronUp size={16} className="shrink-0" style={{ color: 'var(--mid-gray)' }} /> : <ChevronDown size={16} className="shrink-0" style={{ color: 'var(--mid-gray)' }} />}
                            </button>
                            {nOpen && (
                              <div className="px-3 pb-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
                                {n.notes ? <NoteBody notes={n.notes} /> : <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>No note text.</p>}
                                {n.discontinuedRemarks && (
                                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}><span className="font-semibold">Discontinued remarks:</span> {n.discontinuedRemarks}</p>
                                )}
                                {n.editHistory && n.editHistory.length > 0 && (
                                  <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                                    {n.editHistory.map((e, idx) => (
                                      <span key={idx}>{idx > 0 ? ' · ' : ''}{e.name} {e.action} {new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    ))}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
