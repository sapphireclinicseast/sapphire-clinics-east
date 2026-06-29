import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// PATCH /api/expenses/filing-status  { id, filingStatus }
// Filing status is a post-payment attribute, so this updates even locked entries.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, filingStatus } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!['FILED', 'FOR_FILING'].includes(filingStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    await prisma.pettyCashEntry.update({ where: { id }, data: { filingStatus } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Filing status error:', e)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
