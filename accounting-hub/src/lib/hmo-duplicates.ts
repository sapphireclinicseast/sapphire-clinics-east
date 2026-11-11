// Possible duplicate HMO sessions, flagged in AR → HMO → Per HMO (Hannah,
// 2026-11-09: "keep it flagged in Per HMO that it is possible duplicate").
//
// Two standing (not voided) HMO orders are possible duplicates when they share
// the HMO, the patient, the session day (Manila), the service lines, the amount
// AND the remarks. Orders with no real patient (QuickBooks rows named after the
// HMO, "HMO - INSULAR") are never compared. Her rule: "if it is stated in the remarks then yes they are
// different" — so writing what sets one session apart in either order's remarks
// (or the "Not a duplicate" button, which does that for you) clears the flag, and voiding the extra copy moves it to Session Adjustments
// (lib/hmo-session-void) where any PF already paid on it is recovered.

import { Prisma, type PrismaClient } from '@prisma/client'

// First session day compared (Manila midnight, 2025-01-01).
const SINCE = new Date('2025-01-01T00:00:00+08:00')

/** Normalised remarks: case, outer and repeated whitespace ignored. */
export const remarksKey = (notes: string | null | undefined) => (notes ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * For each of `orderIds` that has a possible duplicate, the order numbers of
 * its twins (ascending). Orders with none are left out of the map.
 */
export async function possibleDuplicates(prisma: PrismaClient, orderIds: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  if (!orderIds.length) return out
  const rows = await prisma.$queryRaw<{ id: string; twins: number[] }[]>(Prisma.sql`
    WITH tgt AS (
      SELECT DISTINCT (o."transactionDate" + interval '8 hours')::date AS d, o."netAmount" AS amt
      FROM "Order" o WHERE o.id = ANY(${orderIds})
    ),
    cand AS (
      SELECT o.id, o."orderNumber", o."patientId",
             upper(btrim(coalesce(o."patientName", ''))) AS pn,
             (o."transactionDate" + interval '8 hours')::date AS d,
             o."netAmount" AS amt,
             lower(regexp_replace(btrim(coalesce(o.notes, '')), '[[:space:]]+', ' ', 'g')) AS rmk,
             (SELECT string_agg(lower(btrim(oi.name)) || ' x' || oi.quantity::text, ' | ' ORDER BY lower(btrim(oi.name)), oi.quantity)
                FROM "OrderItem" oi WHERE oi."orderId" = o.id) AS svc,
             hp."walletId" AS wallet
      FROM "Order" o
      JOIN LATERAL (
        SELECT p."walletId" FROM "OrderPayment" p
        WHERE p."orderId" = o.id AND p.method = 'HMO'
        ORDER BY p."walletId" NULLS LAST LIMIT 1
      ) hp ON true
      WHERE o.status <> 'VOIDED'
        AND ((o."transactionDate" + interval '8 hours')::date, o."netAmount") IN (SELECT d, amt FROM tgt)
        -- QuickBooks-era orders billed to the HMO itself ("HMO - INSULAR") carry
        -- no patient, so same-day sessions of different patients look alike.
        AND upper(btrim(coalesce(o."patientName", ''))) !~ '^HMO[[:space:]]*-'
        -- 2024 HMO sessions were SCI (BGC) claims, settled in full by the SCI
        -- settlement — nothing left to chase or void there.
        AND o."transactionDate" >= ${SINCE}
    )
    SELECT a.id, array_agg(b."orderNumber" ORDER BY b."orderNumber") AS twins
    FROM cand a
    JOIN cand b ON b.id <> a.id
      AND b.d = a.d AND b.amt = a.amt
      AND b.wallet IS NOT DISTINCT FROM a.wallet
      AND b.svc IS NOT DISTINCT FROM a.svc
      AND b.rmk = a.rmk
      AND (b."patientId" = a."patientId"
           OR (a."patientId" IS NULL AND b."patientId" IS NULL AND a.pn <> '' AND b.pn = a.pn))
    WHERE a.id = ANY(${orderIds})
    GROUP BY a.id`)
  for (const r of rows) out.set(r.id, r.twins.map(Number))
  return out
}
