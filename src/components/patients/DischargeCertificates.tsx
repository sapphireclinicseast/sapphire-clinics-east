'use client'

// Discharge certificates in the Patient CRM.
//
// Three surfaces share this file because they share one shape of data and one
// set of dialogs:
//   · CertificateActionButton — per-row action in the CRM table
//   · CertificateSettingsButton — who may sign, and their e-signatures
//   · CertificatesCard — the list on a patient's profile
//
// Everything is fetched from /api/patients/certificates, which is session
// authenticated; the files it serves are deliberately not reachable through
// the public /api/uploads route (see lib/certificate-files.ts).

import { useCallback, useEffect, useState } from 'react'
import { Award, Loader2, Trash2, Settings, Plus, X } from 'lucide-react'

const API = '/api/patients/certificates'

export interface CertificateRow {
  id: string
  patientId: string
  patientName: string
  service: string
  dischargeDate: string
  awardedOn: string
  therapistName: string
  managerName: string
  issuedByName: string
  createdAt: string
}

interface Signatory {
  id: string
  name: string
  role: 'therapist' | 'manager' | string
  staffId: string
  hasSignature: boolean
}

interface StaffOption { id: string; name: string; jobTitle: string; department: string }

interface Settings {
  signatories: Signatory[]
  services: string[]
  staff: StaffOption[]
}

function fmt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function jsonOrThrow(res: Response) {
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
  return d
}

/** Opens a stored PDF for printing. A plain link would 401 — the route is
 *  session authenticated and an <a> sends no credentials the browser will
 *  attach to a cross-tab navigation of an API path. */
async function openCertificate(id: string) {
  const win = window.open('', '_blank')   // opened first, or the popup blocker eats it
  try {
    const res = await fetch(`${API}/${id}/file`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Could not retrieve the certificate')
    const url = URL.createObjectURL(await res.blob())
    if (win) win.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    win?.close()
    alert((e as Error).message)
  }
}

// ── Per-row action in the CRM table ──────────────────────────────────────────

export function CertificateActionButton({
  patient, count, onIssued,
}: {
  patient: { id: string; firstName: string; lastName: string }
  count: number
  onIssued: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg transition-colors relative hover:bg-amber-50"
        title={count
          ? `${count} discharge certificate${count > 1 ? 's' : ''} — issue another`
          : 'Issue a discharge certificate'}
        style={{ color: count ? '#B45309' : 'var(--mid-gray)' }}>
        <Award size={13} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: '#15803D', color: '#fff', minWidth: 13, height: 13, padding: '0 3px' }}>
            {count}
          </span>
        )}
      </button>
      {open && (
        <IssueDialog
          patient={patient}
          onClose={() => setOpen(false)}
          onIssued={() => { setOpen(false); onIssued() }}
        />
      )}
    </>
  )
}

// ── Issue dialog ─────────────────────────────────────────────────────────────

