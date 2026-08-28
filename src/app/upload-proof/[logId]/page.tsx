'use client'

import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Upload, CheckCircle, AlertTriangle, Camera } from 'lucide-react'

export default function UploadProofPage() {
  const { logId } = useParams<{ logId: string }>()
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setStatus('uploading')
    setErrorMsg('')
    try {
      const form = new FormData()
      form.append('logId', logId)
      form.append('file', file)
      const res = await fetch('/api/upload-proof', { method: 'POST', body: form })
      if (res.ok) {
        setStatus('success')
      } else {
        const d = await res.json().catch(() => ({}))
        setErrorMsg(d.error || 'Upload failed')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error')
      setStatus('error')
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: '#E8F5F3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Upload size={28} style={{ color: '#0D9488' }} />
        </div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>Upload Cancellation Proof</h1>
        <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: 24 }}>
          Take a photo or choose a file to upload as proof for this cancellation log.
        </p>

        {status === 'success' ? (
          <div style={{ padding: 24, borderRadius: 12, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <CheckCircle size={40} style={{ color: '#15803D', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600, color: '#15803D', fontSize: '0.95rem' }}>Upload Successful!</p>
            <p style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 8 }}>You can close this tab now.</p>
          </div>
        ) : status === 'error' ? (
          <div>
            <div style={{ padding: 16, borderRadius: 12, background: '#FEF2F2', border: '1px solid #FECACA', marginBottom: 16 }}>
              <AlertTriangle size={24} style={{ color: '#DC2626', margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 600, color: '#DC2626', fontSize: '0.85rem' }}>{errorMsg}</p>
            </div>
            <button onClick={() => { setStatus('idle'); setErrorMsg('') }}
              style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Try Again
            </button>
          </div>
        ) : status === 'uploading' ? (
          <div style={{ padding: 24 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#0D9488', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: 12 }}>Uploading...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : (
          <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/*'
              input.capture = 'environment'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleUpload(file)
              }
              input.click()
            }}
              style={{ padding: '14px 24px', borderRadius: 12, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Camera size={20} /> Take Photo
            </button>

            <button onClick={() => fileRef.current?.click()}
              style={{ padding: '14px 24px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Upload size={20} /> Choose File
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" style={{ display: 'none' }} onChange={onFileChange} />

            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 8 }}>Accepted: photos, images, PDFs</p>
          </div>
        )}
      </div>
    </div>
  )
}
