// Absences, for the Accounting Hub's uncharged-cancellation flag.
//
// GET ?from=YYYY-MM-DD[&to=YYYY-MM-DD][&patientId=…]
//
// Every booked session a patient did not attend — CANCELLED, RESCHEDULED or
// NO_SHOW on the clinic schedule — with the cancellation log written for it, if
// any. The schedule is the source of truth here, not the log: most absences
// were never logged (the outcome prompt is skippable), so a flag built on logs
// alone missed nearly nine in ten of them (Hannah's GL trace, 2026-11-17).
//
// The Accounting Hub applies the fee rule and checks what was charged, because
// the orders, guarantee letters and parked fees all live there. This endpoint
// only reports what happened on the schedule.
//
// Auth: x-api-key against the shared service key, like /api/internal/cancellations.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function authorised(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY ?? ''
  if (!key) return false
  return req.headers.get('x-api-key') === key
}

/** Schedule.date is the session's local (Manila) midnight. */
const manilaDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`)
const isYmd = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const fromQ = url.searchParams.get('from')
  const toQ = url.searchParams.get('to')
  const patientId = (url.searchParams.get('patientId') ?? '').trim()
  const from = isYmd(fromQ) ? dayStart(fromQ) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  // Through the end of today by default — a booking later today hasn't been missed yet,
  // but its status only changes once it has.
  const to = isYmd(toQ) ? new Date(dayStart(toQ).getTime() + 24 * 60 * 60 * 1000 - 1) : new Date()

  const schedules = await prisma.schedule.findMany({
    where: {
      status: { in: ['CANCELLED', 'RESCHEDULED', 'NO_SHOW'] },
      patientId: patientId || { not: null },
      date: { gte: from, lte: to },
    },
    select: {
      id: true, patientId: true, staffId: true, date: true, startTime: true, status: true, sessionType: true, branch: true,
      patient: { select: { firstName: true, lastName: true, branches: true, branch: true } },
      staff: { select: { firstName: true, lastName: true, department: true, branch: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  const logs = schedules.length
    ? await prisma.cancellationLog.findMany({
        where: { scheduleId: { in: schedules.map(s => s.id) }, deletedAt: null },
        select: {
          id: true, scheduleId: true, type: true, isValid: true, sourceStatus: true, countsToward: true,
          excludeReason: true, initiatedBy: true, paymentType: true, paidOrderId: true, paidOrderNumber: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    : []
  // One log per booking; if front desk logged it twice, the latest wins.
  const logBySchedule = new Map<string, (typeof logs)[number]>()
  for (const l of logs) if (l.scheduleId && !logBySchedule.has(l.scheduleId)) logBySchedule.set(l.scheduleId, l)

  // Sessions the same patient DID attend that day. A booking marked cancelled
  // is often just moved to another slot the same day; the Accounting Hub
  // compares these with the sessions actually charged that day to tell a
  // real absence from a slot swap.
  const confirmed = schedules.length
    ? await prisma.schedule.findMany({
        where: {
          status: 'CONFIRMED',
          patientId: { in: [...new Set(schedules.map(s => s.patientId!))] },
          date: { gte: schedules[0].date, lte: schedules[schedules.length - 1].date },
        },
        select: { patientId: true, date: true },
      })
    : []
  const confirmedByDay = new Map<string, number>()
  for (const c of confirmed) {
    const k = `${c.patientId}|${manilaDay(c.date)}`
    confirmedByDay.set(k, (confirmedByDay.get(k) ?? 0) + 1)
  }

  // How many bookings each therapist had called off that day, across ALL
  // patients. The Accounting Hub reads several on one day as the therapist
  // being out (for bookings before 2026-11-18), and it can't count that
  // itself when it asks about a single patient.
  const staffDays = schedules.length
    ? await prisma.schedule.groupBy({
        by: ['staffId', 'date'],
        where: {
          status: { in: ['CANCELLED', 'RESCHEDULED', 'NO_SHOW'] },
          staffId: { in: [...new Set(schedules.map(s => s.staffId))] },
          date: { gte: schedules[0].date, lte: schedules[schedules.length - 1].date },
        },
        _count: { _all: true },
      })
    : []
  const perStaffDay = new Map(staffDays.map(g => [`${g.staffId}|${manilaDay(g.date)}`, g._count._all]))

  const name = (p: { firstName: string | null; lastName: string | null } | null) =>
    p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.replace(/\s+/g, ' ').trim() : ''

  return NextResponse.json({
    absences: schedules.map(s => {
      const log = logBySchedule.get(s.id) ?? null
      return {
        scheduleId: s.id,
        patientId: s.patientId,
        patientName: name(s.patient),
        date: manilaDay(s.date),
        startTime: s.startTime,
        status: s.status,
        sessionType: s.sessionType,
        // Where the session was: the calendar it was booked on, else the
        // therapist's branch, else the patient's.
        branch: s.branch || s.staff?.branch || s.patient?.branches?.[0] || s.patient?.branch || null,
        therapist: name(s.staff),
        department: s.staff?.department ?? null,
        confirmedSameDay: confirmedByDay.get(`${s.patientId}|${manilaDay(s.date)}`) ?? 0,
        therapistDayAbsences: perStaffDay.get(`${s.staffId}|${manilaDay(s.date)}`) ?? 1,
        log: log ? {
          id: log.id, type: log.type, isValid: log.isValid, sourceStatus: log.sourceStatus,
          countsToward: log.countsToward, excludeReason: log.excludeReason, initiatedBy: log.initiatedBy,
          paymentType: log.paymentType, paidOrderId: log.paidOrderId, paidOrderNumber: log.paidOrderNumber,
        } : null,
      }
    }),
  })
}
