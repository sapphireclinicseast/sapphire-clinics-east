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
  Target,
  Award,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Certificate {
  seminarId: string
  seminarTitle: string
  seminarDate: string
  certificateFile: string
  certificateUrl: string
  uploadedAt: string | null
  source: 'registered' | 'manual'
}

interface Seminar {
  id: string
  title: string
  date: string
  // Tentative-date support — when HR doesn't have a final calendar
  // date yet, dateUndefined is true and scheduledMonth holds 'YYYY-MM'.
  dateUndefined?: boolean
  scheduledMonth?: string
  timeStart: string
  timeEnd: string
  format: 'virtual' | 'face-to-face' | 'hybrid' | string
  location: string
  meetingLink: string
  speakerName: string
  speakerTitle: string
  speakerHeadshot: string | null
  description: string
  // Free-form learning objectives string from HR; usually multi-line
  // with literal "\n" / "\t" markers that we render verbatim with
  // whitespace-pre-line for readability.
  objectives?: string
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Format the seminar date safely.
//   • Full date (YYYY-MM-DD)   →  "Sun, May 3, 2026"
//   • Month + year only (YYYY-MM, YYYY/MM, "May 2026", etc.) → "May 2026 (TBA)"
//   • Year only (YYYY)         →  "2026 (TBA)"
//   • Empty / unparsable       →  "Date TBA"
function formatDate(iso: string | null | undefined) {
  const raw = (iso ?? '').trim()
  if (!raw) return 'Date TBA'

  // Full ISO date YYYY-MM-DD
  const fullMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (fullMatch) {
    const d = new Date(raw + 'T00:00:00Z')
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      })
    }
  }

  // Year-month only: YYYY-MM or YYYY/MM
  const ymMatch = raw.match(/^(\d{4})[-/](\d{1,2})$/)
  if (ymMatch) {
    const year = Number(ymMatch[1])
    const month = Number(ymMatch[2])
    if (month >= 1 && month <= 12) return `${MONTH_NAMES[month - 1]} ${year} (TBA)`
  }

  // Year only
  if (/^\d{4}$/.test(raw)) return `${raw} (TBA)`

  // Free-form text containing "month year"
  const monthYear = raw.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  )
  if (monthYear) {
    const monthName = monthYear[1][0].toUpperCase() + monthYear[1].slice(1).toLowerCase()
    return `${monthName} ${monthYear[2]} (TBA)`
  }

  // Last resort: try Date parser; if it works, render the full date.
  const fallback = new Date(raw)
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }
  return 'Date TBA'
}

function formatTime12h(t: string | null | undefined) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

// Render the time range, hiding the dash when both ends are missing.
function formatTimeRange(start: string | null | undefined, end: string | null | undefined) {
  const a = formatTime12h(start)
  const b = formatTime12h(end)
  if (!a && !b) return 'Time TBA'
  if (a && b) return `${a} \u2013 ${b}`
  return a || b
}

