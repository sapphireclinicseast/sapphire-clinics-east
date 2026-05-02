import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// Authorization: ensure the requester has a legitimate reason to read this file.
// The path always starts with one of:
//   - session-notes/<scheduleId>/...
//   - patient-docs/<patientId>/...
async function authorizeFileAccess(
  segments: string[],
  user: { id: string; role: string; staffId: string; branches?: any[] }
): Promise<boolean> {
  if (user.role === 'ADMIN') return true

  const allowedStaffIds = (user.branches ?? []).map((b: any) => b.staffId)
  if (allowedStaffIds.length === 0) allowedStaffIds.push(user.staffId)

  const [bucket, resourceId] = segments

  if (bucket === 'session-notes' && resourceId) {
    // Allow if user staffs the schedule (any branch) OR endorsed for the patient
    const schedule = await prisma.schedule.findUnique({
      where: { id: resourceId },
      select: { staffId: true, patientId: true },
    })
    if (!schedule) return false
    if (allowedStaffIds.includes(schedule.staffId)) return true
    if (schedule.patientId) {
      const endorsed = await prisma.patientAssignment.findFirst({
        where: { patientId: schedule.patientId, therapistAccountId: user.id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (endorsed) return true
    }
    return false
  }

  if (bucket === 'patient-docs' && resourceId) {
    // Allow if user has a session with the patient OR is endorsed to them
    const hasSession = await prisma.schedule.findFirst({
      where: { patientId: resourceId, staffId: { in: allowedStaffIds } },
      select: { id: true },
    })
    if (hasSession) return true
    const endorsed = await prisma.patientAssignment.findFirst({
      where: { patientId: resourceId, therapistAccountId: user.id, status: 'ACTIVE' },
      select: { id: true },
    })
    return !!endorsed
  }

  // Default: deny unknown buckets for non-admins
  return false
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Require authentication to access any uploaded file
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path: segments } = await params

  // Per-resource authorization (HIPAA-style — clinicians only access their own patients' files)
  try {
    const allowed = await authorizeFileAccess(segments, session.user as any)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const filePath = path.join(UPLOAD_DIR, ...segments)

  // Prevent path traversal
  const resolved = path.resolve(filePath)
  const uploadRoot = path.resolve(UPLOAD_DIR)
  if (!resolved.startsWith(uploadRoot)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream'

  const buffer = await readFile(resolved)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
