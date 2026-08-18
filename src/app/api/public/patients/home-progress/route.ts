// Patient "Home Progress" log.
//   POST /api/public/patients/home-progress  — create a dated entry (files are
//        added afterwards, one request each, via /[entryId]/file).
//   GET  /api/public/patients/home-progress?token=…  — list the patient's
//        entries (combined across interbranch records), newest first.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as { token?: string; date?: string; remarks?: string }
  const session = verifyPatientToken(body.token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const d = (body.date ?? '').trim()
  const date = d ? new Date(`${d}T00:00:00.000Z`) : new Date()
  if (Number.isNaN(date.getTime())) {
    return withCors(NextResponse.json({ error: 'Invalid date' }, { status: 400 }), origin)
  }

  const entry = await prisma.homeProgressEntry.create({
    data: {
      patientId: session.patientId,
      date,
      remarks: (body.remarks ?? '').trim().slice(0, 5000) || null,
    },
    select: { id: true },
  })
  return withCors(NextResponse.json({ ok: true, entryId: entry.id }), origin)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const ids = await linkedPatientIds(session.patientId)
  const entries = await prisma.homeProgressEntry.findMany({
    where: { patientId: { in: ids } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true, date: true, remarks: true, createdAt: true,
      files: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      },
    },
  })

  return withCors(
    NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        remarks: e.remarks,
        createdAt: e.createdAt.toISOString(),
        files: e.files.map((f) => ({
          id: f.id,
          kind: f.kind,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
      })),
    }),
    origin,
  )
}
