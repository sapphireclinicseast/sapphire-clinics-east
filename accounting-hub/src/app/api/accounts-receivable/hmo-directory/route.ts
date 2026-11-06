import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serviceParentName, parentOptions } from '@/lib/service-groups'
import { todayManila } from '@/lib/tuition'
import {
  DIRECTORY_READ_ROLES, DIRECTORY_WRITE_ROLES, MOA_ALERT_DAYS, MOA_ALERT_ROLES, cleanDirectoryInput, moaDaysLeft,
} from '@/lib/hmo-directory'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

/**
 * GET                → every active HMO with its directory details, plus the Services categories
 * GET ?category=NAME → the active services and prices under that category
 * GET ?alerts=1      → MOAs expired or expiring within 30 days (renewal popup and bell)
 */
export async function GET(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string | undefined
  const params = new URL(req.url).searchParams

  if (params.get('alerts') === '1') {
    if (!role || !MOA_ALERT_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    const today = todayManila()
    const rows = await prisma.hmoDirectory.findMany({
      where: {
        moaValidUntil: { not: null, lte: new Date(Date.parse(today) + MOA_ALERT_DAYS * DAY_MS) },
        wallet: { isActive: true },
      },
      orderBy: { moaValidUntil: 'asc' },
      select: { walletId: true, moaValidUntil: true, wallet: { select: { patientName: true } } },
    })
    return NextResponse.json({
      alerts: rows.map(r => {
        const validUntil = (r.moaValidUntil as Date).toISOString().slice(0, 10)
        return { walletId: r.walletId, hmoName: r.wallet.patientName, validUntil, daysLeft: moaDaysLeft(validUntil, today) }
      }),
    })
  }

  if (!role || !DIRECTORY_READ_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const category = params.get('category')
  if (category !== null) {
    const rows = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, parentGroup: true, department: true, branch: true, price: true, newPrice: true, newPriceEffectiveDate: true,
        branchPrices: { select: { branch: true, price: true, newPrice: true, newPriceEffectiveDate: true } },
      },
    })
    const key = category.trim().toUpperCase()
    return NextResponse.json({ services: rows.filter(s => serviceParentName(s).toUpperCase() === key) })
  }

  const [wallets, services] = await Promise.all([
    prisma.digitalWallet.findMany({
      where: { walletType: 'HMO', isActive: true },
      orderBy: { patientName: 'asc' },
      select: { id: true, patientName: true, paysClinicForMd: true, hmoDirectory: true },
    }),
    prisma.service.findMany({ where: { isActive: true }, select: { name: true, parentGroup: true } }),
  ])
  const counts = new Map<string, number>()
  for (const s of services) {
    const k = serviceParentName(s).toUpperCase()
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return NextResponse.json({
    entries: wallets.map(w => ({
      ...w.hmoDirectory,
      earlyDiscountPct: w.hmoDirectory?.earlyDiscountPct != null ? Number(w.hmoDirectory.earlyDiscountPct) : null,
      walletId: w.id,
      hmoName: w.patientName,
      paysClinicForMd: w.paysClinicForMd,
    })),
    categories: parentOptions(services).map(name => ({ name, count: counts.get(name.toUpperCase()) || 0 })),
  })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !DIRECTORY_WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json()
  const walletId = typeof body.walletId === 'string' ? body.walletId : ''
  const wallet = walletId ? await prisma.digitalWallet.findUnique({ where: { id: walletId }, select: { walletType: true } }) : null
  if (!wallet || wallet.walletType !== 'HMO') return NextResponse.json({ error: 'HMO not found' }, { status: 404 })

  const { data, error } = cleanDirectoryInput(body)
  if (error) return NextResponse.json({ error }, { status: 400 })

  const updatedByName = (session.user.name as string) || null
  const saved = await prisma.hmoDirectory.upsert({
    where: { walletId },
    create: { walletId, ...data, updatedByName },
    update: { ...data, updatedByName },
  })
  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string,
      action: 'UPDATE',
      entity: 'hmo_directory',
      entityId: walletId,
      details: { updated: Object.keys(data), moaValidUntil: saved.moaValidUntil?.toISOString().slice(0, 10) ?? null },
    },
  })
  return NextResponse.json({ ok: true })
}
