'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type Stage = 'loading' | 'ready' | 'uploading' | 'success' | 'error'

export default function PwdIdUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [stage, setStage] = useState<Stage>('loading')
  const [firstName, setFirstName] = useState('')
  const [hasExisting, setHasExisting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/pwd-id-upload/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrorMsg(d.error); setStage('error') }
        else { setFirstName(d.firstName); setHasExisting(d.hasExisting); setStage('ready') }
      })
      .catch(() => { setErrorMsg('Could not connect. Please check your internet connection.'); setStage('error') })
  }, [token])

  function handleFile(file: File) {
    setSelectedFile(file)
    if (file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file))
    } else {
      setPreview(null)
    }
  }

  async function upload() {
    if (!selectedFile) return
    setStage('uploading')
    const form = new FormData()
    form.append('file', selectedFile)
    const res = await fetch(`/api/pwd-id-upload/${token}`, { method: 'POST', body: form })
    const d = await res.json()
    if (!res.ok) { setErrorMsg(d.error ?? 'Upload failed'); setStage('error') }
    else setStage('success')
  }

  const teal = '#1A7B8A'
  const orange = '#F47427'
  const charcoal = '#1C2B30'

  const container: React.CSSProperties = {
    minHeight: '100dvh', background: '#F8F9FA',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 440, background: '#fff',
    borderRadius: '1.25rem', padding: '2rem 1.5rem',
    margin: '1.5rem 1rem', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  }

  return (
    <div style={container}>
      <div style={{ width: '100%', background: charcoal, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 36, height: 36, background: orange, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏥</div>
        <div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>Sapphire Clinics East</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', margin: 0 }}>PWD ID / Senior ID Upload</p>
        </div>
      </div>

      <div style={card}>

        {stage === 'loading' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
            <p style={{ color: '#666', fontSize: '0.9rem' }}>Verifying link…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {stage === 'error' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: 48, marginBottom: '1rem' }}>⚠️</div>
            <p style={{ fontWeight: 700, color: charcoal, marginBottom: '0.5rem' }}>Link Unavailable</p>
            <p style={{ color: '#666', fontSize: '0.875rem', lineHeight: 1.5 }}>{errorMsg}</p>
          </div>
        )}

        {stage === 'ready' && !selectedFile && (
          <>
            <h2 style={{ fontWeight: 700, color: charcoal, marginBottom: '0.25rem', fontSize: '1.1rem' }}>
              Hi{firstName ? `, ${firstName}` : ''}!
            </h2>
            <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              {hasExisting
                ? 'A PWD ID / Senior ID is already on file. Upload a new photo to replace it.'
                : 'Please take a clear photo or upload your PWD ID / Senior ID below.'}
            </p>

            <button onClick={() => cameraRef.current?.click()} style={{ width: '100%', padding: '1rem', background: teal, color: '#fff', border: 'none', borderRadius: '0.875rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.875rem' }}>
              <span style={{ fontSize: 20 }}>📷</span> Take a Photo
            </button>

            <button onClick={() => galleryRef.current?.click()} style={{ width: '100%', padding: '1rem', background: '#fff', color: teal, border: `2px solid ${teal}`, borderRadius: '0.875rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: 20 }}>🖼️</span> Choose from Gallery / Files
            </button>

            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

            <p style={{ color: '#aaa', fontSize: '0.72rem', textAlign: 'center', marginTop: '1.25rem' }}>
              Accepted: JPEG, PNG, WebP, PDF · Max 20 MB
            </p>
          </>
        )}

        {stage === 'ready' && selectedFile && (
          <>
            <h2 style={{ fontWeight: 700, color: charcoal, marginBottom: '1rem', fontSize: '1rem' }}>Review your document</h2>
            {preview ? (
              <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: '0.75rem', background: '#F0F0F0', marginBottom: '1.25rem' }} />
            ) : (
              <div style={{ width: '100%', padding: '2rem', background: '#F0F0F0', borderRadius: '0.75rem', textAlign: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: 40 }}>📄</span>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#555' }}>{selectedFile.name}</p>
              </div>
            )}
            <button onClick={upload} style={{ width: '100%', padding: '1rem', background: orange, color: '#fff', border: 'none', borderRadius: '0.875rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
              Upload This Document
            </button>
            <button onClick={() => { setSelectedFile(null); setPreview(null) }} style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: '#666', border: '1px solid #ddd', borderRadius: '0.875rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
              Choose a Different File
            </button>
          </>
        )}

        {stage === 'uploading' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ width: 48, height: 48, border: `4px solid ${orange}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.25rem' }} />
            <p style={{ fontWeight: 700, color: charcoal, marginBottom: '0.25rem' }}>Uploading…</p>
            <p style={{ color: '#888', fontSize: '0.85rem' }}>Please wait and keep this page open.</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {stage === 'success' && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ width: 64, height: 64, background: '#DCFCE7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 1rem' }}>✅</div>
            <p style={{ fontWeight: 700, color: charcoal, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Document Uploaded!</p>
            <p style={{ color: '#555', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Your PWD ID / Senior ID has been saved to your patient record. You can now close this page.
            </p>
          </div>
        )}

      </div>

      <p style={{ color: '#bbb', fontSize: '0.7rem', padding: '0 1rem 2rem', textAlign: 'center' }}>
        Sapphire Clinics East Inc. · Secure document upload
      </p>
    </div>
  )
}
