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
  ExternalLink,
  Search,
  X,
  Target,
  Award,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, EmptyState, GroupLabel, PageHeader, PillTabs, Skeleton, StatusPill, Tag,
  BTN_PRIMARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, FOCUS, PAGE, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

interface Certificate {
  seminarId: string
  seminarTitle: string
  seminarDate: string
  certificateFile: string
  certificateUrl: string
  uploadedAt: string | null
  source: 'registered' | 'manual'
}

// One speaker as projected by the teletherapy proxy. headshot has
// already been absolutised to the HR origin. aboutSpeaker / bio are
// optional per-speaker overrides — the top-level aboutSpeaker on
// the seminar is the canonical fallback when these are blank.
interface Speaker {
  id?: string
  name?: string
  title?: string
  headshot?: string | null
  aboutSpeaker?: string | null
  bio?: string | null
}

interface Seminar {
  id: string
  title: string
  date: string
  // Lifecycle state from HR. Drives the three-bucket sort below
  // (upcoming-with-date → upcoming-TBD → completed/cancelled).
  status?: 'upcoming' | 'completed' | 'cancelled' | string
  // Tentative-date support — when HR doesn't have a final calendar
  // date yet, dateUndefined is true and scheduledMonth holds 'YYYY-MM'.
  dateUndefined?: boolean
  scheduledMonth?: string
  timeStart: string
  timeEnd: string
  format: 'virtual' | 'face-to-face' | 'hybrid' | string
  location: string
  meetingLink: string
  // Legacy single-speaker fields. For multi-speaker seminars use
  // speakers[] below; these stay populated for single-speaker
  // seminars so older code paths still work.
  speakerName: string
  speakerTitle: string
  speakerHeadshot: string | null
  speakers?: Speaker[]
  // HR's classification picker offers presets like Workshop / Webinar
  // / Conference / Symposium; classificationOther holds a free-form
  // value when the curator picks "Other". Either may be set.
  classification?: string
  classificationOther?: string
  // Long-form bio shown in the "About Speaker" modal.
  aboutSpeaker?: string
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
  // Server-stamped: true iff a certificate has already been uploaded
  // for the logged-in user on this seminar. When true, the Unregister
  // affordance is hidden — the cert is signed proof of attendance and
  // dropping the registration would orphan it. Server-side, the HR
  // unregister handler rejects with 409 for the same case.
  myHasCertificate?: boolean
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
  // About-Speaker modal state. We snapshot the relevant fields off
  // the seminar (rather than holding the whole Seminar object) so a
  // background refetch can't change what's currently shown. The
  // shape supports multiple speakers; each entry uses its own
  // aboutSpeaker / bio when set, else falls back to the seminar's
  // top-level aboutSpeaker (passed as `fallbackBio`).
  const [aboutSpeaker, setAboutSpeaker] = useState<{
    seminarTitle: string
    fallbackBio: string
    speakers: Speaker[]
  } | null>(null)
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
  const searchHits = q
    ? seminars.filter((s) => {
        const allSpeakerNames = (s.speakers ?? []).map((sp) => sp.name || '').join(' ')
        const hay = `${s.title} ${s.speakerName} ${allSpeakerNames} ${s.disciplineFocus?.join(' ') ?? ''} ${s.location}`.toLowerCase()
        return hay.includes(q)
      })
    : seminars

