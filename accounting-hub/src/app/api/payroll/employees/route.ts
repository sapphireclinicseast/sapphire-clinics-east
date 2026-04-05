import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']
const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

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

  // Sync from marketing hub — only Administration department staff
  if (sync) {
    try {
      const res = await fetch(`${MARKETING_HUB_URL}/api/staff/external`, {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const staff = data.staff || []
        for (const s of staff) {
          const dept = s.department || ''
          const br = s.branch || ''
          // Only sync ADMINISTRATION and FRONT_DESK department staff as employees
          if (!['FRONT_DESK', 'ADMINISTRATION'].includes(dept)) continue
          await prisma.employee.upsert({
            where: { externalStaffId: s.id },
            update: {
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              department: dept,
              branch: br,
              jobTitle: s.jobTitle || null,
              email: s.email || null,
            },
            create: {
              externalStaffId: s.id,
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              department: dept,
              branch: br,
              jobTitle: s.jobTitle || null,
              email: s.email || null,
            },
          })
        }
      }
    } catch (e) {
      console.error('Employee sync error:', e)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (!includeInactive) where.isActive = true
  if (branch) where.branch = branch
  if (department) where.department = department

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
    dateHired, regularizationDate, scheduleIn, scheduleOut, restDay,
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
      restDay: restDay || 'SUNDAY',
    },
  })

  return NextResponse.json(employee)
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, ...data } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing employee id' }, { status: 400 })
  }

  // Clean up fields
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
  if (data.employeeBioId !== undefined) updateData.employeeBioId = data.employeeBioId ? parseInt(data.employeeBioId) : null
  if (data.sssNumber !== undefined) updateData.sssNumber = data.sssNumber || null
  if (data.philhealthNumber !== undefined) updateData.philhealthNumber = data.philhealthNumber || null
  if (data.pagibigNumber !== undefined) updateData.pagibigNumber = data.pagibigNumber || null
  if (data.tinNumber !== undefined) updateData.tinNumber = data.tinNumber || null
  if (data.dateHired !== undefined) updateData.dateHired = data.dateHired ? new Date(data.dateHired) : null
  if (data.regularizationDate !== undefined) updateData.regularizationDate = data.regularizationDate ? new Date(data.regularizationDate) : null
  if (data.scheduleIn !== undefined) updateData.scheduleIn = data.scheduleIn
  if (data.scheduleOut !== undefined) updateData.scheduleOut = data.scheduleOut
  if (data.restDay !== undefined) updateData.restDay = data.restDay
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const employee = await prisma.employee.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(employee)
}
