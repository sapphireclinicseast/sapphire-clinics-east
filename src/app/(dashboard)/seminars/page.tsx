'use client'

import { useEffect, useState } from 'react'
import {
  GraduationCap,
  Loader2,
  Calendar,
  Clock,
  MapPin,
  Video,
  User as UserIcon,
  Users,
  CheckCircle2,
  ExternalLink,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Seminar {
  id: string
  title: string
  date: string
  timeStart: string
  timeEnd: string
  format: 'virtual' | 'face-to-face' | 'hybrid' | string
  location: string
  meetingLink: string
  speakerName: string
  speakerTitle: string
  speakerHeadshot: string | null
  description: string
  disciplineFocus: string[]
  targetAudience: string
  feeAmount: number
  hasParticipantLimit: boolean
  maxParticipants: number
  registeredCount: number
  myRegistration: { registered: boolean }
}

const FORMAT_LABEL: Record<string, string> = {
  virtual: 'Virtual',
  'face-to-face': 'Face-to-face',
  hybrid: 'Hybrid',
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function formatTime12h(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export default function SeminarsPage() {
  const [seminars, setSeminars] = useState<Seminar[]>([])
  const [loading, setLoading] = useState(true)
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { fetchSeminars() }, [])

  async function fetchSeminars() {
    setLoading(true)
    try {
      const res = await fetch('/api/seminars', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setSeminars(data.seminars ?? [])
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error ?? 'Failed to load seminars')
      }
    } catch {
      showToast('Failed to load seminars')
    }
    setLoading(false)
  }

  async function handleRegister(id: string) {
    setRegisteringId(id)
    try {
      const res = await fetch(`/api/seminars/${id}/register`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast('You\u2019re registered! A confirmation has been emailed to you.')
        fetchSeminars()
      } else {
        showToast(data.error ?? 'Registration failed')
      }
    } catch {
      showToast('Registration failed')
    }
    setRegisteringId(null)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4500)
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? seminars.filter((s) => {
        const hay = `${s.title} ${s.speakerName} ${s.disciplineFocus?.join(' ') ?? ''} ${s.location}`.toLowerCase()
        return hay.includes(q)
      })
    : seminars

  return (
    <div className="max-w-5xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Seminars &amp; Trainings
            </h1>
            <p className="text-white/60 text-sm mt-1">
              Continuing education from Sapphire Clinics East &mdash; free for all clinicians.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 animate-fade-up stagger-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, speaker, discipline, or location..."
          className="input !pl-9 text-[13px]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" />
          <p className="text-sm text-[var(--mid-gray)]">Loading seminars...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-static text-center py-16 animate-fade-up stagger-2">
          <div className="w-14 h-14 rounded-2xl bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-3">
            <GraduationCap size={24} className="text-[var(--teal)]" />
          </div>
          <p className="text-[var(--mid-gray)] text-sm font-medium">
            {q ? `No seminars match "${search}".` : 'No upcoming seminars right now. Check back soon!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s, i) => {
            const isVirtual = s.format === 'virtual' || s.format === 'hybrid'
            const isFull = s.hasParticipantLimit && s.registeredCount >= s.maxParticipants
            const registered = s.myRegistration.registered
            return (
              <div
                key={s.id}
                className={cn(
                  'card-static animate-fade-up',
                  `stagger-${Math.min(i + 2, 10)}`,
                  registered && 'border-2 border-[var(--teal)]/30'
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="badge badge-teal !text-[10px]">{FORMAT_LABEL[s.format] ?? s.format}</span>
                      {(s.disciplineFocus ?? []).map((d) => (
                        <span key={d} className="badge !text-[10px] bg-[var(--sand-light)] text-[var(--sand-dark)] border border-[var(--sand-dark)]/20">
                          {d}
                        </span>
                      ))}
                      {registered && (
                        <span className="badge !text-[10px] bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          Registered
                        </span>
                      )}
                    </div>
                    <h2
                      className="font-bold text-[16px] text-[var(--charcoal)] leading-snug"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {s.title}
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-[var(--mid-gray)] mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={13} className="text-[var(--teal)] shrink-0" />
                    <span>{formatDate(s.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-[var(--teal)] shrink-0" />
                    <span>{formatTime12h(s.timeStart)} &ndash; {formatTime12h(s.timeEnd)}</span>
                  </div>
                  {s.speakerName && (
                    <div className="flex items-center gap-2">
                      <UserIcon size={13} className="text-[var(--teal)] shrink-0" />
                      <span>
                        {s.speakerName}{s.speakerTitle ? ` · ${s.speakerTitle}` : ''}
                      </span>
                    </div>
                  )}
                  {(s.location || isVirtual) && (
                    <div className="flex items-center gap-2">
                      {isVirtual ? <Video size={13} className="text-[var(--teal)] shrink-0" /> : <MapPin size={13} className="text-[var(--teal)] shrink-0" />}
                      <span>{isVirtual && !s.location ? 'Online' : s.location}</span>
                    </div>
                  )}
                  {s.hasParticipantLimit && (
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-[var(--teal)] shrink-0" />
                      <span>{s.registeredCount} / {s.maxParticipants} registered</span>
                    </div>
                  )}
                </div>

                {s.description && (
                  <p className="text-[12.5px] text-[var(--charcoal)]/80 leading-relaxed mb-4 line-clamp-3">
                    {s.description}
                  </p>
                )}

                {/* Registered + virtual: show meeting link prominently */}
                {registered && isVirtual && s.meetingLink && (
                  <a
                    href={s.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 mb-3 py-2.5 rounded-xl text-[13px] font-semibold bg-[var(--teal)] text-white hover:bg-[var(--deep-teal)] transition-colors"
                  >
                    <Video size={15} />
                    Join Meeting
                    <ExternalLink size={13} />
                  </a>
                )}

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--light-gray)]">
                  <p className="text-[11px] text-[var(--mid-gray)]">
                    Free for clinicians {s.feeAmount > 0 ? `(public fee: ₱${s.feeAmount.toLocaleString()})` : ''}
                  </p>
                  {registered ? (
                    <span className="text-[12px] font-semibold text-green-700 flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      You&rsquo;re in
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRegister(s.id)}
                      disabled={registeringId === s.id || isFull}
                      className="btn-primary !py-2 !px-4 !text-[12px] !rounded-lg disabled:opacity-50"
                      title={isFull ? 'Seminar is full' : 'Register'}
                    >
                      {registeringId === s.id ? (
                        <><Loader2 size={13} className="animate-spin" /> Registering...</>
                      ) : isFull ? 'Full' : 'Register'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
