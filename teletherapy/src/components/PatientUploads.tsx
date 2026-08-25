'use client'

// Therapist-facing view of what the PATIENT uploaded:
//   • Registration documents — Doctor's Referral + PWD ID (captured at
//     sign-up; served as public Operations Hub URLs).
//   • Home Progress — videos / audio / photos the patient posts from the
//     client portal between sessions. Streamed (with Range) by
//     /api/patients/[id]/home-progress/file/[fileId]. Read-only.

import { useEffect, useState } from 'react'
import {
  Loader2,
  FileText,
  CreditCard,
  Video as VideoIcon,
  Mic,
  Image as ImageIcon,
  Download,
  Inbox,
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
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtSize(n: number): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function isImageUrl(u: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)(\?|$)/i.test(u)
}

export default function PatientUploads({
  patientId,
  referralUrl,
  pwdIdUrl,
  pwdSeniorId,
}: {
  patientId: string
  referralUrl?: string | null
  pwdIdUrl?: string | null
  pwdSeniorId?: string | null
}) {
  const [entries, setEntries] = useState<HPEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
  const hasRegDocs = !!(referralUrl || pwdIdUrl || pwdSeniorId)

  return (
    <div className="rounded-xl border border-[var(--light-gray)] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--light-gray)] bg-[var(--off-white)]">
        <h3 className="text-sm font-bold text-[var(--deep-teal)] flex items-center gap-2">
          <Inbox className="w-4 h-4" /> Patient Uploads
        </h3>
        <p className="text-[11px] text-[var(--mid-gray)] mt-0.5">Documents &amp; home-practice media the patient submitted.</p>
      </div>

      <div className="p-4 space-y-5">
        {/* ── Registration documents ───────────────────────────── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--mid-gray)] mb-2">Registration Documents</p>
          {hasRegDocs ? (
            <div className="space-y-2">
              {referralUrl && (
                <a
                  href={referralUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[var(--deep-teal)] hover:underline"
                >
                  <FileText className="w-4 h-4 shrink-0" /> Doctor&apos;s Referral
                </a>
              )}
              {pwdIdUrl && (
                <div className="space-y-1.5">
                  <a
                    href={pwdIdUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[var(--deep-teal)] hover:underline"
                  >
                    <CreditCard className="w-4 h-4 shrink-0" /> PWD ID
                    {pwdSeniorId && <span className="text-[var(--mid-gray)] font-normal">· {pwdSeniorId}</span>}
                  </a>
                  {isImageUrl(pwdIdUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pwdIdUrl} alt="PWD ID" className="max-h-40 rounded-lg border border-[var(--light-gray)]" />
                  )}
                </div>
              )}
              {!referralUrl && !pwdIdUrl && pwdSeniorId && (
                <p className="text-sm text-[var(--charcoal)] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 shrink-0" /> PWD/Senior ID No.: <span className="font-medium">{pwdSeniorId}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--mid-gray)] italic">None on file.</p>
          )}
        </section>

        {/* ── Home Progress media ──────────────────────────────── */}
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
            <div className="space-y-4">
              {entries.map((e) => (
                <div key={e.id} className="rounded-lg border border-[var(--light-gray)] p-3">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-[13px] font-semibold text-[var(--charcoal)]">{fmtDate(e.date)}</span>
                    <span className="text-[11px] text-[var(--mid-gray)]">{e.files.length} file{e.files.length === 1 ? '' : 's'}</span>
                  </div>
                  {e.remarks && <p className="text-[13px] text-[var(--charcoal)] mb-2 whitespace-pre-wrap">{e.remarks}</p>}

                  <div className="space-y-3">
                    {e.files.map((f) => {
                      const src = fileSrc(f.id)
                      const kind = (f.kind || '').toUpperCase()
                      return (
                        <div key={f.id}>
                          {kind === 'VIDEO' ? (
                            <video controls preload="metadata" className="w-full rounded-lg bg-black max-h-72" src={src} />
                          ) : kind === 'AUDIO' ? (
                            <audio controls preload="metadata" className="w-full" src={src} />
                          ) : kind === 'PHOTO' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt={f.fileName} className="max-h-72 rounded-lg border border-[var(--light-gray)]" />
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
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
