import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.gmailAccount.findMany({
    orderBy: { connectedAt: 'asc' },
    select: { id: true, email: true, displayName: true, connectedAt: true },
  })

  return NextResponse.json({ accounts })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.gmailAccount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
