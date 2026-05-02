/**
 * /api/payroll/ie-pr
 *
 * GET  — Fetches IE/PR documents from the teletherapy hub and merges them
 *         with the local payroll-tracking records (countedInPayroll, cutoffPeriod).
 * PATCH — Marks / unmarks a document as counted in payroll.
 *
 * Query params (GET):
 *   documentType  INITIAL_EVALUATION | PROGRESS_REPORT (required)
 *   staffId       filter by therapist externalStaffId (optional)
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const TELETHERAPY_URL = (process.env.TELETHERAPY_HUB_URL ?? 'https://teletherapy.sapphireclinicseast.org').replace(/\/$/, '')
const INTERNAL_KEY = process.env.TELETHERAPY_INTERNAL_API_KEY ?? ''

export interface TeletherapyDoc {
  id: string
  documentType: string
  patient: { id: string; name: string; branch: string | null }
  therapist: { staffId: string; name: string; department: string; branch: string } | null
  department: string
  fileName: string
  mimeType: string
  description: string | null
  uploadedAt: string
}

async function fetchDocs(documentType: string, staffId?: string): Promise<TeletherapyDoc[]> {
  if (!INTERNAL_KEY) throw new Error('TELETHERAPY_INTERNAL_API_KEY not configured')
  const p = new URLSearchParams({ documentType })
  if (staffId) p.set('staffId', staffId)
  const res = await fetch(`${TELETHERAPY_URL}/api/internal/documents?${p}`, {
    headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Teletherapy returned ${res.status}: ${text}`)
  }
  return res.json()
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const documentType = searchParams.get('documentType') ?? ''
  const staffId = searchParams.get('staffId') ?? ''

  if (!documentType) {
    return NextResponse.json({ error: 'documentType is required' }, { status: 400 })
  }

  try {
    const [remoteDocs, localRecords] = await Promise.all([
      fetchDocs(documentType, staffId || undefined),
      prisma.iEPRPayrollRecord.findMany(),
    ])

    const localMap = new Map(localRecords.map(r => [r.documentId, r]))

    const merged = remoteDocs.map(doc => ({
      ...doc,
      countedInPayroll: localMap.get(doc.id)?.countedInPayroll ?? false,
      cutoffPeriod:     localMap.get(doc.id)?.cutoffPeriod ?? null,
      notes:            localMap.get(doc.id)?.notes ?? null,
    }))

    return NextResponse.json(merged)
  } catch (err) {
    console.error('[ie-pr GET] error:', err)
    return NextResponse.json(
      { error: 'Could not reach teletherapy hub. Check TELETHERAPY_HUB_URL and TELETHERAPY_INTERNAL_API_KEY.' },
      { status: 502 }
    )
  }
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { documentId, staffId, countedInPayroll, cutoffPeriod, notes } = body

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const record = await prisma.iEPRPayrollRecord.upsert({
      where: { documentId },
      update: {
        countedInPayroll: countedInPayroll ?? false,
        cutoffPeriod: countedInPayroll ? (cutoffPeriod || null) : null,
        notes: notes || null,
        markedById: session.user.id,
      },
      create: {
        documentId,
        staffId: staffId || null,
        countedInPayroll: countedInPayroll ?? false,
        cutoffPeriod: countedInPayroll ? (cutoffPeriod || null) : null,
        notes: notes || null,
        markedById: session.user.id,
      },
    })

    return NextResponse.json(record)
  } catch (err) {
    console.error('[ie-pr PATCH] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
