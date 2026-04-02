import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'

// Resend SMTP relay — same API key used across all SCEI apps
function createTransport() {
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
      user: 'resend',
      pass: process.env.RESEND_API_KEY ?? 're_CbH3Pirt_JqAd3RJ3TXwaFNmxckQ7GVwK',
    },
  })
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Always return 200 to avoid revealing whether the email exists
    if (!user) {
      return NextResponse.json({ message: 'If the email exists, a reset code has been sent.' })
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiry = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: code, resetTokenExpiry: expiry },
    })

    // Send email via Resend SMTP
    const transporter = createTransport()
    await transporter.sendMail({
      from: 'SCEI Accounting <noreply@do-not-reply.sapphireclinicseast.org>',
      to: email,
      subject: 'Accounting Hub — Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0d6e6e; margin-bottom: 8px;">Password Reset</h2>
          <p style="color: #333;">You requested a password reset for the SAPPHIRE Accounting Hub.</p>
          <p style="color: #333;">Your one-time reset code is:</p>
          <div style="font-size: 40px; font-weight: bold; letter-spacing: 10px; color: #0d6e6e;
                      padding: 20px; background: #f0f9f9; border-radius: 8px;
                      text-align: center; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in <strong>15 minutes</strong>.</p>
          <p style="color: #666; font-size: 14px;">If you did not request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">SAPPHIRE Clinics East, Inc. — Internal access only</p>
        </div>
      `,
    })

    console.log(`[forgot-password] Reset code sent to ${email}`)
    return NextResponse.json({ message: 'If the email exists, a reset code has been sent.' })
  } catch (e: unknown) {
    console.error('[forgot-password] error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
