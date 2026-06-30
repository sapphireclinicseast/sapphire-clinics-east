import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT']

// PATCH /api/petty-cash/audited  { id, audited }
// Audit status is set after review (often once the entry is already in an RFP),
// so this updates even locked entries.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, audited } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await prisma.pettyCashEntry.update({ where: { id }, data: { audited: !!audited } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Audited update error:', e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
