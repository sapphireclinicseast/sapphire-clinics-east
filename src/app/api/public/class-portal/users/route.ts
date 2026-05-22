// GET  /api/public/class-portal/users           — admin: list everyone, teacher: list students only, student: own record only
// POST /api/public/class-portal/users           — admin only: create teacher or student

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/class-portal-auth'
import { syncStudentToPatientCrm } from '@/lib/class-portal-patient-sync'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    let where: { role?: 'STUDENT' | 'TEACHER'; id?: string } = {}
    if (auth.role === 'TEACHER') where = { role: 'STUDENT' }
    if (auth.role === 'STUDENT') where = { id: auth.userId }
    const rows = await prisma.classPortalUser.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    })
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: rows.map((r: any) => ({
        id: r.id,
        role: r.role,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        level: r.level,
        branch: r.branch,
        enrollment: r.enrollment,
        passwordSetAt: r.passwordSetAt ? r.passwordSetAt.toISOString() : null,
        passwordSetBy: r.passwordSetBy ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const body = await req.json() as {
      role: 'STUDENT' | 'TEACHER' | 'FRONTDESK' | 'BRANCH_ADMIN'
      email: string
      password: string
      firstName?: string
      lastName?: string
      level?: string
      branch?: 'EAST' | 'GREENHILLS' | null
      enrollment?: Record<string, unknown>
    }
    if (!body.role || !body.email || !body.password) {
      return withCors(NextResponse.json({ error: 'role, email, and password are required.' }, { status: 400 }), origin)
    }
    const validRoles: Array<typeof body.role> = ['STUDENT', 'TEACHER', 'FRONTDESK', 'BRANCH_ADMIN']
    if (!validRoles.includes(body.role)) {
      return withCors(NextResponse.json({ error: 'Invalid role.' }, { status: 400 }), origin)
    }
    // STUDENT registration is public (parent enrolling their child via /enroll).
    // Staff roles require auth:
    //   ADMIN         → can mint any staff role
    //   BRANCH_ADMIN  → can mint TEACHER + FRONTDESK only (no more branch admins)
    //   anyone else   → forbidden
    if (body.role !== 'STUDENT') {
      const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
      if (auth.role === 'BRANCH_ADMIN' && body.role === 'BRANCH_ADMIN') {
        return withCors(NextResponse.json({ error: 'Branch admins cannot create other branch admins.' }, { status: 403 }), origin)
      }
      // Branch admins may only create staff for their own branch.
      if (auth.role === 'BRANCH_ADMIN' && body.role !== 'TEACHER' && body.branch && body.branch !== auth.branch) {
        return withCors(NextResponse.json({ error: 'Branch admins can only create staff for their own branch.' }, { status: 403 }), origin)
      }
    }
    const email = body.email.trim().toLowerCase()
    const existing = await prisma.classPortalUser.findUnique({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { role_email: { role: body.role as any, email } },
    })
    if (existing) {
      return withCors(NextResponse.json({ error: 'A user with this email already exists for this role.' }, { status: 409 }), origin)
    }
    // Record who set the password initially. For self-signup students this is
    // the parent's own email; for staff-minted accounts it's the admin who
    // created them. Used by the admin user list to show "Last reset by …".
    let passwordSetByEmail: string = email
    if (body.role !== 'STUDENT') {
      try {
        const adminAuth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
        passwordSetByEmail = adminAuth.email
      } catch { /* leave as the target email — staff role auth-checked above */ }
    }
    const created = await prisma.classPortalUser.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        role: body.role as any,
        email,
        passwordHash: await hashPassword(body.password),
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        level: (body.level ?? null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        branch: (body.branch ?? null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enrollment: (body.enrollment ?? null) as any,
        passwordSetAt: new Date(),
        passwordSetBy: passwordSetByEmail,
      },
    })

    // Mirror new students into the marketing Patient CRM so the clinic
    // staff (queue, schedules, dashboards) sees them immediately. Failure
    // here is logged but does not block the class-portal account.
    if (created.role === 'STUDENT') {
      try {
        await syncStudentToPatientCrm({
          email: created.email,
          firstName: created.firstName,
          lastName: created.lastName,
          branch: created.branch as 'EAST' | 'GREENHILLS' | null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enrollment: (created.enrollment as any) ?? null,
        })
      } catch (e) {
        console.warn('[users.POST] Patient CRM sync failed (non-fatal):', e)
      }
    }
    return withCors(NextResponse.json({
      user: {
        id: created.id,
        role: created.role,
        email: created.email,
        firstName: created.firstName,
        lastName: created.lastName,
        level: created.level,
        branch: created.branch,
        enrollment: created.enrollment,
        passwordSetAt: created.passwordSetAt ? created.passwordSetAt.toISOString() : null,
        passwordSetBy: created.passwordSetBy ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
