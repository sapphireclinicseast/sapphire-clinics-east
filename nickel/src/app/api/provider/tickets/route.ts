import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { subject?: string; message?: string }
  const subject = String(b.subject ?? '').trim()
  const message = String(b.message ?? '').trim()
  if (!subject || !message) return NextResponse.json({ error: 'Please add a subject and a message' }, { status: 400 })
  const ticket = await prisma.ticket.create({ data: { providerId: pid, subject, message } })
  return NextResponse.json({ ticket })
}
