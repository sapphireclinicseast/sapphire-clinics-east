// PATCH  /api/public/class-portal/users/[id]    — admin: edit any field; student: edit their own enrollment (+ profile fields)
// DELETE /api/public/class-portal/users/[id]    — admin only

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/class-portal-auth'
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
    if (body.password !== undefined && body.password) data.passwordHash = await hashPassword(body.password)
    if (body.firstName !== undefined) data.firstName = body.firstName
    if (body.lastName !== undefined) data.lastName = body.lastName
    if (body.level !== undefined) data.level = body.level
    if (body.branch !== undefined) data.branch = body.branch
    if (body.enrollment !== undefined) data.enrollment = body.enrollment

    const updated = await prisma.classPortalUser.update({ where: { id }, data })
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
