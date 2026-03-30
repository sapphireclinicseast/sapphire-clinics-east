import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_DEPARTMENTS = ['ALL', 'PT', 'MD', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'ORTHOSIS_PROSTHESIS']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'ALL']
const VALID_PRICE_TYPES = ['FIXED', 'ADJUSTABLE']
const VALID_REVENUE_TYPES = ['EARNED', 'UNEARNED']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const department = searchParams.get('department') || ''
  const branch = searchParams.get('branch') || ''
  const sortField = searchParams.get('sortField') || 'name'
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }

  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  if (department && VALID_DEPARTMENTS.includes(department)) {
    where.department = department
  }

  if (branch && VALID_BRANCHES.includes(branch) && branch !== 'ALL') {
    where.branch = { in: [branch, 'ALL'] }
  }

  // Build orderBy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy: any = {}
  if (['name', 'department', 'branch', 'price', 'createdAt'].includes(sortField)) {
    orderBy[sortField] = sortDir
  } else {
    orderBy.name = 'asc'
  }

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
        unitPay: { select: { id: true, name: true } },
        eligibleFor: {
          include: {
            eligibleService: { select: { id: true, name: true, department: true, price: true } },
          },
        },
      },
    }),
    prisma.service.count({ where }),
  ])

  return NextResponse.json(paginatedResult(services, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, department, branch, price, priceType, revenueType, walletType, packageSessions,
            hasDoctorFee, doctorFee, clinicFee, pwdDiscountClinicOnly, noPwdDiscount, description,
            revenueAccountId, unitPayId, eligibleServices } = body

    if (!name?.trim() || !department || !branch || price == null) {
      return NextResponse.json({ error: 'Name, department, branch, and price are required' }, { status: 400 })
    }

    if (!VALID_DEPARTMENTS.includes(department)) {
      return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    }

    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })
    }

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        department,
        branch,
        price: parseFloat(price),
        priceType: priceType && VALID_PRICE_TYPES.includes(priceType) ? priceType : 'FIXED',
        revenueType: revenueType && VALID_REVENUE_TYPES.includes(revenueType) ? revenueType : 'EARNED',
        walletType: revenueType === 'UNEARNED' && walletType ? walletType : null,
        vipTier: revenueType === 'UNEARNED' && walletType === 'VIP' && body.vipTier ? body.vipTier : null,
        packageSessions: revenueType === 'UNEARNED' && walletType === 'PACKAGE' && packageSessions ? parseInt(packageSessions) : null,
        hasDoctorFee: hasDoctorFee || false,
        doctorFee: hasDoctorFee && doctorFee ? parseFloat(doctorFee) : null,
        clinicFee: hasDoctorFee && clinicFee ? parseFloat(clinicFee) : null,
        pwdDiscountClinicOnly: hasDoctorFee ? (pwdDiscountClinicOnly || false) : false,
        noPwdDiscount: noPwdDiscount || false,
        description: description?.trim() || null,
        revenueAccountId: revenueAccountId || null,
        unitPayId: unitPayId || null,
        createdById: session.user.id,
      },
    })

    // Create eligible service links (for PACKAGE / VIP)
    if (eligibleServices?.length && revenueType === 'UNEARNED') {
      await prisma.serviceEligibility.createMany({
        data: eligibleServices.map((es: { serviceId: string; discountPercent?: number }) => ({
          parentServiceId: service.id,
          eligibleServiceId: es.serviceId,
          discountPercent: es.discountPercent != null ? Number(es.discountPercent) : null,
        })),
        skipDuplicates: true,
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'service',
        entityId: service.id,
        details: { name: service.name, department, branch, price: service.price },
      },
    })

    return NextResponse.json(service, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, name, department, branch, price, priceType, revenueType, walletType, packageSessions,
            hasDoctorFee, doctorFee, clinicFee, pwdDiscountClinicOnly, noPwdDiscount, description,
            revenueAccountId, unitPayId, eligibleServices } = body

    if (!id) {
      return NextResponse.json({ error: 'Service ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (department !== undefined) data.department = department
    if (branch !== undefined) data.branch = branch
    if (price !== undefined) data.price = parseFloat(price)
    if (priceType !== undefined) data.priceType = priceType
    if (revenueType !== undefined) {
      data.revenueType = revenueType
      data.walletType = revenueType === 'UNEARNED' && walletType ? walletType : null
      data.vipTier = revenueType === 'UNEARNED' && walletType === 'VIP' && body.vipTier ? body.vipTier : null
      data.packageSessions = revenueType === 'UNEARNED' && walletType === 'PACKAGE' && packageSessions ? parseInt(packageSessions) : null
    }
    if (hasDoctorFee !== undefined) {
      data.hasDoctorFee = hasDoctorFee
      if (!hasDoctorFee) {
        data.doctorFee = null
        data.clinicFee = null
        data.pwdDiscountClinicOnly = false
      }
    }
    if (doctorFee !== undefined) data.doctorFee = doctorFee ? parseFloat(doctorFee) : null
    if (clinicFee !== undefined) data.clinicFee = clinicFee ? parseFloat(clinicFee) : null
    if (pwdDiscountClinicOnly !== undefined) data.pwdDiscountClinicOnly = pwdDiscountClinicOnly
    if (noPwdDiscount !== undefined) data.noPwdDiscount = noPwdDiscount
    if (description !== undefined) data.description = description?.trim() || null
    if (revenueAccountId !== undefined) data.revenueAccountId = revenueAccountId || null
    if (unitPayId !== undefined) data.unitPayId = unitPayId || null

    const service = await prisma.service.update({ where: { id }, data })

    // Update eligible services if provided
    if (eligibleServices !== undefined) {
      await prisma.serviceEligibility.deleteMany({ where: { parentServiceId: id } })
      if (eligibleServices?.length) {
        await prisma.serviceEligibility.createMany({
          data: eligibleServices.map((es: { serviceId: string; discountPercent?: number }) => ({
            parentServiceId: id,
            eligibleServiceId: es.serviceId,
            discountPercent: es.discountPercent != null ? Number(es.discountPercent) : null,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Re-fetch with eligibility + revenue account + unit pay
    const result = await prisma.service.findUnique({
      where: { id },
      include: {
        revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
        unitPay: { select: { id: true, name: true } },
        eligibleFor: {
          include: { eligibleService: { select: { id: true, name: true, department: true, price: true } } },
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'service',
        entityId: service.id,
        details: { updated: Object.keys(data) },
      },
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Service ID is required' }, { status: 400 })

    await prisma.service.update({ where: { id }, data: { isActive: false } })
    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'DEACTIVATE', entity: 'service', entityId: id },
    })

    return NextResponse.json({ message: 'Service deactivated' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
