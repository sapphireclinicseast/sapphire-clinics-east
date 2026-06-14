// GET  /api/public/class-portal/users           — admin: list everyone, teacher: list students only, student: own record only
// POST /api/public/class-portal/users           — admin only: create teacher or student

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/class-portal-auth'
import { syncStudentToPatientCrm } from '@/lib/class-portal-patient-sync'
import { auditEnrollment } from '@/lib/class-portal-audit'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (auth.role === 'TEACHER') where.role = 'STUDENT'
    if (auth.role === 'STUDENT') where.id = auth.userId
    // Branch admins AND DB-backed front desk are scoped to their own
    // branch. Teachers without a branch (unscoped) stay visible because
    // their assignments table covers cross-branch coverage; rows tagged
    // to the other branch are hidden. The `auth.branch` guard keeps the
    // legacy shared hardcoded frontdesk login (no branch on token)
    // working with its current global view — only branch-tagged tokens
    // get scoped.
    if ((auth.role === 'BRANCH_ADMIN' || auth.role === 'FRONTDESK') && auth.branch) {
      where.OR = [
        { branch: auth.branch },
        // Teachers + frontdesk + branch_admin rows might have null branch
        // for the teacher case — include them so the staff can see
        // unscoped teachers. Student rows always have a branch.
        { AND: [{ branch: null }, { role: { in: ['TEACHER'] } }] },
      ]
    }
    // Disabled accounts are hidden from teachers, branch admins, and
    // front desk — they shouldn't see students/staff who no longer
    // attend. Main admin sees everyone so they can re-enable. Students
    // are filtered by id above, so they only ever see their own row.
    if (auth.role !== 'ADMIN' && auth.role !== 'STUDENT') {
      where.disabledAt = null
    }
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
        disabledAt: r.disabledAt ? r.disabledAt.toISOString() : null,
        disabledBy: r.disabledBy ?? null,
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
  // Captured up top so the catch handler at the bottom can audit the
  // attempt even if body parsing fails mid-flow.
  let auditEmail: string | undefined
  let auditRole: string | undefined
  let auditBranch: string | null | undefined
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
    auditEmail = body.email
    auditRole = body.role
    auditBranch = body.branch ?? null
    // Every account-create attempt is recorded so the admin can trace
    // "the parent says they tried to sign up" by searching by email.
    void auditEnrollment({
      kind: 'account_create_attempt',
      email: auditEmail,
      outcome: 'ok',
      req,
      metadata: { role: auditRole, branch: auditBranch, firstName: body.firstName, lastName: body.lastName, level: body.level },
    })
    if (!body.role || !body.email || !body.password) {
      void auditEnrollment({ kind: 'account_create_failure', email: auditEmail, outcome: 'error', error: 'missing role / email / password', req, metadata: { role: auditRole } })
      return withCors(NextResponse.json({ error: 'role, email, and password are required.' }, { status: 400 }), origin)
    }
    const validRoles: Array<typeof body.role> = ['STUDENT', 'TEACHER', 'FRONTDESK', 'BRANCH_ADMIN']
    if (!validRoles.includes(body.role)) {
      void auditEnrollment({ kind: 'account_create_failure', email: auditEmail, outcome: 'error', error: `invalid role: ${body.role}`, req })
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
      void auditEnrollment({ kind: 'account_create_failure', email: auditEmail, studentId: existing.id, outcome: 'error', error: 'duplicate role+email', req, metadata: { role: auditRole } })
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
    void auditEnrollment({
      kind: 'account_create_success',
      email: created.email,
      studentId: created.id,
      outcome: 'ok',
      req,
      metadata: { role: created.role, branch: created.branch, level: created.level },
    })
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
      void auditEnrollment({ kind: 'account_create_failure', email: auditEmail, outcome: 'error', error: `auth ${e.status}`, req, metadata: { role: auditRole, branch: auditBranch } })
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    void auditEnrollment({ kind: 'account_create_failure', email: auditEmail, outcome: 'error', error: (e as Error).message, req, metadata: { role: auditRole, branch: auditBranch } })
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
