// PATCH /api/progress-reports/[id]/paid — toggle paid state.
// body: { paid: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { paid } = await req.json()
  const userId = (session.user as { id?: string } | undefined)?.id ?? null

  const doc = await prisma.patientDocument.update({
    where: { id },
    data: paid
      ? { paidForAt: new Date(), paidById: userId ?? undefined }
      : { paidForAt: null, paidById: null },
  })

  return NextResponse.json({ ok: true, paidForAt: doc.paidForAt })
}
