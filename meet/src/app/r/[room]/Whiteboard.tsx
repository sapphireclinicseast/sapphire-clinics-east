'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataChannel } from '@livekit/components-react'

// Lightweight collaborative whiteboard synced over LiveKit's data channel.
// Points are normalized (0..1) so drawings line up across different screen
// sizes. Strokes broadcast on completion; a late joiner requests the current
// state and any peer replies with the full stroke list.

type Pt = [number, number]
interface Stroke { color: string; size: number; points: Pt[]; erase?: boolean }

const COLORS = ['#1f2a30', '#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed']

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(3)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const enc = useRef(new TextEncoder())
  const dec = useRef(new TextDecoder())

  const ctx = () => canvasRef.current?.getContext('2d') ?? null

  const paintStroke = useCallback((s: Stroke) => {
    const c = ctx(); const cv = canvasRef.current
    if (!c || !cv) return
    const w = cv.width, h = cv.height
    c.save()
    c.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    c.strokeStyle = s.color
    c.lineWidth = (s.erase ? s.size * 4 : s.size) * (window.devicePixelRatio || 1)
    c.lineJoin = 'round'; c.lineCap = 'round'
    c.beginPath()
    s.points.forEach(([nx, ny], i) => {
      const x = nx * w, y = ny * h
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
    })
    if (s.points.length === 1) { const [nx, ny] = s.points[0]; c.lineTo(nx * w + 0.01, ny * h) }
    c.stroke()
    c.restore()
  }, [])

  const redraw = useCallback(() => {
    const c = ctx(); const cv = canvasRef.current
    if (!c || !cv) return
    c.clearRect(0, 0, cv.width, cv.height)
    for (const s of strokesRef.current) paintStroke(s)
  }, [paintStroke])

  const { send } = useDataChannel('wb', (msg) => {
    try {
      const data = JSON.parse(dec.current.decode(msg.payload))
      if (data.type === 'stroke') { strokesRef.current.push(data.stroke); paintStroke(data.stroke) }
      else if (data.type === 'clear') { strokesRef.current = []; redraw() }
      else if (data.type === 'state' && Array.isArray(data.strokes)) {
        if (strokesRef.current.length === 0) { strokesRef.current = data.strokes; redraw() }
      } else if (data.type === 'request') {
        if (strokesRef.current.length) broadcast({ type: 'state', strokes: strokesRef.current })
      }
    } catch { /* ignore malformed */ }
  })

  const broadcast = useCallback((obj: unknown) => {
    try { send(enc.current.encode(JSON.stringify(obj)), { reliable: true }) } catch { /* not connected */ }
  }, [send])

  // Ask peers for existing drawing when we mount.
  useEffect(() => {
    const t = setTimeout(() => broadcast({ type: 'request' }), 800)
    return () => clearTimeout(t)
  }, [broadcast])

  // Keep the canvas backing store sized to its box (crisp on HiDPI) + redraw.
  useEffect(() => {
    const cv = canvasRef.current, wrap = wrapRef.current
    if (!cv || !wrap) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      cv.width = wrap.clientWidth * dpr
      cv.height = wrap.clientHeight * dpr
      redraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [redraw])

  function norm(e: React.PointerEvent): Pt {
    const cv = canvasRef.current!
    const r = cv.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }
  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId)
    drawingRef.current = { color, size, erase: tool === 'eraser', points: [norm(e)] }
  }
  function onMove(e: React.PointerEvent) {
    const s = drawingRef.current; if (!s) return
    s.points.push(norm(e))
    // redraw just this in-progress stroke incrementally
    paintStroke({ ...s, points: s.points.slice(-2) })
  }
  function onUp() {
    const s = drawingRef.current; if (!s) return
    drawingRef.current = null
    strokesRef.current.push(s)
    broadcast({ type: 'stroke', stroke: s })
  }
  function clearAll() {
    strokesRef.current = []; redraw(); broadcast({ type: 'clear' })
  }

  return (
    <div className="wb">
      <div className="wb-tools">
        {COLORS.map((c) => (
          <button key={c} className={`wb-swatch${color === c && tool === 'pen' ? ' on' : ''}`}
            style={{ background: c }} onClick={() => { setColor(c); setTool('pen') }} aria-label={`color ${c}`} />
        ))}
        <span className="wb-sep" />
        <button className={`wb-btn${tool === 'eraser' ? ' on' : ''}`} onClick={() => setTool('eraser')}>Eraser</button>
        <select className="wb-size" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="pen size">
          <option value={2}>Fine</option><option value={3}>Medium</option><option value={6}>Thick</option>
        </select>
        <button className="wb-btn" onClick={clearAll}>Clear</button>
      </div>
      <div className="wb-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="wb-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
      </div>
    </div>
  )
}