function IssueDialog({
  patient, onClose, onIssued,
}: {
  patient: { id: string; firstName: string; lastName: string }
  onClose: () => void
  onIssued: () => void
}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [name, setName] = useState(`${patient.firstName ?? ''} ${patient.lastName ?? ''}`.replace(/\s+/g, ' ').trim())
  const [service, setService] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [therapistId, setTherapistId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/settings`, { cache: 'no-store' })
      .then(jsonOrThrow).then(setSettings).catch((e) => setErr((e as Error).message))
  }, [])

  async function submit() {
    setErr(null)
    if (!name.trim()) return setErr('Enter the patient name as it should be printed.')
    if (!service) return setErr('Choose the service the patient is being discharged from.')
    if (!date) return setErr('Choose the date of discharge.')

    setBusy(true)
    try {
      const d = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          patientName: name.trim(),
          service,
          dischargeDate: date,
          therapistSignatoryId: therapistId || null,
          managerSignatoryId: managerId || null,
        }),
      }).then(jsonOrThrow)
      onIssued()
      // Straight to the printable file — issuing one almost always means
      // printing it now.
      openCertificate(d.certificate.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const options = (role: string) =>
    (settings?.signatories ?? []).filter((s) => s.role === role)

  return (
    <Modal title="Discharge Certificate" onClose={onClose} width={480}>
      <Field label="Patient name" required
        hint="Printed exactly as typed — this is what appears on the certificate.">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </Field>

      <Field label="Service / programme" required>
        <select value={service} onChange={(e) => setService(e.target.value)} style={inputStyle}>
          <option value="">Select a service…</option>
          {(settings?.services ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Date of discharge" required>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>

      <Field label="Attending therapist">
        <SignatorySelect value={therapistId} onChange={setTherapistId} options={options('therapist')} />
      </Field>

      <Field label="Clinic manager">
        <SignatorySelect value={managerId} onChange={setManagerId} options={options('manager')} />
      </Field>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
        A signatory with no e-signature still prints their name, leaving the line clear to be
        signed by hand.
      </p>

      {err && <ErrorBox>{err}</ErrorBox>}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
          Cancel
        </button>
        <button onClick={submit} disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
          style={{ background: 'var(--teal)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Generate &amp; attach
        </button>
      </div>
    </Modal>
  )
}

function SignatorySelect({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: Signatory[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      <option value="">— none —</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}{s.hasSignature ? '' : '  (no e-signature)'}
        </option>
      ))}
    </select>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function CertificateSettingsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}
        title="Signatories and e-signatures used on discharge certificates">
        <Settings size={12} /> Certificate Settings
      </button>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Signatory[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d: Settings = await fetch(`${API}/settings`, { cache: 'no-store' }).then(jsonOrThrow)
      setRows(d.signatories)
      setStaff(d.staff)
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])

  function patch(i: number, p: Partial<Signatory>) {
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...p } : r)))
  }

  async function save() {
    setErr(null)
    if (rows.some((r) => !r.name.trim())) return setErr('Every signatory needs a printed name.')
    setBusy(true)
    try {
      await fetch(`${API}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatories: rows }),
      }).then(jsonOrThrow)
      // Re-read so new rows come back with their server-side ids, which is
      // what a signature upload needs.
      await load()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function upload(id: string, file: File) {
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('signature', file)
      await fetch(`${API}/signature/${id}`, { method: 'POST', body: fd }).then(jsonOrThrow)
      await load()
    } catch (e) { setErr('Could not upload the signature: ' + (e as Error).message) }
  }

  async function removeSignature(id: string) {
    if (!confirm('Remove this e-signature? Certificates already issued keep the signature they were printed with.')) return
    try {
      await fetch(`${API}/signature/${id}`, { method: 'DELETE' }).then(jsonOrThrow)
      await load()
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Modal title="Certificate Settings — Signatories" onClose={onClose} width={720}>
      <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--mid-gray)' }}>
        Add the people who may sign a discharge certificate. Pick the staff member, then upload
        their e-signature as a PNG with a transparent background if you have one — a JPEG brings
        its white box onto the line with it.
      </p>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            No signatories yet.
          </p>
        )}
        {rows.map((r, i) => (
          <div key={r.id || `new-${i}`}
            className="rounded-xl p-3 flex flex-wrap items-center gap-2"
            style={{ border: '1px solid var(--light-gray)', background: '#fafafa' }}>
            <select
              value={r.staffId}
              onChange={(e) => {
                const st = staff.find((s) => s.id === e.target.value)
                // Fill the printed name only when it is still blank — someone
                // may deliberately want "Dr. J. P. Delos Santos, OTRP".
                patch(i, { staffId: e.target.value, ...(st && !r.name ? { name: st.name } : {}) })
              }}
              style={{ ...inputStyle, flex: '1 1 190px', fontSize: '0.78rem' }}>
              <option value="">— pick a staff member —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` — ${s.jobTitle}` : ''}</option>
              ))}
            </select>

            <input value={r.name} placeholder="Printed name"
              onChange={(e) => patch(i, { name: e.target.value })}
              title="Printed on the certificate — edit if it should differ from the staff record"
              style={{ ...inputStyle, flex: '1 1 150px', fontSize: '0.78rem' }} />

            <select value={r.role} onChange={(e) => patch(i, { role: e.target.value })}
              style={{ ...inputStyle, flex: '0 0 165px', fontSize: '0.78rem' }}>
              <option value="therapist">Attending Therapist</option>
              <option value="manager">Clinic Manager</option>
            </select>

            <div className="flex items-center gap-2 flex-shrink-0">
              {r.id && r.hasSignature ? (
                <>
                  {/* Checkerboard behind it, so a transparent PNG is visibly
                      transparent — which is what belongs on a signature line. */}
                  <img src={`${API}/signature/${r.id}`} alt="e-signature on file"
                    style={{
                      height: 30, maxWidth: 120, objectFit: 'contain', borderRadius: 6,
                      border: '1px solid var(--light-gray)', padding: 2, backgroundColor: '#fff',
                      backgroundImage:
                        'linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%),' +
                        'linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%)',
                      backgroundSize: '10px 10px', backgroundPosition: '0 0, 5px 5px',
                    }} />
                  <button onClick={() => removeSignature(r.id)} className="text-xs underline"
                    style={{ color: 'var(--mid-gray)' }}>Remove</button>
                </>
              ) : (
                <span className="text-xs" style={{ color: '#9CA3AF' }}>
                  {r.id ? 'No e-signature' : 'Save first to attach a signature'}
                </span>
              )}
              {r.id && (
                <label className="text-xs px-2 py-1 rounded-lg cursor-pointer"
                  style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                  {r.hasSignature ? 'Replace' : 'Upload'}
                  <input type="file" accept="image/png,image/jpeg" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(r.id, f); e.target.value = '' }} />
                </label>
              )}
              <button onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}
                className="p-1.5 rounded-lg hover:bg-red-50" title="Delete signatory">
                <Trash2 size={13} style={{ color: '#DC2626' }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setRows((rs) => [...rs, { id: '', name: '', role: 'therapist', staffId: '', hasSignature: false }])}
        className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
        <Plus size={12} /> Add signatory
      </button>

      {err && <ErrorBox>{err}</ErrorBox>}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
          Close
        </button>
        <button onClick={save} disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
          style={{ background: 'var(--teal)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Save signatories
        </button>
      </div>
    </Modal>
  )
}

