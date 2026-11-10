import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toIntervals } from '@/lib/form-ranges'
import { resolveAckBranch } from '@/lib/form-ack'

// Pad stock for the signing page: per form type at this branch, the received
// and already-given control-number ranges, so the page can show on-hand and
// warn about numbers not on hand / already given out while the med rep types.
// The POST re-checks everything server-side.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = resolveAckBranch(new URL(req.url).searchParams.get('branch'))
  if (!b) return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })

  const [receipts, given] = await Promise.all([
    prisma.formReceipt.findMany({ where: { branch: b.branch }, select: { formType: true, fromControl: true, toControl: true, quantity: true } }),
    prisma.formDistribution.findMany({
      where: { branch: b.branch },
      select: { formType: true, fromControl: true, toControl: true, quantity: true, partnerName: true, dateGiven: true },
      orderBy: { dateGiven: 'desc' },
    }),
  ])

  const types = Array.from(new Set([...receipts.map((r) => r.formType), ...given.map((g) => g.formType)])).sort()
  const formTypes = types.map((formType) => {
    const rec = receipts.filter((r) => r.formType === formType)
    const giv = given.filter((g) => g.formType === formType)
    const received = rec.reduce((s, r) => s + r.quantity, 0)
    const out = giv.reduce((s, g) => s + g.quantity, 0)
    return {
      formType,
      received,
      given: out,
      onHand: received - out,
      // zero-padding used on this form's pads (e.g. 4 for "0651")
      width: Math.max(1, ...rec.map((r) => r.fromControl.replace(/[^0-9]/g, '').length)),
      receivedRanges: toIntervals(rec),
      givenRanges: giv.map((g) => {
        const [iv] = toIntervals([g])
        return iv ? { a: iv[0], b: iv[1], partnerName: g.partnerName, dateGiven: g.dateGiven } : null
      }).filter(Boolean),
    }
  })
  return NextResponse.json({ branch: b, formTypes })
}
