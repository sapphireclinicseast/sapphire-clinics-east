import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendGmail } from '@/lib/gmail'

// Was an SMTP relay on port 465, which the VPS blocks outbound — the send hung
// and no reset code ever arrived. Now goes over the Gmail API (HTTPS).

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

    const sent = await sendGmail({
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

    // The response stays identical either way — telling the caller the send
    // failed would leak that the address exists. Log it for the admin instead.
    if (sent.ok) console.log(`[forgot-password] Reset code sent to ${email}`)
    else console.error(`[forgot-password] Gmail send failed for ${email}: ${sent.error}`)

    return NextResponse.json({ message: 'If the email exists, a reset code has been sent.' })
  } catch (e: unknown) {
    console.error('[forgot-password] error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
