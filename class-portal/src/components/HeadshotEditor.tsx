'use client'

import { useEffect, useState } from 'react'
import { getHeadshotFor, saveHeadshot } from '@/lib/session'

interface Props {
  studentId: string
  editable?: boolean
}

const MAX_DATA_URL_LEN = 700_000 // ~500 KB raw — keeps localStorage manageable

export default function HeadshotEditor({ studentId, editable = true }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const h = getHeadshotFor(studentId)
    if (h) setDataUrl(h.dataUrl)
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
      saveHeadshot({ studentId, dataUrl: v, uploadedAt: new Date().toISOString() })
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
