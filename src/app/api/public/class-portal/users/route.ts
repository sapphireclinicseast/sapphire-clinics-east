// GET  /api/public/class-portal/users           — admin: list everyone, teacher: list students only, student: own record only
// POST /api/public/class-portal/users           — admin only: create teacher or student

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/class-portal-auth'
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
      role: 'STUDENT' | 'TEACHER'
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
    if (body.role !== 'TEACHER' && body.role !== 'STUDENT') {
      return withCors(NextResponse.json({ error: 'role must be TEACHER or STUDENT.' }, { status: 400 }), origin)
    }
    // STUDENT registration is public (parent enrolling their child via /enroll).
    // TEACHER creation requires admin authentication.
    if (body.role === 'TEACHER') {
      await requireAuth(req, ['ADMIN'])
    }
    const email = body.email.trim().toLowerCase()
    const existing = await prisma.classPortalUser.findUnique({
      where: { role_email: { role: body.role, email } },
    })
    if (existing) {
      return withCors(NextResponse.json({ error: 'A user with this email already exists for this role.' }, { status: 409 }), origin)
    }
    const created = await prisma.classPortalUser.create({
      data: {
        role: body.role,
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
      },
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
