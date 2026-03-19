import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ barcode: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { barcode } = await params

    const wallet = await prisma.digitalWallet.findUnique({
      where: { barcode },
      include: {
        packages: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!wallet || !wallet.isActive) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: wallet.id,
      barcode: wallet.barcode,
      patientId: wallet.patientId,
      patientName: wallet.patientName,
      patientEmail: wallet.patientEmail,
      rewardPoints: wallet.rewardPoints,
      packages: wallet.packages,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
