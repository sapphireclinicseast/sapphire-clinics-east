// Sync the LOA form's HMO list from the Accounting Hub's HMO digital wallets.
//
// The wallets under Point of Sale → Digital Wallet → HMO are the clinic's real
// list of providers — they carry the receivable balance and get the Statement
// of Account. Keeping a second list here meant adding a provider twice and
// watching the two drift, so the wallets are the source and this mirrors them.
//
// Deliberately additive: a provider that disappears from the wallets is
// RETIRED, never deleted. Letters already filed name it, retiring only takes it
// out of the picker, and a wallet that is briefly absent (renamed, or the hub
// unreachable mid-edit) must not be able to erase history.
//
// Mirrors syncBranchesFromHr, which does the same job for branches against HR
// Platform, including the "never let a failed fetch look like an empty list"
// rule — an error returns ok:false and changes nothing.

import { prisma } from '@/lib/prisma'

export interface HmoSyncResult {
  ok: boolean
  error?: string
  added: string[]
  restored: string[]
  retired: string[]
  unchanged: number
}

export async function syncHmoProvidersFromAccounting(): Promise<HmoSyncResult> {
  const empty = { added: [], restored: [], retired: [], unchanged: 0 }

  const acctUrl = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const acctKey = process.env.EXTERNAL_API_KEY ?? ''
  if (!acctKey) {
    return { ok: false, error: 'EXTERNAL_API_KEY is not configured, so the Accounting Hub cannot be read.', ...empty }
  }

  let names: string[]
  try {
    const res = await fetch(`${acctUrl}/api/internal/hmo-wallets`, {
      headers: { Authorization: `Bearer ${acctKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return { ok: false, error: `Accounting Hub returned ${res.status}`, ...empty }
    }
    const data = await res.json()
    names = Array.isArray(data.hmos) ? data.hmos.filter((n: unknown): n is string => typeof n === 'string' && !!n.trim()) : []
  } catch (err) {
    return { ok: false, error: `Could not reach the Accounting Hub: ${(err as Error).message ?? 'unknown error'}`, ...empty }
  }

  // A successful call that returns nothing is treated as a fault, not as "the
  // clinic has no HMOs". Acting on it would retire every provider at once.
  if (names.length === 0) {
    return { ok: false, error: 'The Accounting Hub returned no HMO wallets — refusing to retire the whole list on an empty response.', ...empty }
  }

  const existing = await prisma.hmoProvider.findMany({ select: { id: true, name: true, active: true, sortOrder: true } })
  const byName = new Map(existing.map(e => [e.name.toUpperCase(), e]))
  const incoming = new Set(names.map(n => n.toUpperCase()))

  const added: string[] = []
  const restored: string[] = []
  const retired: string[] = []
  let unchanged = 0

  let nextOrder = existing.reduce((max, e) => Math.max(max, e.sortOrder), 0)

  for (const name of names) {
    const match = byName.get(name.toUpperCase())
    if (!match) {
      nextOrder += 10
      await prisma.hmoProvider.create({ data: { name, sortOrder: nextOrder } })
      added.push(name)
    } else if (!match.active) {
      // It is back in the wallets, so it belongs in the picker again.
      await prisma.hmoProvider.update({ where: { id: match.id }, data: { active: true } })
      restored.push(match.name)
    } else {
      unchanged += 1
    }
  }

  for (const e of existing) {
    if (e.active && !incoming.has(e.name.toUpperCase())) {
      await prisma.hmoProvider.update({ where: { id: e.id }, data: { active: false } })
      retired.push(e.name)
    }
  }

  return { ok: true, added, restored, retired, unchanged }
}
