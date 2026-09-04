import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_DEPARTMENTS = ['ALL', 'PT', 'MD', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'ORTHOSIS_PROSTHESIS']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE', 'ALL']
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
  const revenueType = searchParams.get('revenueType') || ''
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

  if (revenueType && VALID_REVENUE_TYPES.includes(revenueType)) {
    where.revenueType = revenueType
  }

  const walletType = searchParams.get('walletType') || ''
  if (walletType) {
    where.walletType = walletType
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
        branchPrices: true,
        eligibleFor: {
          include: {
            eligibleService: { select: { id: true, name: true, department: true, price: true } },
          },
        },
      },
    }),
    prisma.service.count({ where }),
  ])

  // Auto-rollover: if newPriceEffectiveDate has passed, move newPrice → price (and the
  // scheduled fee split, when one was set) and clear the scheduled fields.
  const now = new Date()
  const rolloverPromises: Promise<unknown>[] = []
  for (const s of services) {
    if (s.newPrice != null && s.newPriceEffectiveDate && s.newPriceEffectiveDate <= now) {
      const feeRoll = s.hasDoctorFee && (s.newDoctorFee != null || s.newClinicFee != null)
      const histRows = [
        { serviceId: s.id, field: 'price', oldValue: s.price, newValue: s.newPrice, source: 'SCHEDULED' },
        ...(feeRoll && s.newDoctorFee != null ? [{ serviceId: s.id, field: 'doctorFee', oldValue: s.doctorFee, newValue: s.newDoctorFee, source: 'SCHEDULED' }] : []),
        ...(feeRoll && s.newClinicFee != null ? [{ serviceId: s.id, field: 'clinicFee', oldValue: s.clinicFee, newValue: s.newClinicFee, source: 'SCHEDULED' }] : []),
      ]
      rolloverPromises.push(
        prisma.service.update({
          where: { id: s.id },
          data: {
            price: s.newPrice, newPrice: null, newPriceEffectiveDate: null,
            ...(feeRoll ? { doctorFee: s.newDoctorFee ?? s.doctorFee, clinicFee: s.newClinicFee ?? s.clinicFee } : {}),
            newDoctorFee: null, newClinicFee: null,
          },
        }).then(() => prisma.servicePriceHistory.createMany({ data: histRows }))
      )
      s.price = s.newPrice
      s.newPrice = null
      s.newPriceEffectiveDate = null
      if (feeRoll) {
        s.doctorFee = s.newDoctorFee ?? s.doctorFee
        s.clinicFee = s.newClinicFee ?? s.clinicFee
      }
      s.newDoctorFee = null
      s.newClinicFee = null
    }
    for (const bp of s.branchPrices) {
      if (bp.newPrice != null && bp.newPriceEffectiveDate && bp.newPriceEffectiveDate <= now) {
        rolloverPromises.push(
          prisma.serviceBranchPrice.update({
            where: { id: bp.id },
            data: { price: bp.newPrice, newPrice: null, newPriceEffectiveDate: null },
          })
        )
        bp.price = bp.newPrice
        bp.newPrice = null
        bp.newPriceEffectiveDate = null
      }
    }
  }
  if (rolloverPromises.length > 0) {
    await Promise.all(rolloverPromises)
  }

  // For branch-specific users, filter branchPrices to only their branch
  const userRole = session.user.role as string
  let restrictBranch: string | null = null
  if (userRole === 'AHEA_ADMIN' || userRole === 'AHEA_FRONTDESK') restrictBranch = 'SANDBOX_EAST'
  else if (userRole === 'AHGH_ADMIN' || userRole === 'AHGH_FRONTDESK') restrictBranch = 'SANDBOX_GREENHILLS'

  const filtered = restrictBranch
    ? services.map(s => ({
        ...s,
        branchPrices: s.branchPrices.filter(bp => bp.branch === restrictBranch),
      }))
    : services

  return NextResponse.json(paginatedResult(filtered, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, department, branch, price, newPrice, newPriceEffectiveDate, priceType, revenueType, walletType, packageSessions,
            hasDoctorFee, doctorFee, clinicFee, pwdDiscountClinicOnly, noPwdDiscount, description,
            revenueAccountId, unitPayId, unitPayEnabled, thresholdCounted, thresholdQty, issuedOfficialInvoice, isHmoGl, hmoPaysClinicianDirect, recognitionMonths, eligibleServices, branchPrices } = body

    const hasBranchPrices = Array.isArray(branchPrices) && branchPrices.some((bp: { price?: unknown }) => bp.price != null && bp.price !== '')
    if (!name?.trim() || !department || !branch || (price == null && !hasBranchPrices)) {
      return NextResponse.json({ error: 'Name, department, branch, and price are required' }, { status: 400 })
    }

    if (!VALID_DEPARTMENTS.includes(department)) {
      return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    }

    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })
    }

    const priceNum = price != null && price !== '' ? parseFloat(price) : 0

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        department,
        branch,
        price: isNaN(priceNum) ? 0 : priceNum,
        newPrice: newPrice ? parseFloat(newPrice) : null,
        newPriceEffectiveDate: newPriceEffectiveDate ? new Date(newPriceEffectiveDate) : null,
        priceType: priceType && VALID_PRICE_TYPES.includes(priceType) ? priceType : 'FIXED',
        revenueType: revenueType && VALID_REVENUE_TYPES.includes(revenueType) ? revenueType : 'EARNED',
        walletType: revenueType === 'UNEARNED' && walletType ? walletType : null,
        vipTier: revenueType === 'UNEARNED' && walletType === 'VIP' && body.vipTier ? body.vipTier : null,
        packageSessions: revenueType === 'UNEARNED' && walletType === 'PACKAGE' && packageSessions ? parseInt(packageSessions) : null,
        hasDoctorFee: hasDoctorFee || false,
        doctorFee: hasDoctorFee && doctorFee ? parseFloat(doctorFee) : null,
        clinicFee: hasDoctorFee && clinicFee ? parseFloat(clinicFee) : null,
        // Scheduled split rides with the scheduled price — meaningless without one.
        newDoctorFee: hasDoctorFee && newPrice && body.newDoctorFee ? parseFloat(body.newDoctorFee) : null,
        newClinicFee: hasDoctorFee && newPrice && body.newClinicFee ? parseFloat(body.newClinicFee) : null,
        pwdDiscountClinicOnly: hasDoctorFee ? (pwdDiscountClinicOnly || false) : false,
        noPwdDiscount: noPwdDiscount || false,
        description: description?.trim() || null,
        revenueAccountId: revenueAccountId || null,
        unitPayId: unitPayId || null,
        unitPayEnabled: unitPayEnabled !== undefined ? unitPayEnabled : true,
        thresholdCounted: thresholdCounted || false,
        isHmoGl: isHmoGl || false,
        hmoPaysClinicianDirect: hmoPaysClinicianDirect || false,
        recognitionMonths: recognitionMonths ? Number(recognitionMonths) : null,
        thresholdQty: thresholdQty != null ? Math.max(0.5, Math.round((parseFloat(String(thresholdQty)) || 1) * 2) / 2) : 1,
        issuedOfficialInvoice: issuedOfficialInvoice || false,
        createdById: session.user.id,
      },
    })

    // Create eligible service links (for PACKAGE / VIP)
    if (eligibleServices?.length && revenueType === 'UNEARNED') {
      await prisma.serviceEligibility.createMany({
        data: eligibleServices.map((es: { serviceId: string; discountPercent?: number; sessionCost?: number }) => ({
          parentServiceId: service.id,
          eligibleServiceId: es.serviceId,
          discountPercent: es.discountPercent != null ? Number(es.discountPercent) : null,
          // Sessions deducted per unit (0.5 steps); default 1
          sessionCost: es.sessionCost != null && Number(es.sessionCost) > 0 ? Math.round(Number(es.sessionCost) * 2) / 2 : 1,
        })),
        skipDuplicates: true,
      })
    }

    // Create per-branch price overrides for ALL-branch services
    if (branch === 'ALL' && Array.isArray(branchPrices) && branchPrices.length > 0) {
      for (const bp of branchPrices) {
        if (bp.branch && bp.price != null) {
          await prisma.serviceBranchPrice.create({
            data: {
              serviceId: service.id,
              branch: bp.branch,
              price: parseFloat(bp.price),
              newPrice: bp.newPrice ? parseFloat(bp.newPrice) : null,
              newPriceEffectiveDate: bp.newPriceEffectiveDate ? new Date(bp.newPriceEffectiveDate) : null,
            },
          })
        }
      }
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
    const { id, name, department, branch, price, newPrice, newPriceEffectiveDate, priceType, revenueType, walletType, packageSessions,
            hasDoctorFee, doctorFee, clinicFee, pwdDiscountClinicOnly, noPwdDiscount, description,
            revenueAccountId, unitPayId, unitPayEnabled, thresholdCounted, thresholdQty, issuedOfficialInvoice, isHmoGl, hmoPaysClinicianDirect, recognitionMonths, eligibleServices, branchPrices } = body

    if (!id) {
      return NextResponse.json({ error: 'Service ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (department !== undefined) data.department = department
    if (branch !== undefined) data.branch = branch
    if (price !== undefined) { const p = parseFloat(price); if (!isNaN(p)) data.price = p }
    if (newPrice !== undefined) {
      data.newPrice = newPrice ? parseFloat(newPrice) : null
      // The scheduled split rides with the scheduled price — clearing one clears both.
      if (!newPrice) { data.newDoctorFee = null; data.newClinicFee = null }
    }
    if (newPriceEffectiveDate !== undefined) data.newPriceEffectiveDate = newPriceEffectiveDate ? new Date(newPriceEffectiveDate) : null
    if (body.newDoctorFee !== undefined && data.newDoctorFee === undefined) data.newDoctorFee = body.newDoctorFee ? parseFloat(body.newDoctorFee) : null
    if (body.newClinicFee !== undefined && data.newClinicFee === undefined) data.newClinicFee = body.newClinicFee ? parseFloat(body.newClinicFee) : null
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
        data.newDoctorFee = null
        data.newClinicFee = null
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
    if (unitPayEnabled !== undefined) data.unitPayEnabled = unitPayEnabled
    if (thresholdCounted !== undefined) data.thresholdCounted = !!thresholdCounted
    if (thresholdQty !== undefined) data.thresholdQty = Math.max(0.5, Math.round((parseFloat(String(thresholdQty)) || 1) * 2) / 2)
    if (issuedOfficialInvoice !== undefined) data.issuedOfficialInvoice = issuedOfficialInvoice
    if (isHmoGl !== undefined) data.isHmoGl = !!isHmoGl
    if (hmoPaysClinicianDirect !== undefined) data.hmoPaysClinicianDirect = !!hmoPaysClinicianDirect
    if (recognitionMonths !== undefined) data.recognitionMonths = recognitionMonths ? Number(recognitionMonths) : null

    // Capture the money figures before the write so any movement can be recorded.
    const before = await prisma.service.findUnique({
      where: { id },
      select: { price: true, doctorFee: true, clinicFee: true, newPrice: true, newDoctorFee: true, newClinicFee: true },
    })

    const service = await prisma.service.update({ where: { id }, data })

    // Price history: one row per money field that actually moved. The audit log only
    // records which fields were touched, so this is the only place the old value survives.
    if (before) {
      const MONEY = ['price', 'doctorFee', 'clinicFee', 'newPrice', 'newDoctorFee', 'newClinicFee'] as const
      const rows = MONEY.flatMap((f) => {
        if (!(f in data)) return []
        const oldV = before[f] == null ? null : Number(before[f])
        const newV = (service as Record<string, unknown>)[f] == null ? null : Number((service as Record<string, unknown>)[f])
        if (oldV === newV) return []
        return [{
          serviceId: id,
          field: f,
          oldValue: oldV,
          newValue: newV,
          source: 'EDIT',
          changedById: session.user.id ?? null,
        }]
      })
      if (rows.length > 0) {
        await prisma.servicePriceHistory.createMany({ data: rows })
      }
    }

    // Update eligible services if provided
    if (eligibleServices !== undefined) {
      await prisma.serviceEligibility.deleteMany({ where: { parentServiceId: id } })
      if (eligibleServices?.length) {
        await prisma.serviceEligibility.createMany({
          data: eligibleServices.map((es: { serviceId: string; discountPercent?: number; sessionCost?: number }) => ({
            parentServiceId: id,
            eligibleServiceId: es.serviceId,
            discountPercent: es.discountPercent != null ? Number(es.discountPercent) : null,
            // Sessions deducted per unit (0.5 steps); default 1
            sessionCost: es.sessionCost != null && Number(es.sessionCost) > 0 ? Math.round(Number(es.sessionCost) * 2) / 2 : 1,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Update per-branch price overrides if provided
    if (branchPrices !== undefined) {
      await prisma.serviceBranchPrice.deleteMany({ where: { serviceId: id } })
      if (Array.isArray(branchPrices) && branchPrices.length > 0) {
        for (const bp of branchPrices) {
          if (bp.branch && bp.price != null) {
            await prisma.serviceBranchPrice.create({
              data: {
                serviceId: id,
                branch: bp.branch,
                price: parseFloat(bp.price),
                newPrice: bp.newPrice ? parseFloat(bp.newPrice) : null,
                newPriceEffectiveDate: bp.newPriceEffectiveDate ? new Date(bp.newPriceEffectiveDate) : null,
              },
            })
          }
        }
      }
    }

    // Re-fetch with eligibility + revenue account + unit pay + branch prices
    const result = await prisma.service.findUnique({
      where: { id },
      include: {
        revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
        unitPay: { select: { id: true, name: true } },
        branchPrices: true,
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
