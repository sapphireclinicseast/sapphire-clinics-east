import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyBankRules } from '@/lib/bank-rec-rules'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Apply the active rules to PENDING lines — same posting the manual categorise
// does, shared with the auto-apply that runs after every statement upload.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const res = await applyBankRules(prisma, session.user.id as string, {
    ruleId: body.ruleId || undefined, transactionId: body.transactionId || undefined, dryRun: !!body.dryRun,
  })
  const pendingLeft = await prisma.bankTransaction.count({ where: { status: 'PENDING' } })
  return NextResponse.json({ success: true, dryRun: !!body.dryRun, ...res, remainingPending: pendingLeft })
}
