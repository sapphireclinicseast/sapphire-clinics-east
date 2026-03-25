import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const account = await prisma.therapistAccount.findUnique({
    where: { email },
    include: { staff: { select: { firstName: true, lastName: true } } },
  })

  // Always return success to prevent email enumeration
  if (!account) {
    return NextResponse.json({ success: true })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.therapistAccount.update({
    where: { id: account.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://teletherapy.sapphireclinicseast.org'
  const resetUrl = `${baseUrl}/reset-password?token=${token}`

  await sendEmail({
    to: email,
    subject: 'SCEI Teletherapy — Password Reset',
    html: `
      <div style="font-family: 'Gill Sans', Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #1C2B30;">
        <div style="background: linear-gradient(135deg, #0D5B68, #1A7B8A); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Password Reset</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">SCEI Teletherapy</p>
        </div>
        <div style="background: white; padding: 28px; border: 1px solid #E8EDEF; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Hi <strong>${account.staff.firstName}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="background: linear-gradient(135deg, #1A7B8A, #0D5B68); color: white; padding: 12px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 13px; color: #9AABB0;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
