// PATCH /api/public/class-portal/frontdesk-payments/[classPortalPaymentId]
//
// Class-portal JWT gated companion to the internal accounting-hub PATCH at
// /api/internal/class-portal/frontdesk-payments/[id]. Lets the FRONTDESK,
// BRANCH_ADMIN, or ADMIN user flip a bank-deposit / cash payment from
// PENDING → CONVERTED right from their portal (no accounting hub needed).
// Branch admins and front desk are scoped to their own branch; main admin
// can confirm any branch.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ classPortalPaymentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'FRONTDESK' && auth.role !== 'BRANCH_ADMIN' && auth.role !== 'ADMIN') {
      return withCors(NextResponse.json({ error: 'Only front desk, branch admin, or main admin can confirm payments.' }, { status: 403 }), origin)
    }
    const { classPortalPaymentId } = await params
    if (!classPortalPaymentId) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId required.' }, { status: 400 }), origin)
    }
    const body = await req.json().catch(() => ({})) as {
      status?: 'PENDING' | 'CONVERTED'
      notes?: string
      /** Optional method correction. Use case: a row was logged as
       *  PAYMONGO but the parent actually paid by bank deposit. Same
       *  auth rules as status flips (branch-scoped for non-admin). */
      method?: 'PAYMONGO' | 'BANK_DEPOSIT' | 'FRONT_DESK_CASH' | null
      /** Sub-instrument when method = FRONT_DESK_CASH. CASH | CREDIT_CARD
       *  | DEBIT_CARD | GCASH | PAYMAYA. Null clears it (only valid when
       *  the row's method is also being cleared / set to a non-FDC type). */
      methodDetail?: 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'GCASH' | 'PAYMAYA' | null
      /** Reconciliation edits: amount and date overrides so the class-
       *  portal row matches what the accounting hub Order actually
       *  recorded. Plan + period are also editable for the same reason. */
      tuitionCentavos?: number
      miscCentavos?: number
      plan?: string
      period?: string
      /** ISO date strings. createdAt = "submitted at" on Pending rows;
       *  convertedAt = "confirmed at" on Confirmed rows. */
      createdAt?: string
      convertedAt?: string | null
    }

    // Branch scoping for non-main-admin roles.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.classPortalFrontDeskPayment as any).findUnique({ where: { classPortalPaymentId } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId not found.' }, { status: 404 }), origin)
    }
    if ((auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') && auth.branch && existing.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'You can only edit payments for your own branch.' }, { status: 403 }), origin)
    }

    // Decide what's actually changing. Build the Prisma `data` payload
    // piecewise — each whitelisted field is validated independently so
    // a bad amount doesn't drop a valid notes edit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {}
    const statusSent = typeof body.status === 'string'
    if (statusSent) {
      const status: 'PENDING' | 'CONVERTED' = body.status === 'PENDING' ? 'PENDING' : 'CONVERTED'
      data.status = status
      // Only stamp convertedAt to now() when the caller didn't supply
      // an explicit convertedAt — the explicit override wins below.
      if (body.convertedAt === undefined) {
        data.convertedAt = status === 'CONVERTED' ? new Date() : null
      }
    }
    if (body.method !== undefined) {
      const allowed = ['PAYMONGO', 'BANK_DEPOSIT', 'FRONT_DESK_CASH'] as const
      type AllowedMethod = typeof allowed[number]
      if (body.method !== null && !(allowed as readonly string[]).includes(body.method)) {
        return withCors(NextResponse.json({ error: 'Invalid method.' }, { status: 400 }), origin)
      }
      data.method = (body.method as AllowedMethod | null)
      // Switching away from FRONT_DESK_CASH must clear methodDetail so
      // a stale "GCash" tag doesn't dangle on a BANK_DEPOSIT row. Only
      // applied when the caller didn't ALSO set methodDetail explicitly.
      if (data.method !== 'FRONT_DESK_CASH' && body.methodDetail === undefined) {
        data.methodDetail = null
      }
    }
    if (body.methodDetail !== undefined) {
      const allowedDetails = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'GCASH', 'PAYMAYA'] as const
      if (body.methodDetail !== null && !(allowedDetails as readonly string[]).includes(body.methodDetail)) {
        return withCors(NextResponse.json({ error: 'Invalid methodDetail. Must be one of: CASH, CREDIT_CARD, DEBIT_CARD, GCASH, PAYMAYA.' }, { status: 400 }), origin)
      }
      data.methodDetail = body.methodDetail
    }
    if (body.notes !== undefined) data.notes = body.notes ?? null

    // Amount fields — must be non-negative integers; the existing
    // posting endpoint rejects sum <= 0, but here we let the admin
    // patch one side without touching the other.
    if (body.tuitionCentavos !== undefined) {
      const v = Math.round(Number(body.tuitionCentavos))
      if (!Number.isFinite(v) || v < 0) {
        return withCors(NextResponse.json({ error: 'tuitionCentavos must be a non-negative number.' }, { status: 400 }), origin)
      }
      data.tuitionCentavos = v
    }
    if (body.miscCentavos !== undefined) {
      const v = Math.round(Number(body.miscCentavos))
      if (!Number.isFinite(v) || v < 0) {
        return withCors(NextResponse.json({ error: 'miscCentavos must be a non-negative number.' }, { status: 400 }), origin)
      }
      data.miscCentavos = v
    }

    if (body.plan !== undefined) {
      const v = String(body.plan).trim()
      if (!v) {
        return withCors(NextResponse.json({ error: 'plan must not be empty.' }, { status: 400 }), origin)
      }
      data.plan = v
    }
    if (body.period !== undefined) {
      const v = String(body.period).trim()
      if (!v) {
        return withCors(NextResponse.json({ error: 'period must not be empty.' }, { status: 400 }), origin)
      }
      data.period = v
    }

    // Date overrides. Accept ISO 8601 or YYYY-MM-DD. Null on convertedAt
    // clears it (back to PENDING-style row).
    if (body.createdAt !== undefined) {
      const d = new Date(body.createdAt)
      if (!Number.isFinite(d.getTime())) {
        return withCors(NextResponse.json({ error: 'createdAt is not a valid date.' }, { status: 400 }), origin)
      }
      data.createdAt = d
    }
    if (body.convertedAt !== undefined) {
      if (body.convertedAt === null) {
        data.convertedAt = null
      } else {
        const d = new Date(body.convertedAt)
        if (!Number.isFinite(d.getTime())) {
          return withCors(NextResponse.json({ error: 'convertedAt is not a valid date.' }, { status: 400 }), origin)
        }
        data.convertedAt = d
      }
    }

    if (Object.keys(data).length === 0) {
      return withCors(NextResponse.json({ error: 'No editable fields supplied.' }, { status: 400 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalFrontDeskPayment as any).update({
      where: { classPortalPaymentId },
      data,
    })
    return withCors(NextResponse.json({
      payment: {
        id: updated.id,
        classPortalPaymentId: updated.classPortalPaymentId,
        status: updated.status,
        method: updated.method ?? null,
        methodDetail: updated.methodDetail ?? null,
        plan: updated.plan,
        period: updated.period,
        tuitionCentavos: updated.tuitionCentavos,
        miscCentavos: updated.miscCentavos,
        notes: updated.notes ?? null,
        createdAt: updated.createdAt.toISOString(),
        convertedAt: updated.convertedAt?.toISOString() ?? null,
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[public/frontdesk-payments PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

// DELETE — main admin OR branch-scoped front desk can hard-delete a
// payment row. PENDING rows are typically test entries the staff wants
// gone. CONVERTED rows already have an associated accounting-hub Order —
// deleting here does NOT void that Order, so whoever deletes it should
// also void in the accounting hub when needed. The client confirm dialog
// surfaces this warning before the request is sent.
//
// FRONTDESK is restricted to rows whose `branch` matches the token's
// branch claim, so East front-desk can't delete a Greenhills row. Main
// admin is unscoped.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ classPortalPaymentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'FRONTDESK') {
      return withCors(NextResponse.json({ error: 'Only the main admin or front desk can delete a payment row.' }, { status: 403 }), origin)
    }
    const { classPortalPaymentId } = await params
    if (!classPortalPaymentId) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId required.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.classPortalFrontDeskPayment as any).findUnique({ where: { classPortalPaymentId } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId not found.' }, { status: 404 }), origin)
    }
    // Branch scoping for front desk. Legacy shared-hardcoded frontdesk
    // tokens have no branch claim — those keep their old unscoped view,
    // same back-compat we use for the users list filter.
    if (auth.role === 'FRONTDESK' && auth.branch && existing.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'You can only delete payments for your own branch.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalFrontDeskPayment as any).delete({ where: { classPortalPaymentId } })
    return withCors(NextResponse.json({ ok: true, deletedStatus: existing.status }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[public/frontdesk-payments DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
