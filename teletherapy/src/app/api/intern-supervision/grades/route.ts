/**
 * Intern grades encoded by the current supervisor. One grade + optional
 * computation file per intern (per supervisor). Interns must be decked to the
 * supervisor (Ops Hub) to be gradable.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function myDeckedInternIds(user: { role?: string; staffId?: string; branches?: { staffId: string }[] }) {
  const isAdmin = user.role === 'ADMIN'
  const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
  const staffPool = myStaffIds.length > 0 ? myStaffIds : ([user.staffId].filter(Boolean) as string[])
  const deck = await prisma.schedule.findMany({
    where: { internStaffId: { not: null }, ...(isAdmin ? {} : { staffId: { in: staffPool } }) },
    select: { internStaffId: true },
    distinct: ['internStaffId'],
  })
  return deck.map((d) => d.internStaffId).filter((x): x is string => !!x)
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const internIds = await myDeckedInternIds(session.user as never)
  if (internIds.length === 0) return NextResponse.json({ grades: {} })

  // @ts-ignore — internGrade
  const rows = await prisma.internGrade.findMany({
    where: { internStaffId: { in: internIds }, supervisorAccountId: session.user.id },
  })
  const grades: Record<string, unknown> = {}
  for (const r of rows as { internStaffId: string }[]) grades[r.internStaffId] = r
  return NextResponse.json({ grades })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { internStaffId?: string; grade?: string; note?: string; fileName?: string; filePath?: string; mimeType?: string }
    | null
  if (!body?.internStaffId) return NextResponse.json({ error: 'internStaffId required' }, { status: 400 })
  const grade = (body.grade ?? '').trim()
  if (!grade) return NextResponse.json({ error: 'Please enter a grade.' }, { status: 400 })

  // Must supervise this intern.
  const internIds = await myDeckedInternIds(session.user as never)
  if (!internIds.includes(body.internStaffId)) {
    return NextResponse.json({ error: 'You do not supervise this intern.' }, { status: 403 })
  }

  const acct = await prisma.therapistAccount.findUnique({
    where: { id: session.user.id },
    include: { staff: { select: { firstName: true, lastName: true } } },
  })
  const gradedByName = acct?.staff ? `${acct.staff.firstName} ${acct.staff.lastName}` : (session.user.name ?? null)

  const data = {
    grade,
    note: body.note?.trim() || null,
    gradedByName,
    // Only overwrite the file when a new one was uploaded (filePath present).
    ...(body.filePath ? { fileName: body.fileName ?? null, filePath: body.filePath, mimeType: body.mimeType ?? null } : {}),
  }

  // @ts-ignore — internGrade
  const saved = await prisma.internGrade.upsert({
    where: { internStaffId_supervisorAccountId: { internStaffId: body.internStaffId, supervisorAccountId: session.user.id } },
    create: { internStaffId: body.internStaffId, supervisorAccountId: session.user.id, ...data },
    update: data,
  })
  return NextResponse.json({ grade: saved })
}
