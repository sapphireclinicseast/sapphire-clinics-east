'use client'

import { useEffect, useState } from 'react'

interface ProgressReportDoc {
  id: string
  fileName: string
  filePath: string
  mimeType: string
  department: string
  description: string | null
  createdAt: string
  informedFrontDeskAt: string | null
  paidForAt: string | null
  emailedToPatientAt: string | null
  patient: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    branch: string | null
    branches: string[]
    patientType: string
  }
}

const DEPT_LABEL: Record<string, string> = {
  OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED',
  PSYCHOLOGY: 'Psychology', ORTHOSIS: 'O&P',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Active widget: pending PRs (informed but not yet emailed) ──────────────

export function ActiveProgressReports() {
  const [docs, setDocs] = useState<ProgressReportDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [resendDoc, setResendDoc] = useState<ProgressReportDoc | null>(null)

  async function fetchDocs() {
    setLoading(true)
    try {
      const res = await fetch('/api/progress-reports?status=pending')
      if (res.ok) {
        const data = await res.json()
        setDocs(data.documents ?? [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchDocs() }, [])

  async function togglePaid(doc: ProgressReportDoc) {
    setBusy(doc.id)
    try {
      const res = await fetch(`/api/progress-reports/${doc.id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !doc.paidForAt }),
      })
      if (res.ok) await fetchDocs()
      else {
        const e = await res.json()
        alert(e.error ?? 'Failed')
      }
    } catch { alert('Failed') }
    setBusy(null)
  }

  async function emailPR(doc: ProgressReportDoc) {
    setBusy(doc.id)
    try {
      const res = await fetch(`/api/progress-reports/${doc.id}/email-to-patient`, { method: 'POST' })
      if (res.ok) {
        await fetchDocs()
      } else {
        const e = await res.json()
        alert(e.error ?? 'Failed to send email')
      }
    } catch { alert('Failed to send email') }
    setBusy(null)
    setResendDoc(null)
  }

  if (loading) return null
  if (docs.length === 0) return null

  return (
    <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C2410C', marginBottom: '0.65rem' }}>
        Progress Reports ({docs.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {docs.map((doc) => {
          const patientName = `${doc.patient.lastName}, ${doc.patient.firstName}`
          const dept = DEPT_LABEL[doc.department] ?? doc.department
          const paid = !!doc.paidForAt
          const isBusy = busy === doc.id
          return (
            <div key={doc.id} style={{ background: '#fff', border: '1px solid #FED7AA', borderRadius: '0.65rem', padding: '0.65rem 0.85rem' }}>
              {/* Patient row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#9A3412' }}>{patientName}</div>
                  <div style={{ fontSize: '0.7rem', color: '#C2410C' }}>
                    {dept} · informed {formatDate(doc.informedFrontDeskAt)} · {doc.fileName}
                  </div>
                </div>
                <a
                  href={`/api/progress-reports/${doc.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.7rem', fontWeight: 600, color: '#C2410C', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  View
                </a>
              </div>

              {/* Action row: Paid for PR? checkbox + Email PR button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: isBusy ? 'wait' : 'pointer', fontSize: '0.75rem', fontWeight: 600, color: paid ? '#15803D' : '#92400E' }}>
                  <input
                    type="checkbox"
                    checked={paid}
                    disabled={isBusy}
                    onChange={() => togglePaid(doc)}
                    style={{ accentColor: '#15803D', width: '1rem', height: '1rem' }}
                  />
                  Paid for PR?
                </label>

                <button
                  disabled={!paid || isBusy}
                  onClick={() => emailPR(doc)}
                  style={{
                    marginLeft: 'auto',
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: !paid || isBusy ? 'not-allowed' : 'pointer',
                    background: !paid ? '#E5E7EB' : '#ED6823',
                    color: !paid ? '#9CA3AF' : '#fff',
                    transition: 'background 0.2s',
                  }}
                  title={!paid ? 'Tick "Paid for PR?" first to enable' : 'Email PR to patient'}
                >
                  {isBusy ? 'Working…' : '📧 Email PR'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── History widget: sent PRs with search ──────────────────────────────────

export function SentProgressReports() {
  const [docs, setDocs] = useState<ProgressReportDoc[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [resendDoc, setResendDoc] = useState<ProgressReportDoc | null>(null)

  async function fetchDocs(q = search) {
    setLoading(true)
    try {
      const url = new URL('/api/progress-reports', window.location.origin)
      url.searchParams.set('status', 'sent')
      if (q) url.searchParams.set('search', q)
      const res = await fetch(url.toString())
      if (res.ok) {
        const data = await res.json()
        setDocs(data.documents ?? [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    const h = setTimeout(() => fetchDocs(search), 300)
    return () => clearTimeout(h)
  }, [search])

  async function emailPR(doc: ProgressReportDoc) {
    setBusy(doc.id)
    try {
      const res = await fetch(`/api/progress-reports/${doc.id}/email-to-patient`, { method: 'POST' })
      if (res.ok) await fetchDocs()
      else {
        const e = await res.json()
        alert(e.error ?? 'Failed')
      }
    } catch { alert('Failed') }
    setBusy(null)
    setResendDoc(null)
  }

  return (
    <>
      {resendDoc && (
        <div
          onClick={() => setResendDoc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '1rem', padding: '1.5rem', maxWidth: '420px', width: '100%' }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.5rem' }}>Send PR again?</div>
            <div style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '1rem' }}>
              This was already emailed to <strong>{resendDoc.patient.lastName}, {resendDoc.patient.firstName}</strong> on <strong>{formatDate(resendDoc.emailedToPatientAt)}</strong>. Do you want to send it again?
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setResendDoc(null)} style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem', fontWeight: 600, borderRadius: '0.5rem', border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => emailPR(resendDoc)} style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: '0.5rem', border: 'none', background: '#ED6823', color: '#fff', cursor: 'pointer' }}>Yes, send again</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#15803D' }}>
            Past Progress Reports ({docs.length})
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient name…"
            style={{ flex: 1, maxWidth: '240px', padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '0.45rem', border: '1px solid #BBF7D0', background: '#fff', color: '#14532D' }}
          />
        </div>

        {loading ? (
          <div style={{ fontSize: '0.8rem', color: '#15803D', fontStyle: 'italic' }}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: '#15803D', fontStyle: 'italic' }}>
            {search ? `No past PRs matching "${search}"` : 'No PRs sent yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {docs.map((doc) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid #BBF7D0', borderRadius: '0.55rem', padding: '0.55rem 0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#14532D' }}>
                    {doc.patient.lastName}, {doc.patient.firstName}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#15803D' }}>
                    {DEPT_LABEL[doc.department] ?? doc.department} · sent {formatDate(doc.emailedToPatientAt)}
                  </div>
                </div>
                <a
                  href={`/api/progress-reports/${doc.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.7rem', fontWeight: 600, color: '#15803D', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  View
                </a>
                <button
                  onClick={() => setResendDoc(doc)}
                  disabled={busy === doc.id}
                  style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.3rem 0.65rem', borderRadius: '0.4rem', border: '1px solid #15803D', background: '#fff', color: '#15803D', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  title="Send again"
                >
                  Resend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
