'use client'

// LOA Submission — front desk raise a Letter of Authorization, chase the
// document, and print it once it lands.
//
// Branch scoping is enforced in /api/loa, not here: a front-desk account is
// pinned to its own branch server-side and the API reports that back as
// branchLocked, which is the only reason this renders a fixed label instead of
// a dropdown. Hiding the control is a courtesy, never the control itself.

import { useCallback, useEffect, useState } from 'react'
import { FileText, QrCode, Download, Settings, X, Trash2, Upload, Info, Copy, RefreshCw } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

interface Option { id: string; name: string; active: boolean; sortOrder: number }
interface BranchOption { value: string; label: string; shortCode: string }
interface Loa {
  id: string
  patientId: string | null
  patientName: string | null
  deckingSlotId: string | null
  hmoName: string
  branch: string
  services: string[]
  dateOfApproval: string | null
  fileUrl: string | null
  idFileUrl: string | null
  fileMime: string | null
  status: 'AWAITING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  notes: string | null
  createdAt: string
  patient: { id: string; firstName: string; lastName: string } | null
  deckingSlot: {
    id: string; dayOfWeek: string; startTime: string; endTime: string; department: string
    staff: { firstName: string; lastName: string } | null
  } | null
}

const STATUS_STYLE: Record<Loa['status'], { bg: string; fg: string; label: string }> = {
  AWAITING:  { bg: '#FDEAD6', fg: '#93460B', label: 'Awaiting document' },
  SUBMITTED: { bg: '#E3EEFB', fg: '#14507F', label: 'Document received' },
  APPROVED:  { bg: '#DFF5E4', fg: '#166534', label: 'Approved' },
  REJECTED:  { bg: '#FDE4E4', fg: '#991B1B', label: 'Rejected' },
}

