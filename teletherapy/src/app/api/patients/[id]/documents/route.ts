import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'image/jpeg',
  'image/png',
  'image/webp',
]

const VALID_DOC_TYPES = ['INITIAL_EVALUATION', 'PROGRESS_REPORT', 'OTHER_DOCUMENT'] as const

// Helper: get clinician's department from their account
async function getClinicianDepartment(userId: string): Promise<string | null> {
  const acct = await prisma.therapistAccount.findUnique({
    where: { id: userId },
    include: { staff: { select: { department: true } } },
  })
  return acct?.staff?.department ?? null
}

// GET — list documents for this patient (filtered by clinician's department)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId } = await params
  const isAdmin = session.user.role === 'ADMIN'
  const department = isAdmin
    ? req.nextUrl.searchParams.get('department')
    : await getClinicianDepartment(session.user.id)

  if (!isAdmin && !department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 400 })
  }

  // Verify clinician has access to this patient (any branch staffId or endorsed)
  if (!isAdmin) {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    const hasSession = await prisma.schedule.findFirst({
      where: {
        patientId,
        staffId: { in: allowedStaffIds.length > 0 ? allowedStaffIds : [session.user.staffId] },
      },
      select: { id: true },
    })
    const hasEndorsement = await prisma.patientAssignment.findFirst({
      where: {
        patientId,
        therapistAccountId: session.user.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    if (!hasSession && !hasEndorsement) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // @ts-ignore — patientDocument may not be in generated client until first push
  const documents = await prisma.patientDocument.findMany({
    where: {
      patientId,
      ...(department ? { department } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ documents })
}

// POST — upload a new document
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId } = await params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const documentType = formData.get('documentType') as string
  const description = formData.get('description') as string | null
  const scheduleId = (formData.get('scheduleId') as string) || null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!VALID_DOC_TYPES.includes(documentType as any)) {
    return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, Word, JPEG, PNG, WebP' }, { status: 400 })
  }

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 25MB.' }, { status: 400 })
  }

  const department = await getClinicianDepartment(session.user.id)
  if (!department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 400 })
  }

  // Save file to disk
  const dir = path.join(UPLOAD_DIR, 'patient-docs', patientId)
  await mkdir(dir, { recursive: true })

  const ext = file.name.split('.').pop() ?? 'bin'
  const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const filePath = path.join('patient-docs', patientId, safeFileName)
  const fullPath = path.join(UPLOAD_DIR, filePath)

  const bytes = await file.arrayBuffer()
  await writeFile(fullPath, Buffer.from(bytes))

  // @ts-ignore
  const doc = await prisma.patientDocument.create({
    data: {
      patientId,
      uploadedById: session.user.id,
      department,
      documentType: documentType as any,
      fileName: file.name,
      filePath,
      mimeType: file.type,
      description: description || null,
      scheduleId: scheduleId || null,
    },
  })

  return NextResponse.json({ document: doc }, { status: 201 })
}
