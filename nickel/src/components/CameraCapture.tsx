'use client'

import { useEffect, useRef, useState } from 'react'

// Live in-app camera. Opens the device camera (rear on phones) with getUserMedia,
// shows a preview, and captures a JPEG data URI. Falls back to a file/upload
// input when the camera is unavailable or permission is denied.
export default function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (dataUri: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setErr(null); setReady(false)
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
        setReady(true)
      } catch {
        if (!cancelled) setErr('Could not open the camera. Use “Choose file” to upload a photo instead.')
      }
    })()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null }
  }, [open])

  function stop() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null }

  function snap() {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement('canvas')
    const w = v.videoWidth || 1280, h = v.videoHeight || 960
    // Cap the long edge to keep the data URI small.
    const scale = Math.min(1, 1600 / Math.max(w, h))
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
    const uri = canvas.toDataURL('image/jpeg', 0.82)
    stop(); onCapture(uri)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => { stop(); onCapture(String(r.result)) }; r.readAsDataURL(f)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => { stop(); onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <b className="text-[14px] text-[color:var(--ink)]">Take a photo</b>
          <button onClick={() => { stop(); onClose() }} className="text-[13px] text-[color:var(--slate)] hover:underline">Close</button>
        </div>
        {err ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{err}</div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="h-auto w-full" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {!err && <button onClick={snap} disabled={!ready} className="btn-primary flex-1 disabled:opacity-50">{ready ? 'Capture' : 'Starting camera…'}</button>}
          <label className="cursor-pointer rounded-xl border border-[color:var(--line-2)] px-4 py-2.5 text-center text-[13px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--mist)]">
            Choose file<input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
          </label>
        </div>
      </div>
    </div>
  )
}
