import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// GET ?branch= — the saved "Other Fees" template for a branch (used to prefill benefit RFPs)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!branch) return NextResponse.json({ fees: [] })
  const tpl = await prisma.benefitRfpFeeTemplate.findUnique({ where: { branch } })
  return NextResponse.json({ fees: Array.isArray(tpl?.fees) ? tpl!.fees : [] })
}

// PUT { branch, fees } — save/replace the template (empty fees clears it)
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { branch, fees } = await req.json()
  if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })
  const clean = Array.isArray(fees) ? fees : []
  const tpl = await prisma.benefitRfpFeeTemplate.upsert({
    where: { branch },
    update: { fees: clean },
    create: { branch, fees: clean },
  })
  return NextResponse.json({ ok: true, fees: tpl.fees })
}
