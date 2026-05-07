import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']
const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

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

  // Cleanup: remove duplicate employees (same name+branch, prefer the one with externalStaffId)
  if (sync) {
    try {
      const allEmps = await prisma.employee.findMany({ where: { isActive: true } })
      const seen = new Map<string, typeof allEmps[0]>()
      for (const emp of allEmps) {
        const key = `${emp.firstName.toUpperCase()}|${emp.lastName.toUpperCase()}|${emp.branch}`
        const prev = seen.get(key)
        if (prev) {
          // Prefer the one with externalStaffId (synced). If both have it, keep the newer one.
          const keepSynced = emp.externalStaffId && !prev.externalStaffId ? emp : prev
          const removeDup = keepSynced === emp ? prev : emp
          // Clear bio ID on duplicate first (unique constraint), then soft-delete
          if (removeDup.employeeBioId) {
            await prisma.employee.update({ where: { id: removeDup.id }, data: { employeeBioId: null } })
          }
          await prisma.employee.update({ where: { id: removeDup.id }, data: { isActive: false } })
          seen.set(key, keepSynced)
        } else {
          seen.set(key, emp)
        }
      }
    } catch (e) {
      console.error('Duplicate cleanup error:', e)
    }
  }

  // Purge: deactivate any synced employees (externalStaffId set) that are NOT ADMINISTRATION
  // and NOT Verdana. These were incorrectly added when the department filter was briefly
  // removed. Manually-added employees (no externalStaffId) are left untouched.
  if (sync) {
    try {
      await prisma.employee.updateMany({
        where: {
          isActive: true,
          externalStaffId: { not: null },
          branch: { notIn: ['VERDANA', 'VDNA'] },
          department: { not: 'ADMINISTRATION' },
        },
        data: { isActive: false },
      })
    } catch (e) {
      console.error('Non-admin employee purge error:', e)
    }
  }

  // Sync from marketing hub (which also fetches gov IDs from HR platform via includeHR)
  if (sync) {
    try {
      const res = await fetch(`${MARKETING_HUB_URL}/api/staff/external?includeHR=true`, {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const staff = data.staff || []
        for (const s of staff) {
          const dept = s.department || ''
          const br = s.branch || ''
          // Only sync ADMINISTRATION staff into payroll (all branches).
          // Verdana Store staff are ALL synced regardless of department.
          const isVerdana = ['VDNA', 'VERDANA'].includes(br.toUpperCase())
          if (!isVerdana && dept !== 'ADMINISTRATION') continue
          // Normalize Verdana branch name for accounting hub
          const normalizedBranch = isVerdana ? 'VERDANA' : br

          try {
            // Build update/create data — always sync basic fields.
            // isActive: true reactivates employees that were soft-deleted and re-synced.
            // Use HR job title (human-readable) if available, fall back to marketing hub slug.
            const syncData: Record<string, unknown> = {
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              department: dept,
              branch: normalizedBranch,
              jobTitle: s.hrJobTitle || s.jobTitle || null,
              email: s.email || null,
              phone: s.phone || null,
              isActive: true,
            }

            // Sync employeeId as biometric ID
            // Use marketing hub's employeeId (branch-specific bio ID), NOT hrEmployeeId (HR platform ID shared across branches)
            const empId = s.employeeId
            if (empId) {
              const bioId = parseInt(empId)
              if (!isNaN(bioId)) {
                // Check if another employee already has this bioId (unique constraint)
                const bioConflict = await prisma.employee.findFirst({
                  where: { employeeBioId: bioId, externalStaffId: { not: s.id } },
                })
                if (!bioConflict) {
                  syncData.employeeBioId = bioId
                }
              }
            }

            // Look up existing by externalStaffId first
            let existing = await prisma.employee.findUnique({ where: { externalStaffId: s.id } })

            // If not found by externalStaffId, try matching by name+branch to link manual entries
            if (!existing) {
              const nameMatch = await prisma.employee.findFirst({
                where: {
                  firstName: { equals: s.firstName || '', mode: 'insensitive' },
                  lastName: { equals: s.lastName || '', mode: 'insensitive' },
                  branch: normalizedBranch,
                  externalStaffId: null, // only match unlinked manual entries
                },
              })
              if (nameMatch) {
                // Link the manual entry to the marketing hub record
                await prisma.employee.update({
                  where: { id: nameMatch.id },
                  data: { externalStaffId: s.id },
                })
                existing = { ...nameMatch, externalStaffId: s.id }
              }
            }

            // Always sync government IDs and bank details from HR platform — HR platform
            // is the authoritative source. Previously the gov IDs were only filled when
            // empty, which prevented corrections from propagating (JULIE ANN JOVILLO issue).
            if (s.sss) syncData.sssNumber = s.sss
            if (s.philhealth) syncData.philhealthNumber = s.philhealth
            if (s.pagibig) syncData.pagibigNumber = s.pagibig
            if (s.tin) syncData.tinNumber = s.tin
            if (s.bankName) syncData.bankName = s.bankName
            if (s.bankAccountNo) syncData.bankAccountNo = s.bankAccountNo

            await prisma.employee.upsert({
              where: { externalStaffId: s.id },
              update: syncData,
              create: {
                externalStaffId: s.id,
                ...syncData,
                firstName: syncData.firstName as string,
                lastName: syncData.lastName as string,
                department: syncData.department as string,
                branch: syncData.branch as string,
              },
            })
          } catch (empErr) {
            console.error(`Employee sync error for ${s.firstName} ${s.lastName} (${br}):`, empErr)
            // continue syncing the rest
          }
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
