'use client'

// Patient-facing LOA upload. Reached by scanning the QR at the desk or opening
// the link the clinic sent, so it has to work one-handed on a phone: the camera
// button is the primary action and the file picker is the fallback.
//
// Modelled on /referral/[token], which patients already use for referrals.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type Stage = 'loading' | 'ready' | 'uploading' | 'success' | 'error'

export default function LoaUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [stage, setStage] = useState<Stage>('loading')
  const [firstName, setFirstName] = useState('')

  const [hmoName, setHmoName] = useState('')
  const [branch, setBranch] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [opts, setOpts] = useState<{
    hmos: { id: string; name: string }[]
    services: { id: string; name: string }[]
    branches: { value: string; label: string; shortCode: string }[]
  }>({ hmos: [], services: [], branches: [] })
  const [hasExisting, setHasExisting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [approvalDate, setApprovalDate] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/loa-upload/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrorMsg(d.error); setStage('error') }
        else {
          setFirstName(d.firstName ?? '')
          setHmoName(d.hmoName ?? '')
          setBranch(d.branch ?? '')
          setPicked(d.services ?? [])
          setOpts(d.options ?? { hmos: [], services: [], branches: [] })
          setHasExisting(!!d.hasExisting)
          setStage('ready')
        }
      })
      .catch(() => {
        setErrorMsg('Could not connect. Please check your internet connection.')
        setStage('error')
      })
  }, [token])

  function handleFile(file: File) {
    setSelectedFile(file)
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }

  async function upload() {
    if (!selectedFile) return
    setStage('uploading')
    const form = new FormData()
    form.append('file', selectedFile)
    if (approvalDate) form.append('dateOfApproval', approvalDate)
    if (hmoName) form.append('hmoName', hmoName)
    if (branch) form.append('branch', branch)
    picked.forEach(sv => form.append('services', sv))
    try {
      const res = await fetch(`/api/loa-upload/${token}`, { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) { setErrorMsg(d.error ?? 'Upload failed'); setStage('error') }
      else setStage('success')
    } catch {
      setErrorMsg('Upload failed. Please check your connection and try again.')
      setStage('error')
    }
  }

  const teal = '#1A7B8A'
  const orange = '#F47427'
  const charcoal = '#1C2B30'

  const container: React.CSSProperties = {
    minHeight: '100dvh',
    background: '#F8F9FA',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '1.5rem 1rem 3rem',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16,
    padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  }
  const bigButton: React.CSSProperties = {
    width: '100%', padding: '1rem', borderRadius: 12, border: 'none',
    background: orange, color: '#fff', fontSize: '1.05rem', fontWeight: 700,
    cursor: 'pointer', marginBottom: '0.75rem',
  }
  const ghostButton: React.CSSProperties = {
    ...bigButton, background: '#fff', color: charcoal, border: '1.5px solid #D6DCE2',
  }
  // Touch-sized controls throughout — this form is filled on a phone, standing
  // at a counter or at home, not at a desk.
  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700, color: charcoal,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem',
  }
  const fieldBox: React.CSSProperties = {
    width: '100%', padding: '0.7rem', borderRadius: 10, border: '1.5px solid #D6DCE2',
    fontSize: '1rem', marginBottom: '1.1rem', color: charcoal, background: '#fff',
  }

  if (stage === 'loading') {
    return <div style={container}><div style={card}><p style={{ color: '#667' }}>Loading…</p></div></div>
  }

  if (stage === 'error') {
    return (
      <div style={container}>
        <div style={card}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: charcoal, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#667', lineHeight: 1.5 }}>{errorMsg}</p>
        </div>
      </div>
    )
  }

  if (stage === 'success') {
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>✅</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: charcoal, margin: '0.75rem 0 0.5rem' }}>
            Thank you{firstName ? `, ${firstName}` : ''}!
          </h1>
          <p style={{ color: '#667', lineHeight: 1.5 }}>
            Your Letter of Authorization has been sent to the clinic. You can close this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={container}>
      <div style={card}>
        <p style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: teal, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          Sapphire Clinics East
        </p>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: charcoal, marginBottom: '0.4rem' }}>
          Upload your approved LOA
        </h1>
        <p style={{ color: '#667', lineHeight: 1.5, marginBottom: '1rem' }}>
          {firstName ? `Hi ${firstName}! ` : ''}
          Please send us a photo or PDF of your approved Letter of Authorization
          {hmoName ? <> from <strong>{hmoName}</strong></> : null}.
        </p>

        {hasExisting && (
          <p style={{ fontSize: '0.85rem', background: '#FFF7E6', border: '1px solid #F3D9A5', color: '#8A5A00', padding: '0.6rem 0.75rem', borderRadius: 8, marginBottom: '1rem' }}>
            We already have a document on file. Uploading again will replace it.
          </p>
        )}

        <label style={fieldLabel}>HMO name</label>
        <select value={hmoName} onChange={e => setHmoName(e.target.value)} style={fieldBox}>
          <option value="">Select your HMO…</option>
          {opts.hmos.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
        </select>

        {/* Branch comes from HR Hub, so a newly opened clinic appears here
            without this page changing. Prefilled and left editable when the
            clinic already knows which branch the session is at. */}
        <label style={fieldLabel}>Clinic branch</label>
        <select value={branch} onChange={e => setBranch(e.target.value)} style={fieldBox}>
          <option value="">Select the clinic…</option>
          {opts.branches.map(b => <option key={b.shortCode} value={b.shortCode}>{b.label}</option>)}
        </select>

        <label style={fieldLabel}>Date of approval</label>
        <input
          type="date"
          value={approvalDate}
          onChange={e => setApprovalDate(e.target.value)}
          style={fieldBox}
        />

        <label style={fieldLabel}>Services availed</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
          {opts.services.map(sv => {
            const on = picked.includes(sv.name)
            return (
              <label key={sv.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer',
                padding: '0.45rem 0.7rem', borderRadius: 999, fontSize: '0.88rem', fontWeight: 600,
                border: `1.5px solid ${on ? '#1A7B8A' : '#D6DCE2'}`,
                background: on ? '#E6F2F4' : '#fff', color: on ? '#12606C' : '#46555C',
              }}>
                <input
                  type="checkbox" checked={on} style={{ margin: 0, width: 16, height: 16 }}
                  onChange={() => setPicked(p => on ? p.filter(x => x !== sv.name) : [...p, sv.name])}
                />
                {sv.name}
              </label>
            )
          })}
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected LOA" style={{ width: '100%', borderRadius: 12, marginBottom: '1rem', border: '1px solid #E5E9EC' }} />
        )}
        {selectedFile && !preview && (
          <p style={{ fontSize: '0.9rem', color: charcoal, marginBottom: '1rem' }}>
            Selected: <strong>{selectedFile.name}</strong>
          </p>
        )}

        {/* capture="environment" opens the rear camera straight away on a phone,
            which is how most patients will send this — they photograph the
            letter rather than having a file to pick. */}
        <input
          ref={cameraRef} type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <input
          ref={galleryRef} type="file" accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        <button style={bigButton} onClick={() => cameraRef.current?.click()}>
          📷 Take a photo
        </button>
        <button style={ghostButton} onClick={() => galleryRef.current?.click()}>
          📎 Choose a photo or PDF
        </button>

        {selectedFile && (
          <button
            onClick={upload}
            disabled={stage === 'uploading'}
            style={{ ...bigButton, background: teal, marginTop: '0.75rem', opacity: stage === 'uploading' ? 0.6 : 1 }}
          >
            {stage === 'uploading' ? 'Sending…' : 'Send to clinic'}
          </button>
        )}

        <p style={{ fontSize: '0.75rem', color: '#8A9499', marginTop: '1rem', lineHeight: 1.5 }}>
          Accepted: JPG, PNG or PDF, up to 20 MB. This link works once and expires.
        </p>
      </div>
    </div>
  )
}
