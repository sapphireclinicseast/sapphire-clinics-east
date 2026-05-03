import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { email, code, newPassword } = await req.json()

  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !user.resetToken || !user.resetTokenExpiry) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 })
  }

  if (user.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 })
  }

  const valid = await bcrypt.compare(code, user.resetToken)
  if (!valid) {
    return NextResponse.json({ error: 'Incorrect code. Please check and try again.' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  })

  return NextResponse.json({ ok: true })
}
