import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadCancellationFees, pairFeesToLogs } from '@/lib/cancellation-fees'
import { DEPT_FOLLOWUP, TOLERANCE_DAYS } from '@/lib/followup-groups'

const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

async function hrFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  let lastErr: unknown = new Error('No HR URLs configured')
  for (const base of HR_URLS) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...opts,
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${HR_KEY}`, ...opts.headers },
      })
      return res
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

// Department-specific follow-up intervals (in days). Defined in
// lib/followup-groups.ts so this tab and the SMS follow-up audiences read the
// same rule; they used to be two copies that could silently disagree.

// Free cancellation allowance per 6-month window (before fees apply)
const FREE_CANCELLATIONS = 2
const CANCELLATION_WINDOW_DAYS = 180
// Total cancellations before slot removal
const MAX_CANCELLATIONS = 12
// Max no-shows per patient (slot removal at limit)
const MAX_NOSHOWS = 3

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const role = user?.role ?? ''
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'followup'

  // Branch scoping
  let branch = searchParams.get('branch') || ''
  if (role === 'AHEA_FRONT_DESK') branch = 'SANDBOX_EAST'
  else if (role === 'AHGH_FRONT_DESK') branch = 'SANDBOX_GREENHILLS'

  const branchFilter = branch ? { branches: { has: branch } } : undefined

  // ── WAITLIST TAB ──────────────────────────────────────────────
  if (tab === 'waitlist') {
    const formKey = searchParams.get('formKey') || 'registration'
    const FORM_TYPES: Record<string, { sbea: string; sbgh: string | null; title: string }> = {
      registration:  { sbea: 'GULaVBpI', sbgh: 'VaCB1bkE', title: 'Registration Form' },
      'group-therapy': { sbea: 'ChrSrsBF', sbgh: 'tT8QASYo', title: 'Group Therapy Registration' },
      sip:           { sbea: 'SGWVxqcW', sbgh: null, title: 'SIP Registration Form' }, // GH disabled — no ALAGA interns there yet
      psych:         { sbea: 'X2YDKTaH', sbgh: null, title: 'Psych Registration Form' },
    }

    const form = FORM_TYPES[formKey]
    if (!form) return NextResponse.json({ error: 'Unknown form' }, { status: 400 })

    // Fetch responses from HR platform
    const responses: any[] = []
    try {
      const res1 = await hrFetch(`/forms/external/${form.sbea}/responses`, { cache: 'no-store' })
      const d1 = await res1.json()
      if (d1.ok && d1.items) {
        for (const item of d1.items) {
          responses.push({ ...item, _branch: 'SBEA', _formTitle: form.title, _formId: form.sbea })
        }
      }

      if (form.sbgh) {
        const res2 = await hrFetch(`/forms/external/${form.sbgh}/responses`, { cache: 'no-store' })
        const d2 = await res2.json()
        if (d2.ok && d2.items) {
          for (const item of d2.items) {
            responses.push({ ...item, _branch: 'SBGH', _formTitle: form.title, _formId: form.sbgh })
          }
        }
      }
    } catch (err) {
      // Don't swallow — log it and surface to caller. Today's "Registration
      // Form empty" bug was the empty {} catch hiding a real fetch failure.
      console.error('[patient-relationship/waitlist] HR fetch failed:', err)
      return NextResponse.json({
        responses: [],
        total: 0,
        formTitle: form.title,
        _warning: `Could not reach HR Platform: ${(err as Error).message ?? 'unknown error'}`,
      })
    }

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

    // Fetch existing follow-up reminders for these patients in this dept —
    // so the UI can show a permanent "Sent" state after the first click.
    const patientIdsForDept = Array.from(patientMap.keys())
    const reminders = await prisma.followUpReminder.findMany({
      where: { patientId: { in: patientIdsForDept }, department: dept },
      select: { patientId: true, sentAt: true },
    })
    const reminderMap = new Map(reminders.map(r => [r.patientId, r.sentAt]))

    const results = Array.from(patientMap.values()).map(({ patient: p, firstSession, clinician }) => {
      // Reference date: firstDayOfConsult if set, otherwise first recorded session
      let referenceDate: Date
      let referenceSource: 'consult' | 'session'

      if ((p as any).firstDayOfConsult) {
        referenceDate = new Date((p as any).firstDayOfConsult)
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
        reminderSentAt: reminderMap.get(p.id) ?? null,
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

  // ── NO-SHOW TAB ──────────────────────────────────────────────
  if (tab === 'noshow') {
    const patients = await prisma.patient.findMany({
      where: branchFilter,
      include: {
        noShowLogs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { lastName: 'asc' },
    })

    const results = patients.map(p => {
      const activeLogs = p.noShowLogs.filter(l => !l.deletedAt)
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        branch: p.branches?.[0] || p.branch,
        noShowCount: activeLogs.length,
        logs: p.noShowLogs.map(l => ({
          id: l.id,
          remarks: l.remarks,
          createdAt: l.createdAt,
          deletedAt: l.deletedAt,
          deletedBy: l.deletedBy,
          deleteReason: l.deleteReason,
        })),
      }
    })

    // Sort: most no-shows first
    results.sort((a, b) => b.noShowCount - a.noShowCount)

    return NextResponse.json({ patients: results, total: results.length })
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
    // The free-cancellation allowance runs over the ROLLING last 6 months.
    //
    // It used to be anchored to firstDayOfConsult, which meant it only ever
    // measured a patient's FIRST 180 days. For anyone longer-standing than that
    // — most of the roster — every recent cancellation fell outside the window,
    // so the allowance read 0/2 no matter how many times they had cancelled last
    // month. The repeat cancellations the allowance exists to catch were exactly
    // the ones it stopped counting.
    const windowStart = new Date(today.getTime() - CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Whether each fee-bearing cancellation has been settled, from POS orders in
    // the Accounting Hub. One call for the whole page rather than per patient.
    // Null means we could not ask — rendered as "unknown", never as "unpaid".
    const feeIndex = await loadCancellationFees(
      patients.map(p => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
      windowStart.toISOString(),
      branch ? [branch] : null,
    )

    const results = patients.map(p => {
      const firstSession = p.schedules[0]
      const activeLogs = p.cancellationLogs.filter(l => !l.deletedAt)

      // What actually counts against the patient. Two things are excluded:
      //   - reschedules, which are logged here but are not cancellations
      //   - individual cancellations front desk waived when logging them
      // Everything else counts, including logs predating sourceStatus (NULL) —
      // treating those as cancellations keeps existing counts unchanged rather
      // than silently shrinking them.
      const countedLogs = activeLogs.filter(l =>
        l.sourceStatus !== 'RESCHEDULED' && l.countsToward !== false)

      // Lifetime count for slot removal (0/12) — deliberately NOT windowed.
      const totalUsed = countedLogs.length

      // Inside the rolling window, for the fee allowance (0/2).
      const windowLogs = countedLogs.filter(l => new Date(l.createdAt) >= windowStart)
      const windowUsed = windowLogs.length
      const freeRemaining = Math.max(0, FREE_CANCELLATIONS - windowUsed)

      // Which specific logs a fee is actually owed on: the 3rd onward inside the
      // window. Assigned OLDEST FIRST — the first two chronologically are the
      // free ones, so as the window rolls forward and an old log ages out, the
      // next one becomes free rather than the newest arbitrarily being charged.
      // Ordering by id or by insertion would make "which two were free" drift.
      const feeBearingLogs = [...windowLogs]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(FREE_CANCELLATIONS)
      const feeBearingIds = new Set(feeBearingLogs.map(l => l.id))

      // Settled fees, oldest cancellation paired with oldest payment.
      const paidFees = feeIndex
        ? pairFeesToLogs(feeBearingLogs, feeIndex.byPatient.get(p.id) ?? [])
        : new Map()

      // A patient can have a long history and still have nothing inside the
      // window. Left unsaid, a 0/2 sitting next to a lifetime total of 7 reads
      // like the log was wiped, so the UI gets what it needs to say "lapsed".
      // The most recent log that COUNTS — quoting a reschedule or a waived entry
      // here would explain the 0/2 with a row that was never part of it.
      const lastLogAt = countedLogs[0]?.createdAt ?? null   // logs come back desc
      const windowLapsed = totalUsed > 0 && windowUsed === 0
      const daysSinceLastLog = lastLogAt
        ? Math.floor((today.getTime() - new Date(lastLogAt).getTime()) / (1000 * 60 * 60 * 24))
        : null

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        branch: p.branches?.[0] || p.branch,
        firstSessionDate: firstSession?.date || null,
        cancellationsUsed: totalUsed,
        cancellationsRemaining: Math.max(0, MAX_CANCELLATIONS - totalUsed),
        windowUsed,
        freeRemaining,
        windowStart,
        windowLapsed,
        lastLogAt,
        daysSinceLastLog,
        logs: p.cancellationLogs.map(l => ({
          id: l.id,
          type: l.type,
          // Lets the log list show which entries still count toward the 0/2.
          inWindow: !l.deletedAt && new Date(l.createdAt) >= windowStart,
          sourceStatus: l.sourceStatus,
          countsToward: l.countsToward,
          excludeReason: l.excludeReason,
          // True when a cancellation fee is owed on THIS log (3rd onward in the
          // rolling window). Free ones and non-counting rows are never fee-bearing.
          feeBearing: feeBearingIds.has(l.id),
          // The POS order that settled it, when one was found.
          feePaid: paidFees.get(l.id)
            ? {
                orderNumber: paidFees.get(l.id)!.orderNumber,
                paidAt: paidFees.get(l.id)!.paidAt,
                amount: paidFees.get(l.id)!.amount,
                lineName: paidFees.get(l.id)!.lineName,
              }
            : null,
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

    return NextResponse.json({
      patients: results,
      total: results.length,
      // ok:false = the Accounting Hub could not be reached. The UI must show
      // "not checked", never "unpaid" — a failed fetch must not send front desk
      // to collect money a patient has already handed over.
      feeLookup: feeIndex
        ? { ok: true, patterns: feeIndex.patterns, matched: feeIndex.total }
        : { ok: false },
    })
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

  // No-show log creation
  if (body.tab === 'noshow') {
    const { patientId, branch, remarks, scheduleId } = body
    if (!patientId || !branch) {
      return NextResponse.json({ error: 'patientId, branch required' }, { status: 400 })
    }
    // Logged from a Clinic Schedule status change: a status can be edited back
    // and forth (mis-click, patient turns up late), and each pass through
    // NO_SHOW must not stack another log on the patient's record. Deleted logs
    // are ignored so a deliberate delete-then-relog still works.
    if (scheduleId) {
      const existing = await prisma.noShowLog.findFirst({
        where: { scheduleId, deletedAt: null },
      })
      if (existing) return NextResponse.json({ ok: true, log: existing, deduped: true })
    }
    const log = await prisma.noShowLog.create({
      data: { patientId, branch, remarks, scheduleId: scheduleId || null },
    })
    return NextResponse.json({ ok: true, log })
  }

  // Cancellation log creation
  const { patientId, type, branch, remarks, scheduleId } = body
  if (!patientId || !type || !branch) {
    return NextResponse.json({ error: 'patientId, type, branch required' }, { status: 400 })
  }

  const isValid = type.includes('VALID') && !type.includes('INVALID')

  // Same dedupe as no-shows above: one log per session, so toggling a status
  // does not charge a patient twice.
  if (scheduleId) {
    const existing = await prisma.cancellationLog.findFirst({
      where: { scheduleId, deletedAt: null },
    })
    if (existing) return NextResponse.json({ ok: true, log: existing, deduped: true })
  }

  // A waiver must carry its reason, or the count quietly shrinks with nothing on
  // record saying who decided that or why. No reason given → it counts.
  const excludeReason = typeof body.excludeReason === 'string' ? body.excludeReason.trim() : ''
  const countsToward = body.countsToward === false && excludeReason ? false : true

  const log = await prisma.cancellationLog.create({
    data: {
      patientId, type, branch, isValid, remarks,
      scheduleId: scheduleId || null,
      // "CANCELLED" | "RESCHEDULED" — what the session status actually was.
      // Reschedules are recorded but never counted; see the cancellation tab.
      sourceStatus: body.sourceStatus === 'RESCHEDULED' ? 'RESCHEDULED'
        : body.sourceStatus === 'CANCELLED' ? 'CANCELLED' : null,
      countsToward,
      excludeReason: countsToward ? null : excludeReason,
    },
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
      const res = await hrFetch(`/forms/external/${formId}/responses/${submissionId}`, { method: 'DELETE' })
      if (res.ok) return NextResponse.json({ ok: true })
      return NextResponse.json({ error: 'Failed to delete from HR' }, { status: 500 })
    } catch {
      return NextResponse.json({ error: 'HR platform unreachable' }, { status: 500 })
    }
  }

  // Delete no-show log (soft delete)
  if (tab === 'noshow-delete') {
    const logId = searchParams.get('logId')
    const reason = searchParams.get('reason') || ''
    if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })
    await prisma.noShowLog.update({
      where: { id: logId },
      data: {
        deletedAt: new Date(),
        deletedBy: user?.name || user?.email || 'Unknown',
        deleteReason: reason,
      },
    })
    return NextResponse.json({ ok: true })
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
