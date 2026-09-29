'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// The handbook document lives in its own file — it is long, and mixing a
// thousand lines of HTML into the component made both hard to read.
import { HANDBOOK_HTML } from './handbook-content'

export default function HandbookPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [blobUrl, setBlobUrl] = useState<string>('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as { role?: string })?.role !== 'ADMIN') {
      router.replace('/dashboard')
      return
    }
    // blob: URLs are served from memory — they carry no server headers so
    // X-Frame-Options: DENY on the app's own responses doesn't block the iframe.
    const blob = new Blob([HANDBOOK_HTML], { type: 'text/html; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [session, status, router])

  function handlePrint() {
    iframeRef.current?.contentWindow?.print()
  }

  function handleWordDownload() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="UTF-8"><title>Operations Hub Handbook</title>
<style>body{font-family:Calibri,sans-serif;font-size:11pt;color:#1C2535}.sidebar{display:none!important}.mockup{display:none!important}</style>
</head><body>${doc.body.innerHTML}</body></html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Operations-Hub-Handbook.doc'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!blobUrl) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 2 }}>
            Internal Documentation &middot; 2026
          </p>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--near-black)', lineHeight: 1.25 }}>
            Operations Hub — User Handbook
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            🖨 Print / PDF
          </button>
          <button
            onClick={handleWordDownload}
            style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--teal)', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ⬇ Download Word
          </button>
        </div>
      </div>

      <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(237,104,35,0.2)', minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          src={blobUrl}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Operations Hub User Handbook"
        />
      </div>
    </div>
  )
}
