import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      // Don't reveal whether user exists
      return NextResponse.json({ message: 'If the email exists, a reset code has been sent.' })
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiry = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: code,
        resetTokenExpiry: expiry,
      },
    })

    // TODO: Send email with reset code when email service is configured
    console.log(`Password reset code for ${email}: ${code}`)

    return NextResponse.json({ message: 'If the email exists, a reset code has been sent.' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
