'use client'

// Shown after a sale that included a cancellation, late-cancellation or
// no-show fee. It asks which cancellation the money settles and writes the link
// into the Operations Hub.
//
// Deliberately not dismissable: there is no X, no backdrop close and no Escape.
// Front desk previously had to cross-check the POS by hand and in practice did
// not, so fees were chased twice or never — the whole point is that the link
// gets made while the cashier still knows what the payment was for.
//
// It opens AFTER the order is created, never before. A till that cannot be
// closed until a form is filled in is a queue of waiting patients; the money is
// taken first and the link is made immediately after.
//
// When Operations has no cancellation to attach the fee to — East charges more
// fees than it logs cancellations, so this is routine, not an edge case — the
// cashier logs one here and classifies it, rather than being allowed to skip.

import { useCallback, useEffect, useState } from 'react'

const API = '/api/pos/cancellation-link'

export interface FeeLine { name: string; amount: number }

interface Cancellation {
  id: string
  type: string
  branch: string
  remarks: string | null
  createdAt: string
  chargeable: boolean
  settled: boolean
  paidOrderNumber: number | null
}

interface PatientHit { id: string; firstName: string; lastName: string; branches: string[] }

function fmt(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function CancellationLinkModal({
  orderId, orderNumber, branch, patientName, feeLines, onDone,
}: {
  orderId: string
  orderNumber: number
  branch: string
  patientName: string
  feeLines: FeeLine[]
  onDone: () => void
}) {
  const [query, setQuery] = useState(patientName ?? '')
  const [hits, setHits] = useState<PatientHit[] | null>(null)
  const [patient, setPatient] = useState<PatientHit | null>(null)
  const [rows, setRows] = useState<Cancellation[] | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [newType, setNewType] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const search = useCallback(async (q: string) => {
    setErr(null)
    if (q.trim().length < 3) { setHits(null); return }
    try {
      const d = await fetch(`${API}?q=${encodeURIComponent(q.trim())}`).then(r => r.json())
      setHits(d.patients ?? [])
    } catch (e) { setErr((e as Error).message) }
  }, [])

  const loadFor = useCallback(async (p: PatientHit) => {
    setPatient(p); setRows(null); setErr(null)
    try {
      const d = await fetch(`${API}?patientId=${encodeURIComponent(p.id)}`).then(r => r.json())
      setRows(d.cancellations ?? [])
      setTypes(d.types ?? [])
    } catch (e) { setErr((e as Error).message) }
  }, [])

  // Pre-search on the order's own patient name, so the common case is one click.
  useEffect(() => { void search(patientName ?? '') }, [patientName, search])
  useEffect(() => {
    if (hits && hits.length === 1 && !patient) void loadFor(hits[0])
  }, [hits, patient, loadFor])

  const total = feeLines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  async function post(payload: Record<string, unknown>) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || `Failed (${res.status})`)
    return d
  }

  async function link(logId: string) {
    setBusy(true); setErr(null)
    try {
      await post({
        action: 'link', logId, orderId, orderNumber,
        lineName: feeLines[0]?.name ?? '', amount: total,
      })
      setDone(true)
      setTimeout(onDone, 900)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function createAndLink() {
    if (!patient) return
    if (!newType) { setErr('Choose how this cancellation is classified.'); return }
    setBusy(true); setErr(null)
    try {
      const made = await post({
        action: 'create', patientId: patient.id, type: newType,
        branch: branch || patient.branches[0] || '',
      })
      await post({
        action: 'link', logId: made.log.id, orderId, orderNumber,
        lineName: feeLines[0]?.name ?? '', amount: total,
      })
      setDone(true)
      setTimeout(onDone, 900)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const unsettled = (rows ?? []).filter(r => !r.settled && r.chargeable)
  const others = (rows ?? []).filter(r => r.settled || !r.chargeable)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,23,42,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620,
        maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(15,23,42,0.3)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
            Link this cancellation fee
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>
            Order #{orderNumber} took {feeLines.length === 1 ? 'a' : feeLines.length} cancellation
            fee{feeLines.length === 1 ? '' : 's'} totalling ₱{total.toLocaleString()}. Choose which
            cancellation it settles so it shows as paid in Patient Relationship.
          </p>
        </div>

        <div style={{ padding: 20 }}>
          {done ? (
            <p style={{ margin: 0, fontSize: 14, color: '#15803D', fontWeight: 600 }}>
              ✓ Linked. It now reads as paid in the Operations Hub.
            </p>
          ) : !patient ? (
            <>
              <label style={lbl}>Which patient?</label>
              <input
                autoFocus value={query}
                onChange={(e) => { setQuery(e.target.value); void search(e.target.value) }}
                placeholder="Type at least three letters…"
                style={input}
              />
              <div style={{ marginTop: 10 }}>
                {hits == null ? null : hits.length === 0 ? (
                  <p style={muted}>No patient matches that name in the Operations Hub.</p>
                ) : hits.map(h => (
                  <button key={h.id} onClick={() => void loadFor(h)} style={rowBtn}>
                    {h.lastName}, {h.firstName}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#0F172A' }}>
                <strong>{patient.lastName}, {patient.firstName}</strong>
                <button onClick={() => { setPatient(null); setRows(null) }} style={linkBtn}>change</button>
              </p>

              {rows == null ? (
                <p style={muted}>Loading cancellations…</p>
              ) : (
                <>
                  {unsettled.length > 0 && (
                    <>
                      <label style={lbl}>Unsettled cancellations (last 180 days)</label>
                      {unsettled.map(r => (
                        <button key={r.id} disabled={busy} onClick={() => void link(r.id)} style={rowBtn}>
                          <span style={{ fontWeight: 600 }}>{r.type}</span>
                          <span style={{ color: '#64748B' }}> · {fmt(r.createdAt)}</span>
                          {r.remarks ? <span style={{ color: '#94A3B8' }}> · {r.remarks}</span> : null}
                        </button>
                      ))}
                    </>
                  )}

                  {unsettled.length === 0 && (
                    <p style={{ ...muted, marginBottom: 12 }}>
                      Operations has no unsettled cancellation for this patient. Record the one this
                      fee is for:
                    </p>
                  )}

                  <div style={{
                    marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2E8F0',
                  }}>
                    <label style={lbl}>
                      {unsettled.length > 0 ? 'Or record a cancellation that was never logged' : 'Record it as a cancellation'}
                    </label>
                    <select value={newType} onChange={(e) => setNewType(e.target.value)} style={input}>
                      <option value="">Choose the classification…</option>
                      {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button disabled={busy || !newType} onClick={() => void createAndLink()}
                      style={{ ...primary, marginTop: 10, opacity: busy || !newType ? 0.55 : 1 }}>
                      Record it and link this payment
                    </button>
                  </div>

                  {others.length > 0 && (
                    <details style={{ marginTop: 14 }}>
                      <summary style={{ ...muted, cursor: 'pointer' }}>
                        {others.length} already settled or not chargeable
                      </summary>
                      {others.map(r => (
                        <p key={r.id} style={{ ...muted, margin: '6px 0 0' }}>
                          {r.type} · {fmt(r.createdAt)}
                          {r.settled ? ` · paid on order #${r.paidOrderNumber ?? '—'}` : ' · not chargeable'}
                        </p>
                      ))}
                    </details>
                  )}
                </>
              )}
            </>
          )}

          {err && (
            <p style={{
              marginTop: 12, fontSize: 12.5, color: '#B91C1C',
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px',
            }}>{err}</p>
          )}
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
}
const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 9,
  border: '1px solid #CBD5E1', fontSize: 13.5, fontFamily: 'inherit', background: '#fff',
}
const rowBtn: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px',
  marginBottom: 6, borderRadius: 9, border: '1px solid #E2E8F0',
  background: '#F8FAFC', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
}
const primary: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9, border: 'none',
  background: '#12606C', color: '#fff', fontWeight: 700, fontSize: 13.5,
  cursor: 'pointer', fontFamily: 'inherit',
}
const linkBtn: React.CSSProperties = {
  marginLeft: 8, background: 'none', border: 'none', color: '#12606C',
  textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
const muted: React.CSSProperties = { fontSize: 12.5, color: '#64748B', margin: 0 }
