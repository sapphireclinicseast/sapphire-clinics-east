'use client'

// Mobile capture page for the QR-from-phone upload handoff. The parent
// scans a QR on the desktop /documents page → lands here → picks a file
// or takes a photo → uploads via the token. The desktop is polling the
// same token and ingests the file once uploadedAt is set.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { backendOrigin } from '@/lib/backend'
import {
  Banner, Icon, Skeleton, type IconName,
  CARD_STYLE, FILE_FOCUS, SUBTLE_BG,
} from '@/components/hub/ui'

const CARD_SHADOW = '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)'

/** Manila wall-clock time, e.g. "3:45 PM". */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

interface TokenStatus {
  token: string
  studentEmail: string
  docKey: string
  expiresAt: string
  fileName: string | null
  fileType: string | null
  fileSize: number | null
  uploadedAt: string | null
}

const DOC_TITLES: Record<string, string> = {
  psa_birth_cert: 'PSA Birth Certificate',
  child_photo_1x1: '1x1 photo',
  parent_valid_id: 'Parent / Guardian Valid ID',
  pwd_id: 'PWD ID',
  medical_reports: 'Medical / therapy reports',
  report_card_sf9: 'Report Card / SF9',
  good_moral: 'Certificate of Good Moral Character',
  form_137_sf10: 'Form 137 / SF10',
  affidavit_undertaking: 'DepEd Affidavit of Undertaking',
  school_id: 'School ID',
}

export default function MobileUploadPage() {
  const params = useParams() as { token: string }
  const token = params.token
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token)}`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || `HTTP ${res.status}`)
        }
        const d = await res.json() as TokenStatus
        if (!cancelled) {
          setStatus(d)
          if (d.uploadedAt) setDone(true)
        }
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function handleFile(f: File) {
    setUploadErr(null); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch(`${backendOrigin()}/api/public/class-portal/upload-tokens/${encodeURIComponent(token)}/file`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Upload failed (${res.status})`)
      }
      setDone(true)
    } catch (e) {
      setUploadErr((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const docLabel = status ? (DOC_TITLES[status.docKey] ?? status.docKey) : ''

  const expired = loadErr === 'Token expired.'

  return (
    <div className="max-w-md mx-auto animate-fade-up">
      <section className="rounded-2xl px-5 py-6 sm:px-7 sm:py-7" style={{ ...CARD_STYLE, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={done ? { background: '#EEF5E8', color: '#2F5A28' } : loadErr ? { background: '#FEF2F2', color: '#991B1B' } : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            <Icon name={done ? 'check' : loadErr ? (expired ? 'clock' : 'alert') : 'upload'} size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>QR upload</p>
            <h1 className="text-[20px] sm:text-[22px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {done ? 'Uploaded' : expired ? 'This QR has expired' : loadErr ? 'Link not working' : 'Upload from your phone'}
            </h1>
          </div>
        </div>

        {/* Checking the token */}
        {!status && !loadErr && (
          <div className="mt-5 space-y-3" role="status" aria-label="Checking the upload link">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        )}

        {loadErr && (
          <div className="mt-5 space-y-3">
            {expired ? (
              <>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                  For your privacy, each QR code only works for a short time.
                </p>
                <ol className="space-y-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                  {['On your computer, close the QR window.', 'Click "QR upload" on the same document again.', 'Scan the new QR code with this phone.'].map((t, i) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-px"
                        style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>{i + 1}</span>
                      <span className="leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <Banner tone="error">{loadErr}</Banner>
            )}
          </div>
        )}

        {status && !done && (
          <>
            <div className="mt-5 rounded-xl px-3.5 py-3 flex items-center gap-3 min-w-0" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
              <Icon name="file" size={18} style={{ color: 'var(--teal)' }} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>Document</div>
                <div className="text-[14px] font-semibold leading-tight mt-0.5 break-words" style={{ color: 'var(--charcoal)' }}>{docLabel}</div>
              </div>
              {fmtTime(status.expiresAt) && (
                <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                  <Icon name="clock" size={12} /> Until {fmtTime(status.expiresAt)}
                </span>
              )}
            </div>

            {uploadErr && <div className="mt-4"><Banner tone="error">{uploadErr}</Banner></div>}

            {uploading ? (
              <div className="mt-4 rounded-xl px-4 py-5 flex items-center justify-center gap-3" role="status"
                style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
                <Icon name="refresh" size={18} className="animate-spin" style={{ color: 'var(--teal)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Uploading… keep this page open</span>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                <PickTile
                  icon="image"
                  title="Take a photo"
                  hint="Opens your camera. Lay the document flat in good light."
                  primary
                  accept="image/*"
                  capture
                  onFile={f => void handleFile(f)}
                />
                <PickTile
                  icon="upload"
                  title="Pick a file from this phone"
                  hint="A photo or PDF you already have."
                  accept="image/*,application/pdf"
                  onFile={f => void handleFile(f)}
                />
              </div>
            )}

            <p className="text-[12px] mt-4 leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--mid-gray)' }}>
              <Icon name="shield" size={13} className="mt-0.5" />
              <span>Files are kept on the server for 30 minutes and deleted automatically after your desktop picks them up.</span>
            </p>
          </>
        )}

        {done && (
          <div className="mt-5 space-y-3">
            <Banner tone="success">You can close this page — the file should appear on your computer in a moment.</Banner>
            {docLabel && (
              <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                <Icon name="file" size={13} /> For: <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{docLabel}</span>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** A big tap target that wraps a hidden file input. */
function PickTile({ icon, title, hint, accept, capture = false, primary = false, onFile }: {
  icon: IconName; title: string; hint: string; accept: string; capture?: boolean; primary?: boolean; onFile: (f: File) => void
}) {
  return (
    <label className={`flex items-center gap-3 rounded-xl px-4 py-3.5 min-h-[64px] transition-opacity active:opacity-90 ${FILE_FOCUS}`}
      style={primary
        ? { background: 'var(--deep-teal)', color: '#fff', border: '1px solid var(--deep-teal)' }
        : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
      <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={primary ? { background: 'rgba(255,255,255,0.16)' } : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{title}</span>
        <span className="block text-[12px] mt-0.5 leading-snug" style={{ color: primary ? 'rgba(255,255,255,0.8)' : 'var(--mid-gray)' }}>{hint}</span>
      </span>
      <Icon name="chevronRight" size={16} />
      <input
        type="file"
        className="sr-only"
        accept={accept}
        {...(capture ? { capture: 'environment' as const } : {})}
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </label>
  )
}
