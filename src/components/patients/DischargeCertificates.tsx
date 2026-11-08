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

// ── Viewing a stored certificate ─────────────────────────────────────────────
//
// This used to open a new tab: window.open('', '_blank'), then point it at a
// blob URL once the PDF had been fetched. It showed nothing. The window.open
// ran after an await, so it was no longer inside the click that caused it, and
// the popup blocker dropped it — silently, because a blocked popup returns null
// rather than throwing, and the fallback was another window.open that was
// blocked for the same reason. Front desk issued a certificate and got no
// paper, no viewer and no error.
//
// It is shown in the page now. No popup can be blocked, the certificate stays
// in the CRM where the patient is, and Print and Download are explicit buttons
// rather than something the operator has to find in a stray tab.
//
// A plain <a href> is still not an option: the route is session authenticated
// and the PDF must not be reachable from the public uploads path, so the bytes
// are fetched and held as a blob.
function CertificateViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let made: string | null = null
    fetch(`${API}/${id}/file`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || `Could not retrieve the certificate (${res.status})`)
        }
        return res.blob()
      })
      .then((blob) => {
        if (revoked) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      })
      .catch((e) => setErr((e as Error).message))
    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])

  // Printing the iframe rather than the page: window.print() here would print
  // the CRM behind it.
  function print() {
    const frame = document.getElementById(`cert-frame-${id}`) as HTMLIFrameElement | null
    try {
      frame?.contentWindow?.focus()
      frame?.contentWindow?.print()
    } catch {
      // Some browsers refuse to print a blob-sourced frame; the download is
      // always there as the way out, so say that rather than failing mutely.
      alert('This browser would not print directly — use Download and print the file.')
    }
  }

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl"
        style={{
          background: '#fff', width: '100%', maxWidth: 940, height: '92vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(15,23,42,0.3)',
        }}>
        <div className="px-5 py-3 flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-bold flex items-center gap-2"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Award size={16} style={{ color: '#B45309' }} /> Discharge Certificate
          </p>
          <div className="flex items-center gap-2">
            <button onClick={print} disabled={!url}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--teal)', color: '#fff', opacity: url ? 1 : 0.5 }}>
              Print
            </button>
            {url && (
              <a href={url} download="discharge-certificate.pdf"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
                Download
              </a>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
              <X size={16} style={{ color: 'var(--mid-gray)' }} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, background: '#F3F4F6' }}>
          {err ? (
            <div className="p-6">
              <ErrorBox>{err}</ErrorBox>
            </div>
          ) : !url ? (
            <div className="h-full flex items-center justify-center gap-2 text-sm"
              style={{ color: 'var(--mid-gray)' }}>
              <Loader2 size={16} className="animate-spin" /> Loading the certificate…
            </div>
          ) : (
            <iframe id={`cert-frame-${id}`} src={url} title="Discharge certificate"
              style={{ width: '100%', height: '100%', border: 'none' }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Per-row action in the CRM table ──────────────────────────────────────────

export function CertificateActionButton({
  patient, count, onIssued,
}: {
  patient: { id: string; firstName: string; lastName: string }
  count: number
  onIssued: () => void
}) {
  // Clicking this used to go straight to the issue form, whatever the badge
  // said. So a row showing "1 certificate" offered no way to see that
  // certificate — the only thing you could do with an issued certificate from
  // the CRM was issue a second one. A patient who HAS certificates opens the
  // list; a patient who has none goes straight to issuing, since there is
  // nothing to list.
  const [mode, setMode] = useState<'closed' | 'list' | 'issue'>('closed')
  const [viewing, setViewing] = useState<string | null>(null)

  return (
    <>
      <button
        onClick={() => setMode(count > 0 ? 'list' : 'issue')}
        className="p-1.5 rounded-lg transition-colors relative hover:bg-amber-50"
        title={count
          ? `${count} discharge certificate${count > 1 ? 's' : ''} — view, print or issue another`
          : 'Issue a discharge certificate'}
        style={{ color: count ? '#B45309' : 'var(--mid-gray)' }}>
        {/* Sized with the other row actions rather than smaller than them: at
            13px against a pale grey this read as a smudge, and front desk did
            not know it was there. */}
        <Award size={17} strokeWidth={count ? 2.4 : 2} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: '#15803D', color: '#fff', minWidth: 15, height: 15, padding: '0 4px', lineHeight: 1 }}>
            {count}
          </span>
        )}
      </button>

      {mode === 'list' && (
        <CertificateListDialog
          patient={patient}
          onClose={() => setMode('closed')}
          onView={setViewing}
          onIssue={() => setMode('issue')}
          onChanged={onIssued}
        />
      )}
      {mode === 'issue' && (
        <IssueDialog
          patient={patient}
          onClose={() => setMode('closed')}
          onIssued={(certId) => { setMode('closed'); onIssued(); setViewing(certId) }}
        />
      )}
      {viewing && <CertificateViewer id={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

/** The patient's certificates, from the CRM row — view, print, delete, issue. */
function CertificateListDialog({
  patient, onClose, onView, onIssue, onChanged,
}: {
  patient: { id: string; firstName: string; lastName: string }
  onClose: () => void
  onView: (id: string) => void
  onIssue: () => void
  onChanged: () => void
}) {
  const { rows, remove } = useCertificates(patient.id)
  const name = `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.replace(/\s+/g, ' ').trim()

  return (
    <Modal title={name ? `Certificates — ${name}` : 'Discharge Certificates'} onClose={onClose} width={620}>
      <CertificateRows
        rows={rows}
        onView={onView}
        onDelete={async (id) => { await remove(id); onChanged() }}
      />
      <button onClick={onIssue}
        className="mt-3 w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
        style={{ background: 'var(--teal)', color: '#fff' }}>
        <Plus size={13} /> Issue another certificate
      </button>
      <p className="text-[11px] mt-2" style={{ color: '#9CA3AF' }}>
        Certificates are also listed on the patient&rsquo;s profile.
      </p>
    </Modal>
  )
}

// ── Issue dialog ─────────────────────────────────────────────────────────────

function IssueDialog({
  patient, onClose, onIssued,
}: {
  patient: { id: string; firstName: string; lastName: string }
  onClose: () => void
  /** Called with the new certificate's id, so the caller can show it. */
  onIssued: (certificateId: string) => void
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
      // Straight to the printable file — issuing one almost always means
      // printing it now. The caller opens the viewer, because this dialog is
      // about to unmount and a viewer rendered from here would go with it.
      onIssued(d.certificate.id)
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

/* className / style / children are optional so a host toolbar can make the
   trigger match its own buttons; left out, the button looks as it always has. */
export function CertificateSettingsButton({ className, style, children }: {
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
} = {}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={className ?? 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5'}
        style={style ?? { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}
        title="Signatories and e-signatures used on discharge certificates">
        {children ?? <><Settings size={12} /> Certificate Settings</>}
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
  const { rows, load, remove } = useCertificates(patientId)
  const [issuing, setIssuing] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

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

      <div className="p-5">
        <CertificateRows rows={rows} onView={setViewing} onDelete={remove} />
      </div>

      {issuing && (
        <IssueDialog
          patient={{ id: patientId, firstName: first, lastName: rest.join(' ') }}
          onClose={() => setIssuing(false)}
          onIssued={(certId) => { setIssuing(false); load(); setViewing(certId) }}
        />
      )}
      {viewing && <CertificateViewer id={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ── The list itself, shared by the profile card and the CRM row dialog ───────
// One fetcher and one renderer: the CRM row needed exactly the list the profile
// already had, and a second copy would have drifted the moment either changed.

function useCertificates(patientId: string | null) {
  const [rows, setRows] = useState<CertificateRow[] | null>(null)

  const load = useCallback(() => {
    if (!patientId) return
    fetch(`${API}?patientId=${encodeURIComponent(patientId)}`, { cache: 'no-store' })
      .then(jsonOrThrow).then((d) => setRows(d.certificates)).catch(() => setRows([]))
  }, [patientId])
  useEffect(() => { load() }, [load])

  const remove = useCallback(async (id: string) => {
    if (!confirm('Delete this certificate? The stored PDF is removed and cannot be recovered — a new one can be issued, but it will carry today\u2019s signatories.')) return
    await fetch(`${API}/${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }, [load])

  return { rows, load, remove }
}

function CertificateRows({
  rows, onView, onDelete,
}: {
  rows: CertificateRow[] | null
  onView: (id: string) => void
  onDelete: (id: string) => void | Promise<void>
}) {
  if (rows == null) return <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading\u2026</p>
  if (rows.length === 0) return <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No certificate issued yet.</p>

  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className="rounded-lg px-4 py-3 flex items-start justify-between gap-3"
          style={{ border: '1px solid var(--light-gray)', background: '#fafafa' }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{c.service}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Discharged {c.awardedOn || fmt(c.dischargeDate)}
            </p>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              {c.therapistName || 'No therapist named'}
              {c.managerName ? ` \u00b7 ${c.managerName}` : ''}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
              Issued {fmt(c.createdAt)}{c.issuedByName ? ` by ${c.issuedByName}` : ''}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => onView(c.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
              View / print
            </button>
            <button onClick={() => onDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
              <Trash2 size={13} style={{ color: '#DC2626' }} />
            </button>
          </div>
        </div>
      ))}
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
