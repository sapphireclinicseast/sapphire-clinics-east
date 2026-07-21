import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendTransactionalEmail } from '@/lib/transactional-email'

const APP_URL = process.env.NEXTAUTH_URL || 'https://operations.sapphireclinicseast.org'

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}

const FORM_TYPE_LABEL: Record<string, string> = {
  HR08_ADMIN: 'HR08 Admin Evaluation',
  HR08_PEER:  'HR08 Peer Evaluation',
  HR09:       'HR09 Evaluation',
  HR09_CLINICAL: 'HR09 Clinical Evaluation',
  HR09_ADMIN: 'HR09 Admin Evaluation',
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

/** GET — return email log entries for a given branch/year/month context */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')
  const year   = searchParams.get('year')   ? parseInt(searchParams.get('year')!)   : undefined
  const month  = searchParams.get('month')  ? parseInt(searchParams.get('month')!)  : undefined

  const logs = await prisma.peerEvalEmailLog.findMany({
    where: {
      ...(branch ? { branch } : {}),
      ...(year   !== undefined ? { periodYear: year }   : {}),
      ...(month  !== undefined ? { periodMonth: month } : {}),
    },
    select: { assessorId: true, sentAt: true, sentBy: true },
  })
  return NextResponse.json(logs)
}

/** POST — send reminder email to an assessor and record it */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role))
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { assessorId, branch, periodYear, periodMonth } = await req.json()
  if (!assessorId || !branch || periodYear == null || periodMonth == null)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // Fetch assessor with email
  const assessor = await prisma.staff.findUnique({
    where: { id: assessorId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  if (!assessor)  return NextResponse.json({ error: 'Assessor not found' }, { status: 404 })
  if (!assessor.email)
    return NextResponse.json({ error: `${assessor.firstName} ${assessor.lastName} has no email address on file.` }, { status: 422 })

  // Fetch their pending assignments for this period
  const assignments = await prisma.peerEvalAssignment.findMany({
    where: {
      assessorId,
      branch,
      periodYear,
      periodMonth,
      status: 'PENDING',
    },
    include: {
      assessee: { select: { firstName: true, lastName: true, department: true } },
    },
    orderBy: { assessee: { lastName: 'asc' } },
  })

  const periodLabel = periodMonth > 0
    ? `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`
    : `Year ${periodYear}`

  const formUrl = `${APP_URL}/peereval?branch=${branch}&staffId=${assessorId}`

  const assesseeRows = assignments.map(a => {
    const formLabel = FORM_TYPE_LABEL[a.formType] ?? a.formType
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:500;color:#0f172a">${a.assessee.firstName} ${a.assessee.lastName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${a.assessee.department}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${formLabel}</td>
    </tr>`
  }).join('')

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 20px;color:#0f172a">
  <div style="margin-bottom:20px">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1a7b8a;margin-bottom:4px">Sapphire Clinics East · Peer Evaluation</div>
    <h2 style="margin:0;font-size:20px;color:#0f172a">Hi ${assessor.firstName},</h2>
  </div>

  <p style="color:#374151;line-height:1.6">
    This is a reminder that you have <strong>${assignments.length} pending peer evaluation${assignments.length === 1 ? '' : 's'}</strong>
    to complete for <strong>${periodLabel}</strong> at ${BRANCH_LABEL[branch] ?? branch}.
  </p>

  <div style="text-align:center;margin:28px 0">
    <a href="${formUrl}"
       style="background:#1a7b8a;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
      Open My Peer Evaluation Forms
    </a>
  </div>

  <p style="color:#374151;font-weight:600;margin:0 0 8px">You are assigned to evaluate:</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
    <thead>
      <tr style="background:#f8fafc">
        <th style="padding:8px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0">Name</th>
        <th style="padding:8px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0">Department</th>
        <th style="padding:8px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0">Form</th>
      </tr>
    </thead>
    <tbody>${assesseeRows || '<tr><td colspan="3" style="padding:12px;color:#9ca3af;text-align:center">No pending assessments</td></tr>'}</tbody>
  </table>

  <p style="color:#64748b;font-size:12px;margin-top:20px;line-height:1.5">
    If the button above doesn't work, paste this link in your browser:<br>
    <a href="${formUrl}" style="color:#1a7b8a;word-break:break-all">${formUrl}</a>
  </p>

  <p style="color:#94a3b8;font-size:11px;margin-top:28px;padding-top:16px;border-top:1px solid #f1f5f9">
    Sapphire Clinics East · Internal Operations · This is an automated reminder.
  </p>
</div>`

  await sendTransactionalEmail({
    to: assessor.email,
    subject: `Peer Evaluation Reminder — ${assignments.length} pending for ${periodLabel}`,
    html,
  })

  // Upsert log (idempotent — last send wins)
  const log = await prisma.peerEvalEmailLog.upsert({
    where: {
      assessorId_branch_periodYear_periodMonth: { assessorId, branch, periodYear, periodMonth },
    },
    create: {
      assessorId,
      branch,
      periodYear,
      periodMonth,
      sentBy: (session.user as { name?: string; email?: string }).name ?? (session.user as { email?: string }).email ?? undefined,
    },
    update: {
      sentAt: new Date(),
      sentBy: (session.user as { name?: string; email?: string }).name ?? (session.user as { email?: string }).email ?? undefined,
    },
  })

  return NextResponse.json({ sentAt: log.sentAt })
}
