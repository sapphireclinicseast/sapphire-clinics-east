'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataChannel } from '@livekit/components-react'

// Lightweight collaborative whiteboard synced over LiveKit's data channel.
// Coordinates are normalized (0..1) so drawings line up across screen sizes.
// Items (pen strokes, eraser strokes, text) are kept in one ordered list so
// they layer correctly and can be replayed for late joiners.

type Pt = [number, number]
type StrokeItem = { kind: 'stroke'; color: string; size: number; points: Pt[]; erase?: boolean }
type TextItem = { kind: 'text'; x: number; y: number; text: string; color: string; size: number }
type Item = StrokeItem | TextItem

const COLORS = [
  '#1f2a30', '#6b7280', '#ffffff', '#e11d48', '#f97316', '#eab308',
  '#22c55e', '#059669', '#0ea5e9', '#2563eb', '#7c3aed', '#db2777',
]
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<Item[]>([])
  const drawingRef = useRef<StrokeItem | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [penSize, setPenSize] = useState(3)
  const [eraserSize, setEraserSize] = useState(24)
  const [textSize, setTextSize] = useState(20)
  const [tool, setTool] = useState<'pen' | 'eraser' | 'text'>('pen')
  const [editing, setEditing] = useState<{ xPx: number; yPx: number; xN: number; yN: number } | null>(null)
  const [draft, setDraft] = useState('')
  const enc = useRef(new TextEncoder())
  const dec = useRef(new TextDecoder())

  const activeSize = tool === 'eraser' ? eraserSize : tool === 'text' ? textSize : penSize
  const ctx = () => canvasRef.current?.getContext('2d') ?? null

  const paintItem = useCallback((it: Item) => {
    const c = ctx(); const cv = canvasRef.current
    if (!c || !cv) return
    const w = cv.width, h = cv.height, dpr = window.devicePixelRatio || 1
    c.save()
    if (it.kind === 'text') {
      c.globalCompositeOperation = 'source-over'
      c.fillStyle = it.color
      c.font = `${it.size * dpr}px ${FONT}`
      c.textBaseline = 'top'
      it.text.split('\n').forEach((line, i) => c.fillText(line, it.x * w, it.y * h + i * it.size * dpr * 1.25))
    } else {
      c.globalCompositeOperation = it.erase ? 'destination-out' : 'source-over'
      c.strokeStyle = it.color
      c.lineWidth = it.size * dpr
      c.lineJoin = 'round'; c.lineCap = 'round'
      c.beginPath()
      it.points.forEach(([nx, ny], i) => {
        const x = nx * w, y = ny * h
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
      })
      if (it.points.length === 1) { const [nx, ny] = it.points[0]; c.lineTo(nx * w + 0.01, ny * h) }
      c.stroke()
    }
    c.restore()
  }, [])

  const redraw = useCallback(() => {
    const c = ctx(); const cv = canvasRef.current
    if (!c || !cv) return
    c.clearRect(0, 0, cv.width, cv.height)
    for (const it of itemsRef.current) paintItem(it)
  }, [paintItem])

  const { send } = useDataChannel('wb', (msg) => {
    try {
      const data = JSON.parse(dec.current.decode(msg.payload))
      if (data.type === 'item') { itemsRef.current.push(data.item); paintItem(data.item) }
      else if (data.type === 'clear') { itemsRef.current = []; redraw() }
      else if (data.type === 'state' && Array.isArray(data.items)) {
        if (itemsRef.current.length === 0) { itemsRef.current = data.items; redraw() }
      } else if (data.type === 'request') {
        if (itemsRef.current.length) broadcast({ type: 'state', items: itemsRef.current })
      }
    } catch { /* ignore malformed */ }
  })

  const broadcast = useCallback((obj: unknown) => {
    try { send(enc.current.encode(JSON.stringify(obj)), { reliable: true }) } catch { /* not connected */ }
  }, [send])
  const addItem = useCallback((it: Item) => {
    itemsRef.current.push(it); paintItem(it); broadcast({ type: 'item', item: it })
  }, [broadcast, paintItem])

  useEffect(() => {
    const t = setTimeout(() => broadcast({ type: 'request' }), 800)
    return () => clearTimeout(t)
  }, [broadcast])

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

  function rel(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { xPx: e.clientX - r.left, yPx: e.clientY - r.top, xN: (e.clientX - r.left) / r.width, yN: (e.clientY - r.top) / r.height }
  }

  function onDown(e: React.PointerEvent) {
    if (tool === 'text') {
      commitText() // commit any open editor first
      const p = rel(e)
      setEditing({ xPx: p.xPx, yPx: p.yPx, xN: p.xN, yN: p.yN })
      setDraft('')
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = rel(e)
    drawingRef.current = { kind: 'stroke', color, size: activeSize, erase: tool === 'eraser', points: [[p.xN, p.yN]] }
  }
  function onMove(e: React.PointerEvent) {
    const s = drawingRef.current; if (!s) return
    const p = rel(e)
    s.points.push([p.xN, p.yN])
    paintItem({ ...s, points: s.points.slice(-2) })
  }
  function onUp() {
    const s = drawingRef.current; if (!s) return
    drawingRef.current = null
    itemsRef.current.push(s)
    broadcast({ type: 'item', item: s })
  }

  function commitText() {
    if (editing && draft.trim()) {
      addItem({ kind: 'text', x: editing.xN, y: editing.yN, text: draft, color, size: textSize })
    }
    setEditing(null); setDraft('')
  }
  function clearAll() {
    itemsRef.current = []; redraw(); broadcast({ type: 'clear' })
  }

  const sizeRange = tool === 'text' ? { min: 12, max: 48 } : tool === 'eraser' ? { min: 6, max: 60 } : { min: 1, max: 20 }
  const setActiveSize = (n: number) => (tool === 'eraser' ? setEraserSize(n) : tool === 'text' ? setTextSize(n) : setPenSize(n))

  return (
    <div className="wb">
      <div className="wb-tools">
        <div className="wb-swatches">
          {COLORS.map((c) => (
            <button key={c} className={`wb-swatch${color === c ? ' on' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} aria-label={`color ${c}`} />
          ))}
          <label className="wb-swatch wb-custom" style={{ background: color }} title="Custom color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
        <span className="wb-sep" />
        <button className={`wb-btn${tool === 'pen' ? ' on' : ''}`} onClick={() => setTool('pen')}>Pen</button>
        <button className={`wb-btn${tool === 'text' ? ' on' : ''}`} onClick={() => setTool('text')}>Text</button>
        <button className={`wb-btn${tool === 'eraser' ? ' on' : ''}`} onClick={() => setTool('eraser')}>Eraser</button>
        <div className="wb-size">
          <span className="wb-size-label">{tool === 'eraser' ? 'Eraser' : tool === 'text' ? 'Text' : 'Pen'} {activeSize}</span>
          <input type="range" min={sizeRange.min} max={sizeRange.max} value={activeSize}
            onChange={(e) => setActiveSize(Number(e.target.value))} />
        </div>
        <button className="wb-btn" onClick={clearAll}>Clear</button>
      </div>
      <div className="wb-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={`wb-canvas${tool === 'text' ? ' text' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
        {editing && (
          <textarea
            autoFocus
            className="wb-text-input"
            style={{ left: editing.xPx, top: editing.yPx, color, fontSize: textSize, fontFamily: FONT }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
              else if (e.key === 'Escape') { setEditing(null); setDraft('') }
            }}
            placeholder="Type…"
          />
        )}
      </div>
    </div>
  )
}
