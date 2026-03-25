'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useRef } from 'react'
import { Camera, Upload, CheckCircle2, X, RotateCcw, ImageIcon } from 'lucide-react'

export default function CapturePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const scheduleId = params.scheduleId as string
  const token = searchParams.get('token')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<'ready' | 'captured' | 'uploading' | 'done' | 'error'>(!token ? 'error' : 'ready')
  const [error, setError] = useState(!token ? 'Invalid or missing capture token' : '')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCapturedFile(file)

    const reader = new FileReader()
    reader.onload = (ev) => {
      setCapturedImage(ev.target?.result as string)
      setStatus('captured')
    }
    reader.readAsDataURL(file)
  }

  function retake() {
    setCapturedImage(null)
    setCapturedFile(null)
    setStatus('ready')
    // Reset the file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function upload() {
    if (!capturedFile) return
    setStatus('uploading')

    try {
      const formData = new FormData()
      formData.append('file', capturedFile)
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
    <div className="min-h-screen bg-[#1A120B] flex flex-col">
      {/* Header */}
      <div className="bg-[#2B1F14] px-4 py-3 text-center">
        <h1 className="text-white font-semibold text-sm">SCEI Teletherapy</h1>
        <p className="text-white/50 text-xs">Capture Session Notes</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {status === 'error' && (
          <div className="text-center max-w-sm">
            <X className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-white mb-2">{error}</p>
            <button
              onClick={() => { setError(''); setStatus('ready'); }}
              className="text-[#F4943E] text-sm hover:underline"
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            {/* Camera capture area */}
            <div className="w-full aspect-[4/3] border-2 border-dashed border-white/30 rounded-xl flex flex-col items-center justify-center gap-4 bg-white/5">
              <ImageIcon className="w-16 h-16 text-white/30" />
              <p className="text-white/50 text-sm text-center px-4">
                Take a photo of the handwritten session notes
              </p>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              id="camera-input"
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="gallery-input"
            />

            {/* Action buttons */}
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 bg-white text-[#2B1F14] py-4 rounded-xl font-semibold text-base shadow-lg active:scale-[0.98] transition-transform"
              >
                <Camera className="w-6 h-6" />
                Take Photo
              </button>
              <button
                onClick={() => document.getElementById('gallery-input')?.click()}
                className="w-full flex items-center justify-center gap-3 bg-white/10 text-white py-3 rounded-xl text-sm active:scale-[0.98] transition-transform"
              >
                <Upload className="w-5 h-5" />
                Choose from Gallery
              </button>
            </div>
          </div>
        )}

        {status === 'captured' && capturedImage && (
          <>
            <div className="w-full max-w-lg rounded-xl overflow-hidden mb-4 border border-white/10">
              <img src={capturedImage} alt="Captured" className="w-full" />
            </div>
            <div className="flex gap-3">
              <button
                onClick={retake}
                className="flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-lg text-sm active:scale-95 transition-transform"
              >
                <RotateCcw size={16} />
                Retake
              </button>
              <button
                onClick={upload}
                className="flex items-center gap-2 bg-[#E07C24] text-white px-5 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition-transform"
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
    </div>
  )
}
