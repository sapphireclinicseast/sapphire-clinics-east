import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

// Department-specific follow-up intervals (in days)
const DEPT_FOLLOWUP: Record<string, { days: number; label: string }> = {
  PSYCHOLOGY: { days: 90,  label: '3 months of no consult' },
  PT:         { days: 60,  label: 'Should consult with MD after 2 months' },
  OT:         { days: 180, label: 'Reconsult with Developmental Pediatrician after 6 months' },
  SLP:        { days: 180, label: 'Reconsult with Developmental Pediatrician after 6 months' },
  SPED:       { days: 180, label: 'Reconsult with Developmental Pediatrician after 6 months' },
}
const TOLERANCE_DAYS = 7

// Max cancellations per patient per 6-month window
const MAX_CANCELLATIONS = 2
const CANCELLATION_WINDOW_DAYS = 180

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const role = user?.role ?? ''
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'followup'

  // Branch scoping
  let branch = searchParams.get('branch') || ''
  if (role === 'SBEA_FRONT_DESK') branch = 'SANDBOX_EAST'
  else if (role === 'SBGH_FRONT_DESK') branch = 'SANDBOX_GREENHILLS'

  const branchFilter = branch ? { branches: { has: branch } } : undefined

  // ── WAITLIST TAB ──────────────────────────────────────────────
  if (tab === 'waitlist') {
    const formKey = searchParams.get('formKey') || 'registration'
    const FORM_TYPES: Record<string, { sbea: string; sbgh: string | null; title: string }> = {
      registration:  { sbea: 'GULaVBpI', sbgh: 'VaCB1bkE', title: 'Registration Form' },
      'group-therapy': { sbea: 'ChrSrsBF', sbgh: null, title: 'Group Therapy Registration' },
      sip:           { sbea: 'SGWVxqcW', sbgh: null, title: 'SIP Registration Form' },
      psych:         { sbea: 'X2YDKTaH', sbgh: null, title: 'Psych Registration Form' },
    }

    const form = FORM_TYPES[formKey]
    if (!form) return NextResponse.json({ error: 'Unknown form' }, { status: 400 })

    // Fetch responses from HR platform
    const responses: any[] = []
    try {
      const res1 = await fetch(`${HR_URL}/forms/external/${form.sbea}/responses`, {
        headers: { Authorization: `Bearer ${HR_KEY}` }, cache: 'no-store',
      })
      const d1 = await res1.json()
      if (d1.ok && d1.items) {
        for (const item of d1.items) {
          responses.push({ ...item, _branch: 'SBEA', _formTitle: form.title, _formId: form.sbea })
        }
      }

      if (form.sbgh) {
        const res2 = await fetch(`${HR_URL}/forms/external/${form.sbgh}/responses`, {
          headers: { Authorization: `Bearer ${HR_KEY}` }, cache: 'no-store',
        })
        const d2 = await res2.json()
        if (d2.ok && d2.items) {
          for (const item of d2.items) {
            responses.push({ ...item, _branch: 'SBGH', _formTitle: form.title, _formId: form.sbgh })
          }
        }
      }
    } catch {}

    // Filter by branch if needed
    let filtered = responses
    if (branch === 'SANDBOX_EAST') filtered = responses.filter(r => r._branch === 'SBEA')
    else if (branch === 'SANDBOX_GREENHILLS') filtered = responses.filter(r => r._branch === 'SBGH')

    // Sort by submitted_at desc
    filtered.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())

    return NextResponse.json({ responses: filtered, total: filtered.length, formTitle: form.title })
  }

  // ── FOLLOW UP TAB ─────────────────────────────────────────────
  if (tab === 'followup') {
    const dept = searchParams.get('dept') || 'PT'
    const interval = DEPT_FOLLOWUP[dept]
    if (!interval) return NextResponse.json({ error: 'Unknown department' }, { status: 400 })

    // Get patients with their first schedule in this department
    const schedules = await prisma.schedule.findMany({
      where: {
        staff: { department: dept },
        patient: branchFilter ? { ...branchFilter } : undefined,
        patientId: { not: null },
      },
      include: {
        patient: true,
        staff: { select: { firstName: true, lastName: true, department: true } },
      },
      orderBy: { date: 'asc' },
    })

    // Group by patient to get first session per patient
    const patientMap = new Map<string, any>()
    for (const s of schedules) {
      if (!s.patientId || !s.patient) continue
      if (!patientMap.has(s.patientId)) {
        patientMap.set(s.patientId, {
          patient: s.patient,
          firstSession: s,
          clinician: s.staff,
        })
      }
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const results = Array.from(patientMap.values()).map(({ patient: p, firstSession, clinician }) => {
      // Reference date: doctorConsultDate if set, otherwise first session
      let referenceDate: Date
      let referenceSource: 'consult' | 'session'

      if (p.doctorConsultDate) {
        referenceDate = new Date(p.doctorConsultDate)
        referenceSource = 'consult'
      } else {
        referenceDate = new Date(firstSession.date)
        referenceSource = 'session'
      }

      const daysSince = Math.floor((today.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
      const dueIn = interval.days - daysSince

      let status: 'due' | 'upcoming' | 'ok' | 'overdue' = 'ok'
      if (dueIn >= -TOLERANCE_DAYS && dueIn <= TOLERANCE_DAYS) status = 'due'
      else if (dueIn < -TOLERANCE_DAYS) status = 'overdue'
      else if (dueIn <= 14) status = 'upcoming'

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        branch: p.branches?.[0] || p.branch,
        clinicianName: `${clinician.lastName}, ${clinician.firstName}`,
        firstSessionDate: firstSession.date,
        referenceDate: referenceDate.toISOString(),
        referenceSource,
        daysSince,
        dueIn,
        status,
      }
    })

    // Sort: due/overdue first, then upcoming, then ok
    const order = { overdue: 0, due: 1, upcoming: 2, ok: 3 }
    results.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))

    return NextResponse.json({
      patients: results,
      total: results.length,
      interval,
      dept,
      summary: {
        due: results.filter(r => r.status === 'due').length,
        overdue: results.filter(r => r.status === 'overdue').length,
        upcoming: results.filter(r => r.status === 'upcoming').length,
        ok: results.filter(r => r.status === 'ok').length,
      },
    })
  }

  // ── CANCELLATION TAB ─────────────────────────────────────────
  if (tab === 'cancellation') {
    const patients = await prisma.patient.findMany({
      where: branchFilter,
      include: {
        schedules: { orderBy: { date: 'asc' }, take: 1 },
        cancellationLogs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { lastName: 'asc' },
    })

    const today = new Date()

    const results = patients.map(p => {
      // 6-month window starts from first session date
      const firstSession = p.schedules[0]
      const windowStart = firstSession ? new Date(firstSession.date) : null

      // Count active (non-deleted) cancellation logs within window
      const activeLogs = p.cancellationLogs.filter(l => !l.deletedAt)
      const windowLogs = windowStart
        ? activeLogs.filter(l => {
            const logDate = new Date(l.createdAt)
            const daysSince = (logDate.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24)
            return daysSince >= 0 && daysSince <= CANCELLATION_WINDOW_DAYS
          })
        : activeLogs

      const used = windowLogs.length
      const remaining = Math.max(0, MAX_CANCELLATIONS - used)

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        branch: p.branches?.[0] || p.branch,
        firstSessionDate: firstSession?.date || null,
        cancellationsUsed: used,
        cancellationsRemaining: remaining,
        logs: p.cancellationLogs.map(l => ({
          id: l.id,
          type: l.type,
          isValid: l.isValid,
          proofUrl: l.proofUrl,
          remarks: l.remarks,
          createdAt: l.createdAt,
          deletedAt: l.deletedAt,
          deletedBy: l.deletedBy,
          deleteReason: l.deleteReason,
        })),
      }
    })

    return NextResponse.json({ patients: results, total: results.length })
  }

  return NextResponse.json({ error: 'Unknown tab' }, { status: 400 })
}

