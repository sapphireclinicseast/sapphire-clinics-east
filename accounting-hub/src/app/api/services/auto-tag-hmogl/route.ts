import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// PT/OT/SLP services whose name starts with one of these HMO providers are HMO;
// services whose name contains "- OP" are GL (outpatient guarantee letter). Both
// bill to a payor → their sales are receivables (isHmoGl = true).
const HMO_PREFIXES = [
  'AMAPHIL', 'AVEGA', 'ASIANCARE', 'HPPI', 'INLIFE', 'INSULAR', 'INTELLICARE',
  'LACSON & LACSON', 'LIFE AND HEALTH HMP', 'MEDASIA', 'MEDOCARE', 'PACIFIC CROSS',
  'PHILBRITISH', 'PHILCARE', 'SUNLIFE', 'VALUCARE',
]

function matchWhere(): Prisma.ServiceWhereInput {
  return {
    department: { in: ['PT', 'OT', 'SLP'] },
    OR: [
      ...HMO_PREFIXES.map(p => ({ name: { startsWith: p, mode: 'insensitive' as const } })),
      { name: { contains: '- OP', mode: 'insensitive' as const } },
    ],
  }
}

// GET: preview which services match (and which are not yet tagged), no writes.
export async function GET() {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const matches = await prisma.service.findMany({ where: matchWhere(), select: { id: true, name: true, department: true, isHmoGl: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({ total: matches.length, alreadyTagged: matches.filter(m => m.isHmoGl).length, services: matches })
}

// POST: tag every matching PT/OT/SLP HMO/GL service as isHmoGl = true.
export async function POST() {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const where = matchWhere()
  const matches = await prisma.service.findMany({ where, select: { name: true, isHmoGl: true }, orderBy: { name: 'asc' } })
  const newlyTagged = matches.filter(m => !m.isHmoGl).map(m => m.name)
  const res = await prisma.service.updateMany({ where, data: { isHmoGl: true } })
  return NextResponse.json({ matched: matches.length, updated: res.count, newlyTagged, names: matches.map(m => m.name) })
}
