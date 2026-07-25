// GET /api/aurora-admin/payments — admin view of PayMongo booking-downpayment
// payments. Server-to-server auth via the shared AURORA_ADMIN_TOKEN.
// Amounts (gross / PayMongo fee / net) come from the stored webhook payload;
// remittance is phased — paid payments show "For Clearing" until the Payouts
// API reconciliation is wired to flip them to "Remitted to Bank".
// Optional ?branch=SBEA|SBGH filter.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'

const DEPT_LABEL: Record<string, string> = {
  OT: 'Occupational Therapy (OT)',
  PT: 'Physical Therapy (PT)',
  SLP: 'Speech-Language Pathology (SLP)',
  SPED: 'Special Education (SPED)',
  MD: 'Medical Doctor (MD)',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis / Prosthesis',
  PSYCHIATRY: 'Psychiatry',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrician',
  REHABILITATION_MEDICINE: 'Rehabilitation Medicine',
}
const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
}
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

// Deep-find the PayMongo payment attributes (the object carrying both `fee`
// and `net_amount`, in centavos) inside the stored webhook payload.
function findAmounts(payload: unknown): { fee: number | null; gross: number | null; net: number | null } {
  let found: Record<string, unknown> | null = null
  const walk = (o: unknown) => {
    if (found || o === null || typeof o !== 'object') return
    const rec = o as Record<string, unknown>
    if (typeof rec.fee === 'number' && typeof rec.net_amount === 'number') {
      found = rec
      return
    }
    if (Array.isArray(o)) o.forEach(walk)
    else for (const k of Object.keys(rec)) walk(rec[k])
  }
  walk(payload)
  const toPhp = (v: unknown) => (typeof v === 'number' ? Math.round(v) / 100 : null)
  if (!found) return { fee: null, gross: null, net: null }
  const f = found as Record<string, unknown>
  return { fee: toPhp(f.fee), gross: toPhp(f.amount), net: toPhp(f.net_amount) }
}

export async function GET(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const branch = new URL(req.url).searchParams.get('branch')
  const where =
    branch === 'SBEA' || branch === 'SBGH' ? { booking: { is: { branch } } } : {}

  const payments = await prisma.patientPayment.findMany({
    where,
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    take: 3000,
    select: {
      id: true,
      amount: true,
      status: true,
      paidAt: true,
      createdAt: true,
      paymongoRef: true,
      webhookPayload: true,
      booking: {
        select: {
          branch: true,
          department: true,
          date: true,
          patient: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  let paidCount = 0
  let gross = 0
  let fee = 0
  let net = 0

  const rows = payments.map((p) => {
    const w = findAmounts(p.webhookPayload)
    const rowGross = w.gross ?? Number(p.amount)
    const rowFee = w.fee
    const rowNet = w.net ?? (rowFee != null ? rowGross - rowFee : null)
    const paid = p.status === 'paid'
    if (paid) {
      paidCount++
      gross += rowGross
      if (rowFee != null) fee += rowFee
      net += rowNet ?? rowGross
    }
    return {
      id: p.id,
      date: (p.paidAt ?? p.createdAt).toISOString(),
      patientName:
        titleCase(
          `${p.booking?.patient?.firstName ?? ''} ${p.booking?.patient?.lastName ?? ''}`.trim(),
        ) || '—',
      branch: p.booking?.branch ? BRANCH_LABEL[p.booking.branch] ?? p.booking.branch : '',
      department: p.booking?.department
        ? DEPT_LABEL[p.booking.department] ?? titleCase(p.booking.department)
        : '',
      gross: rowGross,
      fee: rowFee,
      net: rowNet,
      status: paid ? 'Paid' : 'Pending',
      remittance: paid ? 'For Clearing' : null,
      ref: p.paymongoRef,
    }
  })

  return NextResponse.json({ payments: rows, totals: { paidCount, gross, fee, net } })
}
