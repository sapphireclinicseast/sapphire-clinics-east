// Which patients have already been greeted this year, per channel.
//
// The dashboard reads this instead of localStorage so the "sent" state is the
// same for every staff member and survives sign-out — the whole point being
// that nobody greets a patient twice.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = new Date().getFullYear()
  const rows = await prisma.birthdayGreeting.findMany({
    where: { year },
    select: { patientId: true, channel: true, sentAt: true, sentByName: true },
  })

  const email: string[] = []
  const sms: string[] = []
  // Who sent it and when, for the button tooltip.
  const detail: Record<string, { by: string | null; at: string }> = {}
  for (const r of rows) {
    ;(r.channel === 'sms' ? sms : email).push(r.patientId)
    detail[`${r.channel}:${r.patientId}`] = { by: r.sentByName, at: r.sentAt.toISOString() }
  }
  return NextResponse.json({ year, email, sms, detail })
}