// ── POST: Create cancellation log or upload proof ────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') || ''

  // Handle file upload (multipart)
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const logId = formData.get('logId') as string
    const file = formData.get('file') as File
    if (!logId || !file) return NextResponse.json({ error: 'logId and file required' }, { status: 400 })

    // Save file
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      const uploadDir = process.env.UPLOAD_DIR || '/app/uploads'
      const cancDir = path.join(uploadDir, 'cancellations')
      await fs.mkdir(cancDir, { recursive: true })

      const ext = file.name.split('.').pop() || 'bin'
      const fileName = `${logId}-${Date.now()}.${ext}`
      const filePath = path.join(cancDir, fileName)
      const buffer = Buffer.from(await file.arrayBuffer())
      await fs.writeFile(filePath, buffer)

      const proofUrl = `/uploads/cancellations/${fileName}`
      await prisma.cancellationLog.update({
        where: { id: logId },
        data: { proofUrl },
      })

      return NextResponse.json({ ok: true, proofUrl })
    } catch (err: any) {
      console.error('Upload proof error:', err)
      return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 })
    }
  }

  // Handle JSON body (create log)
  const body = await req.json()
  const { patientId, type, branch, remarks } = body
  if (!patientId || !type || !branch) {
    return NextResponse.json({ error: 'patientId, type, branch required' }, { status: 400 })
  }

  const isValid = type.includes('VALID') && !type.includes('INVALID')

  const log = await prisma.cancellationLog.create({
    data: { patientId, type, branch, isValid, remarks },
  })

  return NextResponse.json({ ok: true, log })
}

// ── DELETE: Soft-delete a cancellation log ───────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab')

  // Delete waitlist entry (HR form response)
  if (tab === 'waitlist-delete') {
    const formId = searchParams.get('formId')
    const submissionId = searchParams.get('submissionId')
    if (!formId || !submissionId) return NextResponse.json({ error: 'formId and submissionId required' }, { status: 400 })
    try {
      const res = await fetch(`${HR_URL}/forms/external/${formId}/responses/${submissionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${HR_KEY}` },
      })
      if (res.ok) return NextResponse.json({ ok: true })
      return NextResponse.json({ error: 'Failed to delete from HR' }, { status: 500 })
    } catch {
      return NextResponse.json({ error: 'HR platform unreachable' }, { status: 500 })
    }
  }

  // Delete cancellation log (soft delete)
  const logId = searchParams.get('logId')
  const reason = searchParams.get('reason') || ''

  if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })

  await prisma.cancellationLog.update({
    where: { id: logId },
    data: {
      deletedAt: new Date(),
      deletedBy: user?.name || user?.email || 'Unknown',
      deleteReason: reason,
    },
  })

  return NextResponse.json({ ok: true })
}
