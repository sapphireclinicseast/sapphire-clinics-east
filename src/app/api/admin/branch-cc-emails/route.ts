// CRUD for per-branch CC email addresses used when emailing PRs (and other
// patient-facing docs) to the patient. Gated to the super admin account.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SUPER_ADMIN_EMAIL = 'main@sapphireclinicseast.org'

// Branches we know about. Match Patient.branch enum.
const KNOWN_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

function isSuperAdmin(session: { user?: { email?: string | null } } | null) {
  return (session?.user?.email ?? '').toLowerCase() === SUPER_ADMIN_EMAIL
}

// Accept comma- or semicolon-separated list; trim each, validate each
function parseEmails(s: string): { ok: boolean; emails: string[]; bad?: string } {
  const parts = s.split(/[,;]/).map(p => p.trim()).filter(Boolean)
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const e of parts) {
    if (!re.test(e)) return { ok: false, emails: [], bad: e }
  }
  return { ok: true, emails: parts }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }

  const rows = await prisma.branchCCEmail.findMany({ orderBy: { branch: 'asc' } })
  return NextResponse.json({ ccEmails: rows, knownBranches: KNOWN_BRANCHES })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }
  const userId = (session.user as { id?: string } | undefined)?.id ?? null

  const { branch, email, notes } = await req.json()
  if (!branch || !email) {
    return NextResponse.json({ error: 'Branch and email(s) are required' }, { status: 400 })
  }
  if (!KNOWN_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })
  }

  const parsed = parseEmails(email)
  if (!parsed.ok || parsed.emails.length === 0) {
    return NextResponse.json({ error: 'Invalid email address: ' + (parsed.bad ?? email) }, { status: 400 })
  }

  const stored = parsed.emails.join(', ')
  const row = await prisma.branchCCEmail.upsert({
    where: { branch },
    update: { email: stored, notes: notes || null, updatedById: userId ?? undefined },
    create: { branch, email: stored, notes: notes || null, updatedById: userId ?? undefined },
  })

  return NextResponse.json({ ccEmail: row })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }

  const branch = req.nextUrl.searchParams.get('branch')
  if (!branch) return NextResponse.json({ error: 'Branch is required' }, { status: 400 })

  await prisma.branchCCEmail.delete({ where: { branch } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
