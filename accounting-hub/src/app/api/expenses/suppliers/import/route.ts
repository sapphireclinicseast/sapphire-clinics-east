import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

// POST /api/expenses/suppliers/import  { branch, rows: [{registeredName, registeredAddress?, tin?}] }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, rows } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
    let created = 0
    for (const r of rows.slice(0, 2000)) {
      const name = String(r.registeredName || '').trim()
      if (!name) continue
      await prisma.expenseSupplier.upsert({
        where: { branch_registeredName: { branch, registeredName: name } },
        update: { registeredAddress: r.registeredAddress ? String(r.registeredAddress) : null, tin: r.tin ? String(r.tin) : null },
        create: { branch, registeredName: name, registeredAddress: r.registeredAddress ? String(r.registeredAddress) : null, tin: r.tin ? String(r.tin) : null },
      })
      created++
    }
    return NextResponse.json({ created })
  } catch (e) {
    console.error('Supplier import error:', e)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
