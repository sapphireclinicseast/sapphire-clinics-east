// POST /api/public/class-portal/frontdesk-payments
//
// Parent on /pay picks "Pay at front desk" → class portal POSTs here so
// the accounting hub's POS Cashier sees a pending tuition item to convert
// into an order. Idempotent on classPortalPaymentId — retrying the
// "Notify front desk" button doesn't spawn duplicate cashier items.
//
// GET /api/public/class-portal/frontdesk-payments
//
// Lets the class portal admin/student see what's still pending vs.
// converted (for the payment-history banner). Admin sees everything;
// students see only their own.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const ALL_BRANCHES = ['EAST', 'GREENHILLS'] as const
type ClassPortalBranch = (typeof ALL_BRANCHES)[number]

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function jsonError(origin: string | null, e: unknown): NextResponse {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const body = await req.json() as {
      classPortalPaymentId?: string
      studentId?: string
      studentEmail?: string
      studentName?: string
      branch?: string
      plan?: string
      tuitionCentavos?: number
      miscCentavos?: number
      period?: string
      method?: string
      notes?: string
    }

    // Validation — every required field present and reasonable.
    const required = ['classPortalPaymentId', 'studentId', 'studentEmail', 'studentName', 'branch', 'plan', 'period'] as const
    for (const k of required) {
      if (!body[k] || typeof body[k] !== 'string') {
        return withCors(NextResponse.json({ error: `${k} is required.` }, { status: 400 }), origin)
      }
    }
    if (!ALL_BRANCHES.includes(body.branch as ClassPortalBranch)) {
      return withCors(NextResponse.json({ error: 'Invalid branch.' }, { status: 400 }), origin)
    }
    const tuitionCentavos = Math.max(0, Math.round(Number(body.tuitionCentavos ?? 0)))
    const miscCentavos    = Math.max(0, Math.round(Number(body.miscCentavos    ?? 0)))
    if (tuitionCentavos + miscCentavos <= 0) {
      return withCors(NextResponse.json({ error: 'Amount must be greater than zero.' }, { status: 400 }), origin)
    }

    // Students may only create notifications for their own account.
    if (auth.role === 'STUDENT' && auth.userId !== body.studentId) {
      return withCors(NextResponse.json({ error: 'You can only post payment notifications for your own account.' }, { status: 403 }), origin)
    }

    // PAYMONGO rows are minted by an admin/branch-admin/frontdesk via the
    // "Record PayMongo payment" affordance on the student profile, so the
    // payment surfaces in the accounting-hub POS queue same as a bank or
    // cash payment. We don't accept PAYMONGO from STUDENT — only paid-via-
    // PayMongo records that staff manually log, until the proper
    // webhook flow lands.
    const allowed = ['BANK_DEPOSIT', 'FRONT_DESK_CASH', 'PAYMONGO'] as const
    type AllowedMethod = typeof allowed[number]
    const method: AllowedMethod | null = (allowed as readonly string[]).includes(body.method ?? '')
      ? (body.method as AllowedMethod)
      : null
    if (method === 'PAYMONGO' && auth.role === 'STUDENT') {
      return withCors(NextResponse.json({ error: 'Only staff can log a PayMongo payment.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalFrontDeskPayment as any).upsert({
      where: { classPortalPaymentId: body.classPortalPaymentId },
      // Re-notify is allowed: update only the mutable fields. Status/createdAt stay.
      update: {
        studentEmail: body.studentEmail,
        studentName: body.studentName,
        plan: body.plan,
        tuitionCentavos,
        miscCentavos,
        period: body.period,
        method,
        notes: body.notes ?? null,
      },
      create: {
        classPortalPaymentId: body.classPortalPaymentId!,
        studentId: body.studentId!,
        studentEmail: body.studentEmail!,
        studentName: body.studentName!,
        branch: body.branch as ClassPortalBranch,
        plan: body.plan!,
        tuitionCentavos,
        miscCentavos,
        period: body.period!,
        method,
        notes: body.notes ?? null,
        status: 'PENDING',
      },
    })

    return withCors(NextResponse.json({
      payment: {
        id: row.id,
        classPortalPaymentId: row.classPortalPaymentId,
        studentId: row.studentId,
        studentEmail: row.studentEmail,
        studentName: row.studentName,
        branch: row.branch,
        plan: row.plan,
        tuitionCentavos: row.tuitionCentavos,
        miscCentavos: row.miscCentavos,
        period: row.period,
        method: row.method ?? null,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        convertedAt: row.convertedAt?.toISOString() ?? null,
      },
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (auth.role === 'STUDENT') where.studentId = auth.userId
    if (auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') {
      if (auth.branch) where.branch = auth.branch
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalFrontDeskPayment as any).findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = rows.map((r: any) => ({
      id: r.id,
      classPortalPaymentId: r.classPortalPaymentId,
      studentId: r.studentId,
      studentEmail: r.studentEmail,
      studentName: r.studentName,
      branch: r.branch,
      plan: r.plan,
      tuitionCentavos: r.tuitionCentavos,
      miscCentavos: r.miscCentavos,
      period: r.period,
      method: r.method ?? null,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      convertedAt: r.convertedAt?.toISOString() ?? null,
    }))
    return withCors(NextResponse.json({ payments }), origin)
  } catch (e) { return jsonError(origin, e) }
}
