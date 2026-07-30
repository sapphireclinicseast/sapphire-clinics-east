import type { PrismaClient } from '@prisma/client'

/**
 * Keep the Referral section in sync with POS orders: whenever an order names a
 * referrer, make sure a ReferredPatient row links that patient to the referrer.
 * The Referred Patients tab and the Referral Dashboard both read from
 * ReferredPatient, so without this only manually-added links ever showed up.
 *
 * Never throws — a failed link must not fail the order write.
 */
export async function linkReferredPatientFromOrder(
  prisma: PrismaClient,
  opts: {
    referrerId?: string | null
    patientId?: string | null
    patientName?: string | null
    createdById?: string | null
  }
) {
  const referrerId = opts.referrerId || null
  const patientName = opts.patientName?.trim() || null
  if (!referrerId || !patientName) return

  try {
    const referrer = await prisma.referrer.findUnique({ where: { id: referrerId }, select: { id: true } })
    if (!referrer) return

    // Same dupe rule as the manual "Add referred patient" endpoint: one link per
    // referrer + patient (matched by CRM id when we have one, else by name).
    const dupe = await prisma.referredPatient.findFirst({
      where: {
        referrerId,
        OR: [
          ...(opts.patientId ? [{ patientId: opts.patientId }] : []),
          { patientName: { equals: patientName, mode: 'insensitive' as const } },
        ],
      },
      select: { id: true, patientId: true },
    })
    if (dupe) {
      // Backfill the CRM id onto a name-only link when the order carries one.
      if (opts.patientId && !dupe.patientId) {
        await prisma.referredPatient.update({ where: { id: dupe.id }, data: { patientId: opts.patientId } })
      }
      return
    }

    await prisma.referredPatient.create({
      data: {
        referrerId,
        patientId: opts.patientId || null,
        patientName,
        note: 'Auto-linked from POS order',
        createdById: opts.createdById || null,
      },
    })
  } catch (e) {
    console.error('linkReferredPatientFromOrder failed:', e)
  }
}