export default function SeminarsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'certificates'>('upcoming')
  const [seminars, setSeminars] = useState<Seminar[]>([])
  const [loading, setLoading] = useState(true)
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [objectivesSeminar, setObjectivesSeminar] = useState<Seminar | null>(null)
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [certsLoading, setCertsLoading] = useState(false)

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

  async function handleUnregister(id: string, title: string) {
    if (!confirm(`Unregister from "${title}"? You can re-register later as long as the seminar isn\u2019t full.`)) return
    setUnregisteringId(id)
    try {
      const res = await fetch(`/api/seminars/${id}/register`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast('You\u2019ve been unregistered from the seminar.')
        fetchSeminars()
      } else {
        showToast(data.error ?? 'Unregister failed')
      }
    } catch {
      showToast('Unregister failed')
    }
    setUnregisteringId(null)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4500)
  }

  async function fetchCertificates() {
    setCertsLoading(true)
    try {
      const res = await fetch('/api/certificates', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCertificates(data.certificates ?? [])
      } else {
        showToast('Failed to load certificates')
      }
    } catch {
      showToast('Failed to load certificates')
    }
    setCertsLoading(false)
  }

  function handleTabChange(tab: 'upcoming' | 'certificates') {
    setActiveTab(tab)
    if (tab === 'certificates' && certificates.length === 0 && !certsLoading) {
      fetchCertificates()
    }
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--light-gray)] mb-5 animate-fade-up stagger-1">
        <button
          onClick={() => handleTabChange('upcoming')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-[13px] font-semibold transition-all',
            activeTab === 'upcoming'
              ? 'bg-white text-[var(--charcoal)] shadow-sm'
              : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'
          )}
        >
          <GraduationCap size={14} />
          Upcoming
        </button>
        <button
          onClick={() => handleTabChange('certificates')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-[13px] font-semibold transition-all',
            activeTab === 'certificates'
              ? 'bg-white text-[var(--charcoal)] shadow-sm'
              : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'
          )}
        >
          <Award size={14} />
          My Certificates
        </button>
      </div>

      {/* ── Certificates tab ── */}
      {activeTab === 'certificates' && (
        certsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" />
            <p className="text-sm text-[var(--mid-gray)]">Loading your certificates...</p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="card-static text-center py-16 animate-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-3">
              <Award size={24} className="text-[var(--teal)]" />
            </div>
            <p className="text-[var(--mid-gray)] text-sm font-medium">
              No certificates yet. They will appear here once uploaded by HR.
            </p>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-up">
            {certificates.map((cert, i) => (
              <div
                key={`${cert.seminarId}-${cert.certificateFile}`}
                className={cn('card-static flex items-start gap-4', `stagger-${Math.min(i + 1, 10)}`)}
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--pale-teal)] flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-[var(--teal)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[14px] text-[var(--charcoal)] leading-snug mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    {cert.seminarTitle}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--mid-gray)] flex-wrap">
                    {cert.seminarDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} className="text-[var(--teal)]" />
                        {formatDate(cert.seminarDate)}
                      </span>
                    )}
                    {cert.uploadedAt && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} className="text-[var(--teal)]" />
                        Issued {new Date(cert.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    <span className="badge !text-[10px] bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      Certificate Ready
                    </span>
                  </div>
                </div>
                <a
                  href={cert.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary !py-2 !px-3 !text-[12px] !rounded-lg flex items-center gap-1.5 shrink-0"
                >
                  View
                  <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Upcoming seminars tab ── */}
      {activeTab === 'upcoming' && <>

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
            const isHybrid = s.format === 'hybrid'
            const isFaceToFace = s.format === 'face-to-face'
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
                    <span>{formatDate(s.date || s.scheduledMonth)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-[var(--teal)] shrink-0" />
                    <span>{formatTimeRange(s.timeStart, s.timeEnd)}</span>
                  </div>
                  {s.speakerName && (
                    <div className="flex items-center gap-2">
                      <UserIcon size={13} className="text-[var(--teal)] shrink-0" />
                      <span>
                        {s.speakerName}{s.speakerTitle ? ` · ${s.speakerTitle}` : ''}
                      </span>
                    </div>
                  )}
                  {/* Location / format row.
                      • face-to-face: show physical location (or "Location TBA")
                      • virtual:     show "Online" with the Video icon
                      • hybrid:      show physical location here; the meeting
                                     link gets its own dedicated section below
                  */}
                  {isFaceToFace && (
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-[var(--teal)] shrink-0" />
                      <span>{s.location || 'Location TBA'}</span>
                    </div>
                  )}
                  {s.format === 'virtual' && (
                    <div className="flex items-center gap-2">
                      <Video size={13} className="text-[var(--teal)] shrink-0" />
                      <span>Online</span>
                    </div>
                  )}
                  {isHybrid && (
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-[var(--teal)] shrink-0" />
                      <span>{s.location || 'Location TBA'} <span className="opacity-60">(in-person)</span></span>
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
                  <p className="text-[12.5px] text-[var(--charcoal)]/80 leading-relaxed mb-3 line-clamp-3">
                    {s.description}
                  </p>
                )}

                {/* Objectives button — opens a modal with the full
                    learning objectives list when present. */}
                {s.objectives && s.objectives.trim() && (
                  <button
                    onClick={() => setObjectivesSeminar(s)}
                    className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 text-[var(--teal)] hover:bg-[var(--pale-teal)] hover:border-[var(--teal)]/60 transition-colors"
                    title="View learning objectives"
                  >
                    <Target size={13} />
                    Objectives
                  </button>
                )}

                {/* Dedicated meeting-link section — for both pure-virtual
                    AND hybrid seminars. Only revealed once the clinician
                    is registered. For hybrid, this sits below the in-person
                    location so attendees see both options clearly. */}
                {registered && isVirtual && s.meetingLink && (
                  <div className="mb-3 p-3 rounded-xl border border-[var(--teal)]/20 bg-[var(--pale-teal)]/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--teal)] mb-1.5 flex items-center gap-1.5">
                      <Video size={11} />
                      {isHybrid ? 'Online Option' : 'Meeting Link'}
                    </p>
                    <a
                      href={s.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--teal)] text-white hover:bg-[var(--deep-teal)] transition-colors"
                    >
                      <Video size={15} />
                      Join Meeting
                      <ExternalLink size={13} />
                    </a>
                    <p className="text-[10.5px] text-[var(--mid-gray)] mt-1.5 break-all">
                      {s.meetingLink}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--light-gray)]">
                  <p className="text-[11px] text-[var(--mid-gray)]">
                    Free for in-house clinicians {s.feeAmount > 0 ? `(Public fee: ₱${s.feeAmount.toLocaleString()})` : ''}
                  </p>
                  {registered ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-green-700 flex items-center gap-1.5">
                        <CheckCircle2 size={14} />
                        You&rsquo;re in
                      </span>
                      <button
                        onClick={() => handleUnregister(s.id, s.title)}
                        disabled={unregisteringId === s.id}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--clay)]/40 text-[var(--clay)] hover:bg-[var(--clay)] hover:text-white hover:border-[var(--clay)] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                        title="Unregister from this seminar"
                      >
                        {unregisteringId === s.id ? (
                          <><Loader2 size={13} className="animate-spin" /> Unregistering…</>
                        ) : (
                          <>Unregister</>
                        )}
                      </button>
                    </div>
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

      {objectivesSeminar && (
        <ObjectivesModal
          seminar={objectivesSeminar}
          onClose={() => setObjectivesSeminar(null)}
        />
      )}
      </>}
    </div>
  )
}

function ObjectivesModal({ seminar, onClose }: {
  seminar: Seminar; onClose: () => void
}) {
  // Objectives often arrive with literal "\n" / "\t" characters. We
  // render with whitespace-pre-line so existing line breaks survive,
  // and replace tabs with two spaces so numbered lists indent cleanly.
  const text = (seminar.objectives ?? '').replace(/\t/g, '  ')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col animate-gate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hero-gradient px-5 py-4 flex items-center gap-3 shrink-0">
          <Target size={18} className="text-white shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Learning Objectives
            </h2>
            <p className="text-white/70 text-[11px] truncate">{seminar.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {text.trim() ? (
            <p
              className="text-[13.5px] text-[var(--charcoal)] leading-relaxed whitespace-pre-line"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {text}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--mid-gray)] italic text-center py-6">
              No objectives recorded for this seminar yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
