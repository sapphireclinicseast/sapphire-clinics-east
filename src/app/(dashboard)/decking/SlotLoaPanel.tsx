'use client'

// The LOA panel that opens from an HMO slot on the Decking board.
//
// Deliberately the same three actions as the LOA Submission module — name the
// HMO, tick the services, get the document — so front desk never has to leave
// the grid mid-scan. Anything more (status history, deletion) belongs in the
// module itself.

import { useState } from 'react'
import { X, QrCode, Upload, Download } from 'lucide-react'

export interface LoaLite {
  id: string
  hmoName: string
  services: string[]
  dateOfApproval: string | null
  fileUrl: string | null
  status: 'AWAITING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
}

export default function SlotLoaPanel({
  loa, patientLabel, sessionLabel, onClose, onSaved,
}: {
  loa: LoaLite
  patientLabel: string
  sessionLabel: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [fileUrl, setFileUrl] = useState(loa.fileUrl)
  const [qr, setQr] = useState<{ url: string; data: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function makeQr() {
    setBusy(true)
    try {
      const r = await fetch(`/api/loa/${loa.id}/token`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) setQr({ url: d.uploadUrl, data: d.qrDataUrl, expiresAt: d.expiresAt })
      else alert(d.error ?? 'Could not create a link')
    } finally { setBusy(false) }
  }

  async function upload(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(`/api/loa/${loa.id}/file`, { method: 'POST', body: form })
      const d = await r.json()
      if (!r.ok) alert(d.error ?? 'Upload failed')
      else { setFileUrl(d.fileUrl); onSaved?.() }
    } finally { setBusy(false) }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(20,28,32,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60,
  }
  const sheet: React.CSSProperties = {
    background: '#fff', borderRadius: 14, padding: '1.25rem', width: '100%',
    maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
  }
  const field: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid #D6DCE2',
    fontSize: '0.9rem', marginBottom: '0.85rem', color: '#1C2B30', background: '#fff',
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#46555C',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
          <div>
            <p style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: '#5B2A86', textTransform: 'uppercase' }}>
              Letter of Authorization
            </p>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1C2B30' }}>{patientLabel}</h2>
            <p style={{ fontSize: '0.8rem', color: '#8A9499' }}>{sessionLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A9499' }}>
            <X size={18} />
          </button>
        </div>

        {qr ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#667', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Have the patient scan this to upload their approved LOA. Works once, expires{' '}
              {new Date(qr.expiresAt).toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.data} alt="LOA upload QR code" style={{ width: 220, height: 220, margin: '0 auto', display: 'block' }} />
            <input readOnly value={qr.url} onFocus={e => e.currentTarget.select()} style={{ ...field, marginTop: '0.85rem', fontSize: '0.75rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => navigator.clipboard?.writeText(qr.url)} style={{ ...field, marginBottom: 0, cursor: 'pointer', fontWeight: 700, background: '#ED6823', color: '#fff', border: 'none' }}>
                Copy link
              </button>
              <button onClick={() => setQr(null)} style={{ ...field, marginBottom: 0, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
        ) : (
          <>
            {/* Read-back, not a form. The patient fills the letter in on their
                own page — HMO, branch, date, services — so editing it here
                would just be a second source of truth for the same fields. */}
            <div style={{ background: '#F7F9FA', borderRadius: 8, padding: '0.7rem 0.85rem', marginBottom: '0.85rem' }}>
              <Row k="HMO" v={loa.hmoName === 'UNSPECIFIED' ? null : loa.hmoName} />
              <Row k="Date of approval" v={loa.dateOfApproval ? new Date(loa.dateOfApproval).toLocaleDateString('en-CA') : null} />
              <Row k="Services availed" v={loa.services.length ? loa.services.join(', ') : null} />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <button onClick={makeQr} disabled={busy} style={{ ...field, marginBottom: 0, width: 'auto', flex: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 700 }}>
                <QrCode size={15} /> Send link / QR
              </button>
              <label style={{ ...field, marginBottom: 0, width: 'auto', flex: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 700 }}>
                <Upload size={15} /> Upload
                <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
              </label>
            </div>

            {fileUrl && (
              <a href={`/api/loa/${loa.id}/file`} style={{ ...field, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', textDecoration: 'none', color: '#14507F', fontWeight: 700, background: '#E3EEFB', border: '1px solid #A9CBEC' }}>
                <Download size={15} /> Download to print
              </a>
            )}


          </>
        )}
      </div>
    </div>
  )
}

// One "label: value" line, with a visible placeholder when the patient has not
// filled that field in yet — a blank row reads as a rendering bug.
function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.2rem 0', fontSize: '0.85rem' }}>
      <span style={{ color: '#8A9499', fontWeight: 600 }}>{k}</span>
      <span style={{ color: v ? '#1C2B30' : '#B0B8BC', fontWeight: v ? 600 : 400, textAlign: 'right' }}>
        {v ?? 'Not submitted yet'}
      </span>
    </div>
  )
}
