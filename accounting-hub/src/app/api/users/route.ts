import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const VALID_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'HMO_OFFICER', 'MEDREP']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE', 'ALL']

// GET - List all users (paginated)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branch: true,
        branches: true,
        disabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.user.count(),
  ])

  return NextResponse.json(paginatedResult(users, total, params))
}

// POST - Create a new user
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { name, email, password, role, branch, branches } = await req.json()
    // Multi-branch: `branches` (tickboxes) is authoritative; keep single `branch`
    // in sync (= the sole branch, or null when the user spans 0 or many).
    const normBranches: string[] = Array.isArray(branches)
      ? branches.filter((b: string) => VALID_BRANCHES.includes(b))
      : (branch && VALID_BRANCHES.includes(branch) ? [branch] : [])
    const primaryBranch = normBranches.length === 1 ? normBranches[0] : null

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (branch && !VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: role || 'VIEWER',
        branch: primaryBranch as never,
        branches: normBranches as never,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branch: true,
        branches: true,
        createdAt: true,
      },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'user',
        entityId: user.id,
        details: { name: user.name, email: user.email, role: user.role },
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    console.error('[users]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update a user
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { id, name, email, password, role, branch, branches, disabled } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (branch && !VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (name) updateData.name = name
    if (email) updateData.email = email
    if (role) updateData.role = role
    if (branches !== undefined) {
      const norm: string[] = Array.isArray(branches) ? branches.filter((b: string) => VALID_BRANCHES.includes(b)) : []
      updateData.branches = norm
      updateData.branch = norm.length === 1 ? norm[0] : null   // keep single-branch scoping in sync
    } else if (branch !== undefined) {
      updateData.branch = branch || null
      updateData.branches = branch && VALID_BRANCHES.includes(branch) ? [branch] : []
    }
    if (typeof disabled === 'boolean') updateData.disabled = disabled
    if (password) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }
      updateData.passwordHash = await bcrypt.hash(password, 12)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branch: true,
        branches: true,
        createdAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'user',
        entityId: user.id,
        details: { updated: Object.keys(updateData) },
      },
    })

    return NextResponse.json(user)
  } catch (e) {
    console.error('[users]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a user
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (id === session.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Soft-delete: a user who created records (orders, journals, payroll, …) can't
    // be hard-deleted without breaking FK integrity + the audit trail. Deactivate
    // instead — blocked from login, hidden/badged in the list, reactivatable.
    await prisma.user.update({ where: { id }, data: { disabled: true } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entity: 'user',
        entityId: id,
      },
    })

    return NextResponse.json({ message: 'User deactivated' })
  } catch (e) {
    console.error('[users] DELETE', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 })
  }
}
