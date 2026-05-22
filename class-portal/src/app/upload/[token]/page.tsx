'use client'

// Mobile capture page for the QR-from-phone upload handoff. The parent
// scans a QR on the desktop /documents page → lands here → picks a file
// or takes a photo → uploads via the token. The desktop is polling the
// same token and ingests the file once uploadedAt is set.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { backendOrigin } from '@/lib/backend'

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

  return (
    <div className="max-w-md mx-auto animate-fade-up">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>QR upload</div>
        <h1 className="text-[22px] leading-tight text-[color:var(--deep-teal)] mb-1">Upload from your phone</h1>

        {loadErr && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 mt-4">
            {loadErr === 'Token expired.' ? 'This QR has expired. Please regenerate one on your computer.' : loadErr}
          </div>
        )}

        {status && !done && (
          <>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-5">
              Take a photo or pick a file for: <span className="font-semibold text-[color:var(--narra)]">{docLabel}</span>
            </p>

            {uploadErr && (
              <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 mb-4">{uploadErr}</div>
            )}

            <div className="space-y-3">
              <label className={`btn-primary w-full inline-flex items-center justify-center cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploading ? 'Uploading…' : '📷  Take a photo'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  capture="environment"
                  disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void handleFile(f)
                  }}
                />
              </label>
              <label className={`btn-secondary w-full inline-flex items-center justify-center cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploading ? 'Uploading…' : 'Pick a file from this phone'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*,application/pdf"
                  disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void handleFile(f)
                  }}
                />
              </label>
            </div>

            <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-4">
              Files are kept on the server for 30 minutes and deleted automatically after your desktop picks them up.
            </p>
          </>
        )}

        {done && (
          <div className="mt-4">
            <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 mb-3">
              ✓ Uploaded. You can close this page — the file should appear on your computer in a moment.
            </div>
            <p className="text-[12px] text-[color:var(--mid-gray)]">
              {docLabel ? `For: ${docLabel}` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
