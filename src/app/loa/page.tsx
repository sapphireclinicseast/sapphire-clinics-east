'use client'

// The standing LOA form — one permanent URL the clinic hands out on a poster,
// a QR at the desk, or in a message. No token, so the same link works for
// everyone, every time.
//
// The patient identifies themselves by finding their own record in the CRM,
// which is why front desk must register them first. The search deliberately
// answers only a query specific enough to be someone looking themselves up —
// see /api/loa-form/patients.

import { useEffect, useRef, useState } from 'react'
import LoaPhotoCapture from '@/components/LoaPhotoCapture'

type Stage = 'form' | 'submitting' | 'success'
interface Picked { id: string; name: string }

export default function LoaStandingFormPage() {
  const [stage, setStage] = useState<Stage>('form')
  const [errorMsg, setErrorMsg] = useState('')

  // Patient lookup
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Picked[]>([])
  const [patient, setPatient] = useState<Picked | null>(null)
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'none' | 'broad' | 'short'>('idle')

  // The rest of the form
  const [hmoName, setHmoName] = useState('')
  const [branch, setBranch] = useState('')
  const [approvalDate, setApprovalDate] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [opts, setOpts] = useState<{
    hmos: { id: string; name: string }[]
    services: { id: string; name: string }[]
    branches: { value: string; label: string; shortCode: string }[]
  }>({ hmos: [], services: [], branches: [] })

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/loa-form').then(r => r.json()).then(d => {
      setOpts({ hmos: d.hmos ?? [], services: d.services ?? [], branches: d.branches ?? [] })
    }).catch(() => {})
  }, [])

  // Debounced so typing a name is one search, not one per keystroke — the
  // endpoint is rate limited and a per-keystroke search would trip it.
  useEffect(() => {
    if (patient) return
    const q = query.trim()
    if (q.length < 3) { setResults([]); setSearchState(q.length ? 'short' : 'idle'); return }
    setSearchState('searching')
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/loa-form/patients?q=${encodeURIComponent(q)}`)
        const d = await r.json()
        if (d.tooMany) { setResults([]); setSearchState('broad') }
        else if (!d.patients?.length) { setResults([]); setSearchState('none') }
        else { setResults(d.patients); setSearchState('idle') }
      } catch { setResults([]); setSearchState('none') }
    }, 400)
    return () => clearTimeout(t)
  }, [query, patient])

  function handleFile(file: File) {
    setSelectedFile(file)
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }

  async function submit() {
    setErrorMsg('')
    if (!patient) return setErrorMsg('Please find and select your name first.')
    if (!hmoName) return setErrorMsg('Please choose your HMO.')
    if (!branch) return setErrorMsg('Please choose the clinic branch.')
    if (!selectedFile) return setErrorMsg('Please attach a photo or PDF of your LOA.')

    setStage('submitting')
    const fd = new FormData()
    fd.append('patientId', patient.id)
    fd.append('hmoName', hmoName)
    fd.append('branch', branch)
    if (approvalDate) fd.append('dateOfApproval', approvalDate)
    picked.forEach(s => fd.append('services', s))
    fd.append('file', selectedFile)
    try {
      const r = await fetch('/api/loa-form', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { setErrorMsg(d.error ?? 'Submission failed'); setStage('form') }
      else setStage('success')
    } catch {
      setErrorMsg('Could not send. Please check your connection and try again.')
      setStage('form')
    }
  }

  const teal = '#1A7B8A'
  const orange = '#F47427'
  const charcoal = '#1C2B30'

  const container: React.CSSProperties = {
    minHeight: '100dvh', background: '#F8F9FA', display: 'flex', flexDirection: 'column',
    alignItems: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '1.5rem 1rem 3rem',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16,
    padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  }
  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700, color: charcoal,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem',
  }
  const fieldBox: React.CSSProperties = {
    width: '100%', padding: '0.7rem', borderRadius: 10, border: '1.5px solid #D6DCE2',
    fontSize: '1rem', marginBottom: '1.1rem', color: charcoal, background: '#fff',
  }
  const bigButton: React.CSSProperties = {
    width: '100%', padding: '1rem', borderRadius: 12, border: 'none',
    background: orange, color: '#fff', fontSize: '1.05rem', fontWeight: 700,
    cursor: 'pointer', marginBottom: '0.75rem',
  }
  const ghostButton: React.CSSProperties = {
    ...bigButton, background: '#fff', color: charcoal, border: '1.5px solid #D6DCE2',
  }

  if (stage === 'success') {
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>✅</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: charcoal, margin: '0.75rem 0 0.5rem' }}>
            Thank you{patient ? `, ${patient.name.split(',')[1]?.trim() ?? ''}` : ''}!
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
          Submit your approved LOA
        </h1>
        <p style={{ color: '#667', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          Send us your approved Letter of Authorization so we can bill your HMO for your sessions.
        </p>

        {/* ── Step 1: who are you ── */}
        <label style={fieldLabel}>Find your name</label>
        {patient ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
            padding: '0.7rem', borderRadius: 10, marginBottom: '1.1rem',
            border: `1.5px solid ${teal}`, background: '#E6F2F4',
          }}>
            <span style={{ fontWeight: 700, color: '#12606C' }}>{patient.name}</span>
            <button
              onClick={() => { setPatient(null); setQuery(''); setResults([]) }}
              style={{ background: 'none', border: 'none', color: teal, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type your full name…"
              style={{ ...fieldBox, marginBottom: '0.5rem' }}
            />
            {searchState === 'short' && (
              <p style={{ fontSize: '0.8rem', color: '#8A9499', marginBottom: '0.75rem' }}>
                Keep typing — at least 3 letters.
              </p>
            )}
            {searchState === 'searching' && (
              <p style={{ fontSize: '0.8rem', color: '#8A9499', marginBottom: '0.75rem' }}>Searching…</p>
            )}
            {searchState === 'broad' && (
              <p style={{ fontSize: '0.8rem', color: '#8A5A00', background: '#FFF7E6', border: '1px solid #F3D9A5', padding: '0.55rem 0.7rem', borderRadius: 8, marginBottom: '0.75rem' }}>
                That matches too many people. Please type your full name.
              </p>
            )}
            {searchState === 'none' && (
              <p style={{ fontSize: '0.82rem', color: '#8A5A00', background: '#FFF7E6', border: '1px solid #F3D9A5', padding: '0.55rem 0.7rem', borderRadius: 8, marginBottom: '0.75rem', lineHeight: 1.5 }}>
                We could not find that name. Please check the spelling — and if you
                are new, ask the clinic front desk to register you first.
              </p>
            )}
            {results.length > 0 && (
              <div style={{ border: '1px solid #D6DCE2', borderRadius: 10, overflow: 'hidden', marginBottom: '1.1rem' }}>
                {results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setPatient(r); setResults([]) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '0.7rem',
                      background: '#fff', border: 'none', borderBottom: '1px solid #EEF1F3',
                      fontSize: '0.95rem', color: charcoal, cursor: 'pointer',
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Step 2: the letter ── */}
        <label style={fieldLabel}>HMO name</label>
        <select value={hmoName} onChange={e => setHmoName(e.target.value)} style={fieldBox}>
          <option value="">Select your HMO…</option>
          {opts.hmos.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
        </select>

        <label style={fieldLabel}>Clinic branch</label>
        <select value={branch} onChange={e => setBranch(e.target.value)} style={fieldBox}>
          <option value="">Select the clinic…</option>
          {opts.branches.map(b => <option key={b.shortCode} value={b.shortCode}>{b.label}</option>)}
        </select>

        <label style={fieldLabel}>Date of approval</label>
        <input type="date" value={approvalDate} onChange={e => setApprovalDate(e.target.value)} style={fieldBox} />

        <label style={fieldLabel}>Services availed</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
          {opts.services.map(sv => {
            const on = picked.includes(sv.name)
            return (
              <label key={sv.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer',
                padding: '0.45rem 0.7rem', borderRadius: 999, fontSize: '0.88rem', fontWeight: 600,
                border: `1.5px solid ${on ? teal : '#D6DCE2'}`,
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

        <input ref={galleryRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

        {/* Phone: rear camera. Laptop: in-page webcam, since the capture
            attribute is ignored there and this used to open a file picker. */}
        <LoaPhotoCapture onCapture={handleFile} buttonStyle={bigButton} />
        <button style={ghostButton} onClick={() => galleryRef.current?.click()}>📎 Choose a photo or PDF</button>

        {errorMsg && (
          <p style={{ color: '#991B1B', fontSize: '0.88rem', margin: '0.5rem 0 0.75rem' }}>{errorMsg}</p>
        )}

        <button
          onClick={submit}
          disabled={stage === 'submitting'}
          style={{ ...bigButton, background: teal, marginTop: '0.75rem', opacity: stage === 'submitting' ? 0.6 : 1 }}
        >
          {stage === 'submitting' ? 'Sending…' : 'Send to clinic'}
        </button>

        <p style={{ fontSize: '0.75rem', color: '#8A9499', marginTop: '1rem', lineHeight: 1.5 }}>
          Accepted: JPG, PNG or PDF, up to 20 MB. If you cannot find your name,
          please ask the clinic front desk to register you first.
        </p>
      </div>
    </div>
  )
}