  // ── Three-bucket sort ──
  // 1. Upcoming with a confirmed date, future (closest first)
  // 2. Upcoming with no confirmed date (TBD), by estimated month asc
  // 3. Completed / cancelled / past-confirmed, most recent first
  // Bucket assignment is stable: a single pass classifies each row
  // and we sort within each bucket independently, then concatenate.
  const buckets = (() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    function endDate(s: Seminar): Date | null {
      if (s.dateUndefined) return null
      if (!s.date) return null
      const d = new Date(`${s.date}T${s.timeEnd || '23:59'}`)
      return Number.isNaN(d.getTime()) ? null : d
    }
    function startDate(s: Seminar): Date | null {
      if (s.dateUndefined) return null
      if (!s.date) return null
      const d = new Date(`${s.date}T${s.timeStart || '00:00'}`)
      return Number.isNaN(d.getTime()) ? null : d
    }
    function monthStart(s: Seminar): Date | null {
      const m = s.scheduledMonth || ''
      const mm = m.match(/^(\d{4})[-/](\d{1,2})$/)
      if (!mm) return null
      return new Date(Number(mm[1]), Number(mm[2]) - 1, 1)
    }
    function bucketOf(s: Seminar): 1 | 2 | 3 {
      const status = (s.status || 'upcoming').toLowerCase()
      if (status === 'completed' || status === 'cancelled') return 3
      if (s.dateUndefined) return 2
      const end = endDate(s)
      // If we can't parse the date, treat as TBD so it doesn't fall
      // into "completed" by accident.
      if (!end) return 2
      return end >= startOfToday ? 1 : 3
    }

    const b1: Seminar[] = []
    const b2: Seminar[] = []
    const b3: Seminar[] = []
    for (const s of searchHits) {
      const b = bucketOf(s)
      ;(b === 1 ? b1 : b === 2 ? b2 : b3).push(s)
    }
    // Bucket 1 — upcoming with date, ascending (soonest first)
    b1.sort((a, b) => {
      const da = startDate(a)?.getTime() ?? Number.POSITIVE_INFINITY
      const db = startDate(b)?.getTime() ?? Number.POSITIVE_INFINITY
      return da - db
    })
    // Bucket 2 — TBD, ascending by estimated month (rows with no
    // month land last within the bucket)
    b2.sort((a, b) => {
      const da = monthStart(a)?.getTime() ?? Number.POSITIVE_INFINITY
      const db = monthStart(b)?.getTime() ?? Number.POSITIVE_INFINITY
      return da - db
    })
    // Bucket 3 — past/completed, descending (most recent first).
    // Cancelled-but-no-date rows fall to the very end.
    b3.sort((a, b) => {
      const da = endDate(a)?.getTime() ?? 0
      const db = endDate(b)?.getTime() ?? 0
      return db - da
    })
    return { b1, b2, b3 }
  })()
  const filtered = [...buckets.b1, ...buckets.b2, ...buckets.b3]

  // One seminar card. Same content and handlers as before; kit styling.
  const renderCard = (s: Seminar) => {
    const isVirtual = s.format === 'virtual' || s.format === 'hybrid'
    const isHybrid = s.format === 'hybrid'
    const isFaceToFace = s.format === 'face-to-face'
    const isFull = s.hasParticipantLimit && s.registeredCount >= s.maxParticipants
    const registered = s.myRegistration.registered

    // Speakers to render. HR's multi-speaker form populates speakers[]
    // (each with name/title/headshot/aboutSpeaker/bio). For legacy
    // single-speaker seminars we fall back to the top-level
    // speakerName/Title/Headshot.
    const displaySpeakers: Speaker[] = (s.speakers && s.speakers.length > 0)
      ? s.speakers
      : (s.speakerName || s.speakerHeadshot
          ? [{ name: s.speakerName, title: s.speakerTitle, headshot: s.speakerHeadshot, aboutSpeaker: s.aboutSpeaker ?? null }]
          : [])
    const speakerNamesLine = displaySpeakers.map((sp) => {
      const name = (sp.name || '').trim()
      const title = (sp.title || '').trim()
      return title ? `${name} · ${title}` : name
    }).filter(Boolean).join(' / ')
    // Does any speaker have a bio to show in the modal? If not, hide the
    // About Speaker button — pointless to open an empty modal.
    const hasAnyBio = displaySpeakers.some((sp) => (sp.aboutSpeaker || sp.bio || '').trim() !== '')
                  || (s.aboutSpeaker || '').trim() !== ''
    const openAbout = () => setAboutSpeaker({
      seminarTitle: s.title,
      fallbackBio: s.aboutSpeaker || '',
      speakers: displaySpeakers,
    })
    const cls = (s.classification || s.classificationOther || '').trim()

    return (
      <article
        key={s.id}
        className="rounded-xl relative min-w-0"
        style={{ ...CARD_STYLE, ...(registered ? { borderColor: 'var(--moss)', boxShadow: '0 0 0 2px rgba(74,128,115,0.16)' } : null) }}
      >
        <div className="p-4 sm:p-5">
          {/* Speaker block — absolute in the upper-right on lg+ so it
              doesn't dictate the title row's height. */}
          {displaySpeakers.length > 0 && (
            <div className="hidden lg:flex absolute top-4 right-5 flex-col items-end gap-2 z-[1]">
              <div className="flex flex-row items-start gap-3">
                {displaySpeakers.slice(0, 3).map((sp, idx) => (
                  <div key={sp.id || idx} className="flex flex-col items-center gap-1 w-[72px]">
                    <SpeakerAvatar
                      src={sp.headshot}
                      name={sp.name || ''}
                      size={displaySpeakers.length > 1 ? 56 : 68}
                    />
                    {displaySpeakers.length > 1 && sp.name && (
                      <p className="text-[10px] text-center leading-tight w-full truncate" style={{ color: 'var(--mid-gray)' }} title={sp.name}>
                        {sp.name.split(',')[0]}
                      </p>
                    )}
                  </div>
                ))}
                {displaySpeakers.length > 3 && (
                  <p className="text-[10px] italic self-center" style={{ color: 'var(--mid-gray)' }}>
                    +{displaySpeakers.length - 3} more
                  </p>
                )}
              </div>
              {hasAnyBio && (
                <button type="button" onClick={openAbout} className={`text-[11.5px] font-semibold rounded hover:underline whitespace-nowrap ${FOCUS}`} style={{ color: 'var(--teal)' }}>
                  About Speaker{displaySpeakers.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {/* Reserve right-side space on lg+ so the tags / title don't run
              under the absolute avatar block. */}
          <div className={cn(
            'mb-3',
            displaySpeakers.length === 1 && 'lg:pr-[100px]',
            displaySpeakers.length === 2 && 'lg:pr-[180px]',
            displaySpeakers.length >= 3 && 'lg:pr-[260px]'
          )}>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {cls && <span className="capitalize"><Tag tone="warn">{cls}</Tag></span>}
              <Tag tone="brand">{FORMAT_LABEL[s.format] ?? s.format}</Tag>
              {(s.disciplineFocus ?? []).map((d) => (
                <Tag key={d} tone="neutral">{d}</Tag>
              ))}
              {registered && <StatusPill tone="success">Registered</StatusPill>}
            </div>
            <h2 className="font-bold text-[16px] leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {s.title}
            </h2>
          </div>

          {/* Small screens: speakers stacked under the title. */}
          {displaySpeakers.length > 0 && (
            <div className="lg:hidden mb-3 pb-3 space-y-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              {displaySpeakers.map((sp, idx) => (
                <div key={sp.id || idx} className="flex items-center gap-3">
                  <SpeakerAvatar src={sp.headshot} name={sp.name || ''} size={displaySpeakers.length > 1 ? 40 : 48} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{sp.name}</p>
                    {sp.title && <p className="text-[11.5px] truncate" style={{ color: 'var(--mid-gray)' }}>{sp.title}</p>}
                  </div>
                </div>
              ))}
              {hasAnyBio && (
                <button type="button" onClick={openAbout} className={`text-[11.5px] font-semibold rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)' }}>
                  About Speaker{displaySpeakers.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] mb-3" style={{ color: 'var(--mid-gray)' }}>
            <Fact icon={<Calendar size={13} />} label="Date">{formatDate(s.date || s.scheduledMonth)}</Fact>
            <Fact icon={<Clock size={13} />} label="Time">{formatTimeRange(s.timeStart, s.timeEnd)}</Fact>
            {speakerNamesLine && <Fact icon={<UserIcon size={13} />} label="Speaker"><span title={speakerNamesLine}>{speakerNamesLine}</span></Fact>}
            {/* Location / format: face-to-face shows the venue; virtual shows
                Online; hybrid shows the venue here and the link below. */}
            {isFaceToFace && <Fact icon={<MapPin size={13} />} label="Location">{s.location || 'Location TBA'}</Fact>}
            {s.format === 'virtual' && <Fact icon={<Video size={13} />} label="Format">Online</Fact>}
            {isHybrid && <Fact icon={<MapPin size={13} />} label="Location">{s.location || 'Location TBA'} <span className="opacity-60">(in-person)</span></Fact>}
            {s.hasParticipantLimit && (
              <Fact icon={<Users size={13} />} label="Seats">
                <span className="tabular-nums">{s.registeredCount} / {s.maxParticipants} registered</span>
                {isFull && <span className="ml-1.5"><StatusPill tone="warn">Full</StatusPill></span>}
              </Fact>
            )}
          </dl>

          {s.description && (
            <p className="text-[13px] leading-relaxed mb-3 line-clamp-3" style={{ color: 'var(--charcoal)' }}>
              {s.description}
            </p>
          )}

          {/* Objectives — opens a modal with the full learning objectives. */}
          {s.objectives && s.objectives.trim() && (
            <button
              type="button"
              onClick={() => setObjectivesSeminar(s)}
              className={`${BTN_SM} mb-3`}
              style={{ ...SECONDARY_STYLE, color: 'var(--teal)' }}
              title="View learning objectives"
            >
              <Target size={13} />
              Objectives
            </button>
          )}

          {/* Meeting link — for virtual AND hybrid seminars, only once the
              clinician is registered. */}
          {registered && isVirtual && s.meetingLink && (
            <div className="mb-1 p-3 rounded-xl" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
                <Video size={11} />
                {isHybrid ? 'Online Option' : 'Meeting Link'}
              </p>
              <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} w-full`} style={PRIMARY_STYLE}>
                <Video size={15} />
                Join Meeting
                <ExternalLink size={13} />
              </a>
              <p className="text-[11px] mt-1.5 break-all" style={{ color: 'var(--mid-gray)' }}>
                {s.meetingLink}
              </p>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          <p className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
            Free for in-house clinicians {s.feeAmount > 0 ? `(Public fee: ₱${s.feeAmount.toLocaleString()})` : ''}
          </p>
          {registered ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success">You&rsquo;re in</StatusPill>
              {/* Unregister is hidden once a certificate has been issued — the
                  cert is signed proof of attendance and removing the
                  registration would orphan it. HR also rejects this (409). */}
              {s.myHasCertificate ? (
                <span className="text-[11.5px] italic inline-flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }} title="Certificate already issued — contact HR if removal is required">
                  <Award size={12} style={{ color: 'var(--clay)' }} />
                  Certificate issued — locked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUnregister(s.id, s.title)}
                  disabled={unregisteringId === s.id}
                  className={BTN_SM}
                  style={{ ...SECONDARY_STYLE, color: '#8A5A3C' }}
                  title="Unregister from this seminar"
                >
                  {unregisteringId === s.id ? (
                    <><Loader2 size={13} className="animate-spin" /> Unregistering…</>
                  ) : (
                    <>Unregister</>
                  )}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleRegister(s.id)}
              disabled={registeringId === s.id || isFull}
              className={BTN_PRIMARY}
              style={PRIMARY_STYLE}
              title={isFull ? 'Seminar is full' : 'Register'}
            >
              {registeringId === s.id ? (
                <><Loader2 size={13} className="animate-spin" /> Registering...</>
              ) : isFull ? 'Full' : 'Register'}
            </button>
          )}
        </div>
      </article>
    )
  }

  const sections: { key: string; label: string; hint?: string; items: Seminar[] }[] = [
    { key: 'b1', label: 'Upcoming', items: buckets.b1 },
    { key: 'b2', label: 'Date to be announced', hint: 'Scheduled month only — date not confirmed yet', items: buckets.b2 },
    { key: 'b3', label: 'Past & completed', items: buckets.b3 },
  ].filter(x => x.items.length > 0)

  return (
    <div className={`${PAGE} !max-w-[1000px]`}>
      {toast && <div className="toast" role="status">{toast}</div>}

      <PageHeader
        eyebrow="Resources"
        title="Seminars & Trainings"
        description="Continuing education from Sapphire Clinics East — free for all clinicians."
        actions={
          <PillTabs
            label="Seminars view"
            value={activeTab}
            onChange={(id) => handleTabChange(id as 'upcoming' | 'certificates')}
            tabs={[
              { id: 'upcoming', label: <span className="inline-flex items-center gap-1.5"><GraduationCap size={13} /> Seminars</span> },
              { id: 'certificates', label: <span className="inline-flex items-center gap-1.5"><Award size={13} /> My Certificates</span> },
            ]}
          />
        }
      />

      {/* ── Certificates tab ── */}
      {activeTab === 'certificates' && (
        <section className="rounded-xl" style={CARD_STYLE}>
          {certsLoading ? (
            <div className="p-4 space-y-3" role="status" aria-label="Loading your certificates">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : certificates.length === 0 ? (
            <EmptyState icon="award" title="No certificates yet" hint="They will appear here once uploaded by HR." />
          ) : (
            <ul>
              {certificates.map((cert, i) => (
                <li key={`${cert.seminarId}-${cert.certificateFile}`} className="px-4 sm:px-5 py-3.5 flex items-center gap-3.5" style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                  <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                    <FileText size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[14px] leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {cert.seminarTitle}
                    </h3>
                    <div className="flex items-center gap-x-3 gap-y-1 mt-1 text-[11.5px] flex-wrap" style={{ color: 'var(--mid-gray)' }}>
                      {cert.seminarDate && (
                        <span className="inline-flex items-center gap-1"><Calendar size={11} /> {formatDate(cert.seminarDate)}</span>
                      )}
                      {cert.uploadedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          Issued {new Date(cert.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      <StatusPill tone="success">Certificate ready</StatusPill>
                    </div>
                  </div>
                  <a href={cert.certificateUrl} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} shrink-0`} style={PRIMARY_STYLE}>
                    View
                    <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Seminars tab ── */}
      {activeTab === 'upcoming' && <>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, speaker, discipline, or location..."
          aria-label="Search seminars"
          className={`${CONTROL} w-full h-10 pl-9 pr-9`}
          style={CONTROL_STYLE}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--off-white)] ${FOCUS}`}
            style={{ color: 'var(--mid-gray)' }}
            title="Clear search"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading seminars">
          {[0, 1].map(i => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon={q ? 'search' : 'calendar'}
            title={q ? `No seminars match "${search}".` : 'No upcoming seminars right now.'}
            hint={q ? 'Try a different title, speaker or discipline.' : 'Check back soon!'}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((sec) => (
            <section key={sec.key} className="space-y-3">
              <GroupLabel hint={sec.hint}>{sec.label} · {sec.items.length}</GroupLabel>
              <div className="space-y-4">{sec.items.map(renderCard)}</div>
            </section>
          ))}
        </div>
      )}

      {objectivesSeminar && (
        <ObjectivesModal
          seminar={objectivesSeminar}
          onClose={() => setObjectivesSeminar(null)}
        />
      )}

      {aboutSpeaker && (
        <AboutSpeakerModal
          speaker={aboutSpeaker}
          onClose={() => setAboutSpeaker(null)}
        />
      )}
      </>}
    </div>
  )
}

// One fact in the seminar details grid: icon + value, with a hidden label
// for screen readers.
function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="shrink-0" style={{ color: 'var(--teal)' }} aria-hidden>{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

// Round speaker avatar with graceful fallback. If the image errors
// (404, CORS, etc.) we swap to a teal initials circle in-place via
// state — cleaner than the previous trick of hiding the <img> with
// inline style, which left a sized-but-empty hole. Used both on the
// seminar card (88px) and inside the AboutSpeakerModal header (64px).
function SpeakerAvatar({ src, name, size }: {
  src: string | null | undefined
  name: string
  size: number
}) {
  const [errored, setErrored] = useState(false)
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const dim = `${size}px`
  const fontPx = Math.max(12, Math.round(size * 0.30))

  if (src && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || 'Speaker'}
        style={{ width: dim, height: dim }}
        className="rounded-full object-cover border-2 border-[var(--pale-teal)] shadow-sm shrink-0"
        onError={() => setErrored(true)}
      />
    )
  }
  return (
    <div
      style={{ width: dim, height: dim, fontSize: fontPx }}
      className="rounded-full bg-[var(--pale-teal)] flex items-center justify-center text-[var(--teal)] font-bold shrink-0"
    >
      <span style={{ fontFamily: 'var(--font-display)' }}>{initials}</span>
    </div>
  )
}

// Renders the speaker bio(s). Mirrors ObjectivesModal in styling so
// the two modals feel like siblings; for multi-speaker seminars the
// modal renders one mini-card per speaker. Each speaker uses its own
// aboutSpeaker / bio when set, else falls back to the seminar's
// top-level aboutSpeaker (which is what the legacy single-speaker
// form populates).
function AboutSpeakerModal({ speaker, onClose }: {
  speaker: {
    seminarTitle: string
    fallbackBio: string
    speakers: Speaker[]
  }
  onClose: () => void
}) {
  const list = speaker.speakers && speaker.speakers.length > 0 ? speaker.speakers : []
  // Pick the bio for a given speaker. Per-speaker overrides win over
  // the seminar-level fallback. Order: speaker.aboutSpeaker →
  // speaker.bio → seminar-level fallback → 'No biography provided.'.
  // The fallback is only applied to the FIRST speaker so multi-
  // speaker rows don't all show the same generic blob.
  function bioFor(sp: Speaker, idx: number): string {
    const own = (sp.aboutSpeaker || sp.bio || '').trim()
    if (own) return own
    if (idx === 0 && speaker.fallbackBio.trim()) return speaker.fallbackBio
    return ''
  }
  return (
    <Dialog
      labelId="seminar-about-speaker"
      eyebrow={speaker.seminarTitle}
      title={list.length > 1 ? 'About the Speakers' : 'About the Speaker'}
      onClose={onClose}
      size="lg"
    >
      {list.length === 0 ? (
        <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>No speaker information.</p>
      ) : (
        <div className="space-y-5">
          {list.map((sp, idx) => {
            const bio = bioFor(sp, idx)
            return (
              <div key={sp.id || idx} style={{ borderTop: idx ? '1px solid var(--light-gray)' : undefined, paddingTop: idx ? 20 : 0 }}>
                <div className="flex items-center gap-4 mb-3">
                  <SpeakerAvatar src={sp.headshot} name={sp.name || ''} size={60} />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[15px] leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {sp.name || 'Speaker'}
                    </h4>
                    {sp.title && <p className="text-[12.5px] leading-snug" style={{ color: 'var(--mid-gray)' }}>{sp.title}</p>}
                  </div>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--charcoal)' }}>
                  {bio || 'No biography provided.'}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </Dialog>
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
    <Dialog labelId="seminar-objectives" eyebrow="Learning objectives" title={seminar.title} onClose={onClose} size="lg">
      {text.trim() ? (
        <p className="text-[13.5px] leading-relaxed whitespace-pre-line" style={{ fontFamily: 'var(--font-body)', color: 'var(--charcoal)' }}>
          {text}
        </p>
      ) : (
        <EmptyState icon="file" title="No objectives recorded for this seminar yet." />
      )}
    </Dialog>
  )
}
