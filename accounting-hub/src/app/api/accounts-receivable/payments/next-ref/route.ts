// GET /api/accounts-receivable/payments/next-ref?date=YYYY-MM-DD
//
// The next AR collection reference per branch prefix — "AHEA-AR26-0016" — for
// Record Payment to pre-fill. The reference has always been keyed at the head of
// the payment's notes (AHEA-AR26-0015; …, AHGH-AR26-0001 - …, AR25-0022 | …),
// so the sequence is read back from there. An unprefixed AR26-#### belongs to
// AHEA, where those payments were first numbered.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { arRefOf, parseArRef } from '@/lib/ar-ref'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const PREFIXES = ['AHEA', 'AHGH', 'VER'] as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const date = new URL(req.url).searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const yy = date.slice(2, 4)
  const rows = await prisma.aRPayment.findMany({
    where: { notes: { contains: `AR${yy}-` } },
    select: { notes: true },
  })
  const max: Record<string, number> = Object.fromEntries(PREFIXES.map(p => [p, 0]))
  // Only the reference at the head of the notes is the payment's own; a note may
  // mention another payment's number further on (lib/ar-ref).
  for (const r of rows) {
    const parsed = parseArRef(arRefOf(r.notes))
    if (!parsed || parsed.kind !== 'AR' || parsed.yy !== parseInt(yy, 10)) continue
    const prefix = parsed.prefix || 'AHEA'
    max[prefix] = Math.max(max[prefix] ?? 0, parsed.num)
  }
  const next = Object.fromEntries(PREFIXES.map(p => [p, `${p}-AR${yy}-${String((max[p] ?? 0) + 1).padStart(4, '0')}`]))
  return NextResponse.json({ next })
}
