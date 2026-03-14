import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'

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

  // Send the reset code via Gmail SMTP (app password)
  let emailSent = false
  let emailError: string | null = null

  const gmailUser = process.env.GMAIL_RESET_USER
  const gmailPass = process.env.GMAIL_RESET_PASS

  if (!gmailUser || !gmailPass) {
    emailError = 'GMAIL_RESET_USER or GMAIL_RESET_PASS not configured'
    console.warn('[forgot-password]', emailError)
  } else {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })

      await transporter.sendMail({
        from: `"Sapphire Clinics East" <${gmailUser}>`,
        to: email,
        subject: 'Password Reset Code — Sapphire Marketing Hub',
        text: [
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
        ].join('\n'),
      })

      emailSent = true
      console.log('[forgot-password] Reset code emailed to', email)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      emailError = msg
      console.error('[forgot-password] Failed to send reset email:', err)
    }
  }

  return NextResponse.json({ ok: true, emailSent, emailError })
}
