'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Video, Stethoscope, CalendarDays } from 'lucide-react'
import { formatTime, formatDate, manilaDateString, shiftDateString } from '@/lib/utils'
import { useBranchSwitcher } from '@/components/BranchSwitcher'
import {
  Avatar, DashCard, EmptyState, Icon, KpiCard, PageHeader, RowsSkeleton, StatusPill, Tag, type Tone,
  CONTROL, CONTROL_STYLE, BTN_SECONDARY, SECONDARY_STYLE, FOCUS, PAGE, SUBTLE_BG,
} from '@/components/hub/ui'

interface SessionItem {
  id: string
  date: string
  startTime: string
  endTime: string
  sessionType: string
  status: string
  meetLink: string | null
  notes: string | null
  patient: {
    id: string
    firstName: string
    lastName: string
    email: string | null
  } | null
  staff: {
    firstName: string
    lastName: string
    department: string
  }
  sessionNote: {
    id: string
    status: string
  } | null
}

// Booking status → pill tone (icon + text, never colour alone).
const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warn',
  CONFIRMED: 'success',
  CANCELLED: 'error',
  RESCHEDULED: 'info',
}
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [date, setDate] = useState(manilaDateString())
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const { isMultiBranch, sharedStaffId, activeStaffId, activeBranch } = useBranchSwitcher()

  // Limited staff accounts (Front Desk / Admin Staff) don't have the clinical
  // dashboard in their preset — send them to their first allowed section.
  const acctType = session?.user?.accountType
  useEffect(() => {
    if (acctType === 'FRONT_DESK') router.replace('/patients-love')
    else if (acctType === 'ADMIN_STAFF') router.replace('/peers-love')
  }, [acctType, router])

  useEffect(() => {
    if (activeStaffId) fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, activeStaffId, activeBranch?.branch])

  async function fetchSessions() {
    setLoading(true)
    try {
      const staffParam = isMultiBranch && activeStaffId ? `&staffId=${activeStaffId}` : ''
      const branchParam = sharedStaffId && activeBranch ? `&patientBranch=${activeBranch.branch}` : ''
      const res = await fetch(`/api/sessions?date=${date}${staffParam}${branchParam}`)
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  // Stepped as a calendar day, not as 24 hours from a UTC midnight: the two
  // differ for every Manila morning, which is when the desk is busiest.
  function changeDate(offset: number) {
    setDate(shiftDateString(date, offset))
  }

  const isToday = manilaDateString() === date
  const completed = sessions.filter((s) => s.sessionNote?.status === 'COMPLETED').length
  const pending = sessions.filter((s) => !s.sessionNote).length
  const discontinued = sessions.filter((s) => s.sessionNote?.status === 'DISCONTINUED').length

  return (
    <div className={`${PAGE} !max-w-[1240px] animate-fade-up`}>
      <PageHeader
        eyebrow={isToday ? 'Today' : 'Sessions'}
        title={isToday ? "Today's sessions" : 'Sessions'}
        description={formatDate(date)}
        actions={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => changeDate(-1)} aria-label="Previous day"
              className={`${BTN_SECONDARY} !px-2`} style={SECONDARY_STYLE}>
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => { if (e.target.value) setDate(e.target.value) }}
              aria-label="Pick a date"
              className={CONTROL}
              style={CONTROL_STYLE}
            />
            <button type="button" onClick={() => changeDate(1)} aria-label="Next day"
              className={`${BTN_SECONDARY} !px-2`} style={SECONDARY_STYLE}>
              <ChevronRight size={16} />
            </button>
            {!isToday && (
              <button type="button" onClick={() => setDate(manilaDateString())}
                className={BTN_SECONDARY} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
                Today
              </button>
            )}
          </div>
        }
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:items-start space-y-5 lg:space-y-0">
        <div className="min-w-0 space-y-5">
          {/* Stats */}
          {!loading && sessions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Sessions" value={sessions.length} sub={isToday ? 'Booked today' : 'Booked this day'} icon={<Icon name="calendar" size={16} />} />
              <KpiCard label="Notes done" value={completed} sub={`${sessions.length ? Math.round((completed / sessions.length) * 100) : 0}% of sessions`} accent="var(--moss)" icon={<Icon name="check" size={16} />} />
              <KpiCard label="Notes pending" value={pending} sub={pending ? 'Still to write' : 'All caught up'} accent={pending ? 'var(--sun)' : 'var(--moss)'} icon={<Icon name="clock" size={16} />} />
              <KpiCard label="Discontinued" value={discontinued} sub="Marked discontinued" accent="var(--clay)" icon={<Icon name="x" size={16} />} />
            </div>
          )}

          <DashCard
            title="Sessions"
            icon={<CalendarDays size={16} />}
            description={loading ? 'Loading…' : sessions.length ? 'Open a session to write or review its note.' : undefined}
            flush
          >
            {loading ? (
              <RowsSkeleton rows={4} label="Loading sessions" />
            ) : sessions.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No sessions scheduled"
                hint={isToday ? 'You have no sessions for today.' : 'No sessions on this date.'}
              />
            ) : (
              <ul>
                {sessions.map((s, i) => {
                  // Note pill: red until the note is written, green once it's
                  // done; amber for a discontinued note so it can't be mistaken
                  // for a missing one.
                  const noteTone: Tone | null = s.sessionNote
                    ? (s.sessionNote.status === 'COMPLETED' ? 'success' : 'warn')
                    : null
                  return (
                    <li key={s.id} style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                      <button
                        type="button"
                        onClick={() => router.push(`/session/${s.id}`)}
                        className={`group w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3.5 transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
                      >
                        <Avatar text={s.patient ? `${s.patient.firstName[0]}${s.patient.lastName[0]}` : 'W'} size={38} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[14.5px] font-semibold truncate" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                              {s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : 'Walk-in Patient'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[12.5px]" style={{ color: 'var(--mid-gray)' }}>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Icon name="clock" size={12} />
                              {formatTime(s.startTime)} – {formatTime(s.endTime)}
                            </span>
                            <Tag tone="brand">{s.sessionType}</Tag>
                            {session?.user?.role === 'ADMIN' && (
                              <span className="inline-flex items-center gap-1">
                                <Stethoscope size={12} />
                                {s.staff.lastName}
                              </span>
                            )}
                            {s.meetLink && (
                              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--teal)' }}>
                                <Video size={12} /> Meet
                              </span>
                            )}
                          </div>
                          {/* Phones: status pills under the details so the name keeps its width. */}
                          <div className="flex flex-wrap gap-1.5 mt-1.5 sm:hidden">
                            <StatusPill tone={STATUS_TONE[s.status] ?? 'warn'}>{titleCase(s.status)}</StatusPill>
                            {noteTone
                              ? <StatusPill tone={noteTone}>{s.sessionNote!.status === 'COMPLETED' ? 'Note done' : 'Discontinued'}</StatusPill>
                              : <StatusPill tone="error">No note yet</StatusPill>}
                          </div>
                        </div>
                        <div className="hidden sm:flex flex-col items-end gap-1.5 flex-shrink-0">
                          <StatusPill tone={STATUS_TONE[s.status] ?? 'warn'}>{titleCase(s.status)}</StatusPill>
                          {noteTone
                            ? <StatusPill tone={noteTone}>{s.sessionNote!.status === 'COMPLETED' ? 'Note done' : 'Discontinued'}</StatusPill>
                            : <StatusPill tone="error">No note yet</StatusPill>}
                        </div>
                        <ChevronRight size={16} className="flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--mid-gray)' }} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </DashCard>
        </div>

        {/* Scheduling reminder — pinned to the right so clinicians always see it */}
        <aside className="lg:sticky lg:top-0 min-w-0">
          <ScheduleReminder />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Codepaca.svg" alt="Aura alpaca mascot" width={140} height={140} style={{ display: 'block', margin: '12px auto 0' }} />
        </aside>
      </div>
    </div>
  )
}

// "The 3 R's of Daily Scheduling" quick-reference card.
function ScheduleReminder() {
  const rows = [
    { r: 'RELEASE', when: 'before 1:00 PM', desc: 'Front Desk sends your next-day schedule (decking) for confirmation.' },
    { r: 'REPLY', when: 'before 5:00 PM', desc: 'You confirm you will attend tomorrow — through the official channel.' },
    { r: 'REPORT', when: 'by 8:00 AM', desc: 'You report a same-day absence (illness or emergency) and confirm it is acknowledged.' },
  ]
  return (
    <section className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid var(--light-gray)' }}>
      <header className="px-4 sm:px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Quick reference</p>
        <h2 className="text-[15px] font-bold leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          The 3 R&rsquo;s of Daily Scheduling
        </h2>
      </header>
      {/* Rule banner */}
      <div className="px-4 sm:px-5 py-2.5 text-[12.5px] font-bold" style={{ background: 'var(--sun-tint)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
        Release by 1 · Reply by 5 · Report by 8
      </div>
      <ol>
        {rows.map((row, i) => (
          <li key={row.r} className="px-4 sm:px-5 py-3 flex gap-3" style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5"
              style={{ background: 'var(--deep-teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>{i + 1}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="font-bold text-[13px] tracking-wide" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>{row.r}</span>
                <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ background: 'var(--pale-teal)', color: 'var(--charcoal)' }}>{row.when}</span>
              </div>
              <p className="text-[12.5px] leading-snug mt-1" style={{ color: 'var(--mid-gray)' }}>{row.desc}</p>
            </div>
          </li>
        ))}
      </ol>
      {/* Footer note */}
      <div className="px-4 sm:px-5 py-3" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
        <p className="text-[11.5px] italic leading-snug" style={{ color: 'var(--mid-gray)' }}>
          Confirm explicitly through the official clinic channel — silence is not treated as confirmation.
        </p>
      </div>
    </section>
  )
}
