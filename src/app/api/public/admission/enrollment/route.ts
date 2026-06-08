// GET /api/public/admission/enrollment?code=<access>&studentId=<id>
//
// Companion to /api/public/admission. Returns the FULL enrollment JSON
// for a single student, including base64 fields like
// `certSignatureDataUrl` that the list endpoint strips for performance.
// Called by the partner-school admission tracker only when the user
// clicks "View PDF" / "Download PDF" — so the 400 KB signature
// payload only ships once, on demand, instead of once per student
// every time the tracker opens.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../../_cors'

const ACCESS_CODE = process.env.ADMISSION_ACCESS_CODE || 'scei'

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
  const studentId = url.searchParams.get('studentId')
  if (!studentId) {
    return withCors(NextResponse.json({ error: 'studentId is required.' }, { status: 400 }), origin)
  }
  try {
    const row = await prisma.classPortalUser.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        email: true,
        branch: true,
        level: true,
        enrollment: true,
        createdAt: true,
      },
    })
    if (!row || row.role !== 'STUDENT') {
      return withCors(NextResponse.json({ error: 'Student not found.' }, { status: 404 }), origin)
    }
    return withCors(NextResponse.json({
      student: {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        branch: row.branch,
        level: row.level,
        enrollment: (row.enrollment ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    console.error('[admission/enrollment GET]', e)
    return withCors(NextResponse.json({ error: 'Server error' }, { status: 500 }), origin)
  }
}
