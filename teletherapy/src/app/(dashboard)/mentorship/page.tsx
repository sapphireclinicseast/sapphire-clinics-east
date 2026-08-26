'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, ChevronDown, ChevronUp, FileText, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import MeetingsPanel from '@/components/MeetingsPanel'

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
  const { data: sess } = useSession()
  const isAdmin = (sess?.user as { role?: string } | undefined)?.role === 'ADMIN'
  const isClinicalMentor = !!(sess?.user as { isClinicalMentor?: boolean } | undefined)?.isClinicalMentor
  const canSeeMentees = isAdmin || isClinicalMentor

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Mentorship
        </h1>
        <p className="text-white/60 text-sm mt-1">
          {canSeeMentees ? 'Your mentees’ session notes, and your mentorship meetings' : 'Schedule and join your mentorship meetings'}
        </p>
      </div>

      {canSeeMentees && (
        <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-[var(--off-white)] border border-[var(--light-gray)] mb-6">
          {([['mentees', 'Mentees'], ['meeting', 'Meetings']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 min-w-[110px] px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors',
                tab === t ? 'bg-white text-[var(--teal)] shadow-sm' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]')}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'meeting' && <MeetingsPanel context="MENTORSHIP" title="Mentorship Meetings" />}

      {tab === 'mentees' && canSeeMentees && (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--mid-gray)] mb-1">People picked into your mentee list in HR Staff Profiles. Open a mentee to read every session note they’ve written.</p>
          {menteesLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[var(--teal)]" /></div>
          ) : (mentees ?? []).length === 0 ? (
            <div className="card-static text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="text-[var(--teal)]" />
              </div>
              <p className="font-semibold text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>No mentees yet</p>
              <p className="text-[13px] text-[var(--mid-gray)] max-w-md mx-auto leading-relaxed">
                When people are picked into your mentee list in HR Staff Profiles, they’ll appear here with their session notes.
              </p>
            </div>
          ) : (
            (mentees ?? []).map((m) => {
              const open = openMentee === m.id
              const notes = notesByMentee[m.id]
              return (
                <div key={m.id} className="rounded-xl border border-[var(--light-gray)] bg-white overflow-hidden">
                  <button onClick={() => toggleMentee(m.id)}
                    className="w-full flex items-center justify-between gap-3 flex-wrap px-4 py-3 text-left hover:bg-[var(--off-white)]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--pale-teal)] flex items-center justify-center font-bold text-[var(--teal)] text-[13px]">
                        {m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--charcoal)] text-[14px]">{m.name}</p>
                        <p className="text-[12px] text-[var(--mid-gray)]">{m.department} · {m.branch}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-2">
                      {notesLoading === m.id && <Loader2 size={14} className="animate-spin text-[var(--mid-gray)]" />}
                      {notes && <span className="text-[11px] text-[var(--mid-gray)]">{notes.length} note{notes.length === 1 ? '' : 's'}</span>}
                      {open ? <ChevronUp size={18} className="text-[var(--mid-gray)]" /> : <ChevronDown size={18} className="text-[var(--mid-gray)]" />}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-[var(--light-gray)] p-2 space-y-2">
                      {notes && notes.length === 0 && (
                        <p className="text-[12px] text-[var(--mid-gray)] px-2 py-3">No session notes yet.</p>
                      )}
                      {(notes ?? []).map((n) => {
                        const nOpen = openNote === n.id
                        return (
                          <div key={n.id} className="rounded-lg border border-[var(--light-gray)] bg-white overflow-hidden">
                            <button onClick={() => setOpenNote(nOpen ? null : n.id)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--off-white)]">
                              <span className="flex items-center gap-2 flex-wrap">
                                <FileText size={14} className="text-[var(--teal)]" />
                                <span className="font-semibold text-[var(--charcoal)] text-[13.5px]">{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                <span className="text-[12px] text-[var(--mid-gray)]">{n.patientName}</span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--pale-teal)] text-[var(--teal)]">{n.status}</span>
                                {n.lockedAt && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Locked</span>}
                              </span>
                              {nOpen ? <ChevronUp size={16} className="text-[var(--mid-gray)]" /> : <ChevronDown size={16} className="text-[var(--mid-gray)]" />}
                            </button>
                            {nOpen && (
                              <div className="px-3 pb-3 border-t border-[var(--light-gray)] pt-3 space-y-2">
                                <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{n.notes || <span className="italic text-[var(--mid-gray)]">No note text.</span>}</p>
                                {n.discontinuedRemarks && (
                                  <p className="text-[12px] text-[var(--mid-gray)]"><span className="font-semibold">Discontinued remarks:</span> {n.discontinuedRemarks}</p>
                                )}
                                {n.editHistory && n.editHistory.length > 0 && (
                                  <p className="text-[11px] text-[var(--mid-gray)]">
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
