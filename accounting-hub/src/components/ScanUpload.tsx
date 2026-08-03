'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Upload, QrCode, Loader2, X, Check } from 'lucide-react'
import { compressImageFile } from '@/lib/client-image-compress'

/**
 * Section-aware uploader. Two ways in:
 *  - "Choose from File" — desktop picker, saved as <prefix>-NN via /api/upload.
 *  - "Scan QR"          — phone opens /m/<token>, takes photos, they stream back
 *                         here (renamed the same way) via an UploadSession poll.
 * `existingCount` seeds the -NN sequence so a 2nd photo becomes -02, etc.
 */
export function ScanUpload({
  prefix, section, existingCount = 0, onUploaded, accept = 'image/*,.pdf', label = 'Choose from File', compact = false,
}: {
  prefix: string
  section: string
  existingCount?: number
  onUploaded: (url: string) => void
  accept?: string
  label?: string
  compact?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [token, setToken] = useState('')
  const [origin, setOrigin] = useState('')
  const [received, setReceived] = useState(0)
  const seen = useRef<Set<string>>(new Set())

  const pickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setUploading(true)
    try {
      let n = existingCount
      for (const raw of Array.from(files)) {
        n += 1
        // Large photos are downscaled client-side so slow office uplinks can
        // finish inside the proxy's body timeout (raw phone photos caused 408s).
        const file = await compressImageFile(raw)
        const fd = new FormData(); fd.append('file', file); fd.append('prefix', prefix || section); fd.append('seq', String(n))
        // Never spin forever: give the transfer 4 minutes, then surface a real error.
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 240_000)
        let r: Response
        try {
          r = await fetch('/api/upload', { method: 'POST', body: fd, signal: ctl.signal })
        } finally { clearTimeout(timer) }
        if (r.ok) { const u = (await r.json()).url; if (u) onUploaded(u) }
        else {
          const msg = await r.json().then(d => d?.error as string | undefined).catch(() => undefined)
          alert(`Upload of "${raw.name}" failed${msg ? `: ${msg}` : ` (HTTP ${r.status})`}. Please try again.`)
        }
      }
    } catch (e) {
      alert(e instanceof DOMException && e.name === 'AbortError'
        ? 'Upload timed out — the connection is too slow to send this file. Try again, or use a smaller photo.'
        : 'Upload failed — the connection dropped before the file finished sending. Check your internet connection and try again.')
    } finally { setUploading(false) }
  }

  const openQr = async () => {
    seen.current = new Set(); setReceived(0)
    setOrigin(window.location.origin)
    try {
      const r = await fetch('/api/upload-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: prefix || section, section }) })
      if (!r.ok) { alert('Could not start the QR session.'); return }
      setToken((await r.json()).token); setQrOpen(true)
    } catch { alert('Could not start the QR session.') }
  }

  const poll = useCallback(async () => {
    if (!token) return
    try {
      const r = await fetch(`/api/upload-session?token=${token}`)
      if (!r.ok) return
      const d = await r.json()
      for (const u of (d.urls || []) as string[]) {
        if (!seen.current.has(u)) { seen.current.add(u); onUploaded(u); setReceived(seen.current.size) }
      }
    } catch { /* ignore */ }
  }, [token, onUploaded])

  useEffect(() => {
    if (!qrOpen || !token) return
    const iv = setInterval(poll, 2000)
    return () => clearInterval(iv)
  }, [qrOpen, token, poll])

  const btn = compact
    ? 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border cursor-pointer'
    : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border cursor-pointer'
  const sz = compact ? 12 : 15

  return (
    <>
      <div className="inline-flex items-center gap-2">
        <label className={btn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          {uploading ? <Loader2 size={sz} className="animate-spin" /> : <Upload size={sz} />} {label}
          <input type="file" multiple accept={accept} className="hidden" onChange={e => { pickFiles(e.target.files); e.target.value = '' }} />
        </label>
        <button type="button" onClick={openQr} className={btn} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
          <QrCode size={sz} /> Scan QR
        </button>
      </div>

      {qrOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setQrOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Scan to upload from your phone</h3>
              <button onClick={() => setQrOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>Open your phone camera and point it here. Take as many photos as you need — they appear below automatically.</p>
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                {token && <QRCodeSVG value={`${origin}/m/${token}`} size={190} />}
              </div>
            </div>
            <p className="text-sm font-semibold mb-3 flex items-center justify-center gap-1.5" style={{ color: received > 0 ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>
              {received > 0 ? <><Check size={15} /> {received} photo{received > 1 ? 's' : ''} received</> : <><Loader2 size={14} className="animate-spin" /> Waiting for photos…</>}
            </p>
            <button onClick={() => setQrOpen(false)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Done</button>
          </div>
        </div>
      )}
    </>
  )
}
