import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sortDays } from '@/lib/decking-days'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')

  const configs = await prisma.deckingTherapistConfig.findMany({
    where: branch ? { branch } : {},
  })
  return NextResponse.json(configs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, workDays: rawWorkDays, startTime, endTime, useDefault, branch, department, deliveryMode: rawMode } = await req.json()
  // Null = the consultant's general schedule (what every row was before this).
  // A named service overrides it, so on-site days and teletherapy days can
  // differ. Anything unrecognised falls back to the general row rather than
  // creating a schedule no board will ever read.
  const deliveryMode = ['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(rawMode) ? rawMode : null
  // Stored in calendar order so the board never has to trust the order the
  // checkboxes arrived in. The boards sort on render too — this just stops new
  // rows from being written scrambled in the first place.
  const workDays = sortDays(Array.isArray(rawWorkDays) ? rawWorkDays : [])
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

  // Interbranch staff get one config PER branch (staffId+branch is the unique
  // key, not staffId alone) — otherwise saving a secondary-branch schedule
  // would silently overwrite their primary-branch config.
  const config = await prisma.deckingTherapistConfig.upsert({
    where: { staffId_branch_deliveryMode: { staffId, branch, deliveryMode } },
    create: {
      staffId,
      workDays: workDays ?? [],
      startTime: startTime ?? '10:00',
      endTime: endTime ?? '20:00',
      useDefault: useDefault ?? true,
      branch: branch ?? '',
      department: department ?? '',
      deliveryMode,
    },
    update: { workDays, startTime, endTime, useDefault, branch, department },
  })
  return NextResponse.json(config)
}


/**
 * Remove a service-specific schedule, putting that service back on the
 * consultant's general days. Deleting the general row is not offered here —
 * that is what the work-days checkboxes already do by clearing them.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, branch, deliveryMode } = await req.json()
  if (!staffId || !branch) {
    return NextResponse.json({ error: 'staffId and branch are required' }, { status: 400 })
  }
  if (!['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode)) {
    return NextResponse.json({ error: 'deliveryMode must name a service' }, { status: 400 })
  }

  await prisma.deckingTherapistConfig.deleteMany({ where: { staffId, branch, deliveryMode } })
  return NextResponse.json({ ok: true })
}
