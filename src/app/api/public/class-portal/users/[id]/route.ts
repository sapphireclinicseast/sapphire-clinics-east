// PATCH  /api/public/class-portal/users/[id]    — admin: edit any field; student: edit their own enrollment (+ profile fields)
// DELETE /api/public/class-portal/users/[id]    — admin only

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/class-portal-auth'
import { syncStudentToPatientCrm } from '@/lib/class-portal-patient-sync'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function asJsonError(origin: string | null, e: unknown): Promise<NextResponse> {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    const body = await req.json() as {
      email?: string
      password?: string
      firstName?: string | null
      lastName?: string | null
      level?: string | null
      branch?: 'EAST' | 'GREENHILLS' | null
      enrollment?: Record<string, unknown> | null
      /**
       * Soft-disable flag. `true` writes disabledAt = now() + disabledBy =
       * auth.email; `false` clears both. Only the main admin may set
       * this; branch admins are blocked at the role check below.
       */
      disabled?: boolean
    }

    // STUDENT may only update their own row; TEACHER / FRONTDESK cannot edit
    // users; BRANCH_ADMIN can edit anything in their branch; ADMIN unrestricted.
    if (auth.role === 'TEACHER' || auth.role === 'FRONTDESK') {
      return withCors(NextResponse.json({ error: 'This role cannot edit user accounts.' }, { status: 403 }), origin)
    }
    if (auth.role === 'STUDENT' && auth.userId !== id) {
      return withCors(NextResponse.json({ error: 'You can only edit your own record.' }, { status: 403 }), origin)
    }
    if (auth.role === 'BRANCH_ADMIN') {
      const target = await prisma.classPortalUser.findUnique({ where: { id } })
      if (!target) {
        return withCors(NextResponse.json({ error: 'User not found.' }, { status: 404 }), origin)
      }
      if (target.role === 'BRANCH_ADMIN' && target.id !== auth.userId) {
        return withCors(NextResponse.json({ error: 'Branch admins cannot edit other branch admins.' }, { status: 403 }), origin)
      }
      // Branch admins may only touch users in their branch (or unscoped teachers).
      if (target.branch && auth.branch && target.branch !== auth.branch) {
        return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.email !== undefined) data.email = String(body.email).trim().toLowerCase()
    if (body.password !== undefined && body.password) {
      data.passwordHash = await hashPassword(body.password)
      // Audit who set the password and when — plaintext is NOT stored.
      data.passwordSetAt = new Date()
      data.passwordSetBy = auth.email
    }
    if (body.firstName !== undefined) data.firstName = body.firstName
    if (body.lastName !== undefined) data.lastName = body.lastName
    if (body.level !== undefined) data.level = body.level
    if (body.branch !== undefined) data.branch = body.branch
    if (body.enrollment !== undefined) data.enrollment = body.enrollment
    // Disable / enable. Restricted to main admin: branch admins can
    // already edit users in their branch but should NOT be able to
    // lock other staff out. STUDENT self-edits never carry `disabled`.
    if (body.disabled !== undefined) {
      if (auth.role !== 'ADMIN') {
        return withCors(NextResponse.json({ error: 'Only the main admin can disable or re-enable accounts.' }, { status: 403 }), origin)
      }
      data.disabledAt = body.disabled ? new Date() : null
      data.disabledBy = body.disabled ? auth.email : null
    }

    const updated = await prisma.classPortalUser.update({ where: { id }, data })

    // Keep the marketing Patient CRM in sync — same identity (matched by
    // email), updated fields propagate so the CRM always reflects the
    // latest enrollment data without staff having to re-enter anything.
    if (updated.role === 'STUDENT') {
      try {
        await syncStudentToPatientCrm({
          email: updated.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          branch: updated.branch as 'EAST' | 'GREENHILLS' | null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enrollment: (updated.enrollment as any) ?? null,
        })
      } catch (e) {
        console.warn('[users.PATCH] Patient CRM sync failed (non-fatal):', e)
      }
    }

    return withCors(NextResponse.json({
      user: {
        id: updated.id,
        role: updated.role,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        level: updated.level,
        branch: updated.branch,
        enrollment: updated.enrollment,
        passwordSetAt: updated.passwordSetAt ? updated.passwordSetAt.toISOString() : null,
        passwordSetBy: updated.passwordSetBy ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disabledAt: (updated as any).disabledAt ? (updated as any).disabledAt.toISOString() : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disabledBy: (updated as any).disabledBy ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    return asJsonError(origin, e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN'])
    const { id } = await params
    await prisma.classPortalUser.delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    return asJsonError(origin, e)
  }
}
