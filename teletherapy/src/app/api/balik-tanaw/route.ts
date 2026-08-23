/**
 * Balik-Tanaw — an intern's own weekly reflections (list + submit).
 * Only INTERN accounts write here; the matching supervisor view lives at
 * /api/intern-supervision/balik-tanaw.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { questionsForDepartment } from '@/lib/balik-tanaw-questions'

async function currentStaff(accountId: string) {
  const acct = await prisma.therapistAccount.findUnique({
    where: { id: accountId },
    include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
  })
  return acct?.staff ?? null
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const staff = await currentStaff(session.user.id)
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 400 })

  // @ts-ignore — balikTanaw may not be in generated client until first generate
  const entries = await prisma.balikTanaw.findMany({
    where: { internStaffId: staff.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({
    entries,
    department: staff.department,
    questions: questionsForDepartment(staff.department),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.accountType !== 'INTERN') {
    return NextResponse.json({ error: 'Only interns can submit a Balik-Tanaw.' }, { status: 403 })
  }
  const staff = await currentStaff(session.user.id)
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 400 })

  const body = await req.json().catch(() => null) as
    | { periodLabel?: string; answers?: { question: string; answer: string }[]; internSignedName?: string }
    | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const periodLabel = (body.periodLabel ?? '').trim()
  const internSignedName = (body.internSignedName ?? '').trim()
  const answers = Array.isArray(body.answers) ? body.answers : []
  if (!periodLabel) return NextResponse.json({ error: 'Please label the week.' }, { status: 400 })
  if (!internSignedName) return NextResponse.json({ error: 'Please sign with your name.' }, { status: 400 })
  if (answers.length === 0 || answers.every((a) => !a.answer?.trim())) {
    return NextResponse.json({ error: 'Please answer at least one question.' }, { status: 400 })
  }

  // @ts-ignore — balikTanaw
  const created = await prisma.balikTanaw.create({
    data: {
      internStaffId: staff.id,
      department: staff.department,
      periodLabel,
      answers,
      internSignedName,
    },
  })
  return NextResponse.json({ entry: created })
}
