'use client'

// Opens a data: URI (image or PDF) reliably. Chrome blocks top-level
// navigation to data: URLs, so we convert to a Blob URL and open that.
export default function OpenAttachment({ src, className, children }: { src: string; className?: string; children: React.ReactNode }) {
  function open(e: React.MouseEvent) {
    e.preventDefault()
    try {
      const comma = src.indexOf(',')
      const meta = src.slice(5, comma) // after "data:"
      const mime = meta.split(';')[0] || 'application/octet-stream'
      const isB64 = /;base64/i.test(meta)
      const payload = src.slice(comma + 1)
      let blob: Blob
      if (isB64) {
        const bin = atob(payload)
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        blob = new Blob([arr], { type: mime })
      } else {
        blob = new Blob([decodeURIComponent(payload)], { type: mime })
      }
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      window.open(src, '_blank', 'noopener') // fallback
    }
  }
  return <button type="button" onClick={open} className={className}>{children}</button>
}
