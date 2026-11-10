import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (!q) return NextResponse.json([])

  // ── Typed the way the name is WRITTEN ────────────────────────────────────
  //
  // Every name in this system reads "LIM, RAYNE GIULIANNA ADRIELE" — on the
  // board, on the spreadsheet, in the dropdowns. So that is what front desk
  // type, and it used to find nothing: the query was matched whole against
  // firstName and against lastName, and "lim, rayne" is neither. Typing just
  // "rayne" worked, which made it look as though the patient was half missing
  // rather than as though the search could not read a comma.
  //
  // Split on commas and spaces instead, and require EVERY word to appear in
  // one name or the other. "lim, rayne", "rayne lim", "lim" and "rayne" then
  // all find her, and a two-word query is narrower than either word alone
  // rather than failing outright.
  const words = q.split(/[\s,]+/).map(w => w.trim()).filter(Boolean)
  if (words.length === 0) return NextResponse.json([])

  const patients = await prisma.patient.findMany({
    where: {
      AND: words.map(w => ({
        OR: [
          { firstName: { contains: w, mode: 'insensitive' as const } },
          { lastName: { contains: w, mode: 'insensitive' as const } },
        ],
      })),
    },
    select: { id: true, firstName: true, lastName: true, email: true, dob: true, patientType: true, branches: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 10,
  })

  return NextResponse.json(patients)
}
