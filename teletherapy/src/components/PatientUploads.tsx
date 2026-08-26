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
  Loader2,
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

  return (
    <div className="rounded-xl border border-[var(--light-gray)] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--light-gray)] bg-[var(--off-white)]">
        <h3 className="text-sm font-bold text-[var(--deep-teal)] flex items-center gap-2">
          <Inbox className="w-4 h-4" /> Patient Uploads
        </h3>
        <p className="text-[11px] text-[var(--mid-gray)] mt-0.5">PWD/Senior ID and home-practice media the patient submitted.</p>
      </div>

      <div className="p-4 space-y-5">
        {/* ── PWD / Senior ID ──────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--mid-gray)] mb-2">PWD / Senior ID</p>
          {pwdIdUrl ? (
            <a href={pwdIdUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--deep-teal)] hover:underline">
              <CreditCard className="w-4 h-4 shrink-0" /> PWD ID
              {pwdSeniorId && <span className="text-[var(--mid-gray)] font-normal">· {pwdSeniorId}</span>}
            </a>
          ) : pwdSeniorId ? (
            <p className="flex items-center gap-2 text-sm text-[var(--charcoal)]">
              <CreditCard className="w-4 h-4 shrink-0" /> <span className="font-medium">{pwdSeniorId}</span>
            </p>
          ) : (
            <p className="text-[13px] text-[var(--mid-gray)] italic">None on file.</p>
          )}
        </section>

        {/* ── Home Progress — per-date rows + date filter ──────── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--mid-gray)] mb-2">Home Progress</p>

          {error && <p className="text-[13px] text-[var(--clay)]">{error}</p>}

          {!entries && !error && (
            <p className="text-[13px] text-[var(--mid-gray)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </p>
          )}

          {entries && entries.length === 0 && (
            <p className="text-[13px] text-[var(--mid-gray)] italic">The patient hasn&apos;t uploaded any home-practice media yet.</p>
          )}

          {entries && entries.length > 0 && (
            <>
              {/* Date filter (matches Session History) */}
              <div className="rounded-lg border border-[var(--light-gray)] bg-[var(--off-white)] p-3 mb-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--mid-gray)] uppercase tracking-wider shrink-0">
                  <Calendar size={13} /> Filter by date
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-1 w-full">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] text-[var(--mid-gray)]">From</label>
                    <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="px-2 py-1 text-[12px] rounded-lg border border-[var(--light-gray)] bg-white" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] text-[var(--mid-gray)]">To</label>
                    <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="px-2 py-1 text-[12px] rounded-lg border border-[var(--light-gray)] bg-white" />
                  </div>
                  {(filterFrom || filterTo) && (
                    <button onClick={() => { setFilterFrom(''); setFilterTo('') }} className="text-[11px] text-[var(--mid-gray)] hover:text-[var(--deep-teal)] underline ml-auto">Clear</button>
                  )}
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="text-[13px] text-[var(--mid-gray)] italic">No uploads in this date range.</p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((e) => {
                    const isOpen = expanded === e.id
                    return (
                      <div key={e.id} className="rounded-lg border border-[var(--light-gray)] overflow-hidden">
                        <button
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-[var(--off-white)] transition-colors text-left"
                        >
                          <Calendar size={15} className="text-[var(--mid-gray)] shrink-0" />
                          <span className="text-[13px] font-semibold text-[var(--charcoal)]">{fmtDate(e.date)}</span>
                          <span className="text-[11px] text-[var(--mid-gray)]">{e.files.length} file{e.files.length === 1 ? '' : 's'}</span>
                          <span className="ml-auto text-[var(--mid-gray)]">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                        </button>

                        {isOpen && (
                          <div className="p-3 border-t border-[var(--light-gray)] space-y-3">
                            {e.remarks && <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{e.remarks}</p>}
                            {e.files.map((f) => {
                              const src = fileSrc(f.id)
                              const kind = (f.kind || '').toUpperCase()
                              return (
                                <div key={f.id}>
                                  {kind === 'VIDEO' ? (
                                    <video controls preload="metadata" className="w-full max-w-2xl rounded-lg bg-black max-h-80" src={src} />
                                  ) : kind === 'AUDIO' ? (
                                    <audio controls preload="metadata" className="w-full max-w-lg" src={src} />
                                  ) : kind === 'PHOTO' ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={src} alt={f.fileName} className="max-h-80 rounded-lg border border-[var(--light-gray)]" />
                                  ) : null}
                                  <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--mid-gray)]">
                                    {kind === 'VIDEO' ? <VideoIcon className="w-3.5 h-3.5" /> : kind === 'AUDIO' ? <Mic className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                                    <span className="truncate">{f.fileName}</span>
                                    {f.sizeBytes ? <span>· {fmtSize(f.sizeBytes)}</span> : null}
                                    <a href={src} download={f.fileName} className="ml-auto inline-flex items-center gap-1 text-[var(--deep-teal)] hover:underline">
                                      <Download className="w-3.5 h-3.5" /> Save
                                    </a>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
