import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { getGmailClient, makeEmailBody } from '@/lib/email'

const EMAIL_BODY = (name: string, code: string) =>
  [
    `Hi ${name},`,
    '',
    'You requested a password reset for your Sapphire Marketing Hub account.',
    '',
    `Your reset code is:  ${code}`,
    '',
    'This code expires in 15 minutes.',
    '',
    'If you did not request this, please ignore this email — your password has not changed.',
    '',
    '— Sapphire Clinics East',
  ].join('\n')

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email } })

  // Always return success — prevents email enumeration
  if (!user) return NextResponse.json({ ok: true })

  // Generate 6-digit code, hash it, set 15-minute expiry
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const hashedCode = await bcrypt.hash(code, 10)
  const expiry = new Date(Date.now() + 15 * 60 * 1000)

  await prisma.user.update({
    where: { email },
    data: { resetToken: hashedCode, resetTokenExpiry: expiry },
  })

  const body = EMAIL_BODY(user.name, code)

  // Try Resend first (dedicated transactional email, uses HTTPS)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { data, error } = await resend.emails.send({
        from: 'Sapphire Clinics East <noreply@do-not-reply.sapphireclinicseast.org>',
        to: [email],
        subject: 'Password Reset Code — Sapphire Marketing Hub',
        text: body,
      })
      if (error) throw new Error(error.message)
      console.log('[forgot-password] Sent via Resend, id:', data?.id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[forgot-password] Resend error, falling back to Gmail API:', err)
    }
  }

  // Fallback: Gmail API (HTTPS — works even when SMTP ports are blocked)
  try {
    const gmailAcct = await prisma.gmailAccount.findFirst()
    if (gmailAcct) {
      const raw = makeEmailBody(
        email,
        'Password Reset Code — Sapphire Marketing Hub',
        body,
        gmailAcct.email
      )
      const gmail = await getGmailClient(gmailAcct.refreshToken)
      const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      console.log('[forgot-password] Sent via Gmail API, messageId:', result.data.id)
    } else {
      console.warn('[forgot-password] No Gmail account connected — reset code not emailed')
    }
  } catch (err) {
    console.error('[forgot-password] Gmail API error:', err)
  }

  return NextResponse.json({ ok: true })
}
