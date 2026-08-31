import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeSendCampaign } from '@/lib/email'
import { scheduleEmail } from '@/lib/queue'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subject, body, recipientGroup, gmailAccountId, scheduledAt, branches, ccEmails } = await req.json()

  if (!subject || !body) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }

  // Optional "copy me" address(es). Accept comma/semicolon separated, validate
  // each, and store normalised — an invalid address here must fail loudly
  // rather than silently dropping the operator's copy at send time.
  let ccNormalised: string | null = null
  if (typeof ccEmails === 'string' && ccEmails.trim()) {
    const parts = ccEmails.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean)
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const bad = parts.find((e: string) => !re.test(e))
    if (bad) {
      return NextResponse.json({ error: `Invalid CC email address: ${bad}` }, { status: 400 })
    }
    ccNormalised = parts.join(',')
  }

  // Resolve recipient IDs with raw SQL branch filter (avoids enum array type mismatch)
  const hasBranchFilter = Array.isArray(branches) && branches.length > 0
  let patientIds: string[] | null = null
  if (hasBranchFilter) {
    const placeholders = branches.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT id FROM "Patient" WHERE branch::text = ANY(ARRAY[${placeholders}]) OR "branches"::text[] && ARRAY[${placeholders}]`,
      ...branches,
    )
    patientIds = rows.map((r: { id: string }) => r.id)
  }

  // Resolve recipient count (include branch filter)
  let patients = await prisma.patient.findMany({
    where: {
      ...(patientIds !== null ? { id: { in: patientIds } } : {}),
      unsubscribed: false,
    },
    select: { email: true, patientType: true, dob: true },
  })
  if (recipientGroup === 'pediatric') patients = patients.filter((p) => p.patientType === 'PEDIATRIC')
  else if (recipientGroup === 'adult') patients = patients.filter((p) => p.patientType === 'ADULT')
  else if (recipientGroup === 'birthday-month') {
    const m = new Date().getMonth()
    patients = patients.filter((p) => p.dob && new Date(p.dob).getMonth() === m)
  }
  const recipientCount = patients.filter((p) => p.email).length

  if (recipientCount === 0) {
    return NextResponse.json({ error: 'No patients with email addresses in this group' }, { status: 400 })
  }

  const isScheduled = !!scheduledAt
  const scheduledDate = isScheduled ? new Date(scheduledAt) : null

  // Encode branch filter into recipientGroup string (e.g. "all|SANDBOX_EAST,VERDANA_STORE")
  // This makes the branch filter persist for scheduled campaign execution
  const storedGroup = hasBranchFilter
    ? `${recipientGroup}|${(branches as string[]).join(',')}`
    : recipientGroup

  // Create campaign record
  const campaign = await prisma.emailCampaign.create({
    data: {
      subject,
      body,
      recipientGroup: storedGroup,
      recipientCount,
      ccEmails: ccNormalised,
      gmailAccountId: gmailAccountId || null,
      scheduledAt: scheduledDate,
      status: isScheduled ? 'scheduled' : 'sending',
      userId: (session.user as { id: string }).id,
    },
  })

  if (isScheduled && scheduledDate) {
    await scheduleEmail(campaign.id, scheduledDate).catch((err) =>
      console.error('Email queue error:', err)
    )
    return NextResponse.json({ campaign, scheduled: true })
  }

  // Start the send, but do NOT await the whole run before replying.
  //
  // A tranche is up to 450 emails; at Gmail's pace that is minutes, far past
  // nginx's proxy_read_timeout. The proxy then returns its HTML 504 page, the
  // browser's res.json() dies on "Unexpected token '<'", and the operator sees
  // a failure — while the server carries on sending. The worst part is what
  // that invites: pressing Send again, which starts a SECOND campaign to the
  // same list.
  //
  // Progress is already durable and owned by the campaign row: sentCount is
  // written every 10 sends, executeSendCampaign resumes from it, and it sets
  // its own terminal status (sent / partial / failed). So the response only has
  // to say the run started — the history list is the source of truth for how it
  // went. Failures are recorded there rather than lost with this request.
  void executeSendCampaign(campaign.id).catch((err) => {
    // executeSendCampaign marks the campaign 'failed' itself; this catch only
    // stops an unhandled rejection from taking the process down mid-send.
    console.error('Email send error:', err)
  })

  return NextResponse.json({ campaign, started: true, sent: recipientCount })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ campaigns })
}
