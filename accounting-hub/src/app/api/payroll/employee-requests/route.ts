import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const employeeId = searchParams.get('employeeId') || ''
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId

  // Enforce branch restriction based on role
  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.employee = { branch }
  } else if (allowed) {
    where.employee = { branch: { in: allowed } }
  }

  const requests = await prisma.employeeRequest.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      consultant: { select: { id: true, name: true, department: true, branch: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(requests)
}

// Create a request — requires authentication
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { employeeId, consultantId, requestType, leaveType, isHalfDay, halfDayPeriod, startDate, endDate, reason, attachment, requestedTimeIn, requestedTimeOut, requestedScheduleIn, requestedScheduleOut, changeToWorkingDay } = body

  if ((!employeeId && !consultantId) || !requestType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const request = await prisma.employeeRequest.create({
    data: {
      employeeId: employeeId || null,
      consultantId: consultantId || null,
      requestType,
      leaveType: leaveType || null,
      isHalfDay: !!isHalfDay,
      halfDayPeriod: isHalfDay && halfDayPeriod ? halfDayPeriod : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      reason: reason || null,
      attachment: attachment || null,
      requestedTimeIn: requestedTimeIn || null,
      requestedTimeOut: requestedTimeOut || null,
      requestedScheduleIn: requestedScheduleIn || null,
      requestedScheduleOut: requestedScheduleOut || null,
      changeToWorkingDay: changeToWorkingDay != null ? changeToWorkingDay : null,
    },
  })

  return NextResponse.json(request)
}

// Approve/Deny a request
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, status, reviewNotes } = body

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch the request first so we can handle CHANGE_TIME approval
  const existing = await prisma.employeeRequest.findUnique({ where: { id }, include: { employee: true } })
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Check approval authority: branch admins cannot approve requests from excluded positions
  if (status === 'APPROVED' && existing.employee) {
    const role = session.user.role as string
    const isBranchAdmin = ['SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN'].includes(role)
    if (isBranchAdmin) {
      const settings = await prisma.employeeSettings.findFirst()
      const excludedPositions = (settings?.requestApprovalExcludedPositions as string[] | null) || []
      if (excludedPositions.length > 0 && existing.employee.jobTitle) {
        const empTitle = existing.employee.jobTitle.toUpperCase()
        const isExcluded = excludedPositions.some(pos => empTitle.includes(pos.toUpperCase()))
        if (isExcluded) {
          return NextResponse.json({
            error: `You do not have authority to approve requests from employees with the position "${existing.employee.jobTitle}". Only Admin or Accountant accounts can approve this request.`
          }, { status: 403 })
        }
      }
    }
  }

  const request = await prisma.employeeRequest.update({
    where: { id },
    data: {
      status,
      reviewedById: session.user.id as string,
      reviewNotes: reviewNotes || null,
    },
  })

  // On APPROVED Change Time In/Out: override timekeeping record
  if (status === 'APPROVED' && existing.employeeId && existing.startDate &&
      (existing.requestType === 'CHANGE_TIME_IN' || existing.requestType === 'CHANGE_TIME_OUT')) {
    try {
      const dateOnly = new Date(existing.startDate)
      dateOnly.setHours(0, 0, 0, 0)

      const timeStr = existing.requestType === 'CHANGE_TIME_IN' ? existing.requestedTimeIn : existing.requestedTimeOut
      if (timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const timestamp = new Date(dateOnly)
        timestamp.setHours(hours, minutes, 0, 0)

        // Find existing timekeeping record for this date
        const tkRecord = await prisma.timekeepingRecord.findUnique({
          where: { employeeId_date: { employeeId: existing.employeeId, date: dateOnly } },
        })

        const updateData: Record<string, unknown> = {
          source: 'FILING',
          dtrProof: existing.attachment || null,
          remarks: `Filed via employee request (${existing.requestType === 'CHANGE_TIME_IN' ? 'Change Time In' : 'Change Time Out'})`,
        }

        if (existing.requestType === 'CHANGE_TIME_IN') {
          updateData.timeIn = timestamp
        } else {
          updateData.timeOut = timestamp
        }

        // Recalculate hours if we have both timeIn and timeOut
        if (tkRecord) {
          const newTimeIn = existing.requestType === 'CHANGE_TIME_IN' ? timestamp : tkRecord.timeIn
          const newTimeOut = existing.requestType === 'CHANGE_TIME_OUT' ? timestamp : tkRecord.timeOut
          if (newTimeIn && newTimeOut) {
            const diffMs = newTimeOut.getTime() - newTimeIn.getTime()
            let hours = diffMs / (1000 * 60 * 60)
            if (hours > 5) hours -= 1 // deduct 1hr lunch
            updateData.hoursWorked = Math.max(0, Math.round(hours * 100) / 100)
          }

          // Recalculate late/undertime using employee schedule
          if (existing.employee) {
            const schedIn = existing.employee.scheduleIn || '08:00'
            const schedOut = existing.employee.scheduleOut || '17:00'
            const [sInH, sInM] = schedIn.split(':').map(Number)
            const [sOutH, sOutM] = schedOut.split(':').map(Number)

            if (newTimeIn) {
              const schedInMin = sInH * 60 + sInM
              const actualInMin = newTimeIn.getHours() * 60 + newTimeIn.getMinutes()
              updateData.lateMinutes = Math.max(0, actualInMin - schedInMin)
            }
            if (newTimeOut) {
              const schedOutMin = sOutH * 60 + sOutM
              const actualOutMin = newTimeOut.getHours() * 60 + newTimeOut.getMinutes()
              updateData.undertimeMinutes = Math.max(0, schedOutMin - actualOutMin)
            }
          }

          await prisma.timekeepingRecord.update({
            where: { employeeId_date: { employeeId: existing.employeeId, date: dateOnly } },
            data: updateData,
          })
        } else {
          // No existing record — create one with FILING source
          await prisma.timekeepingRecord.create({
            data: {
              employeeId: existing.employeeId,
              date: dateOnly,
              timeIn: existing.requestType === 'CHANGE_TIME_IN' ? timestamp : null,
              timeOut: existing.requestType === 'CHANGE_TIME_OUT' ? timestamp : null,
              source: 'FILING',
              dtrProof: existing.attachment || null,
              remarks: `Filed via employee request (${existing.requestType === 'CHANGE_TIME_IN' ? 'Change Time In' : 'Change Time Out'})`,
            },
          })
        }
      }
    } catch (e) {
      console.error('Failed to apply timekeeping override:', e)
      // Don't fail the approval — just log the error
    }
  }

  // On APPROVED Change Schedule: update timekeeping record for that date
  if (status === 'APPROVED' && existing.employeeId && existing.startDate &&
      existing.requestType === 'CHANGE_SCHEDULE' && existing.changeToWorkingDay != null) {
    try {
      const dateOnly = new Date(existing.startDate)
      dateOnly.setHours(0, 0, 0, 0)

      const isNowWorkingDay = existing.changeToWorkingDay
      const schedIn = isNowWorkingDay ? (existing.requestedScheduleIn || '08:00') : null
      const schedOut = isNowWorkingDay ? (existing.requestedScheduleOut || '17:00') : null

      const tkRecord = await prisma.timekeepingRecord.findUnique({
        where: { employeeId_date: { employeeId: existing.employeeId, date: dateOnly } },
      })

      const schedLabel = isNowWorkingDay
        ? `Changed to Working Day (${schedIn}–${schedOut})`
        : 'Changed to Rest Day'

      if (tkRecord) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
          isRestDay: !isNowWorkingDay,
          source: 'FILING',
          remarks: `Schedule change via employee request: ${schedLabel}`,
        }

        // Recalculate late/undertime against new schedule if it's now a working day
        if (isNowWorkingDay && schedIn && schedOut && tkRecord.timeIn && tkRecord.timeOut) {
          const [sInH, sInM] = schedIn.split(':').map(Number)
          const [sOutH, sOutM] = schedOut.split(':').map(Number)
          const actualInMin = tkRecord.timeIn.getHours() * 60 + tkRecord.timeIn.getMinutes()
          const actualOutMin = tkRecord.timeOut.getHours() * 60 + tkRecord.timeOut.getMinutes()
          updateData.lateMinutes = Math.max(0, actualInMin - (sInH * 60 + sInM))
          updateData.undertimeMinutes = Math.max(0, (sOutH * 60 + sOutM) - actualOutMin)
        }

        await prisma.timekeepingRecord.update({
          where: { employeeId_date: { employeeId: existing.employeeId, date: dateOnly } },
          data: updateData,
        })
      } else {
        // No existing record — create one
        await prisma.timekeepingRecord.create({
          data: {
            employeeId: existing.employeeId,
            date: dateOnly,
            isRestDay: !isNowWorkingDay,
            source: 'FILING',
            remarks: `Schedule change via employee request: ${schedLabel}`,
          },
        })
      }
    } catch (e) {
      console.error('Failed to apply schedule change:', e)
    }
  }

  return NextResponse.json(request)
}
