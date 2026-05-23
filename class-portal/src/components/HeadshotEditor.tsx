'use client'

import { useEffect, useState } from 'react'
import { getHeadshotFor, saveHeadshot } from '@/lib/session'
import { backendOrigin, getToken } from '@/lib/backend'

interface Props {
  studentId: string
  editable?: boolean
}

const MAX_DATA_URL_LEN = 700_000 // ~500 KB raw — keeps localStorage manageable

export default function HeadshotEditor({ studentId, editable = true }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // 1) Instant render from this device's local cache, if any.
    const cached = getHeadshotFor(studentId)
    if (cached) setDataUrl(cached.dataUrl)

    // 2) ALWAYS try the server-side 1x1 photo the parent uploaded at
    //    enrollment, UNLESS the local cache was set by an explicit
    //    upload via this editor (source === 'manual'). Reasons:
    //      - Headshot store is per-device localStorage, so a teacher
    //        viewing from a classroom tablet wouldn't have any cache.
    //      - Older auto-synced caches won't refresh if the parent
    //        later re-uploads a clearer photo.
    //      - Aurora-style cases: enrollment uploaded a 1x1 but it
    //        never made it into the cache on the viewer's device.
    //    We accept any decodable blob — the server stores
    //    'application/octet-stream' for older uploads that lacked a
    //    proper MIME, and the canvas downscaler will tell us soon
    //    enough whether the bytes are actually an image.
    if (cached?.source === 'manual') return
    let cancelled = false
    ;(async () => {
      try {
        const tok = getToken()
        const res = await fetch(
          `${backendOrigin()}/api/public/class-portal/document-blobs/${encodeURIComponent(studentId)}/child_photo_1x1`,
          { headers: tok ? { authorization: `Bearer ${tok}` } : undefined },
        )
        if (cancelled || !res.ok) return
        const blob = await res.blob()
        const small = await downscale(blob, 500, 0.85)
        if (cancelled || !small) return
        // Don't churn the DOM if the freshly-fetched copy matches what
        // we already rendered from cache.
        if (small === cached?.dataUrl) return
        setDataUrl(small)
        try {
          saveHeadshot({ studentId, dataUrl: small, uploadedAt: new Date().toISOString(), source: '1x1' })
        } catch { /* ignore localStorage quota */ }
      } catch { /* swallow — keeps the placeholder or cached value rendering */ }
    })()
    return () => { cancelled = true }
  }, [studentId])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(null)
    if (!f.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    const r = new FileReader()
    r.onload = () => {
      const v = String(r.result)
      if (v.length > MAX_DATA_URL_LEN) {
        setErr('Image is too large. Try a smaller crop (<500 KB).')
        return
      }
      // Mark this upload as 'manual' so the server-fallback effect on
      // the next render doesn't blow it away with the 1x1.
      saveHeadshot({ studentId, dataUrl: v, uploadedAt: new Date().toISOString(), source: 'manual' })
      setDataUrl(v)
    }
    r.readAsDataURL(f)
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full overflow-hidden border-2 shrink-0"
        style={{ width: 88, height: 88, borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="Student headshot" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[color:var(--mid-gray)] text-2xl">👤</div>
        )}
      </div>
      {editable && (
        <div className="flex flex-col gap-1">
          <label className="btn-secondary cursor-pointer inline-flex items-center gap-2" style={{ width: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {dataUrl ? 'Replace headshot' : 'Upload headshot'}
            <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
          </label>
          {err && <span className="text-[11.5px] text-rose-700">{err}</span>}
          <span className="text-[10.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>PNG or JPG · max ~500 KB</span>
        </div>
      )}
    </div>
  )
}

/**
 * Read an image blob, resize so the longer edge ≤ maxEdge, and return
 * a JPEG data URL. Mirrors the helper account-setup uses on the
 * enrollment flow so a photo seeded from the server fallback ends up
 * the same size as one captured at signup. Returns null if the
 * environment can't decode or render the image.
 */
function downscale(blob: Blob, maxEdge: number, jpegQuality: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return }
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        const longer = Math.max(img.width, img.height)
        const scale = longer > maxEdge ? maxEdge / longer : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(url); resolve(null); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', jpegQuality))
      } catch { resolve(null) }
      finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
