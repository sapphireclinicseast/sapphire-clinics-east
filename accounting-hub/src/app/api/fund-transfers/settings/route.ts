import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// GET → { nextSeq }
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let s = await prisma.fundTransferSettings.findUnique({ where: { id: 'singleton' } })
  if (!s) s = await prisma.fundTransferSettings.create({ data: { id: 'singleton', nextSeq: 1 } })
  return NextResponse.json({ nextSeq: s.nextSeq })
}

// PATCH { nextSeq } → set the starting count for the next reference number.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { nextSeq } = await req.json()
  const n = parseInt(String(nextSeq), 10)
  if (isNaN(n) || n < 1) return NextResponse.json({ error: 'Enter a valid starting number (≥ 1)' }, { status: 400 })
  await prisma.fundTransferSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', nextSeq: n }, update: { nextSeq: n } })
  return NextResponse.json({ nextSeq: n })
}
