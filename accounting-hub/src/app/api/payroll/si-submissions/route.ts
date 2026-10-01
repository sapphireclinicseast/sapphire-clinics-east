import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MONTH_RX = /^\d{4}-\d{2}$/

// GET /api/payroll/si-submissions?from=YYYY-MM&to=YYYY-MM[&consultantId=]
// Service-invoice submissions in a month range — the compliance matrix and the
// tracking rows both read from here.
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
      month: { gte: from <= to ? from : to, lte: from <= to ? to : from },
      ...(consultantId ? { consultantId } : {}),
    },
    select: { consultantId: true, month: true, siUrl: true, uploadedAt: true },
    orderBy: [{ month: 'asc' }],
  })
  return NextResponse.json({ submissions: rows })
}

// POST { consultantId, months: ["YYYY-MM", ...], siUrl }
// Records a received Service Invoice. One invoice covering several months
// upserts one row per month, all pointing at the same uploaded copy.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { consultantId, months, siUrl } = await req.json()
    if (!consultantId) return NextResponse.json({ error: 'consultantId is required' }, { status: 400 })
    const list: string[] = [...new Set((Array.isArray(months) ? months : []).filter((m: unknown) => MONTH_RX.test(String(m))))]
    if (!list.length) return NextResponse.json({ error: 'months is required (YYYY-MM)' }, { status: 400 })
    const url = typeof siUrl === 'string' && siUrl.trim() ? siUrl.trim() : null
    const consultant = await prisma.consultant.findUnique({ where: { id: consultantId }, select: { id: true } })
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

    for (const month of list) {
      await prisma.consultantSiSubmission.upsert({
        where: { consultantId_month: { consultantId, month } },
        update: { siUrl: url, uploadedAt: new Date(), createdById: session.user.id as string },
        create: { consultantId, month, siUrl: url, createdById: session.user.id as string },
      })
    }
    return NextResponse.json({ ok: true, months: list })
  } catch (e) {
    console.error('SI submission save error:', e)
    return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
  }
}

// DELETE ?consultantId=&month=YYYY-MM — unmark a month (wrong upload).
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const consultantId = sp.get('consultantId') || ''
  const month = sp.get('month') || ''
  if (!consultantId || !MONTH_RX.test(month)) return NextResponse.json({ error: 'consultantId and month are required' }, { status: 400 })
  await prisma.consultantSiSubmission.deleteMany({ where: { consultantId, month } })
  return NextResponse.json({ ok: true })
}
