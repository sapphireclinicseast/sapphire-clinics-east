import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const PCV_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

// POST /api/expenses/recurring-to-onetime { recurringId }
// Creates a ONE_TIME payment copy (FULL amount) of a DISTRIBUTED recurring entry so it
// can be included in an RFP and paid in full — while the recurring entry stays put and
// keeps amortizing to the P&L. The copy is flagged skipReports so the expense is NOT
// double-counted in the Income Statement. Idempotent: only one open (unreimbursed) copy
// per recurring entry at a time.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { recurringId } = await req.json()
    if (!recurringId) return NextResponse.json({ error: 'recurringId is required' }, { status: 400 })
    const src = await prisma.pettyCashEntry.findUnique({ where: { id: recurringId } })
    if (!src || src.recordType !== 'RECURRING') return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 })
    if (!src.distributeMonthly) return NextResponse.json({ error: 'Only distributed (prepaid) recurring entries can be paid this way.' }, { status: 400 })

    // Don't create a second open copy while one is still unpaid / unreimbursed.
    const existing = await prisma.pettyCashEntry.findFirst({
      where: { sourceRecurringId: recurringId, recordType: 'ONE_TIME', reimbursementId: null },
    })
    if (existing) return NextResponse.json({ id: existing.id, pcvNumber: existing.pcvNumber, existing: true })

    const branch = src.branch
    const entry = await prisma.$transaction(async (tx) => {
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      const seq = settings.nextPcvSeq
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: seq + 1 } })
      const yy = new Date().getFullYear() % 100
      const pcvNumber = `${PCV_BRANCH_CODE[branch] || branch}-PCV${yy}-${String(seq).padStart(6, '0')}`
      return tx.pettyCashEntry.create({
        data: {
          branch, recordType: 'ONE_TIME', pcvNumber, pcvSeq: seq, pcvSub: 1,
          date: src.date || new Date(),
          requestor: src.requestor, department: src.department, accountTitle: src.accountTitle,
          description: src.description, grossAmount: src.grossAmount, vatable: src.vatable,
          siNumber: src.siNumber, tinNumber: src.tinNumber, registeredName: src.registeredName,
          registeredAddress: src.registeredAddress, validity: src.validity,
          hasEwt: src.hasEwt, ewtRate: src.ewtRate,
          proofUrls: src.proofUrls ?? undefined, proofUrl: src.proofUrl,
          skipReports: true, sourceRecurringId: src.id,
          createdById: session.user.id ?? null,
        },
      })
    })
    return NextResponse.json({ id: entry.id, pcvNumber: entry.pcvNumber })
  } catch (e) {
    console.error('Recurring-to-one-time error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create one-time copy' }, { status: 500 })
  }
}
