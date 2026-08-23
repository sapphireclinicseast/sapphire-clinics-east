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

  // Send immediately
  try {
    await executeSendCampaign(campaign.id)
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send email' },
      { status: 500 }
    )
  }

  return NextResponse.json({ campaign, sent: recipientCount })
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
