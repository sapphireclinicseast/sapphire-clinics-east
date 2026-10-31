// GET /api/internal/class-portal/tuition[?branch=EAST|GREENHILLS][&sy=2026]
//
// Called by the accounting hub (shared EXTERNAL_API_KEY) for AR → Tuition:
// every enrolled student with the school year's front-desk payment rows and
// the promissory notes uploaded in the class portal (metadata only — the file
// itself streams from ./promissory-notes/[id]). Each student carries the
// marketing Patient.id matched by email, the same key the POS queue uses, so
// the accounting hub can find the student at the till.
//
// School year = Jun 1 → May 31 in Asia/Manila, as in students/[id]/fee-summary.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

function schoolYearStart(now: Date): number {
  const ph = new Date(now.getTime() + 8 * 60 * 60_000)
  return ph.getUTCMonth() >= 5 ? ph.getUTCFullYear() : ph.getUTCFullYear() - 1
}

export async function GET(req: NextRequest) {
  if (!API_KEY || req.headers.get('authorization') !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = req.nextUrl.searchParams
  const branchParam = sp.get('branch')
  const branch = branchParam === 'EAST' || branchParam === 'GREENHILLS' ? branchParam : null
  const syParam = parseInt(sp.get('sy') || '', 10)
  const sy = Number.isFinite(syParam) && syParam > 2000 ? syParam : schoolYearStart(new Date())
  // Jun 1 00:00 Manila → May 31 23:59:59 Manila of the next year.
  const from = new Date(Date.UTC(sy, 5, 1) - 8 * 60 * 60_000)
  const to = new Date(Date.UTC(sy + 1, 5, 1) - 8 * 60 * 60_000)

  try {
    const [students, payments, notes] = await Promise.all([
      prisma.classPortalUser.findMany({
        where: { role: 'STUDENT', disabledAt: null, ...(branch ? { branch } : {}) },
        select: { id: true, email: true, firstName: true, lastName: true, level: true, branch: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalFrontDeskPayment as any).findMany({
        where: { createdAt: { gte: from, lt: to }, ...(branch ? { branch } : {}) },
        select: {
          classPortalPaymentId: true, studentId: true, plan: true, period: true,
          tuitionCentavos: true, miscCentavos: true, status: true, method: true, methodDetail: true,
          isPartialPayment: true, notes: true, createdAt: true, convertedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalPromissoryNote as any).findMany({
        where: branch ? { branch } : {},
        select: { id: true, studentId: true, fileName: true, fileType: true, fileSize: true, notes: true, uploadedBy: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // CRM patient per student — what the POS rings the student up as. The
    // student sync keys patients by the portal email, but siblings can share
    // a parent's email and some patients were registered under another one,
    // so: same email and name, else same email, else same name.
    const fold = (x: string | null | undefined) => (x || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '')
    const emails = Array.from(new Set(students.map(s => (s.email || '').toLowerCase()).filter(Boolean)))
    const lastNames = Array.from(new Set(students.map(s => (s.lastName || '').trim()).filter(Boolean)))
    const patients = emails.length || lastNames.length
      ? await prisma.patient.findMany({
          where: { OR: [{ email: { in: emails, mode: 'insensitive' } }, { lastName: { in: lastNames, mode: 'insensitive' } }] },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : []
    const patientFor = (s: { email: string | null; firstName: string | null; lastName: string | null }) => {
      const email = (s.email || '').toLowerCase()
      const name = fold(`${s.firstName ?? ''}${s.lastName ?? ''}`)
      const byEmail = patients.filter(p => email && (p.email || '').toLowerCase() === email)
      return (byEmail.find(p => fold(`${p.firstName}${p.lastName}`) === name)
        ?? (byEmail.length === 1 ? byEmail[0] : undefined)
        ?? patients.find(p => fold(`${p.firstName}${p.lastName}`) === name))?.id ?? null
    }

    return NextResponse.json({
      schoolYear: sy,
      students: students.map(s => ({
        id: s.id,
        name: [s.firstName, s.lastName].filter(Boolean).join(' ').trim() || s.email,
        email: s.email,
        level: s.level,
        branch: s.branch,
        patientId: patientFor(s),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payments: payments.map((p: any) => ({
        classPortalPaymentId: p.classPortalPaymentId,
        studentId: p.studentId,
        plan: p.plan,
        period: p.period,
        amountCentavos: (p.tuitionCentavos ?? 0) + (p.miscCentavos ?? 0),
        status: p.status,
        method: p.method ?? null,
        methodDetail: p.methodDetail ?? null,
        isPartialPayment: Boolean(p.isPartialPayment),
        notes: p.notes ?? null,
        createdAt: p.createdAt.toISOString(),
        convertedAt: p.convertedAt?.toISOString() ?? null,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notes: notes.map((n: any) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    })
  } catch (e) {
    console.error('[internal/class-portal/tuition] GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
