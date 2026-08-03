'use client'

import { useState } from 'react'
import { compressImageFile } from '@/lib/client-image-compress'
import { useParams } from 'next/navigation'

export default function MobileUploadPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const [items, setItems] = useState<{ preview: string; done: boolean; error?: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setBusy(true)
    for (const raw of Array.from(files)) {
      // Downscale big photos so slow mobile data finishes inside the proxy timeout.
      const file = await compressImageFile(raw)
      const preview = URL.createObjectURL(file)
      setItems(prev => [...prev, { preview, done: false }])
      const mark = (patch: { done: boolean; error?: boolean }) =>
        setItems(prev => prev.map(x => x.preview === preview ? { preview, ...patch } : x))
      try {
        const fd = new FormData(); fd.append('token', token); fd.append('file', file)
        const r = await fetch('/api/upload-session/file', { method: 'POST', body: fd })
        if (r.status === 410) setExpired(true)
        mark({ done: r.ok, error: !r.ok })
      } catch {
        mark({ done: false, error: true })
      }
    }
    setBusy(false)
  }

  const doneCount = items.filter(i => i.done).length

  return (
    <div style={{ minHeight: '100vh', background: '#0f766e', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Upload photos</h1>
        <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>
          {expired ? 'This link has expired — please generate a new QR on the computer.'
            : 'Take or choose photos. They appear on the computer automatically. You can add several.'}
        </p>

        {!expired && (
          <>
            <label style={{ display: 'block', background: '#fff', color: '#0f766e', textAlign: 'center', fontWeight: 700, padding: '16px', borderRadius: 16, fontSize: 16, marginBottom: 12, cursor: 'pointer' }}>
              📷 Take / choose photos
              <input type="file" accept="image/*,application/pdf" capture="environment" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
            </label>
            {busy && <p style={{ fontSize: 13, textAlign: 'center', opacity: 0.9 }}>Uploading…</p>}
            {doneCount > 0 && <p style={{ fontSize: 14, textAlign: 'center', fontWeight: 700, marginBottom: 12 }}>✓ {doneCount} photo{doneCount > 1 ? 's' : ''} uploaded</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {items.map((it, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#134e4a' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: it.done ? 1 : 0.5 }} />
                  <span style={{ position: 'absolute', bottom: 4, right: 4, fontSize: 14 }}>{it.error ? '⚠️' : it.done ? '✓' : '…'}</span>
                </div>
              ))}
            </div>

            {doneCount > 0 && <p style={{ fontSize: 12, textAlign: 'center', opacity: 0.8, marginTop: 20 }}>Done? You can close this page.</p>}
          </>
        )}
      </div>
    </div>
  )
}
