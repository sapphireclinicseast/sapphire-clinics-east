/**
 * Changing a session's HMO from AR (PATCH /api/accounts-receivable/hmo).
 *
 * Same roles as the Change Date pencil and SOA Submissions: a switch can take
 * a session off an SOA, so front desk (who can't edit SOAs) is left out. They
 * still correct a payer in POS (Reopen → Edit Order).
 */
export const HMO_CHANGE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

/**
 * Which HMO a session's services name (Hannah 2026-11-17: "some patients were
 * re-tagged for service as avega but it is still labelled here as
 * intellicare").
 *
 * HMO services carry their HMO's name in front: "AVEGA - Basic/Standard PT
 * package…", or the QuickBooks import's "HMO - AVEGA / AVEGA - PT SESSION…".
 * The first word of such a name, matched against the HMO wallets' names, says
 * which HMO the service belongs to. Generic lines ("BASIC SESSION", "Hot Moist
 * Pack per area") name no HMO and are ignored.
 *
 * Prisma-free: the AR page imports it.
 */
export interface HmoWalletLike { id: string; patientName: string }

const words = (s: string) => s.toUpperCase().match(/[A-Z]+/g) || []

/** First word of each part of an HMO's name: AVEGA → AVEGA; INLIFE/GENERALI → INLIFE, GENERALI. */
export function hmoWalletKeys(name: string): string[] {
  return name.split('/').map(part => words(part)[0]).filter((k): k is string => !!k)
}

/** The HMO word a service name starts with — only "<HMO> - <service>" names count — or ''. */
export function serviceHmoKey(itemName: string): string {
  const rest = itemName.trim().replace(/^HMO\s*-\s*/i, '')
  if (!/\s-\s/.test(rest)) return ''
  return words(rest)[0] || ''
}

/**
 * The HMO the session's services name, when every service that names an HMO
 * names the same one and it is not the HMO the session is billed to. null when
 * the services agree with the payer, name no HMO, or name more than one.
 */
export function serviceHmoMismatch<W extends HmoWalletLike>(
  itemNames: string[],
  wallets: W[],
  currentWalletId?: string | null,
): W | null {
  const byKey = new Map<string, W>()
  for (const w of wallets) for (const k of hmoWalletKeys(w.patientName)) if (!byKey.has(k)) byKey.set(k, w)
  const named = new Set<string>()
  for (const n of itemNames) {
    const w = byKey.get(serviceHmoKey(n))
    if (w) named.add(w.id)
  }
  if (named.size !== 1) return null
  const [id] = [...named]
  if (id === currentWalletId) return null
  return wallets.find(w => w.id === id) ?? null
}
