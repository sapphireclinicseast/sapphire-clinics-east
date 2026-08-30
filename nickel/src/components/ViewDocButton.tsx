'use client'

import { useState } from 'react'

// Fetches a document's file (auth-checked) and opens it via a Blob URL
// (Chrome blocks top-level navigation to data: URLs).
export default function ViewDocButton({ docId, className, children }: { docId: string; className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false)
  async function open() {
    setBusy(true)
    try {
      const d = await fetch(`/api/document/${docId}/file`).then((r) => r.json())
      if (!d.file) return
      const src: string = d.file
      const comma = src.indexOf(','); const meta = src.slice(5, comma)
      const mime = meta.split(';')[0] || 'application/octet-stream'
      const bin = atob(src.slice(comma + 1)); const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([arr], { type: mime }))
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch { /* ignore */ } finally { setBusy(false) }
  }
  return <button type="button" onClick={open} disabled={busy} className={className}>{children}</button>
}
