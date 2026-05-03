import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — public (used by TV display to check settings)
export async function GET() {
  const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
  return NextResponse.json({
    showLeaderboard: settings?.showLeaderboard ?? false,
    showComplaintForm: settings?.showComplaintForm ?? false,
  })
}

// PATCH — auth required (used by Ads Manager to toggle features)
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const data: Record<string, boolean> = {}
  if (typeof body.showLeaderboard === 'boolean') data.showLeaderboard = body.showLeaderboard
  if (typeof body.showComplaintForm === 'boolean') data.showComplaintForm = body.showComplaintForm

  const settings = await prisma.surveySettings.upsert({
    where: { id: 'default' },
    update: data,
    create: { id: 'default', ...data },
  })

  return NextResponse.json({
    showLeaderboard: settings.showLeaderboard,
    showComplaintForm: settings.showComplaintForm,
  })
}
