import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendInvestorEmail, advanceEmailHtml, loanPaymentEmailHtml, MailAttachment } from '@/lib/email'

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

// POST /api/loans/payments/email  { payoutId, kind }
// Emails the shareholder that their advance/loan payment was deposited, from
// main@sapphireclinicseast.org, with the proof of payment attached.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const { payoutId, kind } = await req.json()
    if (!payoutId) return NextResponse.json({ error: 'payoutId required' }, { status: 400 })
    const isLoan = kind === 'loan'

    // Resolve the payout record, its parent (advance/loan), and the shareholder's email.
    let email: string | null = null, name = '', amount = 0, principalPortion = 0, interestPortion = 0
    let proofUrls: string[] = [], date = new Date()
    let shareholderId: string | null = null
    if (isLoan) {
      const payout = await prisma.loanPayout.findUnique({ where: { id: payoutId } })
      if (!payout) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      const loan = await prisma.loan.findUnique({ where: { id: payout.loanId } })
      if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
      name = loan.name; shareholderId = loan.shareholderId
      amount = Number(payout.amount); principalPortion = Number(payout.principalPortion); interestPortion = Number(payout.interestPortion)
      proofUrls = Array.isArray(payout.proofUrls) ? (payout.proofUrls as string[]) : []
      date = payout.paidDate ? new Date(payout.paidDate) : new Date()
    } else {
      const payout = await prisma.advancePayout.findUnique({ where: { id: payoutId } })
      if (!payout) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      const advance = await prisma.advance.findUnique({ where: { id: payout.advanceId } })
      if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })
      name = advance.name; shareholderId = advance.shareholderId
      amount = Number(payout.amount)
      proofUrls = Array.isArray(payout.proofUrls) ? (payout.proofUrls as string[]) : []
      date = payout.paidDate ? new Date(payout.paidDate) : new Date()
    }
    if (shareholderId) {
      const sh = await prisma.shareholder.findUnique({ where: { id: shareholderId }, select: { email: true, name: true } })
      email = sh?.email || null; name = sh?.name || name
    }
    if (!email) return NextResponse.json({ error: 'No email on file for this shareholder (loans to banks/other entities have none).' }, { status: 400 })

    const origin = new URL(req.url).origin
    const attachments = (await Promise.all(proofUrls.map(u => toAttachment(u, origin)))).filter((a): a is MailAttachment => !!a)
    const html = isLoan ? loanPaymentEmailHtml({ name, amount, date, principalPortion, interestPortion }) : advanceEmailHtml({ name, amount, date })
    const subject = isLoan ? 'Your loan payment has been deposited — with our thanks' : 'Your advance has been repaid — with our thanks'
    const result = await sendInvestorEmail({ to: email, subject, html, attachments })
    if (!result.ok) return NextResponse.json({ error: result.error || 'Email failed' }, { status: 502 })
    if (isLoan) await prisma.loanPayout.update({ where: { id: payoutId }, data: { emailedAt: new Date() } })
    else await prisma.advancePayout.update({ where: { id: payoutId }, data: { emailedAt: new Date() } })
    return NextResponse.json({ ok: true, from: result.from, to: email })
  } catch (e) {
    console.error('Payment email error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to send email' }, { status: 500 })
  }
}
