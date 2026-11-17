// GET /api/patient-relationship/coverage?patientId=…
//
// A suggestion, not an answer: how this patient's sessions are usually paid
// for, so the cancellation prompt can arrive pre-filled instead of asking
// front desk to classify something the board already knows.
//
// It is a suggestion because coverage belongs to a SESSION, not a person. The
// same child can be GL for occupational therapy and cash for speech, and a
// letter runs out mid-year. So this offers the most likely answer and the
// prompt lets it be changed — which is the difference between saving a click
// and quietly charging a guarantee letter that does not exist.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isCoverage } from '@/lib/cancellation-types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const patientId = (req.nextUrl.searchParams.get('patientId') ?? '').trim()
  if (!patientId) return NextResponse.json({ error: 'patientId is required' }, { status: 400 })

  try {
    // The board is the best record of how a patient is funded: front desk set
    // the payment type on the slot when they booked it.
    const slots = await prisma.deckingSlot.findMany({
      where: { patientId, disabled: false },
      select: { paymentType: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })

    if (slots.length === 0) {
      return NextResponse.json({ suggested: null, reason: 'no slots on the board' })
    }

    // The most common, not simply the newest. One slot retyped by mistake
    // should not redirect a charge; a patient who is genuinely GL will be GL
    // across their slots.
    const tally = new Map<string, number>()
    for (const s of slots) {
      if (!isCoverage(s.paymentType)) continue
      tally.set(s.paymentType, (tally.get(s.paymentType) ?? 0) + 1)
    }
    if (tally.size === 0) return NextResponse.json({ suggested: null, reason: 'no payment type set' })

    const [suggested, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    return NextResponse.json({
      suggested,
      // Said out loud so the prompt can show WHY it picked that, rather than
      // presenting a guess as a fact.
      reason: `${count} of ${slots.length} slots on the board`,
      // A patient funded two ways is exactly the case a patient-level flag
      // gets wrong, so the prompt is told rather than left to assume.
      mixed: tally.size > 1,
    })
  } catch (err) {
    console.error('[coverage]', err)
    // No suggestion rather than a failure: the prompt still works, it just
    // asks instead of pre-filling.
    return NextResponse.json({ suggested: null, reason: 'lookup failed' })
  }
}
