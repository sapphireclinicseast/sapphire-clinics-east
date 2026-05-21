// GET   /api/public/admission?code=<access>&branch=EAST|GREENHILLS|ALL
// PATCH /api/public/admission?code=<access>
//
// Public endpoints gated by an access code (default "scei") instead of a
// class-portal JWT. Built for the partner school to view + update LIS
// status + remittance status across both branches from a single page
// (/admission).
//
// The PATCH body accepts only the two admission-tracking fields — anyone
// with the code cannot edit student identity, enrollment data, or payments.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../_cors'

const ACCESS_CODE = process.env.ADMISSION_ACCESS_CODE || 'scei'

const LIS_VALUES = ['WAITING_FOR_ENROLLMENT', 'PENDING_ENROLLMENT', 'PENDING_TRANSFER', 'ENROLLED'] as const
const REMIT_VALUES = ['PENDING', 'PAID'] as const

function checkCode(req: Request): boolean {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('code')
  const fromHeader = req.headers.get('x-admission-code')
  return (fromQuery === ACCESS_CODE) || (fromHeader === ACCESS_CODE)
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  if (!checkCode(req)) {
    return withCors(NextResponse.json({ error: 'Invalid access code.' }, { status: 401 }), origin)
  }
  const url = new URL(req.url)
  const branchFilter = url.searchParams.get('branch')?.toUpperCase()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { role: 'STUDENT' }
    if (branchFilter === 'EAST' || branchFilter === 'GREENHILLS') {
      where.branch = branchFilter
    }
    const rows = await prisma.classPortalUser.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students = rows.map((r: any) => {
      const e = (r.enrollment ?? {}) as Record<string, unknown>
      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        branch: r.branch,
        level: r.level,
        lrnStatus: (e.lrnStatus as string) ?? null,
        lrn: (e.lrn as string) ?? null,
        cellphone: (e.cellphone as string) ?? null,
        diagnosis: (e.diagnosis as string) ?? null,
        lisStatus: (e.lisStatus as string) ?? null,
        remittanceStatus: (e.remittanceStatus as string) ?? null,
        createdAt: r.createdAt.toISOString(),
      }
    })
    return withCors(NextResponse.json({ students }), origin)
  } catch (e) {
    console.error('[admission GET]', e)
    return withCors(NextResponse.json({ error: 'Server error' }, { status: 500 }), origin)
  }
}

export async function PATCH(req: Request) {
  const origin = req.headers.get('origin')
  if (!checkCode(req)) {
    return withCors(NextResponse.json({ error: 'Invalid access code.' }, { status: 401 }), origin)
  }
  let body: { studentId?: string; lisStatus?: string | null; remittanceStatus?: string | null }
  try { body = await req.json() } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }), origin)
  }
  if (!body.studentId) {
    return withCors(NextResponse.json({ error: 'studentId required' }, { status: 400 }), origin)
  }

  // Whitelist the two admission columns; anything else is silently dropped.
  const patch: Record<string, string | null> = {}
  if (body.lisStatus === null || (typeof body.lisStatus === 'string' && (LIS_VALUES as readonly string[]).includes(body.lisStatus))) {
    patch.lisStatus = body.lisStatus
  } else if (body.lisStatus !== undefined) {
    return withCors(NextResponse.json({ error: 'Invalid lisStatus' }, { status: 400 }), origin)
  }
  if (body.remittanceStatus === null || (typeof body.remittanceStatus === 'string' && (REMIT_VALUES as readonly string[]).includes(body.remittanceStatus))) {
    patch.remittanceStatus = body.remittanceStatus
  } else if (body.remittanceStatus !== undefined) {
    return withCors(NextResponse.json({ error: 'Invalid remittanceStatus' }, { status: 400 }), origin)
  }
  if (Object.keys(patch).length === 0) {
    return withCors(NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 }), origin)
  }

  try {
    const existing = await prisma.classPortalUser.findUnique({ where: { id: body.studentId } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'Student not found' }, { status: 404 }), origin)
    }
    const enrollment = { ...((existing.enrollment as Record<string, unknown>) ?? {}), ...patch }
    const updated = await prisma.classPortalUser.update({
      where: { id: body.studentId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { enrollment: enrollment as any },
    })
    const e = (updated.enrollment ?? {}) as Record<string, unknown>
    return withCors(NextResponse.json({
      student: {
        id: updated.id,
        lisStatus: (e.lisStatus as string) ?? null,
        remittanceStatus: (e.remittanceStatus as string) ?? null,
      },
    }), origin)
  } catch (e) {
    console.error('[admission PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error' }, { status: 500 }), origin)
  }
}
