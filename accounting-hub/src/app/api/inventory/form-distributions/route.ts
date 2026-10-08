import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Front desk and the MedRep hand pads to partners themselves, so they can log
// distributions here (the page shows them a Forms-only slice of Inventory).
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MEDREP', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// Numeric value of a control number (ignores prefix / zero-padding).
function controlToInt(s: string): number | null {
  const digits = String(s ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

function rangeQuantity(fromControl: string, toControl: string): number | null {
  const a = controlToInt(fromControl)
  const b = controlToInt(toControl)
  if (a == null || b == null) return null
  const qty = b - a + 1
  return qty >= 1 ? qty : null
}

// Merge intervals and test whether [a,b] is fully covered by their union.
function coveredByUnion(intervals: Array<[number, number]>, a: number, b: number): boolean {
  if (a > b) return false
  const sorted = [...intervals].sort((x, y) => x[0] - y[0])
  let cursor = a
  for (const [lo, hi] of sorted) {
    if (lo > cursor) break // gap before the next interval → not covered
    if (hi >= cursor) cursor = Math.max(cursor, hi + 1)
    if (cursor > b) return true
  }
  return cursor > b
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branch) where.branch = branch

  const [distributions, receipts] = await Promise.all([
    prisma.formDistribution.findMany({ where, orderBy: [{ dateGiven: 'desc' }, { createdAt: 'desc' }] }),
    prisma.formReceipt.findMany({ where, select: { branch: true, formType: true, fromControl: true, toControl: true } }),
  ])

  // Index received ranges by branch|formType so each distribution can be flagged
  // when the pads it issued were never recorded as received (not on hand here).
  const receiptRanges = new Map<string, Array<[number, number]>>()
  for (const r of receipts) {
    const a = controlToInt(r.fromControl), b = controlToInt(r.toControl)
    if (a == null || b == null) continue
    const key = `${r.branch}|${r.formType}`
    if (!receiptRanges.has(key)) receiptRanges.set(key, [])
    receiptRanges.get(key)!.push([a, b])
  }

  const data = distributions.map((d) => {
    const a = controlToInt(d.fromControl), b = controlToInt(d.toControl)
    const ranges = receiptRanges.get(`${d.branch}|${d.formType}`) || []
    const onHandRecorded = a != null && b != null && coveredByUnion(ranges, a, b)
    return { ...d, onHandRecorded }
  })

  return NextResponse.json({ data })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, formType, partnerId, partnerName, dateGiven, fromControl, toControl, remarks, alsoRecordReceipt } = await req.json()
    if (!branch || !formType?.trim() || !partnerName?.trim() || !fromControl?.trim() || !toControl?.trim()) {
      return NextResponse.json({ error: 'Branch, form type, partner institution, and control-number range are required' }, { status: 400 })
    }
    const quantity = rangeQuantity(fromControl, toControl)
    if (quantity == null) {
      return NextResponse.json({ error: 'Invalid control-number range (the "to" number must be ≥ the "from" number, and both must contain digits)' }, { status: 400 })
    }

    // A distribution of pads that were never logged as received would sit flagged
    // "Not on hand" forever. Refuse it with needsReceipt so the client can offer
    // to record the supplier receipt in the same breath; declining saves nothing.
    const a = controlToInt(fromControl), b = controlToInt(toControl)
    const receipts = await prisma.formReceipt.findMany({
      where: { branch, formType: formType.trim() },
      select: { fromControl: true, toControl: true },
    })
    const ranges: Array<[number, number]> = []
    for (const r of receipts) {
      const lo = controlToInt(r.fromControl), hi = controlToInt(r.toControl)
      if (lo != null && hi != null) ranges.push([lo, hi])
    }
    const covered = a != null && b != null && coveredByUnion(ranges, a, b)
    if (!covered && !alsoRecordReceipt) {
      return NextResponse.json({
        needsReceipt: true,
        error: 'These control numbers are not recorded as received in Consumable Forms',
      }, { status: 409 })
    }

    const distData = {
      branch,
      formType: formType.trim(),
      partnerId: partnerId?.toString().trim() || null,
      partnerName: partnerName.trim(),
      dateGiven: dateGiven ? new Date(dateGiven) : new Date(),
      fromControl: fromControl.trim(),
      toControl: toControl.trim(),
      quantity,
      remarks: remarks?.trim() || null,
      createdById: session.user.id as string,
      createdByName: session.user.name || null,
    }
    if (!covered) {
      // Record the receipt for the distributed range itself (the common case is a
      // whole pad handed straight through), then the distribution, atomically.
      const [, created] = await prisma.$transaction([
        prisma.formReceipt.create({
          data: {
            branch,
            formType: formType.trim(),
            dateReceived: distData.dateGiven,
            fromControl: fromControl.trim(),
            toControl: toControl.trim(),
            quantity,
            remarks: `Auto-recorded with partner distribution to ${partnerName.trim()}`,
            createdById: session.user.id as string,
            createdByName: session.user.name || null,
          },
        }),
        prisma.formDistribution.create({ data: distData }),
      ])
      return NextResponse.json(created)
    }
    const created = await prisma.formDistribution.create({ data: distData })
    return NextResponse.json(created)
  } catch (err) {
    console.error('Form distribution create error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save distribution' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, branch, formType, partnerId, partnerName, dateGiven, fromControl, toControl, remarks } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const quantity = rangeQuantity(fromControl, toControl)
    if (quantity == null) {
      return NextResponse.json({ error: 'Invalid control-number range' }, { status: 400 })
    }
    const updated = await prisma.formDistribution.update({
      where: { id },
      data: {
        branch,
        formType: formType?.trim(),
        partnerId: partnerId?.toString().trim() || null,
        partnerName: partnerName?.trim(),
        dateGiven: dateGiven ? new Date(dateGiven) : undefined,
        fromControl: fromControl?.trim(),
        toControl: toControl?.trim(),
        quantity,
        remarks: remarks?.trim() || null,
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('Form distribution update error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update distribution' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await prisma.formDistribution.delete({ where: { id } })
    return NextResponse.json({ message: 'Distribution deleted' })
  } catch (err) {
    console.error('Form distribution delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
