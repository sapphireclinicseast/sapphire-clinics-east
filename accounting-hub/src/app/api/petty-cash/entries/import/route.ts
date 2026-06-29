import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'CEO']
const STR_FIELDS = ['requestor', 'department', 'pcfStatus', 'description', 'vatable',
  'siNumber', 'tinNumber', 'registeredName', 'registeredAddress', 'accountTitle', 'referenceNumber'] as const

function pcvNumber(seq: number): string {
  const yy = new Date().getFullYear() % 100
  return `PCV${yy}-${String(seq).padStart(6, '0')}`
}

// POST /api/petty-cash/entries/import  { branch, rows: [{...editable fields}] }
// Creates one entry per row with sequential auto PCV numbers.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, rows } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
    }
    if (rows.length > 2000) {
      return NextResponse.json({ error: 'Too many rows (max 2000 per import)' }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx) => {
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      let seq = settings.nextPcvSeq
      const out = []
      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {
          branch,
          pcvNumber: pcvNumber(seq),
          pcvSeq: seq,
          createdById: session.user.id ?? null,
        }
        for (const f of STR_FIELDS) {
          const v = row?.[f]
          if (v !== undefined && v !== null && String(v).trim() !== '') data[f] = String(v).trim()
        }
        if (row?.grossAmount !== undefined && row?.grossAmount !== '') data.grossAmount = Number(row.grossAmount) || 0
        if (row?.date) {
          const d = new Date(row.date)
          if (!isNaN(d.getTime())) data.date = d
        }
        out.push(await tx.pettyCashEntry.create({ data }))
        seq++
      }
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: seq } })
      return out
    })

    return NextResponse.json({ created: created.length, entries: created })
  } catch (e) {
    console.error('Petty cash import error:', e)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
