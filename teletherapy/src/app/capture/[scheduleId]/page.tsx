'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Camera, Upload, CheckCircle2, X, RotateCcw } from 'lucide-react'

export default function CapturePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const scheduleId = params.scheduleId as string
  const token = searchParams.get('token')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [status, setStatus] = useState<'loading' | 'ready' | 'captured' | 'uploading' | 'done' | 'error'>('loading')
  const [error, setError] = useState('')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing capture token')
      setStatus('error')
      return
    }
    startCamera()
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function startCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setStatus('ready')
    } catch {
      setError('Camera access denied. Please allow camera access and try again.')
      setStatus('error')
    }
  }

  function capture() {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setCapturedImage(dataUrl)
      setStatus('captured')
      stream?.getTracks().forEach((t) => t.stop())
    }
  }

  function retake() {
    setCapturedImage(null)
    startCamera()
  }

  async function upload() {
    if (!capturedImage) return
    setStatus('uploading')

    try {
      // Convert data URL to blob
      const res = await fetch(capturedImage)
      const blob = await res.blob()
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('scheduleId', scheduleId)
      formData.append('token', token!)

      const uploadRes = await fetch('/api/capture-upload', {
        method: 'POST',
        body: formData,
      })

      if (uploadRes.ok) {
        setStatus('done')
      } else {
        const data = await uploadRes.json()
        setError(data.error ?? 'Upload failed')
        setStatus('error')
      }
    } catch {
      setError('Upload failed. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-[#0A1012] flex flex-col">
      {/* Header */}
      <div className="bg-[#1C2B30] px-4 py-3 text-center">
        <h1 className="text-white font-semibold text-sm">SCEI Teletherapy</h1>
        <p className="text-white/50 text-xs">Capture Session Notes</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {status === 'loading' && (
          <div className="text-white text-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Starting camera...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center max-w-sm">
            <X className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-white mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-[#2AAABB] text-sm hover:underline"
            >
              Try Again
            </button>
          </div>
        )}

        {(status === 'ready') && (
          <>
            <div className="relative w-full max-w-lg rounded-xl overflow-hidden mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full"
              />
              {/* Overlay guides */}
              <div className="absolute inset-4 border-2 border-white/30 rounded-lg pointer-events-none" />
            </div>
            <p className="text-white/60 text-xs text-center mb-4">
              Position the handwritten notes within the frame
            </p>
            <button
              onClick={capture}
              className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <Camera className="w-7 h-7 text-[#1C2B30]" />
            </button>
          </>
        )}

        {status === 'captured' && capturedImage && (
          <>
            <div className="w-full max-w-lg rounded-xl overflow-hidden mb-4">
              <img src={capturedImage} alt="Captured" className="w-full" />
            </div>
            <div className="flex gap-3">
              <button
                onClick={retake}
                className="flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-lg text-sm"
              >
                <RotateCcw size={16} />
                Retake
              </button>
              <button
                onClick={upload}
                className="flex items-center gap-2 bg-[#1A7B8A] text-white px-5 py-2.5 rounded-lg text-sm font-medium"
              >
                <Upload size={16} />
                Upload
              </button>
            </div>
          </>
        )}

        {status === 'uploading' && (
          <div className="text-white text-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Uploading...</p>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center">
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-3" />
            <h2 className="text-white font-semibold text-lg mb-1">Uploaded!</h2>
            <p className="text-white/60 text-sm">
              The photo has been attached to the session notes.
            </p>
            <p className="text-white/40 text-xs mt-4">You can close this page.</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
