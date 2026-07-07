import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

// POST { entryId }  → stamp a petty-cash / one-time-expense entry as recorded in
// Inventory & Procurement. Called once the item / stock adjustment / capitalized
// freight has actually been saved on the Inventory page, so the "Recorded in
// Inventory" state persists for all users (server-side, survives refresh).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { entryId } = await req.json()
    if (!entryId) return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
    const e = await prisma.pettyCashEntry.findUnique({ where: { id: entryId }, select: { id: true, inventoryRecordedAt: true } })
    if (!e) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    // Idempotent: keep the original timestamp if already stamped.
    const inventoryRecordedAt = e.inventoryRecordedAt ?? new Date()
    if (!e.inventoryRecordedAt) {
      await prisma.pettyCashEntry.update({ where: { id: entryId }, data: { inventoryRecordedAt } })
    }
    return NextResponse.json({ inventoryRecordedAt })
  } catch (err) {
    console.error('record-entry error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to stamp entry' }, { status: 500 })
  }
}
