// Cancellation-fee payments, read from POS orders in the Accounting Hub.
//
// Front desk had no way to see whether a fee had already been settled, so
// patients were either chased for fees they had paid or never chased at all.
// The Accounting Hub is the only place that knows, so this asks it.
//
// Identity matching reuses nameKey from pos-history: POS carries one free-text
// name whose word order is inconsistent, and only some orders carry a patientId.

import { nameKey } from '@/lib/pos-history'

export interface FeePayment {
  patientKey: string        // resolved Patient.id, or `name:<key>` when unresolved
  orderNumber: number
  paidAt: string
  amount: number
  lineName: string
}

export interface FeePaymentIndex {
  /** Patient.id → payments, oldest first. */
  byPatient: Map<string, FeePayment[]>
  /** The name patterns the Accounting Hub matched on, for display. */
  patterns: string[]
  /** Total fee lines seen. Zero with a non-empty roster usually means the
   *  pattern doesn't match how this clinic names the line — the UI says so
   *  rather than showing every fee as unpaid. */
  total: number
}

/**
 * Returns null when the Accounting Hub can't be reached or no key is set.
 *
 * Null is NOT "nothing is paid" — the caller must render an unknown state, not
 * an unpaid one. Telling front desk a fee is unpaid because a fetch failed is
 * how a patient gets charged twice.
 */
export async function loadCancellationFees(
  roster: { id: string; firstName: string | null; lastName: string | null }[],
  fromISO: string,
  branches: string[] | null,
): Promise<FeePaymentIndex | null> {
  const acctUrl = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const acctKey = process.env.EXTERNAL_API_KEY ?? ''
  if (!acctKey) return null

  let data: { patterns: string[]; rows: {
    patientId: string | null; patientName: string | null; branch: string
    orderNumber: number; paidAt: string; amount: number; lineName: string
  }[] }
  try {
    const qs = new URLSearchParams({ from: fromISO })
    if (branches && branches.length > 0) qs.set('branches', branches.join(','))
    const res = await fetch(`${acctUrl}/api/internal/cancellation-fees?${qs}`, {
      headers: { Authorization: `Bearer ${acctKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }

  const byId = new Set(roster.map(p => p.id))
  const byName = new Map<string, string[]>()
  for (const p of roster) {
    const k = nameKey(`${p.lastName ?? ''} ${p.firstName ?? ''}`)
    if (!k) continue
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k)!.push(p.id)
  }

  const byPatient = new Map<string, FeePayment[]>()
  for (const r of data.rows ?? []) {
    let pid: string | null = null
    if (r.patientId && byId.has(r.patientId)) {
      pid = r.patientId
    } else if (r.patientName) {
      const hits = byName.get(nameKey(r.patientName))
      // Exactly one match only. An ambiguous name must not clear someone's fee:
      // marking the wrong patient paid loses real money, so it stays unresolved.
      if (hits && hits.length === 1) pid = hits[0]
    }
    if (!pid) continue
    if (!byPatient.has(pid)) byPatient.set(pid, [])
    byPatient.get(pid)!.push({
      patientKey: pid,
      orderNumber: r.orderNumber,
      paidAt: r.paidAt,
      amount: r.amount,
      lineName: r.lineName,
    })
  }
  for (const list of byPatient.values()) {
    list.sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
  }

  return { byPatient, patterns: data.patterns ?? [], total: (data.rows ?? []).length }
}

/**
 * Pairs a patient's fee-bearing cancellations with their fee payments.
 *
 * Both are taken oldest first and matched in order, a payment only settling a
 * cancellation dated on or before it. Nothing in POS says WHICH cancellation a
 * fee line was for, so oldest-first is the assumption — stated here because it
 * decides which row shows as unpaid when someone has more cancellations than
 * payments. One payment settles one cancellation; a patient with 3 fee-bearing
 * cancellations and 2 payments correctly shows exactly one still owing.
 */
export function pairFeesToLogs(
  feeBearing: { id: string; createdAt: string | Date }[],
  payments: FeePayment[],
): Map<string, FeePayment> {
  const paired = new Map<string, FeePayment>()
  const pool = [...payments]
  const ordered = [...feeBearing].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  for (const log of ordered) {
    const logTime = new Date(log.createdAt).getTime()
    // A payment made BEFORE the cancellation can't be for it.
    const i = pool.findIndex(p => new Date(p.paidAt).getTime() >= logTime)
    if (i === -1) continue
    paired.set(log.id, pool[i])
    pool.splice(i, 1)
  }
  return paired
}
