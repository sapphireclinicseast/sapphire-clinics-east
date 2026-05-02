'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Eraser, Upload, Pen } from 'lucide-react'

interface Props {
  initialDataUrl?: string | null
  onChange: (dataUrl: string | null) => void
  width?: number
  height?: number
}

export default function SignaturePad({ initialDataUrl, onChange, width = 500, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  // Initialize canvas with existing signature
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // Draw line style
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (initialDataUrl) {
      const img = new Image()
      img.onload = () => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
      }
      img.src = initialDataUrl
    }
  }, [initialDataUrl, width, height])

  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }, [])

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const coords = getCoords(e)
    if (!coords) return
    setIsDrawing(true)
    lastPointRef.current = coords
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(coords.x, coords.y)
    }
  }, [getCoords])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const coords = getCoords(e)
    if (!coords) return
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && lastPointRef.current) {
      ctx.strokeStyle = '#1a1a2e'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      ctx.lineTo(coords.x, coords.y)
      ctx.stroke()
      lastPointRef.current = coords
    }
  }, [isDrawing, getCoords])

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
    lastPointRef.current = null
    // Save to parent
    const canvas = canvasRef.current
    if (canvas) {
      onChange(canvas.toDataURL('image/png'))
    }
  }, [onChange])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    onChange(null)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        // Fit image within canvas maintaining aspect ratio
        const scale = Math.min(width / img.width, height / img.height)
        const x = (width - img.width * scale) / 2
        const y = (height - img.height * scale) / 2
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale)
        onChange(canvas.toDataURL('image/png'))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${mode === 'draw' ? 'bg-[var(--teal)] text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
          <Pen size={13} /> Draw Signature
        </button>
        <button type="button" onClick={() => { setMode('upload'); fileInputRef.current?.click() }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${mode === 'upload' ? 'bg-[var(--teal)] text-white' : 'bg-[var(--off-white)] text-[var(--mid-gray)] hover:bg-gray-100'}`}>
          <Upload size={13} /> Upload Image
        </button>
        <button type="button" onClick={clearCanvas}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-all ml-auto">
          <Eraser size={13} /> Clear
        </button>
      </div>

      {/* Canvas */}
      <div className="border-2 border-[var(--light-gray)] rounded-xl overflow-hidden bg-white cursor-crosshair touch-none"
        style={{ width, maxWidth: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, display: 'block' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
      <p className="text-[11px] text-[var(--mid-gray)] mt-1.5">Draw with mouse/finger or upload a signature image</p>
    </div>
  )
}
