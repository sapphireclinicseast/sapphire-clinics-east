import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendInvestorEmail, advanceEmailHtml, MailAttachment } from '@/lib/email'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Fetch a stored proof file and return it as a base64 attachment (best-effort).
async function toAttachment(url: string, origin: string): Promise<MailAttachment | null> {
  try {
    const full = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`
    const res = await fetch(full)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const name = decodeURIComponent(url.split('/').pop() || 'proof')
    return { filename: name, content: buf.toString('base64') }
  } catch { return null }
}

// POST /api/loans/payments/email  { payoutId }
// Emails the shareholder that their advance payment was deposited (advances only),
// from main@sapphireclinicseast.org, with the proof of deposit attached.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const { payoutId } = await req.json()
    if (!payoutId) return NextResponse.json({ error: 'payoutId required' }, { status: 400 })
    const payout = await prisma.advancePayout.findUnique({ where: { id: payoutId } })
    if (!payout) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    const advance = await prisma.advance.findUnique({ where: { id: payout.advanceId } })
    if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })
    let email: string | null = null, name = advance.name
    if (advance.shareholderId) {
      const sh = await prisma.shareholder.findUnique({ where: { id: advance.shareholderId }, select: { email: true, name: true } })
      email = sh?.email || null; name = sh?.name || name
    }
    if (!email) return NextResponse.json({ error: 'No email on file for this shareholder' }, { status: 400 })

    const origin = new URL(req.url).origin
    const urls = Array.isArray(payout.proofUrls) ? (payout.proofUrls as string[]) : []
    const attachments = (await Promise.all(urls.map(u => toAttachment(u, origin)))).filter((a): a is MailAttachment => !!a)
    const amount = Number(payout.amount)
    const date = payout.paidDate ? new Date(payout.paidDate) : new Date()
    const html = advanceEmailHtml({ name, amount, date })
    const result = await sendInvestorEmail({ to: email, subject: 'Your advance has been repaid — with our thanks', html, attachments })
    if (!result.ok) return NextResponse.json({ error: result.error || 'Email failed' }, { status: 502 })
    await prisma.advancePayout.update({ where: { id: payoutId }, data: { emailedAt: new Date() } })
    return NextResponse.json({ ok: true, from: result.from, to: email })
  } catch (e) {
    console.error('Advance email error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to send email' }, { status: 500 })
  }
}
