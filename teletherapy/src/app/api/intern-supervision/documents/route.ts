/**
 * Internship documents (supervision guides, forms specific to the internship).
 * Department-scoped: a supervisor sees the documents uploaded by any supervisor
 * in their own department. Admins see all (optionally filtered by ?department=).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function currentStaff(accountId: string) {
  const acct = await prisma.therapistAccount.findUnique({
    where: { id: accountId },
    include: { staff: { select: { department: true, firstName: true, lastName: true } } },
  })
  return acct?.staff ?? null
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = session.user.role === 'ADMIN'
  const staff = await currentStaff(session.user.id)
  const department = isAdmin ? (req.nextUrl.searchParams.get('department') || undefined) : staff?.department
  if (!isAdmin && !department) return NextResponse.json({ documents: [] })

  // @ts-ignore — internshipDocument
  const documents = await prisma.internshipDocument.findMany({
    where: department ? { department } : {},
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ documents, department: department ?? null })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const staff = await currentStaff(session.user.id)
  const isAdmin = session.user.role === 'ADMIN'
  if (!staff?.department && !isAdmin) return NextResponse.json({ error: 'No department on your record.' }, { status: 400 })

  const body = await req.json().catch(() => null) as
    | { title?: string; description?: string; fileName?: string; filePath?: string; mimeType?: string; department?: string }
    | null
  if (!body?.title?.trim()) return NextResponse.json({ error: 'Please add a title.' }, { status: 400 })
  if (!body.filePath || !body.fileName) return NextResponse.json({ error: 'Please attach a file.' }, { status: 400 })

  const department = staff?.department ?? body.department
  if (!department) return NextResponse.json({ error: 'Department required.' }, { status: 400 })

  // @ts-ignore — internshipDocument
  const created = await prisma.internshipDocument.create({
    data: {
      department,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      fileName: body.fileName,
      filePath: body.filePath,
      mimeType: body.mimeType ?? null,
      uploadedByAccountId: session.user.id,
      uploadedByName: staff ? `${staff.firstName} ${staff.lastName}` : (session.user.name ?? 'Supervisor'),
    },
  })
  return NextResponse.json({ document: created })
}
