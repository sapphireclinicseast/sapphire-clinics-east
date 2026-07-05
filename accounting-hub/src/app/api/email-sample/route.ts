import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendInvestorEmail, dividendEmailHtml, advanceEmailHtml } from '@/lib/email'

// Admin-only "send a test email" tool for the branded investor templates.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || (session.user.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { type, to } = await req.json()
    if (!to?.trim()) return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 })
    const now = new Date()
    let html: string, subject: string
    if (type === 'advance') {
      html = advanceEmailHtml({ name: 'Hannah Jara', amount: 19342.81, date: now })
      subject = 'Your advance has been repaid — with our sincere thanks'
    } else {
      html = dividendEmailHtml({ name: 'Hannah Jara', perShare: 5, shares: 1000, amount: 5000, date: now, type: 'REGULAR' })
      subject = 'Notice of dividend — thank you for believing in what we’re building'
    }
    const r = await sendInvestorEmail({ to: to.trim(), subject, html })
    if (!r.ok) return NextResponse.json({ error: r.error || 'Send failed' }, { status: 502 })
    return NextResponse.json({ sent: true, from: r.from, type: type === 'advance' ? 'advance' : 'dividend' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
