/**
 * GET /api/contract — the signed-in staff member's employment contract (metadata).
 *
 * HR uploads one contract per staff member in HR Hub › Staff Profiles. This
 * asks HR for the one filed under the signed-in email, using the shared
 * service key (TELETHERAPY_HR_API_KEY). Returns { contract: null } when HR has
 * none on file. The PDF itself streams through /api/contract/file.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.TELETHERAPY_HR_API_KEY ?? ''

export interface ContractMeta { originalName: string; size: number; uploadedAt: string; uploadedBy: string }

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!HR_KEY) return NextResponse.json({ error: 'TELETHERAPY_HR_API_KEY is not configured on the server' }, { status: 500 })
  try {
    const res = await fetch(`${HR_API_BASE}/internal/staff-contract?email=${encodeURIComponent(session.user.email.toLowerCase())}`, {
      headers: { 'x-api-key': HR_KEY }, cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: `HR hub returned ${res.status}` }, { status: 502 })
    const data = (await res.json()) as { ok: boolean; contract: ContractMeta | null }
    return NextResponse.json({ contract: data.contract ?? null })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach HR hub', detail: (err as Error).message }, { status: 502 })
  }
}
