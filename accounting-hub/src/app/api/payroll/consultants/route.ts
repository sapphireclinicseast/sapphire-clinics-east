import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

/** Branch-specific roles can only see their branch + VERDANA */
function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

/** Format name as ALL CAPS: "FIRSTNAME LASTNAME" */
function formatName(s: string): string {
  return s.toUpperCase()
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const department = searchParams.get('department') || ''
  const sync = searchParams.get('sync') === 'true'

  // Optionally sync from marketing hub
  if (sync) {
    try {
      const res = await fetch(`${MARKETING_HUB_URL}/api/staff/external?includeHR=true`, {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const staff = data.staff || []
        const syncedExternalIds = new Set<string>()

        // Phase 1: Clean existing duplicates (same name + same branch, prefer one with externalStaffId)
        const allConsultants = await prisma.consultant.findMany({ where: { isActive: true } })
        const seenNames = new Map<string, typeof allConsultants[0]>()
        for (const c of allConsultants) {
          const key = `${c.name.toUpperCase()}|${c.branch}`
          const prev = seenNames.get(key)
          if (prev) {
            const keep = c.externalStaffId && !prev.externalStaffId ? c : prev
            const remove = keep === c ? prev : c
            await prisma.consultant.update({ where: { id: remove.id }, data: { isActive: false } })
            seenNames.set(key, keep)
          } else {
            seenNames.set(key, c)
          }
        }

        // Phase 2: Sync from marketing hub
        for (const s of staff) {
          const name = formatName(`${s.firstName} ${s.lastName}`)
          const dept = s.department || ''
          const br = s.branch || ''
          // Only sync clinical departments (not admin/front desk)
          if (['FRONT_DESK', 'ADMINISTRATION'].includes(dept)) continue

          syncedExternalIds.add(s.id)

          let existing = await prisma.consultant.findUnique({ where: { externalStaffId: s.id } })

          // If not found by externalStaffId, try matching by name to link manual entries
          if (!existing) {
            const nameMatch = await prisma.consultant.findFirst({
              where: { name: { equals: name, mode: 'insensitive' }, branch: br, externalStaffId: null, isActive: true },
            })
            if (nameMatch) {
              await prisma.consultant.update({
                where: { id: nameMatch.id },
                data: { externalStaffId: s.id },
              })
              existing = { ...nameMatch, externalStaffId: s.id }
            }
          }

          const syncData: Record<string, unknown> = { name, department: dept, branch: br }

          // Sync contact info
          if (s.email) syncData.email = s.email
          if (s.phone) syncData.phone = s.phone
          if (s.bankName) syncData.bankName = s.bankName
          if (s.bankAccountNo) syncData.bankAccountNo = s.bankAccountNo

          // Sync Bio ID (employeeId from Marketing Hub = biometric device ID for payreg)
          if (s.employeeId) {
            const bioId = parseInt(s.employeeId)
            if (!isNaN(bioId)) syncData.bioId = bioId
          }

          // Pre-fill government IDs from HR platform if not already set
          if (s.tin && (!existing || !existing.tinNumber)) syncData.tinNumber = s.tin
          if (s.sss && (!existing || !existing.sssNumber)) syncData.sssNumber = s.sss
          if (s.philhealth && (!existing || !existing.philhealthNumber)) syncData.philhealthNumber = s.philhealth
          if (s.pagibig && (!existing || !existing.pagibigNumber)) syncData.pagibigNumber = s.pagibig

          await prisma.consultant.upsert({
            where: { externalStaffId: s.id },
            update: syncData,
            create: { externalStaffId: s.id, name, department: dept, branch: br, ...syncData },
          })
        }

        // Phase 3: Soft-delete consultants removed from marketing hub
        // Only affect those that were previously synced (have externalStaffId)
        if (syncedExternalIds.size > 0) {
          const linkedConsultants = await prisma.consultant.findMany({
            where: { externalStaffId: { not: null }, isActive: true },
          })
          for (const c of linkedConsultants) {
            if (c.externalStaffId && !syncedExternalIds.has(c.externalStaffId)) {
              await prisma.consultant.update({ where: { id: c.id }, data: { isActive: false } })
            }
          }
        }
      }
    } catch (e) {
      console.error('Consultant sync error:', e)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (department) where.department = department

  // Enforce branch restriction based on role
  const allowed = allowedBranches((session.user as { role?: string }).role || '')
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.branch = branch
  } else if (allowed) {
    where.branch = { in: allowed }
  }

  const consultants = await prisma.consultant.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      unitPayRates: {
        include: { unitPay: { select: { id: true, name: true } } },
      },
    },
  })

  return NextResponse.json(consultants)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, department, branch, externalStaffId } = await req.json()
    if (!name?.trim() || !department || !branch) {
      return NextResponse.json({ error: 'Name, department, and branch are required' }, { status: 400 })
    }

    const consultant = await prisma.consultant.create({
      data: {
        name: name.trim(),
        department,
        branch,
        externalStaffId: externalStaffId || null,
      },
    })

    return NextResponse.json(consultant, { status: 201 })
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
    const { id, taxDeduction, monthlyRetainer, unitPayRates, isActive, name, department, branch, birAddress } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (taxDeduction !== undefined) data.taxDeduction = taxDeduction
    if (monthlyRetainer !== undefined) data.monthlyRetainer = Number(monthlyRetainer)
    if (isActive !== undefined) data.isActive = isActive
    if (name !== undefined) data.name = name.trim()
    if (department !== undefined) data.department = department
    if (branch !== undefined) data.branch = branch
    if (birAddress !== undefined) data.birAddress = birAddress || null

    const consultant = await prisma.consultant.update({ where: { id }, data })

    // Update unit pay rates if provided
    if (unitPayRates && Array.isArray(unitPayRates)) {
      // Delete existing and recreate
      await prisma.consultantUnitPay.deleteMany({ where: { consultantId: id } })
      if (unitPayRates.length > 0) {
        await prisma.consultantUnitPay.createMany({
          data: unitPayRates.map((r: { unitPayId: string; amount: number; disabled?: boolean; thresholdEnabled?: boolean; thresholdAmount?: number; reducedAmount?: number }) => ({
            consultantId: id,
            unitPayId: r.unitPayId,
            amount: Number(r.amount),
            disabled: r.disabled || false,
            thresholdEnabled: r.thresholdEnabled || false,
            thresholdAmount: r.thresholdAmount != null ? Number(r.thresholdAmount) : null,
            reducedAmount: r.reducedAmount != null ? Number(r.reducedAmount) : null,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Re-fetch with rates
    const result = await prisma.consultant.findUnique({
      where: { id },
      include: {
        unitPayRates: {
          include: { unitPay: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
