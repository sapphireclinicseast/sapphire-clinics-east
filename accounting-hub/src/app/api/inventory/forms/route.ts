import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// Extract the numeric value of a control number (ignores any prefix / padding).
function controlToInt(s: string): number | null {
  const digits = String(s ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

// pcs in an inclusive control-number range, or null if invalid.
function rangeQuantity(fromControl: string, toControl: string): number | null {
  const a = controlToInt(fromControl)
  const b = controlToInt(toControl)
  if (a == null || b == null) return null
  const qty = b - a + 1
  return qty >= 1 ? qty : null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branch) where.branch = branch

  const receipts = await prisma.formReceipt.findMany({
    where,
    orderBy: [{ formType: 'asc' }, { dateReceived: 'desc' }],
  })
  return NextResponse.json({ data: receipts })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, formType, dateReceived, fromControl, toControl, remarks } = await req.json()
    if (!branch || !formType?.trim() || !fromControl?.trim() || !toControl?.trim()) {
      return NextResponse.json({ error: 'Branch, form type, and control-number range are required' }, { status: 400 })
    }
    const quantity = rangeQuantity(fromControl, toControl)
    if (quantity == null) {
      return NextResponse.json({ error: 'Invalid control-number range (the "to" number must be ≥ the "from" number, and both must contain digits)' }, { status: 400 })
    }
    const created = await prisma.formReceipt.create({
      data: {
        branch,
        formType: formType.trim(),
        dateReceived: dateReceived ? new Date(dateReceived) : new Date(),
        fromControl: fromControl.trim(),
        toControl: toControl.trim(),
        quantity,
        remarks: remarks?.trim() || null,
        createdById: session.user.id as string,
        createdByName: session.user.name || null,
      },
    })
    return NextResponse.json(created)
  } catch (err) {
    console.error('Form receipt create error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save receipt' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, branch, formType, dateReceived, fromControl, toControl, remarks } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!branch || !formType?.trim() || !fromControl?.trim() || !toControl?.trim()) {
      return NextResponse.json({ error: 'Branch, form type, and control-number range are required' }, { status: 400 })
    }
    const quantity = rangeQuantity(fromControl, toControl)
    if (quantity == null) {
      return NextResponse.json({ error: 'Invalid control-number range (the "to" number must be ≥ the "from" number, and both must contain digits)' }, { status: 400 })
    }
    const updated = await prisma.formReceipt.update({
      where: { id },
      data: {
        branch,
        formType: formType.trim(),
        dateReceived: dateReceived ? new Date(dateReceived) : undefined,
        fromControl: fromControl.trim(),
        toControl: toControl.trim(),
        quantity,
        remarks: remarks?.trim() || null,
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('Form receipt update error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update receipt' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    await prisma.formReceipt.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Form receipt delete error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete receipt' }, { status: 500 })
  }
}
