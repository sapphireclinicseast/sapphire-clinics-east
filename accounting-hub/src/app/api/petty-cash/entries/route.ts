import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'CEO']

// Fields a client may set/update on an entry.
const EDITABLE = [
  'requestor', 'department', 'pcfStatus', 'date', 'description', 'vatable',
  'siNumber', 'tinNumber', 'registeredName', 'registeredAddress', 'grossAmount',
  'accountTitle', 'referenceNumber', 'proofUrl', 'proofUrls', 'validity', 'finalized',
  'recurFrequency', 'recurDeadlineDay', 'distributeMonthly', 'distributeStart', 'distributeEnd',
] as const

const PCV_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER', CEO: 'CEO' }
// Petty cash entries carry a "-NN" sub-sequence (entries sharing one PCV);
// expense entries (RECURRING/ONE_TIME) keep the plain base number.
function pcvNumber(branch: string, seq: number, sub: number, withSub: boolean): string {
  const yy = new Date().getFullYear() % 100
  const base = `${PCV_BRANCH_CODE[branch] || branch}-PCV${yy}-${String(seq).padStart(6, '0')}`
  return withSub ? `${base}-${String(sub).padStart(2, '0')}` : base
}

// GET /api/petty-cash/entries?branch=SANDBOX_EAST
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const recordType = sp.get('recordType') || 'PETTY_CASH'
  if (!VALID_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  }
  const entries = await prisma.pettyCashEntry.findMany({
    where: { branch, recordType },
    orderBy: [{ pcvSeq: 'asc' }, { pcvSub: 'asc' }],
    include: { reimbursement: { select: { refNumber: true } } },
  })
  return NextResponse.json(entries)
}

// POST /api/petty-cash/entries  { branch }  → creates a blank row with the next PCV number
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branch = body.branch
    const recordType = ['PETTY_CASH', 'RECURRING', 'ONE_TIME'].includes(body.recordType) ? body.recordType : 'PETTY_CASH'
    // When provided, the new row shares this existing PCV base (a new "-NN" sub).
    const samePcvSeq = body.samePcvSeq != null && body.samePcvSeq !== '' ? Number(body.samePcvSeq) : null
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    const withSub = recordType === 'PETTY_CASH'
    const entry = await prisma.$transaction(async (tx) => {
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      let baseSeq: number, sub: number
      if (samePcvSeq != null && !isNaN(samePcvSeq)) {
        // Reuse an existing PCV base — bump its sub-sequence; don't claim a new number.
        baseSeq = samePcvSeq
        const agg = await tx.pettyCashEntry.aggregate({ where: { branch, recordType, pcvSeq: baseSeq }, _max: { pcvSub: true } })
        sub = (agg._max.pcvSub || 0) + 1
      } else {
        baseSeq = settings.nextPcvSeq
        await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: baseSeq + 1 } })
        sub = 1
      }
      return tx.pettyCashEntry.create({
        data: {
          branch,
          recordType,
          pcvNumber: pcvNumber(branch, baseSeq, sub, withSub),
          pcvSeq: baseSeq,
          pcvSub: sub,
          date: new Date(),
          createdById: session.user.id ?? null,
        },
      })
    })
    return NextResponse.json(entry)
  } catch (e) {
    console.error('Petty cash create error:', e)
    return NextResponse.json({ error: 'Failed to add row' }, { status: 500 })
  }
}

// PUT /api/petty-cash/entries  { id, ...fields }
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.pettyCashEntry.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    if (existing.reimbursementId || existing.paidAt) {
      return NextResponse.json({ error: 'Locked: entry has been paid / reimbursed' }, { status: 409 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    for (const f of EDITABLE) {
      if (f in body) {
        if (f === 'grossAmount') data.grossAmount = Number(body.grossAmount) || 0
        else if (f === 'date') data.date = body.date ? new Date(body.date) : null
        else if (f === 'distributeStart' || f === 'distributeEnd') data[f] = body[f] ? new Date(body[f]) : null
        else if (f === 'recurDeadlineDay') data[f] = (body[f] === '' || body[f] == null) ? null : Number(body[f])
        else if (f === 'distributeMonthly') data[f] = !!body[f]
        else data[f] = body[f] === '' ? null : body[f]
      }
    }
    if ('branchAllocations' in body) data.branchAllocations = body.branchAllocations ?? null
    if ('proofUrls' in body) data.proofUrls = body.proofUrls ?? null
    const entry = await prisma.pettyCashEntry.update({ where: { id }, data })
    return NextResponse.json(entry)
  } catch (e) {
    console.error('Petty cash update error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

// DELETE /api/petty-cash/entries?id=...
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await prisma.pettyCashEntry.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if (existing.reimbursementId) {
    return NextResponse.json({ error: 'Locked: entry is part of a reimbursement report' }, { status: 409 })
  }
  await prisma.pettyCashEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
