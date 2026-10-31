// PATCH / DELETE /api/public/class-portal/frontdesk-payments/[classPortalPaymentId]
//
// Refused. Tuition is recorded only at the Accounting Hub POS (Hannah,
// 2026-10-31): Class Hub shows what the POS recorded and cannot confirm, edit
// or delete a payment. Corrections are made on the sale (void / reopen / edit
// in POS → Order History), which keeps the Class Hub row in step through the
// internal route /api/internal/class-portal/frontdesk-payments/[id].

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

const CLASS_HUB_READ_ONLY = 'Tuition payments are recorded at the Accounting Hub POS and corrected there (void, reopen or edit the sale). Class Hub only shows them.'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function refuse(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    return withCors(NextResponse.json({ error: CLASS_HUB_READ_ONLY }, { status: 409 }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function PATCH(req: NextRequest) { return refuse(req) }

export async function DELETE(req: NextRequest) { return refuse(req) }
