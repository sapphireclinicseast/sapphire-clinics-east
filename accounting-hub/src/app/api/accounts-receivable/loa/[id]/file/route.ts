// GET /api/accounts-receivable/loa/[id]/file — open the LOA document.
//
// Proxies the Operations Hub's key-authenticated internal file endpoint.
// Roles and branch scoping are applied HERE (the internal endpoint returns
// everything): branch-locked accounting roles may only open documents whose
// row belongs to their branch, which the ops hub echoes in x-loa-branch.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const READ_ROLES = [
  'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER',
  'AHEA_ADMIN', 'AHGH_ADMIN', 'HMO_OFFICER',
  'AHEA_FRONTDESK', 'AHGH_FRONTDESK',
]
const ROLE_BRANCH: Record<string, string> = {
  AHEA_ADMIN: 'SBEA', AHEA_FRONTDESK: 'SBEA',
  AHGH_ADMIN: 'SBGH', AHGH_FRONTDESK: 'SBGH',
}

const OPS_URL = process.env.OPS_HUB_URL || 'https://operations.sapphireclinicseast.org'
const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!READ_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!API_KEY) {
    return NextResponse.json({ error: 'EXTERNAL_API_KEY is not configured on the Accounting Hub.' }, { status: 500 })
  }

  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  try {
    const res = await fetch(`${OPS_URL}/api/internal/loa/${id}/file`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return NextResponse.json({ error: body.error || `Operations Hub returned ${res.status}` }, { status: res.status === 404 ? 404 : 502 })
    }
    const locked = ROLE_BRANCH[role]
    if (locked && res.headers.get('x-loa-branch') !== locked) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': res.headers.get('content-disposition') || 'inline',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[ar/loa/file] ops-hub fetch failed:', err)
    return NextResponse.json({ error: `Could not reach the Operations Hub: ${(err as Error).message ?? 'unknown error'}` }, { status: 502 })
  }
}
