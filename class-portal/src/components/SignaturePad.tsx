'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Called whenever the signature changes. Empty string means "no signature". */
  onChange: (dataUrl: string) => void
  /** Optional initial value (data URL). */
  initialValue?: string
  /** Pixel height of the pad. */
  height?: number
}

/** Reusable signature capture: draw on a canvas, or upload an image of an e-signature. */
export default function SignaturePad({ onChange, initialValue, height = 160 }: Props) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(initialValue ?? null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1A1A1A'
  }, [mode])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
    const { x, y } = pos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y); ctx.stroke()
    hasInk.current = true
  }
  function onUp() {
    drawing.current = false
    if (hasInk.current) {
      const c = canvasRef.current
      if (c) onChange(c.toDataURL('image/png'))
    }
  }

  function clearPad() {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    hasInk.current = false
    onChange('')
  }

  function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const v = String(reader.result)
      setUploadedDataUrl(v)
      onChange(v)
    }
    reader.readAsDataURL(f)
  }

  return (
    <div>
      <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl mb-3" style={{ fontFamily: 'var(--font-display)' }}>
        <button type="button" onClick={() => setMode('draw')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'draw' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}
        >Draw signature</button>
        <button type="button" onClick={() => setMode('upload')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'upload' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}
        >Upload e-signature</button>
      </div>

      {mode === 'draw' ? (
        <div>
          <div className="rounded-xl bg-white" style={{ borderColor: 'var(--paper-3)', borderStyle: 'dashed', borderWidth: '1.5px' }}>
            <canvas
              ref={canvasRef}
              className="block w-full"
              style={{ height, touchAction: 'none' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
            />
          </div>
          <button type="button" className="text-xs text-[color:var(--mid-gray)] hover:text-[color:var(--narra)] mt-2 underline-offset-2 hover:underline" onClick={clearPad}>
            Clear pad
          </button>
        </div>
      ) : (
        <div>
          {/* Native file pickers render as bare white "Choose File" buttons
              that disappear on a paper background — wrap a styled label so
              the affordance is obvious. */}
          <label className="btn-secondary cursor-pointer inline-flex items-center gap-2" style={{ width: 'auto' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {uploadedDataUrl ? 'Replace signature image' : 'Choose signature image'}
            <input type="file" accept="image/*" onChange={onUploadFile} className="sr-only" />
          </label>
          <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-2" style={{ fontFamily: 'var(--font-display)' }}>
            PNG or JPG of your handwritten signature.
          </p>
          {uploadedDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedDataUrl} alt="Uploaded signature preview" className="mt-3 max-h-32 rounded-lg bg-white p-2" style={{ border: '1px solid var(--paper-3)' }} />
          )}
        </div>
      )}
    </div>
  )
}
