import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const PCV_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER' }

// POST /api/expenses/recurring-generate { recurringId }
// Creates a ONE_TIME expense entry pre-filled from a recurring setup, for the
// accountant to validate. Claims the shared per-branch PCV sequence.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { recurringId } = await req.json()
    if (!recurringId) return NextResponse.json({ error: 'recurringId is required' }, { status: 400 })
    const src = await prisma.pettyCashEntry.findUnique({ where: { id: recurringId } })
    if (!src || src.recordType !== 'RECURRING') return NextResponse.json({ error: 'Recurring setup not found' }, { status: 404 })
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
          branch, recordType: 'ONE_TIME', pcvNumber, pcvSeq: seq, pcvSub: 1, date: new Date(),
          requestor: src.requestor, department: src.department, accountTitle: src.accountTitle,
          description: src.description, grossAmount: src.grossAmount, vatable: src.vatable,
          siNumber: src.siNumber, tinNumber: src.tinNumber, registeredName: src.registeredName,
          registeredAddress: src.registeredAddress,
          createdById: session.user.id ?? null,
        },
      })
    })
    return NextResponse.json(entry)
  } catch (e) {
    console.error('Recurring generate error:', e)
    return NextResponse.json({ error: 'Failed to generate entry' }, { status: 500 })
  }
}
