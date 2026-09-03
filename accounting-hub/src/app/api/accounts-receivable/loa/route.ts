// GET /api/accounts-receivable/loa
//
// LOA submissions for the HMO officer, read from the Operations Hub. The two
// apps run on separate databases (sapphire_accounting / sapphire_marketing), so
// this proxies /api/internal/loa there rather than querying a table it cannot
// see — the same shape as the other cross-hub reads.
//
// Roles are applied HERE, on the accounting side: the internal endpoint is
// key-authenticated and returns everything, so an accounting role that may not
// see LOAs must be stopped before the fetch, not after.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const READ_ROLES = [
  'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER',
  'AHEA_ADMIN', 'AHGH_ADMIN', 'HMO_OFFICER',
  'AHEA_FRONTDESK', 'AHGH_FRONTDESK',
]

// Branch-scoped accounting roles see their own branch only, mirroring how the
// Operations Hub pins its front desk. A filter the client sends is a request,
// not a permission.
const ROLE_BRANCH: Record<string, string> = {
  AHEA_ADMIN: 'SBEA', AHEA_FRONTDESK: 'SBEA',
  AHGH_ADMIN: 'SBGH', AHGH_FRONTDESK: 'SBGH',
}

const OPS_URL = process.env.OPS_HUB_URL || 'https://operations.sapphireclinicseast.org'
const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!READ_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'EXTERNAL_API_KEY is not configured on the Accounting Hub, so LOA submissions cannot be read from the Operations Hub.' },
      { status: 500 },
    )
  }

  const { searchParams } = new URL(req.url)
  const locked = ROLE_BRANCH[role]
  const branch = locked ?? (searchParams.get('branch') || '')
  const hmo = searchParams.get('hmo') || ''
  const status = searchParams.get('status') || ''

  const qs = new URLSearchParams()
  if (branch) qs.set('branch', branch)
  if (hmo) qs.set('hmo', hmo)
  if (status) qs.set('status', status)

  try {
    const res = await fetch(`${OPS_URL}/api/internal/loa?${qs}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Operations Hub returned ${res.status}` },
        { status: 502 },
      )
    }
    const data = await res.json()
    return NextResponse.json({ ...data, branchLocked: !!locked, branch: branch || null })
  } catch (err) {
    // Don't swallow — an empty table that silently meant "the hub was down" is
    // indistinguishable from "no letters yet", which is the worse failure.
    console.error('[ar/loa] ops-hub fetch failed:', err)
    return NextResponse.json(
      { error: `Could not reach the Operations Hub: ${(err as Error).message ?? 'unknown error'}` },
      { status: 502 },
    )
  }
}
