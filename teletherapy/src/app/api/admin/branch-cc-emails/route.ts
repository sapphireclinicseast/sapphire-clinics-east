import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Last-resort default if the HrBranch sync cache is empty (before the first
// "Sync Branches" click, or if it's briefly unreachable) — must match
// Patient.branch enum (Branch in schema.prisma) since IE send-to-patient
// looks up CC emails by patient.branch. SBEA/SBGH are legacy aliases stored
// on Staff records — not exposed as new options here. Prefer
// getKnownBranches() below, which reads the live registry so a newly-added
// branch shows up here automatically.
const FALLBACK_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

async function getKnownBranches(): Promise<string[]> {
  try {
    const rows = await prisma.hrBranch.findMany({
      where: { active: true, teletherapyBranch: { not: null } },
      select: { teletherapyBranch: true },
      orderBy: { name: 'asc' },
    })
    const branches = rows.map(r => r.teletherapyBranch).filter((b): b is string => !!b)
    return branches.length > 0 ? branches : FALLBACK_BRANCHES
  } catch {
    return FALLBACK_BRANCHES
  }
}

function requireAdmin(role?: string) {
  return role === 'ADMIN'
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// GET — list all branch cc emails (admin only)
export async function GET() {
  const session = await auth()
  if (!session?.user || !requireAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // @ts-ignore
  const rows = await prisma.branchCCEmail.findMany({ orderBy: { branch: 'asc' } })
  return NextResponse.json({ ccEmails: rows, knownBranches: await getKnownBranches() })
}

// POST/PUT — upsert a cc email for a branch
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !requireAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { branch, email, notes } = await req.json()

  if (!branch || !email) {
    return NextResponse.json({ error: 'Branch and email are required' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // @ts-ignore
  const row = await prisma.branchCCEmail.upsert({
    where: { branch },
    update: { email, notes: notes || null, updatedById: session.user.id },
    create: { branch, email, notes: notes || null, updatedById: session.user.id },
  })

  return NextResponse.json({ ccEmail: row })
}

// DELETE — remove cc email for a branch
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !requireAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const branch = req.nextUrl.searchParams.get('branch')
  if (!branch) {
    return NextResponse.json({ error: 'Branch is required' }, { status: 400 })
  }

  // @ts-ignore
  await prisma.branchCCEmail.delete({ where: { branch } }).catch(() => null)
  return NextResponse.json({ success: true })
}
