'use client'

// Therapist-facing view of what the PATIENT submitted (its own tab on the
// patient page):
//   • PWD / Senior ID — captured at sign-up (served as a public Ops Hub URL).
//     (Doctor's Referral is intentionally NOT here — it has its own dedicated
//     card, which already covers both front-desk and client-portal uploads.)
//   • Home Progress — videos / audio / photos the patient posts from the
//     client portal between sessions, shown as collapsible per-DATE rows
//     (like Session History) with a From/To date filter. Each file streams
//     (with Range) from /api/patients/[id]/home-progress/file/[fileId].
// Read-only — these are owned/created on the Operations Hub side.

import { useEffect, useState } from 'react'
import {
  CreditCard,
  Video as VideoIcon,
  Mic,
  Image as ImageIcon,
  Download,
  Inbox,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  Banner, BTN_SM, CARD_STYLE, CONTROL_SM, CONTROL_STYLE, DashCard, EmptyState, FOCUS, RowsSkeleton,
  SECONDARY_STYLE, SUBTLE_BG, Tag,
} from '@/components/hub/ui'

interface HPFile {
  id: string
  kind: string // AUDIO | VIDEO | PHOTO | OTHER
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}
interface HPEntry {
  id: string
  date: string // YYYY-MM-DD
  remarks: string | null
  createdAt: string
  files: HPFile[]
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtSize(n: number): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function PatientUploads({
  patientId,
  pwdIdUrl,
  pwdSeniorId,
}: {
  patientId: string
  pwdIdUrl?: string | null
  pwdSeniorId?: string | null
}) {
  const [entries, setEntries] = useState<HPEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/patients/${patientId}/home-progress`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data?.error || 'Could not load uploads')
        setEntries(data.entries ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load uploads')
      }
    })()
    return () => { cancelled = true }
  }, [patientId])

  const fileSrc = (fileId: string) => `/api/patients/${patientId}/home-progress/file/${fileId}`

  const filtered = (entries ?? []).filter((e) => {
    const t = new Date(`${e.date}T00:00:00`).getTime()
    const from = filterFrom ? new Date(`${filterFrom}T00:00:00`).getTime() : -Infinity
    const to = filterTo ? new Date(`${filterTo}T00:00:00`).getTime() + 86400000 : Infinity
    return t >= from && t < to
  })

  const totalFiles = (entries ?? []).reduce((n, e) => n + e.files.length, 0)

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs px-0.5" style={{ color: 'var(--mid-gray)' }}>
        What the patient submitted: their PWD / Senior ID and home-practice media from the client portal. Read-only.
      </p>

      {/* ── PWD / Senior ID ──────────────────────────────────── */}
      <DashCard title="PWD / Senior ID" icon={<CreditCard size={16} />}>
        {pwdIdUrl ? (
          <a href={pwdIdUrl} target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
            style={{ border: '1px solid var(--light-gray)' }}>
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
              <CreditCard size={17} aria-hidden />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>View PWD ID</span>
              {pwdSeniorId && <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>ID no. {pwdSeniorId}</span>}
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>Open ↗</span>
          </a>
        ) : pwdSeniorId ? (
          <p className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--charcoal)' }}>
            <CreditCard size={16} className="shrink-0" style={{ color: 'var(--teal)' }} />
            <span className="font-semibold">{pwdSeniorId}</span>
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>· no ID photo uploaded</span>
          </p>
        ) : (
          <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>None on file.</p>
        )}
      </DashCard>

      {/* ── Home Progress — per-date rows + date filter ──────── */}
      <DashCard
        title="Home Progress"
        icon={<Inbox size={16} />}
        description="Videos, audio and photos the patient posts between sessions."
        action={entries && entries.length > 0 ? <Tag tone="brand">{totalFiles} file{totalFiles === 1 ? '' : 's'}</Tag> : undefined}
        flush
      >
        {error && <div className="p-4"><Banner tone="error">{error}</Banner></div>}

        {!entries && !error && <RowsSkeleton rows={3} label="Loading uploads" />}

        {entries && entries.length === 0 && (
          <EmptyState icon="upload" title="No home-practice media yet" hint="When the patient uploads videos, audio or photos from the client portal, they'll appear here by date." />
        )}

        {entries && entries.length > 0 && (
          <>
            {/* Date filter (matches Session History) */}
            <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
                <Calendar size={13} aria-hidden /> Filter by date
              </span>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                From
                <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={CONTROL_SM} style={CONTROL_STYLE} />
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                To
                <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={CONTROL_SM} style={CONTROL_STYLE} />
              </label>
              {(filterFrom || filterTo) && (
                <button onClick={() => { setFilterFrom(''); setFilterTo('') }} className={`${BTN_SM} sm:ml-auto`} style={SECONDARY_STYLE}>Clear</button>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon="calendar" title="No uploads in this date range" />
            ) : (
              <ul>
                {filtered.map((e, i) => {
                  const isOpen = expanded === e.id
                  return (
                    <li key={e.id} style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        aria-expanded={isOpen}
                        className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors text-left hover:bg-[#F8FAF2] ${FOCUS}`}
                      >
                        <Calendar size={15} className="shrink-0" style={{ color: 'var(--teal)' }} />
                        <span className="text-[13.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>{fmtDate(e.date)}</span>
                        <Tag>{e.files.length} file{e.files.length === 1 ? '' : 's'}</Tag>
                        <span className="ml-auto" style={{ color: 'var(--mid-gray)' }}>{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                      </button>

                      {isOpen && (
                        <div className="px-4 sm:px-5 pb-4 pt-1 space-y-3">
                          {e.remarks && (
                            <p className="text-[13px] leading-relaxed whitespace-pre-wrap rounded-lg px-3 py-2" style={{ color: 'var(--charcoal)', background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>{e.remarks}</p>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            {e.files.map((f) => {
                              const src = fileSrc(f.id)
                              const kind = (f.kind || '').toUpperCase()
                              return (
                                <figure key={f.id} className={`rounded-lg overflow-hidden min-w-0 ${kind === 'VIDEO' ? 'sm:col-span-2' : ''}`} style={CARD_STYLE}>
                                  {kind === 'VIDEO' ? (
                                    <video controls preload="metadata" className="w-full bg-black max-h-80" src={src} />
                                  ) : kind === 'AUDIO' ? (
                                    <div className="p-3" style={{ background: SUBTLE_BG }}><audio controls preload="metadata" className="w-full" src={src} /></div>
                                  ) : kind === 'PHOTO' ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={src} alt={f.fileName} className="w-full max-h-80 object-contain" style={{ background: SUBTLE_BG }} />
                                  ) : null}
                                  <figcaption className="flex items-center gap-2 px-3 py-2 text-[11.5px]" style={{ color: 'var(--mid-gray)', borderTop: kind === 'OTHER' || !kind ? undefined : '1px solid var(--light-gray)' }}>
                                    {kind === 'VIDEO' ? <VideoIcon size={14} aria-hidden /> : kind === 'AUDIO' ? <Mic size={14} aria-hidden /> : <ImageIcon size={14} aria-hidden />}
                                    <span className="truncate flex-1 min-w-0" title={f.fileName}>{f.fileName}</span>
                                    {f.sizeBytes ? <span className="shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtSize(f.sizeBytes)}</span> : null}
                                    <a href={src} download={f.fileName} className={`${BTN_SM} shrink-0`} style={SECONDARY_STYLE}>
                                      <Download size={13} /> Save
                                    </a>
                                  </figcaption>
                                </figure>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </DashCard>
    </div>
  )
}
