import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// PATCH: Update upload status (UPLOADED → ACCEPTED → FINALIZED)
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { uploadId, status } = await req.json()

  if (!uploadId || !status || !['ACCEPTED', 'FINALIZED'].includes(status)) {
    return NextResponse.json({ error: 'Missing uploadId or invalid status' }, { status: 400 })
  }

  const upload = await prisma.timekeepingUpload.update({
    where: { id: uploadId },
    data: { status },
  })

  return NextResponse.json(upload)
}
