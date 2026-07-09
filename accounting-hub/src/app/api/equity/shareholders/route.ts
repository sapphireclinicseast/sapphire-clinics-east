import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Shareholder profile (TIN / birthdate / email / address) — read + update only.
// Does NOT touch share records or journal entries.
const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const shareholders = await prisma.shareholder.findMany({ orderBy: { shSeq: 'asc' }, select: { id: true, shNumber: true, name: true, tin: true, birthdate: true, email: true, address: true } })
  return NextResponse.json({ shareholders })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const data: Record<string, unknown> = {}
    if (b.tin !== undefined) data.tin = (typeof b.tin === 'string' ? b.tin.trim() : b.tin) || null
    if (b.email !== undefined) data.email = (typeof b.email === 'string' ? b.email.trim() : b.email) || null
    if (b.address !== undefined) data.address = (typeof b.address === 'string' ? b.address.trim() : b.address) || null
    if (b.birthdate !== undefined) data.birthdate = b.birthdate ? new Date(b.birthdate) : null
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    await prisma.shareholder.update({ where: { id: b.id }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Shareholder update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update' }, { status: 500 })
  }
}
