'use client'

import { useEffect, useRef, useState } from 'react'

// E-signature field: draw on a pad OR upload an image. Emits a PNG data URL.
export default function SignatureField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [drawing, setDrawing] = useState(false)   // pad open?
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pen = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const dirty = useRef(false)

  useEffect(() => {
    if (!drawing) return
    const c = canvasRef.current; if (!c) return
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * ratio); c.height = Math.round(rect.height * ratio)
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14243A'
    dirty.current = false
  }, [drawing])

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: React.PointerEvent) { e.preventDefault(); pen.current = true; last.current = pos(e); canvasRef.current?.setPointerCapture(e.pointerId) }
  function move(e: React.PointerEvent) {
    if (!pen.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !last.current) return
    const p = pos(e); ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; dirty.current = true
  }
  function up() { pen.current = false; last.current = null }
  function clear() {
    const c = canvasRef.current; const ctx = c?.getContext('2d'); if (!c || !ctx) return
    const r = c.getBoundingClientRect(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, r.width, r.height); dirty.current = false
  }
  function save() {
    if (!dirty.current) { setDrawing(false); return }
    const url = canvasRef.current?.toDataURL('image/png'); if (url) onChange(url); setDrawing(false)
  }
  function upload(file: File | undefined) {
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { alert('Image must be under 4 MB.'); return }
    const r = new FileReader(); r.onload = () => onChange(String(r.result)); r.readAsDataURL(file)
  }

  if (drawing) {
    return (
      <div>
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="w-full max-w-[420px] touch-none rounded-xl border border-[color:var(--line-2)] bg-white" style={{ height: 150 }} />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={save} className="btn-primary !py-2">Save signature</button>
          <button type="button" onClick={clear} className="btn-outline !py-2">Clear</button>
          <button type="button" onClick={() => setDrawing(false)} className="btn-outline !py-2">Cancel</button>
        </div>
        <p className="mt-1 text-[11px] text-[color:var(--muted)]">Sign with your mouse or finger.</p>
      </div>
    )
  }

  return (
    <div>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="mb-2 inline-block rounded-lg border border-[color:var(--line)] bg-white p-2"><img src={value} alt="signature" className="h-16 w-auto" /></div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDrawing(true)} className="btn-outline !py-2 inline-flex items-center gap-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 19c3-1 5-4 7-8s4-6 6-6 2 3-1 6-6 4-3 6 6-2 9-4"/></svg>
          {value ? 'Re-draw signature' : 'Draw signature'}
        </button>
        <label className="btn-outline !py-2 cursor-pointer inline-flex items-center gap-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/></svg>
          Upload image
          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {value && <button type="button" onClick={() => onChange('')} className="text-[12.5px] text-[color:var(--slate)] hover:underline">Remove</button>}
      </div>
    </div>
  )
}
