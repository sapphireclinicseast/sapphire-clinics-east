import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePatientViewBranch } from '@/lib/patient-view'

/**
 * POST /api/patient-view/scan  { branch, code }
 *
 * The one thing the patient tablet is allowed to write: the barcode of the VIP
 * or Prepaid card the patient just scanned, so the cashier can apply it without
 * taking the card across the counter.
 *
 * Public, because the tablet has no session — so it is deliberately narrow:
 *
 *  · It only writes while a checkout is live for that branch. Outside a sale
 *    there is nothing to attach a card to, and the endpoint does nothing.
 *  · It stores the code and nothing else. It does not look the card up, so it
 *    cannot be used to test whether a card exists or read anyone's balance —
 *    the till resolves the card, under a session, as it always did.
 *  · It reports the same result either way, so a caller learns nothing about
 *    whether a checkout is in progress.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const branch = resolvePatientViewBranch(String(body.branch || ''))
    const code = String(body.code ?? '').trim().slice(0, 64)
    if (!branch || code.length < 4) {
      return NextResponse.json({ received: true })
    }

    await prisma.patientViewCheckout.updateMany({
      where: { branch: branch.branch, active: true },
      data: { scannedCode: code, scannedAt: new Date() },
    })

    // Intentionally not reporting whether anything was updated.
    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[patient-view] scan failed:', e)
    return NextResponse.json({ received: true })
  }
}
