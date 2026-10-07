import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchHrStaffForSync } from '@/lib/external-staff'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MEDREP']

// GET → the one-time new-referred-patient incentive settings (who receives it,
// ₱ per new patient) plus the HR staff roster for the recipient dropdown.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [settings, staff] = await Promise.all([
    prisma.referralIncentiveSettings.findUnique({ where: { id: 'MAIN' } }),
    fetchHrStaffForSync(),
  ])
  return NextResponse.json({
    staffId: settings?.staffId || null,
    staffName: settings?.staffName || null,
    amount: settings ? Number(settings.amount) : 50,
    staff: staff
      .map(s => ({ id: String(s.id || ''), name: `${String(s.firstName || '').trim()} ${String(s.lastName || '').trim()}`.trim().toUpperCase(), jobTitle: String(s.jobTitle || '') }))
      .filter(s => s.id && s.name)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })
}

// POST { staffId, staffName, amount } → save the singleton.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { staffId, staffName, amount } = await req.json()
    const amt = Math.max(0, Number(amount) || 0)
    const saved = await prisma.referralIncentiveSettings.upsert({
      where: { id: 'MAIN' },
      create: { id: 'MAIN', staffId: staffId || null, staffName: staffName?.trim() || null, amount: amt },
      update: { staffId: staffId || null, staffName: staffName?.trim() || null, amount: amt },
    })
    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'UPDATE', entity: 'referral-incentive-settings', details: { staffName: saved.staffName, amount: amt } },
    })
    return NextResponse.json({ staffId: saved.staffId, staffName: saved.staffName, amount: Number(saved.amount) })
  } catch (e) {
    console.error('Incentive settings save error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
