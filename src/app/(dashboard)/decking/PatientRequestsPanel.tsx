'use client'

// Self-contained Pending Patient Requests panel, rendered above the Decking
// weekly grid. Pulls from /api/decking/bookings and exposes Approve, Reject,
// Send-Email actions. Keeps integration with DeckingClient.tsx minimal.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface BookingRow {
  id: string
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'
  branch: string
  department: string
  date: string
  startTime: string
  endTime: string
  isTeletherapy: boolean
  meetLink: string | null
  notes: string | null
  rejectionReason: string | null
  downpayment: string | number | null
  patient: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
  staff: { id: string; firstName: string; lastName: string; department: string; branch: string }
  payment: { status: string; amount: number | string; paidAt: string | null } | null
}

interface Props {
  branch: 'SBEA' | 'SBGH'
}

export default function PatientRequestsPanel({ branch }: Props) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch(`/api/decking/bookings?branch=${branch}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      setBookings(data.bookings as BookingRow[])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [branch])

  useEffect(() => { load() }, [load])

  const pending = useMemo(() => bookings.filter((b) => b.status === 'PENDING'), [bookings])
  const approved = useMemo(() => bookings.filter((b) => b.status === 'APPROVED'), [bookings])
  const paid = useMemo(() => bookings.filter((b) => b.status === 'PAID'), [bookings])

  async function approve(id: string) {
    if (!confirm('Approve this booking and send payment email?')) return
    setBusy(id)
    try {
      const r = await fetch(`/api/decking/bookings/${id}/approve`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Approve failed')
      await load()
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function reject(id: string) {
    const reason = prompt('Reason for rejection (will be shown to patient):') ?? ''
    if (reason === null) return
    setBusy(id)
    try {
      const r = await fetch(`/api/decking/bookings/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Reject failed')
      await load()
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function resend(id: string) {
    setBusy(id)
    try {
      const r = await fetch(`/api/decking/bookings/${id}/send-payment-email`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Send failed')
      alert('Payment email sent.')
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const sectionRows = (rows: BookingRow[], showActions: 'pending' | 'approved' | 'paid') => (
    <div className="space-y-2">
      {rows.length === 0 && (
        <div className="text-sm text-gray-500 italic px-2 py-1">None</div>
      )}
      {rows.map((b) => (
        <div
          key={b.id}
          className="flex items-center justify-between gap-4 bg-white border rounded-lg px-3 py-2 text-sm"
        >
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate" style={{ color: 'var(--charcoal)' }}>
              {(b.patient.firstName || b.patient.lastName)
                ? `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim()
                : <span className="text-rose-600">⚠ No name provided</span>}
              <span className="text-gray-500 font-normal ml-1">· {b.department}</span>
              {b.isTeletherapy && (
                <span className="ml-2 text-xs bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">tele</span>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{b.date} · {b.startTime}–{b.endTime}</span>
              <span>w/ {b.staff.firstName} {b.staff.lastName}</span>
              {b.patient.email && <span className="text-gray-500">✉ {b.patient.email}</span>}
              {b.patient.phone && <span className="text-gray-500">☎ {b.patient.phone}</span>}
            </div>
            {b.notes && <div className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{b.notes}&rdquo;</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showActions === 'pending' && (
              <>
                <button
                  className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-medium disabled:opacity-50"
                  disabled={busy === b.id}
                  onClick={() => approve(b.id)}
                >Approve</button>
                <button
                  className="px-3 py-1 rounded bg-rose-500 text-white text-xs font-medium disabled:opacity-50"
                  disabled={busy === b.id}
                  onClick={() => reject(b.id)}
                >Reject</button>
              </>
            )}
            {showActions === 'approved' && (
              <>
                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  Awaiting payment{b.downpayment ? ` · ₱${Number(b.downpayment).toLocaleString()}` : ''}
                </span>
                <button
                  className="px-3 py-1 rounded border text-xs font-medium disabled:opacity-50"
                  disabled={busy === b.id}
                  onClick={() => resend(b.id)}
                >Send Email</button>
              </>
            )}
            {showActions === 'paid' && (
              <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                💰 Paid Downpayment{b.payment?.amount ? ` · ₱${Number(b.payment.amount).toLocaleString()}` : ''}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="bg-slate-50 border rounded-xl p-4 mb-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Patient Appointment Requests
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {pending.length} pending · {approved.length} awaiting payment · {paid.length} paid today
          </p>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {err && <div className="text-rose-600 text-sm">{err}</div>}
          {loading && <div className="text-slate-500 text-sm">Loading…</div>}

          {!loading && (
            <>
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Pending</div>
                {sectionRows(pending, 'pending')}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Approved — Awaiting Payment</div>
                {sectionRows(approved, 'approved')}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Paid Downpayment</div>
                {sectionRows(paid, 'paid')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
