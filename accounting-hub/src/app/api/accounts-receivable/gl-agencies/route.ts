import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { agencyOptions } from '@/lib/gl-stage'

// GET → { agencies: string[] } — the Guarantee Letter agency dropdown list:
// STAR, ODESFA and LGU, then every other agency already set on a GL wallet or a
// Detailed GL entry. Adding an agency is just setting it on a letter; from then
// on it is offered everywhere (lib/gl-stage).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [wallets, cases] = await Promise.all([
    prisma.digitalWallet.findMany({ where: { agency: { not: null } }, distinct: ['agency'], select: { agency: true } }),
    prisma.glCase.findMany({ where: { agency: { not: null } }, distinct: ['agency'], select: { agency: true } }),
  ])
  return NextResponse.json({ agencies: agencyOptions([...wallets, ...cases].map(r => r.agency)) })
}
