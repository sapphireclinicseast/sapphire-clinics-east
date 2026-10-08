import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// PATCH /api/expenses/filing-status  { id, filingStatus } or { ids: [...], filingStatus }
// Filing status is a post-payment attribute, so this updates even locked entries.
// Bulk form powers the Expense Report's tick-and-file; updateMany quietly skips
// ids that aren't petty-cash entries (payroll-sourced report rows).
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, ids, filingStatus } = await req.json()
    const list: string[] = Array.isArray(ids) ? ids.map(String).filter(Boolean) : id ? [String(id)] : []
    if (!list.length) return NextResponse.json({ error: 'id or ids is required' }, { status: 400 })
    if (!['FILED', 'FOR_FILING'].includes(filingStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    const r = await prisma.pettyCashEntry.updateMany({ where: { id: { in: list } }, data: { filingStatus } })
    return NextResponse.json({ ok: true, updated: r.count })
  } catch (e) {
    console.error('Filing status error:', e)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
