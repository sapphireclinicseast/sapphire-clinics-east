import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getGmailClient, makeEmailBody } from '@/lib/email'

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
    data: {
      resetToken: hashedCode,
      resetTokenExpiry: expiry,
    },
  })

  // Send via Gmail API (HTTPS — works even when SMTP ports are blocked on VPS)
  try {
    const gmailAcct = await prisma.gmailAccount.findFirst()
    if (gmailAcct) {
      const emailBody = [
        `Hi ${user.name},`,
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
      const raw = makeEmailBody(
        email,
        'Password Reset Code — Sapphire Marketing Hub',
        emailBody,
        gmailAcct.email
      )
      const gmail = await getGmailClient(gmailAcct.refreshToken)
      const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      console.log('[forgot-password] Reset code sent via Gmail API, messageId:', result.data.id)
    } else {
      console.warn('[forgot-password] No Gmail account connected — reset code not emailed')
    }
  } catch (err: unknown) {
    console.error('[forgot-password] Gmail API error:', err)
    // Code is still stored — user can retry
  }

  return NextResponse.json({ ok: true })
}