// ── Profile card ─────────────────────────────────────────────────────────────

export function CertificatesCard({ patientId, patientName }: { patientId: string | null; patientName?: string }) {
  const [rows, setRows] = useState<CertificateRow[] | null>(null)
  const [issuing, setIssuing] = useState(false)

  const load = useCallback(() => {
    if (!patientId) return
    fetch(`${API}?patientId=${encodeURIComponent(patientId)}`, { cache: 'no-store' })
      .then(jsonOrThrow).then((d) => setRows(d.certificates)).catch(() => setRows([]))
  }, [patientId])
  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    if (!confirm('Delete this certificate? The stored PDF is removed and cannot be recovered — a new one can be issued, but it will carry today’s signatories.')) return
    await fetch(`${API}/${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  if (!patientId) return null
  const [first = '', ...rest] = (patientName ?? '').split(' ')

  return (
    <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="px-5 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
          style={{ color: 'var(--mid-gray)' }}>
          <Award size={14} style={{ color: '#B45309' }} /> Discharge Certificates
        </p>
        <button onClick={() => setIssuing(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--teal)', color: '#fff' }}>
          + Issue certificate
        </button>
      </div>

      <div className="p-5 space-y-2">
        {rows == null ? (
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No certificate issued yet.</p>
        ) : rows.map((c) => (
          <div key={c.id} className="rounded-lg px-4 py-3 flex items-start justify-between gap-3"
            style={{ border: '1px solid var(--light-gray)', background: '#fafafa' }}>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{c.service}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                Discharged {c.awardedOn || fmt(c.dischargeDate)}
              </p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                {c.therapistName || 'No therapist named'}
                {c.managerName ? ` · ${c.managerName}` : ''}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                Issued {fmt(c.createdAt)}{c.issuedByName ? ` by ${c.issuedByName}` : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => openCertificate(c.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                Open / print
              </button>
              <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                <Trash2 size={13} style={{ color: '#DC2626' }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {issuing && (
        <IssueDialog
          patient={{ id: patientId, firstName: first, lastName: rest.join(' ') }}
          onClose={() => setIssuing(false)}
          onIssued={() => { setIssuing(false); load() }}
        />
      )}
    </div>
  )
}

// ── Small shared pieces ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--light-gray)', fontSize: '0.84rem',
  fontFamily: 'inherit', color: 'var(--charcoal)', background: '#fff',
}

function Modal({
  title, onClose, width, children,
}: { title: string; onClose: () => void; width: number; children: React.ReactNode }) {
  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        className="rounded-2xl"
        style={{
          background: '#fff', width: '100%', maxWidth: width,
          maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
        }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {title}
          </p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9CA3AF' }}>{hint}</p>}
    </div>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-xs rounded-lg px-3 py-2"
      style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
      {children}
    </div>
  )
}
