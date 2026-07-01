import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchHrStaffForSync } from '@/lib/external-staff'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

/** Branch-specific roles can only see their branch + VERDANA */
function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null // ADMIN, ACCOUNTANT, VIEWER — no restriction
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const department = searchParams.get('department') || ''
  const sync = searchParams.get('sync') === 'true'
  const includeInactive = searchParams.get('includeInactive') === 'true'

  // Sync employees straight from the HR Platform (authoritative for all branches).
  // Aura Health employees are filtered by employmentType='employee'; Verdana staff
  // are all included (handled below).
  if (sync) {
    try {
      const staff = await fetchHrStaffForSync()
      if (staff.length > 0) {
        // Track which externalStaffIds are valid employees (for purge step below)
        const validExternalIds = new Set<string>()

        for (const s of staff) {
          const br = s.branch || ''
          const isVerdana = ['VDNA', 'VERDANA'].includes(br.toUpperCase())
          // Only sync staff with employmentType='employee' (not consultants/therapists on
          // retainer). Verdana Store staff are ALL synced regardless of employment type.
          if (!isVerdana && s.employmentType !== 'employee') continue

          validExternalIds.add(s.id)
          const normalizedBranch = isVerdana ? 'VERDANA' : br

          try {
            // Fields to sync — deliberately excludes dailyRate / monthlyRate / rateType
            // so manually-entered pay rates are never overwritten.
            const syncData: Record<string, unknown> = {
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              department: s.department || '',
              branch: normalizedBranch,
              jobTitle: s.hrJobTitle || s.jobTitle || null,
              email: s.email || null,
              phone: s.phone || null,
              isActive: true,
            }

            // Marketing Hub employeeId = biometric device ID = Bio ID in accounting hub.
            const bioId = s.employeeId ? parseInt(s.employeeId) : NaN

            // Always sync government IDs and bank details from HR platform (authoritative source).
            if (s.sss) syncData.sssNumber = s.sss
            if (s.philhealth) syncData.philhealthNumber = s.philhealth
            if (s.pagibig) syncData.pagibigNumber = s.pagibig
            if (s.tin) syncData.tinNumber = s.tin
            if (s.bankName) syncData.bankName = s.bankName
            if (s.bankAccountNo) syncData.bankAccountNo = s.bankAccountNo
            // Date Hired from HR staff profile (used on the Certificate of Employment).
            // Only set when HR has a value so a manually-entered date is never wiped.
            if (s.dateHired) { const dh = new Date(s.dateHired); if (!isNaN(+dh)) syncData.dateHired = dh }

            // ── Find existing record (priority: Bio ID → externalStaffId → name+branch) ──
            // This prevents duplicate creation when the same person already exists.
            let existing: { id: string; employeeBioId: number | null; externalStaffId: string | null; branch: string; isActive?: boolean } | null = null

            // 1. Match by Bio ID + same branch (most reliable — same physical device ID)
            if (!isNaN(bioId) && bioId > 0) {
              existing = await prisma.employee.findFirst({
                where: { employeeBioId: bioId, branch: normalizedBranch },
                select: { id: true, employeeBioId: true, externalStaffId: true, branch: true },
              }) ?? null
            }

            // 2. Match by externalStaffId (previously synced record)
            if (!existing) {
              existing = await prisma.employee.findUnique({
                where: { externalStaffId: s.id },
                select: { id: true, employeeBioId: true, externalStaffId: true, branch: true },
              }) ?? null
            }

            // 3. Match by name + branch (catches manually-entered records, any link state)
            // Prefer active records so we don't accidentally relink a soft-deleted duplicate.
            if (!existing) {
              existing = await prisma.employee.findFirst({
                where: {
                  firstName: { equals: s.firstName || '', mode: 'insensitive' },
                  lastName: { equals: s.lastName || '', mode: 'insensitive' },
                  branch: normalizedBranch,
                },
                select: { id: true, employeeBioId: true, externalStaffId: true, branch: true, isActive: true },
                orderBy: { isActive: 'desc' }, // prefer active records
              }) ?? null
            }

            // Set Bio ID on syncData only if no conflict with a DIFFERENT record
            if (!isNaN(bioId) && bioId > 0) {
              const bioConflict = await prisma.employee.findFirst({
                where: { employeeBioId: bioId, ...(existing ? { id: { not: existing.id } } : {}) },
                select: { id: true, firstName: true, lastName: true, branch: true },
              })
              if (!bioConflict) {
                syncData.employeeBioId = bioId
              } else {
                console.warn(
                  `[payroll-sync] Bio ID ${bioId} conflict for ${s.firstName} ${s.lastName} (${normalizedBranch}): ` +
                  `already assigned to employee ${(bioConflict as Record<string,unknown>).firstName} ${(bioConflict as Record<string,unknown>).lastName} ` +
                  `(${(bioConflict as Record<string,unknown>).branch}) — Bio ID skipped`
                )
              }
            }

            if (existing) {
              // Ensure the record is linked to this Marketing Hub staff ID
              if (existing.externalStaffId !== s.id) {
                await prisma.employee.update({ where: { id: existing.id }, data: { externalStaffId: s.id } })
              }
              // Update info fields only — pay rates (dailyRate, monthlyRate, rateType) are untouched
              await prisma.employee.update({ where: { id: existing.id }, data: syncData })
            } else {
              // Genuinely new employee not found by any matching method — create
              await prisma.employee.create({
                data: {
                  externalStaffId: s.id,
                  ...syncData,
                  firstName: syncData.firstName as string,
                  lastName: syncData.lastName as string,
                  department: syncData.department as string,
                  branch: syncData.branch as string,
                },
              })
            }
          } catch (empErr) {
            console.error(`Employee sync error for ${s.firstName} ${s.lastName} (${br}):`, empErr)
          }
        }

        // ── Purge: deactivate synced employees no longer in the valid employee set ──
        // Catches consultants/clinical staff added by a previous code version.
        // Manually-entered employees (no externalStaffId) are never touched.
        if (validExternalIds.size > 0) {
          try {
            const toDeactivate = await prisma.employee.findMany({
              where: {
                isActive: true,
                externalStaffId: { not: null },
                NOT: [{ externalStaffId: { in: [...validExternalIds] } }],
              },
              select: { id: true, employeeBioId: true },
            })
            for (const emp of toDeactivate) {
              // Clear Bio ID first to release the unique constraint, then deactivate
              await prisma.employee.update({
                where: { id: emp.id },
                data: { ...(emp.employeeBioId ? { employeeBioId: null } : {}), isActive: false },
              })
            }
          } catch (purgeErr) {
            console.error('Non-employee purge error:', purgeErr)
          }
        }

        // ── Duplicate cleanup: deactivate same-name+branch extras, keep synced record ──
        // Run after sync so any records reactivated above are also deduplicated.
        try {
          const activeEmps = await prisma.employee.findMany({ where: { isActive: true } })
          const seen = new Map<string, typeof activeEmps[0]>()
          for (const emp of activeEmps) {
            const key = `${emp.firstName.toUpperCase()}|${emp.lastName.toUpperCase()}|${emp.branch}`
            const prev = seen.get(key)
            if (prev) {
              const keepSynced = emp.externalStaffId && !prev.externalStaffId ? emp : prev
              const removeDup = keepSynced === emp ? prev : emp
              if (removeDup.employeeBioId) {
                await prisma.employee.update({ where: { id: removeDup.id }, data: { employeeBioId: null } })
              }
              await prisma.employee.update({ where: { id: removeDup.id }, data: { isActive: false } })
              seen.set(key, keepSynced)
            } else {
              seen.set(key, emp)
            }
          }
        } catch (dupErr) {
          console.error('Duplicate cleanup error:', dupErr)
        }
      }
    } catch (e) {
      console.error('Employee sync error:', e)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (!includeInactive) where.isActive = true
  if (department) where.department = department

  // Enforce branch restriction based on role
  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    // If user requested a specific branch, only allow if within their permitted branches
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.branch = branch
  } else if (allowed) {
    // No branch specified — restrict to allowed branches
    where.branch = { in: allowed }
  }

  const employees = await prisma.employee.findMany({
    where,
    include: {
      benefits: { where: { isActive: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(employees)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    firstName, lastName, email, department, branch, jobTitle,
    rateType, dailyRate, monthlyRate, employeeBioId,
    sssNumber, philhealthNumber, pagibigNumber, tinNumber,
    dateHired, regularizationDate, scheduleIn, scheduleOut, daySchedules, restDay,
    ignoreTimekeeping,
  } = body

  if (!firstName || !lastName || !department || !branch) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const employee = await prisma.employee.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      department,
      branch,
      jobTitle: jobTitle || null,
      rateType: rateType || 'DAILY',
      dailyRate: dailyRate || 0,
      monthlyRate: monthlyRate || 0,
      employeeBioId: employeeBioId ? parseInt(employeeBioId) : null,
      sssNumber: sssNumber || null,
      philhealthNumber: philhealthNumber || null,
      pagibigNumber: pagibigNumber || null,
      tinNumber: tinNumber || null,
      dateHired: dateHired ? new Date(dateHired) : null,
      regularizationDate: regularizationDate ? new Date(regularizationDate) : null,
      scheduleIn: scheduleIn || '08:00',
      scheduleOut: scheduleOut || '17:00',
      daySchedules: daySchedules || null,
      restDay: restDay || 'SUNDAY',
      ignoreTimekeeping: ignoreTimekeeping === true,
    },
  })

  return NextResponse.json(employee)
}

function buildUpdateData(data: Record<string, unknown>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {}
  if (data.firstName !== undefined) updateData.firstName = data.firstName
  if (data.lastName !== undefined) updateData.lastName = data.lastName
  if (data.email !== undefined) updateData.email = data.email || null
  if (data.department !== undefined) updateData.department = data.department
  if (data.branch !== undefined) updateData.branch = data.branch
  if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle || null
  if (data.rateType !== undefined) updateData.rateType = data.rateType
  if (data.dailyRate !== undefined) updateData.dailyRate = data.dailyRate
  if (data.monthlyRate !== undefined) updateData.monthlyRate = data.monthlyRate
  if (data.employeeBioId !== undefined) updateData.employeeBioId = data.employeeBioId ? parseInt(String(data.employeeBioId)) : null
  if (data.sssNumber !== undefined) updateData.sssNumber = data.sssNumber || null
  if (data.philhealthNumber !== undefined) updateData.philhealthNumber = data.philhealthNumber || null
  if (data.pagibigNumber !== undefined) updateData.pagibigNumber = data.pagibigNumber || null
  if (data.tinNumber !== undefined) updateData.tinNumber = data.tinNumber || null
  if (data.dateHired !== undefined) updateData.dateHired = data.dateHired ? new Date(data.dateHired as string) : null
  if (data.regularizationDate !== undefined) updateData.regularizationDate = data.regularizationDate ? new Date(data.regularizationDate as string) : null
  if (data.scheduleIn !== undefined) updateData.scheduleIn = data.scheduleIn
  if (data.scheduleOut !== undefined) updateData.scheduleOut = data.scheduleOut
  if (data.daySchedules !== undefined) updateData.daySchedules = data.daySchedules || null
  if (data.restDay !== undefined) updateData.restDay = data.restDay
  if (data.ignoreTimekeeping !== undefined) updateData.ignoreTimekeeping = data.ignoreTimekeeping === true
  if (data.isActive !== undefined) updateData.isActive = data.isActive
  return updateData
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Support bulk update: { bulk: [{ id, ...fields }, ...] }
  if (body.bulk && Array.isArray(body.bulk)) {
    const results = []
    for (const item of body.bulk) {
      const { id, ...data } = item
      if (!id) continue
      const updateData = buildUpdateData(data)
      if (Object.keys(updateData).length === 0) continue
      const emp = await prisma.employee.update({ where: { id }, data: updateData })
      results.push(emp)
    }
    return NextResponse.json(results)
  }

  // Single update
  const { id, ...data } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing employee id' }, { status: 400 })
  }

  const updateData = buildUpdateData(data)
  const employee = await prisma.employee.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(employee)
}
