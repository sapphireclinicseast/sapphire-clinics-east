'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  Clock,
  Video,
  User,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Activity,
  Stethoscope,
} from 'lucide-react'
import { cn, formatTime, formatDate, toDateString } from '@/lib/utils'
import BranchSwitcher, { useBranchSwitcher } from '@/components/BranchSwitcher'

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

const statusBadge: Record<string, string> = {
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  CANCELLED: 'badge-cancelled',
  RESCHEDULED: 'badge-rescheduled',
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [date, setDate] = useState(toDateString(new Date()))
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const { branches, isMultiBranch, activeStaffId, switchBranch } = useBranchSwitcher()

  useEffect(() => {
    if (activeStaffId) fetchSessions()
  }, [date, activeStaffId])

  async function fetchSessions() {
    setLoading(true)
    try {
      const staffParam = isMultiBranch && activeStaffId ? `&staffId=${activeStaffId}` : ''
      const res = await fetch(`/api/sessions?date=${date}${staffParam}`)
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  function changeDate(offset: number) {
    const d = new Date(date)
    d.setDate(d.getDate() + offset)
    setDate(toDateString(d))
  }

  const isToday = toDateString(new Date()) === date
  const completed = sessions.filter((s) => s.sessionNote?.status === 'COMPLETED').length
  const pending = sessions.filter((s) => !s.sessionNote).length
  const discontinued = sessions.filter((s) => s.sessionNote?.status === 'DISCONTINUED').length

  return (
    <div className="max-w-5xl mx-auto">
      {/* Branch switcher for interbranch clinicians */}
      {isMultiBranch && (
        <div className="mb-4 animate-fade-up">
          <BranchSwitcher branches={branches} activeStaffId={activeStaffId} onSwitch={switchBranch} />
        </div>
      )}

      {/* Hero header — templates pattern */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8 animate-fade-up">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight animate-slide-down" style={{ fontFamily: 'var(--font-display)' }}>
              {isToday ? "Today's Sessions" : 'Sessions'}
            </h1>
            <p className="text-white/70 text-sm mt-1 animate-slide-down stagger-1">
              {formatDate(date)}
            </p>
          </div>

          {/* Date Navigator */}
          <div className="flex items-center gap-2 animate-slide-down stagger-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:border-white/50 outline-none [color-scheme:dark]"
            />
            <button
              onClick={() => changeDate(1)}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            >
              <ChevronRight size={18} />
            </button>
            {!isToday && (
              <button
                onClick={() => setDate(toDateString(new Date()))}
                className="px-4 py-2.5 rounded-xl bg-white text-[var(--deep-teal)] text-sm font-semibold hover:bg-white/90 transition-all active:scale-97"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card-static flex items-center gap-3 animate-fade-up stagger-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #cf9d8820, #c6984920)' }}>
              <Activity size={18} style={{ color: '#cf9d88' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#cf9d88' }}>{sessions.length}</p>
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider">Total</p>
            </div>
          </div>
          <div className="card-static flex items-center gap-3 animate-fade-up stagger-2">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{completed}</p>
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider">Done</p>
            </div>
          </div>
          <div className="card-static flex items-center gap-3 animate-fade-up stagger-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{pending}</p>
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider">Pending</p>
            </div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 border-3 border-[var(--pale-teal)] border-t-[var(--teal)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--mid-gray)]">Loading sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="card-static text-center py-16 animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-[var(--teal)]" />
          </div>
          <p className="text-[var(--charcoal)] font-semibold text-[15px]">No sessions scheduled</p>
          <p className="text-sm text-[var(--mid-gray)] mt-1">
            {isToday ? 'You have no sessions for today.' : 'No sessions on this date.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, i) => (
            <button
              key={s.id}
              onClick={() => router.push(`/session/${s.id}`)}
              className={`card w-full text-left group cursor-pointer animate-fade-up stagger-${Math.min(i + 1, 10)}`}
            >
              <div className="flex items-center gap-4">
                {/* Avatar circle */}
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0" style={{ background: 'linear-gradient(135deg, #cf9d88, #c69849)' }}>
                  {s.patient ? `${s.patient.firstName[0]}${s.patient.lastName[0]}` : 'W'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-[var(--charcoal)] text-[15px] truncate">
                      {s.patient
                        ? `${s.patient.lastName}, ${s.patient.firstName}`
                        : 'Walk-in Patient'}
                    </h3>
                    {s.sessionNote && (
                      <span className="flex items-center gap-1">
                        {s.sessionNote.status === 'COMPLETED' ? (
                          <CheckCircle2 size={15} className="text-green-500" />
                        ) : (
                          <XCircle size={15} className="text-red-500" />
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--mid-gray)]">
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      {formatTime(s.startTime)} – {formatTime(s.endTime)}
                    </span>
                    <span className="badge badge-teal !text-[10px] !py-0.5 !px-2">
                      {s.sessionType}
                    </span>
                    {session?.user?.role === 'ADMIN' && (
                      <span className="text-[12px]">
                        <Stethoscope size={12} className="inline mr-0.5" />
                        {s.staff.lastName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`badge ${statusBadge[s.status] ?? 'badge-pending'}`}>
                    {s.status}
                  </span>
                  {s.meetLink && (
                    <span className="flex items-center gap-1 text-[12px] text-[var(--teal)] font-medium">
                      <Video size={14} />
                      Meet
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
