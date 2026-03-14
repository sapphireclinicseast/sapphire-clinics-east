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

  // Send the code via the first connected Gmail account
  let emailSent = false
  let emailError: string | null = null

  try {
    const gmailAcct = await prisma.gmailAccount.findFirst()
    if (!gmailAcct) {
      emailError = 'No Gmail account connected'
      console.warn('[forgot-password] No Gmail account connected — reset code not emailed')
    } else {
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
      emailSent = true
      console.log('[forgot-password] Email sent, messageId:', result.data.id)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    emailError = msg
    console.error('[forgot-password] Failed to send reset email:', err)
  }

  return NextResponse.json({ ok: true, emailSent, emailError })
}
