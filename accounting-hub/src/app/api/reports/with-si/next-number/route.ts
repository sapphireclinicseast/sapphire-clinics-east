import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const siInt = (s: string | null) => { const d = String(s || '').replace(/\D/g, ''); return d ? parseInt(d, 10) : null }

// GET ?branch= — the next available Sales Invoice number in the branch's series:
// one past the highest number in use across orders AND AR-payment SIs (same
// booklet). Outliers from other numbering systems (a bank reference typed into
// the SI field) are excluded the same way the With SI report does — by keeping
// only the dominant band around the median — so one stray UB181910 can never
// make the suggestion jump to 181911.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = enforceBranch((session.user as { branch?: string; branches?: string[] }).branch, (session.user as { branches?: string[] }).branches, sp.get('branch')) ?? (sp.get('branch') || '')
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Select a branch' }, { status: 400 })

  try {
    const [orders, arPayments] = await Promise.all([
      prisma.order.findMany({
        where: { branch, salesInvoiceNumber: { not: null } },
        select: { salesInvoiceNumber: true },
      }),
      prisma.aRPayment.findMany({
        where: { branch, salesInvoiceNumber: { not: null } },
        select: { salesInvoiceNumber: true },
      }),
    ])
    const ints = [...orders, ...arPayments]
      .map(r => siInt(r.salesInvoiceNumber))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b)

    if (ints.length === 0) return NextResponse.json({ next: '0001', max: null })

    const BAND_BREAK = 1000
    const mid = Math.floor(ints.length / 2)
    let bandEnd = mid
    while (bandEnd < ints.length - 1 && ints[bandEnd + 1] - ints[bandEnd] <= BAND_BREAK) bandEnd++
    const max = ints[bandEnd]
    const next = max + 1
    return NextResponse.json({ next: String(next).padStart(4, '0'), max: String(max).padStart(4, '0') })
  } catch (err) {
    console.error('Next SI number error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
