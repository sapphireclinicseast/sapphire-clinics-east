import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COVERAGE_KEY_RX } from '@/lib/payroll/si-coverage'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MONTH_RX = /^\d{4}-\d{2}$/

// GET /api/payroll/si-submissions?from=YYYY-MM&to=YYYY-MM[&consultantId=]
// Service-invoice submissions in a month range. A row's `month` is a whole
// month ("YYYY-MM") or a single cutoff ("YYYY-MM-1" / "YYYY-MM-2") — see
// lib/payroll/si-coverage.ts. The Service Invoice screen reads si-tracking.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || from
  const consultantId = sp.get('consultantId') || ''
  if (!MONTH_RX.test(from) || !MONTH_RX.test(to)) {
    return NextResponse.json({ error: 'from/to must be YYYY-MM' }, { status: 400 })
  }
  const rows = await prisma.consultantSiSubmission.findMany({
    where: {
      // "-9" keeps the last month's half-month rows ("YYYY-MM-2" > "YYYY-MM").
      month: { gte: from <= to ? from : to, lte: `${from <= to ? to : from}-9` },
      ...(consultantId ? { consultantId } : {}),
    },
    select: { consultantId: true, month: true, siUrl: true, uploadedAt: true },
    orderBy: [{ month: 'asc' }],
  })
  return NextResponse.json({ submissions: rows })
}

// POST { consultantId, keys: ["YYYY-MM" | "YYYY-MM-1" | "YYYY-MM-2", ...], siUrl }
// Records a received Service Invoice. One invoice covering several periods
// upserts one row per whole month or half month, all pointing at the same
// uploaded copy and stamped with the same time, so the screen can show them
// as one invoice. `months` (whole months only) is still accepted.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { consultantId, months, keys, siUrl } = await req.json()
    if (!consultantId) return NextResponse.json({ error: 'consultantId is required' }, { status: 400 })
    const raw = Array.isArray(keys) ? keys : Array.isArray(months) ? months : []
    const list: string[] = [...new Set(raw.map((m: unknown) => String(m)).filter((m: string) => COVERAGE_KEY_RX.test(m)))]
    if (!list.length) return NextResponse.json({ error: 'Pick the period the invoice covers' }, { status: 400 })
    const url = typeof siUrl === 'string' && siUrl.trim() ? siUrl.trim() : null
    const consultant = await prisma.consultant.findUnique({ where: { id: consultantId }, select: { id: true } })
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

    const uploadedAt = new Date()
    await prisma.$transaction(list.map(month => prisma.consultantSiSubmission.upsert({
      where: { consultantId_month: { consultantId, month } },
      update: { siUrl: url, uploadedAt, createdById: session.user.id as string },
      create: { consultantId, month, siUrl: url, uploadedAt, createdById: session.user.id as string },
    })))
    return NextResponse.json({ ok: true, keys: list, uploadedAt: uploadedAt.toISOString() })
  } catch (e) {
    console.error('SI submission save error:', e)
    return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
  }
}

// DELETE ?consultantId=&keys=k1,k2 (or &month=k) — remove a wrongly recorded
// invoice: the rows it covers.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const consultantId = sp.get('consultantId') || ''
  const list = (sp.get('keys') || sp.get('month') || '').split(',').map(k => k.trim()).filter(k => COVERAGE_KEY_RX.test(k))
  if (!consultantId || !list.length) return NextResponse.json({ error: 'consultantId and keys are required' }, { status: 400 })
  await prisma.consultantSiSubmission.deleteMany({ where: { consultantId, month: { in: list } } })
  return NextResponse.json({ ok: true })
}
