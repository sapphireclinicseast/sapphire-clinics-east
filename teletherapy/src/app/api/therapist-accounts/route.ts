import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { reconcileAllAccountEmails } from '@/lib/sync-account-emails'

// Passwords are never stored readable and never listed. The admin who creates
// an account or sets a new password gets it back ONCE, in that POST/PATCH
// response, so they can copy and share it; after that only the bcrypt hash
// exists. Anyone who forgets is given a new one (key icon in the Admin Panel).
//
// Every response from this route selects these fields only — never the whole
// row, which carries passwordHash and resetToken.
const ACCOUNT_SELECT = {
  id: true,
  email: true,
  role: true,
  accountType: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  staffId: true,
  staff: {
    select: {
      firstName: true,
      lastName: true,
      department: true,
      branch: true,
    },
  },
} as const

// A response that carries a one-time password must never be cached.
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Bring every login email in step with the current staff (HR/Ops) email
  // before listing, so the panel never shows a stale address. Old emails are
  // kept as aliases so no one is locked out. Never blocks the list on error.
  await reconcileAllAccountEmails().catch(() => {})

  const accounts = await prisma.therapistAccount.findMany({
    select: ACCOUNT_SELECT,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ accounts }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { staffId, email, password } = body
  // accountType is the access preset; it also determines the role.
  // CLINICIAN/FRONT_DESK/ADMIN_STAFF -> THERAPIST role; ADMIN -> ADMIN role.
  const VALID_TYPES = ['CLINICIAN', 'FRONT_DESK', 'ADMIN_STAFF', 'ADMIN']
  const accountType: string = VALID_TYPES.includes(body.accountType)
    ? body.accountType
    : (body.role === 'ADMIN' ? 'ADMIN' : 'CLINICIAN')
  const role = accountType === 'ADMIN' ? 'ADMIN' : 'THERAPIST'

  if (!staffId || !email || !password) {
    return NextResponse.json({ error: 'Staff member, email, and password are required' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Check if staff exists
  const staff = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staff) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  // Check for existing account
  const existingByEmail = await prisma.therapistAccount.findUnique({ where: { email } })
  if (existingByEmail) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
  }

  const existingByStaff = await prisma.therapistAccount.findUnique({ where: { staffId } })
  if (existingByStaff) {
    return NextResponse.json({ error: 'Staff member already has an account' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const account = await prisma.therapistAccount.create({
    data: {
      staffId,
      email,
      passwordHash,
      role,
      accountType,
    },
    select: ACCOUNT_SELECT,
  })

  // The one and only time this password leaves the server.
  return NextResponse.json({ account, password }, { status: 201, headers: NO_STORE })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { id, isActive, newPassword, newEmail, accountType } = body

  if (!id) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}

  if (typeof isActive === 'boolean') {
    updateData.isActive = isActive
    // Re-enabling overrides the intern auto-disable sweep so it stays on
    // (e.g. a re-rotation); disabling clears the override.
    updateData.internAccessOverride = isActive
  }

  // Change the access preset (and keep role in sync).
  if (typeof accountType === 'string' && ['CLINICIAN', 'FRONT_DESK', 'ADMIN_STAFF', 'ADMIN'].includes(accountType)) {
    updateData.accountType = accountType
    updateData.role = accountType === 'ADMIN' ? 'ADMIN' : 'THERAPIST'
  }

  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    updateData.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  if (newEmail) {
    // Check if email is already in use by another account
    const existingByEmail = await prisma.therapistAccount.findFirst({
      where: { email: newEmail, NOT: { id } },
    })
    if (existingByEmail) {
      return NextResponse.json({ error: 'Email already in use by another account' }, { status: 400 })
    }
    updateData.email = newEmail

    // Also revise the underlying Staff record's email so everything that
    // matches by email (interbranch login, payroll, customer/peer surveys)
    // stays in sync. Update every Staff row that shares this person's current
    // email (interbranch staff carry the same email across branches).
    const acct = await prisma.therapistAccount.findUnique({
      where: { id },
      select: { staffId: true, staff: { select: { email: true } } },
    })
    if (acct) {
      const oldEmail = acct.staff?.email
      if (oldEmail && oldEmail !== newEmail) {
        await prisma.staff.updateMany({ where: { email: oldEmail }, data: { email: newEmail } })
      }
      // Ensure this account's own Staff record is updated even if its email was
      // empty or didn't match the old value.
      await prisma.staff.update({ where: { id: acct.staffId }, data: { email: newEmail } }).catch(() => null)
    }
  }

  const updated = await prisma.therapistAccount.update({
    where: { id },
    data: updateData,
    select: ACCOUNT_SELECT,
  })

  // A new password is echoed back once so the admin can copy and share it.
  if (newPassword) {
    return NextResponse.json({ account: updated, password: newPassword }, { headers: NO_STORE })
  }
  return NextResponse.json({ account: updated })
}
