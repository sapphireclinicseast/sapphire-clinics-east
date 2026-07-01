import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postClosingEntry, reverseClosingEntry } from '@/lib/accounting/post-closing-entry'

const RUN_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

/**
 * POST /api/closing-entry      — close the books for { year, branch? }
 * DELETE /api/closing-entry    — reopen by writing a reversal { year, branch?, reason? }
 *
 * Idempotent: a year+branch can only be closed once (re-runs return alreadyClosed=true).
 * Reopening lets the user post adjustments and re-close.
 */

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({})) as { year?: number; branch?: string }
    const year   = body.year   ?? (new Date().getUTCFullYear())
    const branch = body.branch ?? 'ALL'

    const result = await postClosingEntry(prisma, year, branch, session.user.id)

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CLOSING_ENTRY',
        entity: 'closingEntry',
        entityId: result.journalEntryId || `${year}:${branch}`,
        details: { year, branch, posted: result.posted, alreadyClosed: result.alreadyClosed ?? false, reason: result.reason, netIncome: result.netIncome },
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/closing-entry]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const year   = parseInt(searchParams.get('year') || String(new Date().getUTCFullYear()))
    const branch = searchParams.get('branch') || 'ALL'
    const reason = searchParams.get('reason') || 'manual reopen'

    const result = await reverseClosingEntry(prisma, year, branch, session.user.id, reason)

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CLOSING_ENTRY_REVERSAL',
        entity: 'closingEntry',
        entityId: result.journalEntryId || `${year}:${branch}`,
        details: { year, branch, posted: result.posted, reason },
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[DELETE /api/closing-entry]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