export default function LoaSubmissionsPage() {
  const [rows, setRows] = useState<Loa[]>([])
  const [loading, setLoading] = useState(true)
  const [branchLocked, setBranchLocked] = useState(false)
  const [lockedBranch, setLockedBranch] = useState<string | null>(null)

  const [hmos, setHmos] = useState<Option[]>([])
  const [services, setServices] = useState<Option[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])

  const [fBranch, setFBranch] = useState('')
  const [fHmo, setFHmo] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [q, setQ] = useState('')

  const [showInvite, setShowInvite] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [qr, setQr] = useState<{ id: string; url: string; data: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (fBranch) p.set('branch', fBranch)
    if (fHmo) p.set('hmo', fHmo)
    if (fStatus) p.set('status', fStatus)
    if (q.trim()) p.set('q', q.trim())
    try {
      const r = await fetch(`/api/loa?${p}`)
      const d = await r.json()
      setRows(d.submissions ?? [])
      setBranchLocked(!!d.branchLocked)
      setLockedBranch(d.branch ?? null)
    } finally { setLoading(false) }
  }, [fBranch, fHmo, fStatus, q])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/loa/settings').then(r => r.json()).then(d => {
      setHmos(d.hmos ?? []); setServices(d.services ?? []); setBranches(d.branches ?? [])
    }).catch(() => {})
  }, [])

  function nameOf(l: Loa) {
    return l.patient ? `${l.patient.lastName}, ${l.patient.firstName}` : (l.patientName || '—')
  }

  async function makeQr(id: string) {
    setBusy(id)
    try {
      const r = await fetch(`/api/loa/${id}/token`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) setQr({ id, url: d.uploadUrl, data: d.qrDataUrl, expiresAt: d.expiresAt })
      else alert(d.error ?? 'Could not create a link')
    } finally { setBusy(null) }
  }

  async function uploadFor(id: string, file: File) {
    setBusy(id)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(`/api/loa/${id}/file`, { method: 'POST', body: form })
      if (!r.ok) alert((await r.json()).error ?? 'Upload failed')
      else await load()
    } finally { setBusy(null) }
  }

  async function setStatus(id: string, status: Loa['status']) {
    setBusy(id)
    try {
      await fetch(`/api/loa/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await load()
    } finally { setBusy(null) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this LOA record? The uploaded document goes with it.')) return
    setBusy(id)
    try { await fetch(`/api/loa/${id}`, { method: 'DELETE' }); await load() }
    finally { setBusy(null) }
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #E5E9EC', borderRadius: 12, padding: '1rem',
  }
  const input: React.CSSProperties = {
    padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #D6DCE2',
    fontSize: '0.875rem', background: '#fff', color: '#1C2B30',
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: '#8A9499', textTransform: 'uppercase' }}>Clinic Tools</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1C2B30', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={24} /> LOA Submission
          </h1>
          <p style={{ color: '#667', fontSize: '0.9rem', marginTop: '0.15rem' }}>
            Letters of Authorization for HMO sessions — share the form link or QR, or upload the document yourself.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowSettings(true)} style={{ ...input, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Settings size={15} /> Settings
          </button>
          <button onClick={() => setShowInvite(true)} style={{ ...input, cursor: 'pointer', background: '#ED6823', color: '#fff', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <QrCode size={16} /> LOA form link
          </button>
        </div>
      </div>

      {/* The form asks patients to find themselves in the CRM, so a patient who
          has never been registered cannot submit. Front desk have to know that,
          and the place they will look is this screen. */}
      <div style={{
        display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
        background: '#FFF7E6', border: '1px solid #F3D9A5', borderRadius: 10,
        padding: '0.7rem 0.85rem', marginTop: '1rem',
      }}>
        <Info size={16} style={{ color: '#8A5A00', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: '0.85rem', color: '#8A5A00', lineHeight: 1.55, margin: 0 }}>
          <strong>Register the patient first.</strong> The LOA form asks patients to
          find their own name, and it searches the Patient CRM — so anyone who has
          not been added there yet cannot submit. If a patient says their name is
          not found, create their record in <strong>Patient CRM</strong>, then send
          them the link again.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        {branchLocked ? (
          <span style={{ ...input, background: '#F1F3F5', color: '#667', display: 'flex', alignItems: 'center' }}>
            Branch: <strong style={{ marginLeft: 4, color: '#1C2B30' }}>{branchLabel(lockedBranch)}</strong>
          </span>
        ) : (
          <select value={fBranch} onChange={e => setFBranch(e.target.value)} style={input}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b.shortCode} value={b.shortCode}>{b.label}</option>)}
          </select>
        )}
        <select value={fHmo} onChange={e => setFHmo(e.target.value)} style={input}
                title="HMO providers come from the HMO digital wallets in Accounting Hub → Point of Sale">
          <option value="">All HMOs</option>
          {hmos.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={input}>
          <option value="">Any status</option>
          {(Object.keys(STATUS_STYLE) as Loa['status'][]).map(s => (
            <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
          ))}
        </select>
        <input placeholder="Search patient…" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, minWidth: 200 }} />
      </div>

      {loading ? (
        <div style={card}><p style={{ color: '#667' }}>Loading…</p></div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: '#667' }}>No LOA submissions yet.</p>
          <p style={{ color: '#8A9499', fontSize: '0.85rem', marginTop: '0.35rem' }}>
            Share the form link or QR with patients — or start one from an HMO slot on the Decking board.
          </p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#F7F9FA', textAlign: 'left' }}>
                {['Patient', 'HMO', 'Services', 'Branch', 'Approved', 'Status', 'Document', ''].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#46555C', borderBottom: '1px solid #E5E9EC', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(l => {
                const st = STATUS_STYLE[l.status]
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid #EEF1F3' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: '#1C2B30' }}>
                      {nameOf(l)}
                      {l.deckingSlot && (
                        <div style={{ fontSize: '0.72rem', color: '#8A9499', fontWeight: 400 }}>
                          {l.deckingSlot.department} · {l.deckingSlot.dayOfWeek} {l.deckingSlot.startTime}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{l.hmoName}</td>
                    <td style={{ padding: '0.6rem 0.75rem', maxWidth: 220 }}>
                      {l.services.length ? l.services.join(', ') : <span style={{ color: '#B0B8BC' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{branchLabel(l.branch)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {l.dateOfApproval ? new Date(l.dateOfApproval).toLocaleDateString('en-CA') : <span style={{ color: '#B0B8BC' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <select
                        value={l.status}
                        onChange={e => setStatus(l.id, e.target.value as Loa['status'])}
                        disabled={busy === l.id}
                        style={{ ...input, padding: '0.25rem 0.4rem', fontSize: '0.78rem', fontWeight: 700, background: st.bg, color: st.fg, border: 'none' }}
                      >
                        {(Object.keys(STATUS_STYLE) as Loa['status'][]).map(s => (
                          <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {l.fileUrl ? (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <a href={`/api/loa/${l.id}/file`} style={{ ...input, padding: '0.25rem 0.5rem', fontSize: '0.78rem', textDecoration: 'none', color: '#14507F', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Download size={13} /> Print
                          </a>
                          <a href={`/api/loa/${l.id}/file?view=1`} target="_blank" rel="noreferrer" style={{ ...input, padding: '0.25rem 0.5rem', fontSize: '0.78rem', textDecoration: 'none', color: '#46555C' }}>
                            View
                          </a>
                          {/* The ID is what the counter signature gets checked
                              against, so it belongs next to the letter rather
                              than somewhere it has to be hunted for. Letters
                              filed before the ID was asked for have none. */}
                          {l.idFileUrl && (
                            <a href={`/api/loa/${l.id}/file?doc=id&view=1`} target="_blank" rel="noreferrer"
                               title="Valid ID — check the signature against the one signed at the counter"
                               style={{ ...input, padding: '0.25rem 0.5rem', fontSize: '0.78rem', textDecoration: 'none', color: '#5B2A86' }}>
                              ID
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#B0B8BC' }}>Not yet</span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => makeQr(l.id)} disabled={busy === l.id} title="Send link / show QR"
                          style={{ ...input, padding: '0.25rem 0.5rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <QrCode size={14} /> QR
                        </button>
                        <label title="Upload the document yourself"
                          style={{ ...input, padding: '0.25rem 0.5rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Upload size={14} />
                          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFor(l.id, f) }} />
                        </label>
                        <button onClick={() => remove(l.id)} disabled={busy === l.id} title="Delete"
                          style={{ ...input, padding: '0.25rem 0.5rem', cursor: 'pointer', color: '#991B1B' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {qr && <QrModal qr={qr} onClose={() => setQr(null)} />}
      {showInvite && <FormLinkModal onClose={() => setShowInvite(false)} />}
      {showSettings && (
        <SettingsModal
          hmos={hmos} services={services}
          onClose={() => setShowSettings(false)}
          onChanged={() => fetch('/api/loa/settings').then(r => r.json()).then(d => {
            setHmos(d.hmos ?? []); setServices(d.services ?? [])
          })}
        />
      )}
    </div>
  )
}

// ─── Modals ─────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20,28,32,0.45)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50,
}
const sheet: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '1.25rem', width: '100%',
  maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
}
const field: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid #D6DCE2',
  fontSize: '0.9rem', marginBottom: '0.85rem', color: '#1C2B30', background: '#fff',
}
const label: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#46555C',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem',
}

function QrModal({ qr, onClose }: { qr: { url: string; data: string; expiresAt: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...sheet, maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1C2B30', marginBottom: '0.5rem' }}>
          Patient uploads their LOA
        </h2>
        <p style={{ color: '#667', fontSize: '0.85rem', marginBottom: '0.85rem' }}>
          Have them scan this, or send the link. It works once and expires{' '}
          {new Date(qr.expiresAt).toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.data} alt="LOA upload QR code" style={{ width: 240, height: 240, margin: '0 auto', display: 'block' }} />
        <input readOnly value={qr.url} style={{ ...field, marginTop: '0.85rem', fontSize: '0.78rem' }} onFocus={e => e.currentTarget.select()} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { navigator.clipboard?.writeText(qr.url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            style={{ ...field, marginBottom: 0, cursor: 'pointer', fontWeight: 700, background: '#ED6823', color: '#fff', border: 'none' }}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button onClick={onClose} style={{ ...field, marginBottom: 0, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

function FormLinkModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ url: string; qrDataUrl: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/loa/form-link').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...sheet, maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1C2B30' }}>LOA form</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A9499' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#667', lineHeight: 1.5, marginBottom: '0.9rem', textAlign: 'left' }}>
          This is the same link every time — print the QR for the counter, or send
          the link to any patient. They find their own name, fill in the form and
          upload the letter.
        </p>

        {data ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qrDataUrl} alt="LOA form QR code" style={{ width: 230, height: 230, margin: '0 auto', display: 'block' }} />
            <input readOnly value={data.url} onFocus={e => e.currentTarget.select()} style={{ ...field, marginTop: '0.85rem', fontSize: '0.78rem', textAlign: 'center' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => { navigator.clipboard?.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                style={{ ...field, marginBottom: 0, cursor: 'pointer', fontWeight: 700, background: '#ED6823', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              >
                <Copy size={15} /> {copied ? 'Copied!' : 'Copy link'}
              </button>
              <a
                href={data.qrDataUrl} download="LOA-form-QR.png"
                style={{ ...field, marginBottom: 0, cursor: 'pointer', fontWeight: 700, textDecoration: 'none', color: '#46555C', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Save QR
              </a>
            </div>
          </>
        ) : (
          <p style={{ color: '#8A9499', fontSize: '0.9rem', padding: '2rem 0' }}>Loading…</p>
        )}
      </div>
    </div>
  )
}

function SettingsModal({
  hmos, services, onClose, onChanged,
}: { hmos: Option[]; services: Option[]; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'hmo' | 'service'>('hmo')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const list = tab === 'hmo' ? hmos : services

  async function syncHmos() {
    setBusy(true); setSyncMsg(null)
    try {
      const r = await fetch('/api/loa/settings/sync-hmos', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setSyncMsg({ ok: false, text: d.error ?? 'Sync failed' }); return }
      const bits = [
        d.added.length   ? `${d.added.length} added`       : null,
        d.restored.length? `${d.restored.length} restored` : null,
        d.retired.length ? `${d.retired.length} retired`   : null,
      ].filter(Boolean)
      setSyncMsg({
        ok: true,
        text: bits.length
          ? `Synced — ${bits.join(', ')}. ${d.unchanged} already matched.`
          : `Already up to date — all ${d.unchanged} providers match the wallets.`,
      })
      onChanged()
    } finally { setBusy(false) }
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch('/api/loa/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: tab, ...body }),
      })
      if (!r.ok) alert((await r.json()).error ?? 'Could not save')
      else onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1C2B30' }}>LOA form settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A9499' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.82rem', color: '#667', marginBottom: '0.85rem' }}>
          Branches are not listed here — they come from HR Hub, so a new clinic appears on its own.
        </p>

        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
          {(['hmo', 'service'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '0.4rem 0.8rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
              border: 'none', background: tab === t ? '#1C2B30' : '#F1F3F5', color: tab === t ? '#fff' : '#46555C',
            }}>
              {t === 'hmo' ? 'HMO names' : 'Services'}
            </button>
          ))}
        </div>

        {tab === 'hmo' ? (
          <div style={{
            background: '#F7F9FA', border: '1px solid #E5E9EC', borderRadius: 10,
            padding: '0.75rem 0.85rem', marginBottom: '0.85rem',
          }}>
            <p style={{ fontSize: '0.82rem', color: '#46555C', lineHeight: 1.55, margin: '0 0 0.6rem' }}>
              This list mirrors the <strong>HMO digital wallets</strong> in the Accounting Hub
              (Point of Sale → Digital Wallet → HMO). Add a provider there and it appears
              here — it syncs on a schedule, or press the button to pull it now.
            </p>
            <button
              disabled={busy}
              onClick={syncHmos}
              style={{ ...field, marginBottom: 0, cursor: 'pointer', fontWeight: 700, background: '#1C2B30', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={15} /> {busy ? 'Syncing…' : 'Sync from Accounting Hub'}
            </button>
            {syncMsg && (
              <p style={{ fontSize: '0.8rem', marginTop: '0.6rem', marginBottom: 0, lineHeight: 1.5, color: syncMsg.ok ? '#166534' : '#991B1B' }}>
                {syncMsg.text}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Add a service…"
              style={{ ...field, marginBottom: 0 }}
            />
            <button
              disabled={busy || !newName.trim()}
              onClick={async () => { await post({ name: newName }); setNewName('') }}
              style={{ ...field, marginBottom: 0, width: 'auto', cursor: 'pointer', fontWeight: 700, background: '#ED6823', color: '#fff', border: 'none' }}
            >
              Add
            </button>
          </div>
        )}

        <div style={{ border: '1px solid #E5E9EC', borderRadius: 8, overflow: 'hidden' }}>
          {list.length === 0 && <p style={{ padding: '0.75rem', color: '#8A9499', fontSize: '0.85rem' }}>Nothing here yet.</p>}
          {list.map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0.7rem', borderBottom: '1px solid #EEF1F3' }}>
              <span style={{ fontSize: '0.88rem', color: o.active ? '#1C2B30' : '#B0B8BC', textDecoration: o.active ? 'none' : 'line-through' }}>
                {o.name}
              </span>
              {/* Retire rather than delete: letters already filed name this
                  value, and removing it would blank their record. The HMO sync
                  retires the same way when a wallet disappears. */}
              <button
                disabled={busy}
                onClick={() => post({ id: o.id, active: !o.active })}
                style={{ padding: '0.2rem 0.55rem', borderRadius: 6, border: '1px solid #D6DCE2', background: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', color: o.active ? '#991B1B' : '#166534' }}
              >
                {o.active ? 'Retire' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
