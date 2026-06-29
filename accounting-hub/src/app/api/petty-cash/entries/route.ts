import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

// Fields a client may set/update on an entry.
const EDITABLE = [
  'requestor', 'department', 'pcfStatus', 'date', 'description', 'vatable',
  'siNumber', 'tinNumber', 'registeredName', 'registeredAddress', 'grossAmount',
  'accountTitle', 'referenceNumber', 'proofUrl',
] as const

function pcvNumber(seq: number): string {
  const yy = new Date().getFullYear() % 100
  return `PCV${yy}-${String(seq).padStart(6, '0')}`
}

// GET /api/petty-cash/entries?branch=SANDBOX_EAST
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  }
  const entries = await prisma.pettyCashEntry.findMany({
    where: { branch },
    orderBy: { pcvSeq: 'asc' },
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
    const { branch } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    // Atomically claim the next PCV sequence for this branch.
    const entry = await prisma.$transaction(async (tx) => {
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      const seq = settings.nextPcvSeq
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: seq + 1 } })
      return tx.pettyCashEntry.create({
        data: {
          branch,
          pcvNumber: pcvNumber(seq),
          pcvSeq: seq,
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
    if (existing.reimbursementId) {
      return NextResponse.json({ error: 'Locked: entry is part of a reimbursement report' }, { status: 409 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    for (const f of EDITABLE) {
      if (f in body) {
        if (f === 'grossAmount') data.grossAmount = Number(body.grossAmount) || 0
        else if (f === 'date') data.date = body.date ? new Date(body.date) : null
        else data[f] = body[f] === '' ? null : body[f]
      }
    }
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
