'use client'

// Photo capture for the LOA upload pages.
//
// `<input type="file" accept="image/*" capture="environment">` opens the camera
// on a phone and is ignored on a laptop — there it silently degrades to an
// ordinary file picker, so "Take a photo" did nothing camera-like and a patient
// on a laptop had no way to photograph their letter.
//
// So: phones keep the native capture input (better resolution, familiar UI, and
// it works when a browser blocks getUserMedia), while a laptop gets an in-page
// webcam. The split is on `pointer: coarse` rather than a user-agent string —
// it is asking the question that actually matters, "is this a touch device with
// a real camera app behind the file input".
//
// getUserMedia needs a secure context. Production is HTTPS and localhost counts,
// but if it is missing for any reason the button falls back to the file picker
// rather than appearing broken.

import { useEffect, useRef, useState } from 'react'
import { CameraIcon, ButtonLabel } from '@/components/loa-upload-icons'

interface Props {
  onCapture: (file: File) => void
  /** Rendered as the primary button. A node, so it can carry an icon. */
  label?: React.ReactNode
  buttonStyle?: React.CSSProperties
}

export default function LoaPhotoCapture({
  onCapture,
  label = <ButtonLabel icon={<CameraIcon />}>Take a photo of LOA</ButtonLabel>,
  buttonStyle,
}: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nativeRef = useRef<HTMLInputElement | null>(null)

  function prefersNativeCamera(): boolean {
    if (typeof window === 'undefined') return true
    const touch = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
    const canStream = !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
    return touch || !canStream
  }

  function stop() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // Release the camera if the page navigates or the component unmounts — a
  // stream left running keeps the laptop's camera light on.
  useEffect(() => stop, [])

  async function start() {
    setError(''); setReady(false); setOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)
    } catch (err) {
      const name = (err as DOMException)?.name
      setError(
        name === 'NotAllowedError'
          ? 'Your browser blocked camera access. Allow it in the address bar, or choose a photo or PDF instead.'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No camera was found on this device. Please choose a photo or PDF instead.'
            : name === 'NotReadableError'
              ? 'The camera is already in use by another app. Close it and try again, or choose a photo instead.'
              : 'Could not open the camera. Please choose a photo or PDF instead.',
      )
      setReady(false)
    }
  }

  function shoot() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      blob => {
        if (!blob) { setError('Could not save the photo. Please try again.'); return }
        onCapture(new File([blob], `loa-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        stop(); setOpen(false)
      },
      'image/jpeg',
      0.92,
    )
  }

  const primary: React.CSSProperties = buttonStyle ?? {
    width: '100%', padding: '1rem', borderRadius: 12, border: 'none',
    background: '#F47427', color: '#fff', fontSize: '1.05rem', fontWeight: 700,
    cursor: 'pointer', marginBottom: '0.75rem',
  }

  return (
    <>
      {/* Phones use this directly; on a laptop it stays hidden and the webcam
          modal takes over, but it remains the fallback when a camera fails. */}
      <input
        ref={nativeRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onCapture(f) }}
      />

      <button
        style={primary}
        onClick={() => (prefersNativeCamera() ? nativeRef.current?.click() : start())}
      >
        {label}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,26,0.88)', zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontWeight: 800, color: '#1C2B30', marginBottom: '0.6rem' }}>
              Photograph your LOA
            </p>

            {error ? (
              <p style={{ color: '#991B1B', fontSize: '0.9rem', lineHeight: 1.5, margin: '0.5rem 0 1rem' }}>{error}</p>
            ) : (
              <p style={{ color: '#667', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 0.7rem' }}>
                Hold the letter flat and fill the frame, then press Capture.
              </p>
            )}

            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef} autoPlay playsInline muted
              style={{
                width: '100%', borderRadius: 12, background: '#000',
                display: error ? 'none' : 'block', maxHeight: '60vh', objectFit: 'contain',
              }}
            />

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
              <button
                onClick={() => { stop(); setOpen(false) }}
                style={{
                  flex: 1, padding: '0.85rem', borderRadius: 10, border: '1.5px solid #D6DCE2',
                  background: '#fff', color: '#1C2B30', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              {!error && (
                <button
                  onClick={shoot}
                  disabled={!ready}
                  style={{
                    flex: 2, padding: '0.85rem', borderRadius: 10, border: 'none',
                    background: ready ? '#1A7B8A' : '#9BB6BB', color: '#fff', fontWeight: 700,
                    cursor: ready ? 'pointer' : 'default',
                  }}
                >
                  {ready ? 'Capture' : 'Starting camera…'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
