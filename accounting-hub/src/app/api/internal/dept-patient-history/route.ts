// GET /api/internal/dept-patient-history?branches=SANDBOX_EAST,...
//
// Distinct (patient, department) pairs from POS order history, so the
// Operations Hub's "Patients by Service" breakdown can reach back before it
// existed. Operations Hub's own Schedule table only starts when the Clinic
// Schedule module went into use (~Mar 2026), while POS orders here run from
// Jun 2024 — without this the dashboard undercounts every department by 3-4x.
//
// Auth: Authorization: Bearer EXTERNAL_API_KEY (shared inter-hub key, same
// pattern as /api/internal/vip-status).
//
// Identity is returned as BOTH patientId and patientName because the two are
// unevenly populated: only ~8.8k of ~35.8k orders carry a patientId (the
// 2024-25 migrated history is name-only). The caller resolves ids exactly and
// falls back to name matching, so it needs whichever is present.
//
// Returns { window: {from,to}, rows: [{patientId, patientName, dept}],
//           skippedNonClinical } — deduped pairs, not order rows.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

// Service.department here uses ORTHOSIS_PROSTHESIS; Operations Hub's
// StaffDepartment enum calls it ORTHOSIS. Map so both sides agree.
const DEPT_MAP: Record<string, string> = {
  PT: 'PT',
  OT: 'OT',
  SLP: 'SLP',
  MD: 'MD',
  PSYCHOLOGY: 'PSYCHOLOGY',
  SPED: 'SPED',
  ORTHOSIS_PROSTHESIS: 'ORTHOSIS',
}
// 'ALL' and 'EDU' are not clinical service lines (ALL = items priced across
// departments). Counting them under a department would invent treatment that
// didn't happen, so they're skipped and reported rather than silently dropped.

// Order.patientName is free text and, in the migrated history, sometimes holds
// something that isn't a patient: a service description pasted in
// ("PT - THERAPIST (SINGLE) - MSK/ORTHO..."), an institution or HMO
// ("Municipality of Cainta", "HMO - INTELLICARE"), a sales channel ("Shopee"),
// or a test row ("UNPAID TEST"). Each of those otherwise becomes a distinct
// "patient" in the Operations Hub breakdown and inflates the department counts.
// Only applied when there is no patientId — a real id always wins over the text.
const NON_PERSON = new RegExp(
  [
    'SESSION', 'PACKAGE', 'THERAPIST', 'TUTORIAL', 'INTELLICARE', 'HMO',
    'MUNICIPALITY', 'PREPAID', 'PER DIAGNOSTIC', 'ONE-ON-ONE', 'PLACEMENT',
    'HOMECARE', 'TELETHERAPY', 'AQUATHERAPY', 'VOUCHER', 'SHOPEE', 'LAZADA',
    'WALK-?IN', 'GUEST', 'UNPAID', '\\bTEST\\b', '\\bN/?A\\b', '\\bCASH\\b',
  ].join('|'),
  'i',
)

function isNonPerson(name: string): boolean {
  const n = name.trim()
  if (n.length < 3) return true            // "Hi"
  if (NON_PERSON.test(n)) return true
  // Service rows are long and hyphen-delimited; real names are neither.
  if (n.length > 45 && n.includes(' - ')) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const branchParam = req.nextUrl.searchParams.get('branches')
  const branches = branchParam
    ? branchParam.split(',').map(b => b.trim()).filter(Boolean)
    : null

  // VOIDED orders are reversed transactions — treatment that was cancelled at
  // the till. REOPENED is a completed order pulled back for editing, so it
  // still represents a real visit.
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['COMPLETED', 'REOPENED'] },
      ...(branches && branches.length > 0 ? { branch: { in: branches } } : {}),
    },
    select: {
      patientId: true,
      patientName: true,
      transactionDate: true,
      items: { select: { service: { select: { department: true } } } },
    },
  })

  // Dedupe to (identity, dept) pairs. A patient billed 40 PT sessions must
  // count once, or the caller's "unique patients" figure stops being unique.
  const seen = new Set<string>()
  const rows: { patientId: string | null; patientName: string | null; dept: string }[] = []
  // Session volume per (month, dept) — the caller needs this for
  // "avg sessions/patient/mo", which cannot be derived from the deduped pairs
  // above. Each order line is one paid session.
  const monthly = new Map<string, number>()
  let skippedNonClinical = 0
  let skippedNonPatient = 0
  let from: Date | null = null
  let to: Date | null = null

  for (const o of orders) {
    if (!o.patientId && !o.patientName) continue   // walk-in retail, no patient
    if (!o.patientId && o.patientName && isNonPerson(o.patientName)) {
      skippedNonPatient++
      continue
    }
    if (o.transactionDate) {
      if (!from || o.transactionDate < from) from = o.transactionDate
      if (!to   || o.transactionDate > to)   to   = o.transactionDate
    }
    for (const it of o.items) {
      const raw = it.service?.department
      if (!raw) continue
      const dept = DEPT_MAP[raw]
      if (!dept) { skippedNonClinical++; continue }
      // Volume counts every line, before the per-patient dedupe below.
      if (o.transactionDate) {
        const mKey = `${o.transactionDate.getFullYear()}-${String(o.transactionDate.getMonth() + 1).padStart(2, '0')}|${dept}`
        monthly.set(mKey, (monthly.get(mKey) ?? 0) + 1)
      }

      const identity = o.patientId ?? `name:${o.patientName}`
      const key = `${identity}|${dept}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ patientId: o.patientId, patientName: o.patientName, dept })
    }
  }

  return NextResponse.json({
    window: {
      from: from ? from.toISOString().slice(0, 10) : null,
      to:   to   ? to.toISOString().slice(0, 10)   : null,
    },
    rows,
    monthly: Array.from(monthly.entries()).map(([k, sessions]) => {
      const [month, dept] = k.split('|')
      return { month, dept, sessions }
    }),
    skippedNonClinical,
    skippedNonPatient,
  })
}
