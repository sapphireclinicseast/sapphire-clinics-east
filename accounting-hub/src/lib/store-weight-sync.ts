/**
 * Push shipping weights to the Verdana storefront.
 *
 * verdanarehab.com prices delivery by Σ (weightKg × qty), so its copy of the
 * weight has to follow this one. The hub is the source of truth; the store is
 * told what changed.
 *
 * Never fatal. A save here must not fail because the storefront is down or the
 * secret is unset — the weight is still recorded, and the caller logs whatever
 * came back so a silent divergence is visible in the server log.
 */

const STORE_URL = process.env.STORE_WEIGHT_SYNC_URL || 'https://verdanarehab.com/api/sync/weights'
const SECRET = process.env.WEIGHT_SYNC_SECRET || ''

export interface WeightSyncResult {
  pushed: boolean
  reason?: string
  updated?: number
  unmatched?: string[]
}

export async function pushWeightsToStore(
  weights: { sku: string | null | undefined; weightKg: number | null | undefined }[],
): Promise<WeightSyncResult> {
  if (!SECRET) return { pushed: false, reason: 'WEIGHT_SYNC_SECRET not set' }

  // Only rows that can actually match a storefront product are worth sending.
  const rows = weights
    .filter((w) => w.sku && String(w.sku).trim())
    .map((w) => ({ sku: String(w.sku).trim(), weightKg: w.weightKg ?? null }))
  if (rows.length === 0) return { pushed: false, reason: 'no SKUs to sync' }

  try {
    const res = await fetch(STORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': SECRET },
      body: JSON.stringify({ weights: rows }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return { pushed: false, reason: `store returned ${res.status}` }
    }
    const data = (await res.json()) as { updated?: number; unmatched?: string[] }
    return { pushed: true, updated: data.updated ?? 0, unmatched: data.unmatched ?? [] }
  } catch (e) {
    return { pushed: false, reason: e instanceof Error ? e.message : 'request failed' }
  }
}
