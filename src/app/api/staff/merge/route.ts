/**
 * Staff Merge — the Staff module's "Merge" button on a Pending Duplicates group.
 *
 * POST { keepId, deleteId }: everything the deleteId profile owns moves onto
 * keepId, keepId picks up deleteId's branches, and deleteId is removed. The
 * work and the reasoning live in @/lib/staff-merge; this route adds the human
 * check and the HTTP shape. Refusals (both profiles have a staff portal login,
 * two submitted peer evaluations collide, ...) come back as { error } with
 * nothing changed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mergeStaff, StaffMergeRefused } from '@/lib/staff-merge'

// Same roles as the Staff module's Sync button: the people who manage the roster.
const MERGE_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK']

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  if (!MERGE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { keepId?: unknown; deleteId?: unknown } | null
  const keepId = typeof body?.keepId === 'string' ? body.keepId : ''
  const deleteId = typeof body?.deleteId === 'string' ? body.deleteId : ''
  if (!keepId || !deleteId)
    return NextResponse.json({ error: 'keepId and deleteId required' }, { status: 400 })
  if (keepId === deleteId)
    return NextResponse.json({ error: 'keepId and deleteId must be different' }, { status: 400 })

  try {
    // A few dozen statements on a busy profile — more than the 5s default allows.
    const result = await prisma.$transaction(tx => mergeStaff(tx, keepId, deleteId), { maxWait: 10_000, timeout: 60_000 })
    console.log('[staff-merge]', session.user?.email ?? role, JSON.stringify(result))
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof StaffMergeRefused) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[staff-merge]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
