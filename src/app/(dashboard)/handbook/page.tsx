'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// The handbook document lives in its own file — it is long, and mixing a
// thousand lines of HTML into the component made both hard to read.
import { HANDBOOK_HTML } from './handbook-content'

// The page is now only a frame. Save as PDF, Download as Word and Search all
// live in the document's own masthead, the same way the HR portal handbook
// carries them, so a second row of buttons out here would have duplicated
// controls that already exist two centimetres below.
export default function HandbookPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [blobUrl, setBlobUrl] = useState<string>('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as { role?: string })?.role !== 'ADMIN') {
      router.replace('/dashboard')
      return
    }
    // blob: URLs are served from memory — they carry no server headers, so
    // X-Frame-Options: DENY on the app's own responses doesn't block the iframe.
    const blob = new Blob([HANDBOOK_HTML], { type: 'text/html; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [session, status, router])

  if (!blobUrl) return null

  return (
    <div style={{ height: '100%', minHeight: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--light-gray)' }}>
      <iframe
        src={blobUrl}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Operations Hub User Handbook"
      />
    </div>
  )
}
