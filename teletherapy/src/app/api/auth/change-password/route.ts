import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
  }

  // Verify current password
  const account = await prisma.therapistAccount.findUnique({
    where: { id: session.user.id },
  })

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, account.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  // Update password
  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.therapistAccount.update({
    where: { id: session.user.id },
    data: {
      passwordHash,
      lastPlainPassword: newPassword,
    },
  })

  return NextResponse.json({ success: true })
}
