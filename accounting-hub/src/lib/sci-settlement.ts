// The SCI (BGC) accreditation era: HMO sessions billed under Sapphire Clinics
// Inc. (BGC) before our own accreditation. They are closed in AR by ₱0 marker
// payments (no cash) and paid to us through the amended SCI-SCEI settlement —
// 18 post-dated checks recorded in AR → Other Customers, not as HMO payments.
// Prisma-free so the AR page can share it.

/** ARPayment.notes of every ₱0 marker that closes SCI-era sessions. */
export const SCI_ERA_MARKER_PREFIX = 'SCI (BGC) accreditation-era marker'
/** The settlement's OtherReceivable row (AR → Other Customers). */
export const SCI_SETTLEMENT_ID = 'scisettlement2026'

export const isSciEraMarker = (notes: string | null | undefined) => !!notes && notes.startsWith(SCI_ERA_MARKER_PREFIX)
