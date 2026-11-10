'use client'

// Finger / stylus signature box for phones and tablets. Strokes are kept as
// points (in CSS pixels relative to the box) so rotating the device or
// resizing redraws them instead of wiping the signature. onChange gets a PNG
// data URL cropped to the ink (transparent background), or null when cleared.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

type Pt = { x: number; y: number }

interface Props {
  onChange: (png: string | null) => void
  height?: number
  placeholder?: string
  disabled?: boolean
}

const INK = '#111827'
const LINE_W = 2.6

function strokePath(ctx: CanvasRenderingContext2D, s: Pt[], scale: number, ox = 0, oy = 0) {
  if (!s.length) return
  ctx.beginPath()
  const X = (p: Pt) => (p.x - ox) * scale, Y = (p: Pt) => (p.y - oy) * scale
  if (s.length === 1) {
    ctx.arc(X(s[0]), Y(s[0]), (LINE_W * scale) / 2, 0, Math.PI * 2)
    ctx.fillStyle = INK
    ctx.fill()
    return
  }
  ctx.moveTo(X(s[0]), Y(s[0]))
  for (let i = 1; i < s.length - 1; i++) {
    const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2
    ctx.quadraticCurveTo(X(s[i]), Y(s[i]), (mx - ox) * scale, (my - oy) * scale)
  }
  const last = s[s.length - 1]
  ctx.lineTo(X(last), Y(last))
  ctx.stroke()
}

export function SignaturePad({ onChange, height = 200, placeholder = 'Sign here with a finger', disabled }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Pt[][]>([])
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  const redraw = useCallback(() => {
    const c = canvasRef.current, w = wrapRef.current
    if (!c || !w) return
    const dpr = window.devicePixelRatio || 1
    const cssW = w.clientWidth
    if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(cssW * dpr)
      c.height = Math.round(height * dpr)
      c.style.width = `${cssW}px`
      c.style.height = `${height}px`
    }
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = INK; ctx.lineWidth = LINE_W * dpr
    for (const s of strokes.current) strokePath(ctx, s, dpr)
  }, [height])

  useEffect(() => {
    redraw()
    const w = wrapRef.current
    if (!w || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => redraw())
    ro.observe(w)
    return () => ro.disconnect()
  }, [redraw])

  // Export the ink only, cropped with a margin, at 2× for a crisp PDF.
  const exportPng = useCallback((): string | null => {
    const all = strokes.current.flat()
    if (!all.length) return null
    let len = 0
    for (const s of strokes.current) for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)
    if (len < 25) return null // a stray tap is not a signature
    const pad = 10
    const minX = Math.min(...all.map((p) => p.x)) - pad, minY = Math.min(...all.map((p) => p.y)) - pad
    const maxX = Math.max(...all.map((p) => p.x)) + pad, maxY = Math.max(...all.map((p) => p.y)) + pad
    const scale = Math.min(2, 1400 / Math.max(maxX - minX, 1))
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round((maxX - minX) * scale))
    out.height = Math.max(1, Math.round((maxY - minY) * scale))
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = INK; ctx.lineWidth = LINE_W * scale
    for (const s of strokes.current) strokePath(ctx, s, scale, minX, minY)
    return out.toDataURL('image/png')
  }, [])

  const pos = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    strokes.current.push([pos(e)])
    setEmpty(false)
    redraw()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    e.preventDefault()
    const s = strokes.current[strokes.current.length - 1]
    // Coalesced events give smoother lines on fast strokes where supported.
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent]
    const r = canvasRef.current!.getBoundingClientRect()
    for (const ev of evs) s.push({ x: ev.clientX - r.left, y: ev.clientY - r.top })
    redraw()
  }
  const onUp = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(exportPng())
  }
  const clear = () => {
    strokes.current = []
    setEmpty(true)
    redraw()
    onChange(null)
  }

  return (
    <div>
      <div ref={wrapRef} className="relative rounded-lg border bg-white overflow-hidden"
        style={{ height, borderColor: 'var(--light-gray)', opacity: disabled ? 0.6 : 1 }}>
        <canvas ref={canvasRef} className="absolute inset-0 block"
          style={{ touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} />
        <div className="pointer-events-none absolute left-4 right-4 border-b border-dashed" style={{ bottom: 44, borderColor: '#cbd5c0' }} />
        {empty && (
          <p className="pointer-events-none absolute left-0 right-0 text-center text-sm" style={{ bottom: 18, color: 'var(--hr-faint, #8A9AA0)' }}>
            {placeholder}
          </p>
        )}
      </div>
      <div className="flex justify-end mt-2">
        <button type="button" onClick={clear} disabled={empty || disabled}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-white text-[13px] font-semibold disabled:opacity-40"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <Eraser size={15} /> Clear signature
        </button>
      </div>
    </div>
  )
}
