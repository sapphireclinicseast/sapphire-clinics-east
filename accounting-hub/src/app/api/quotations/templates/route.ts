/**
 * The per-branch .docx letterhead a quotation is generated onto.
 *
 * The file itself goes through /api/upload (which already handles .docx and the
 * volume-mounted uploads dir); this route only records which stored file belongs
 * to which branch, one template per branch.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { QUOTATION_BRANCHES } from '@/lib/quotations/pricing'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'BOOKKEEPER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const BRANCH_KEYS = QUOTATION_BRANCHES.map(b => b.key) as string[]

export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const templates = await prisma.quotationTemplate.findMany({ orderBy: { branch: 'asc' } })
  return NextResponse.json({ templates })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { branch, fileName, storedName } = await req.json()
    if (!BRANCH_KEYS.includes(branch)) {
      return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })
    }
    if (!fileName || !storedName) {
      return NextResponse.json({ error: 'fileName and storedName are required' }, { status: 400 })
    }
    if (!String(fileName).toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ error: 'The template must be a .docx file' }, { status: 400 })
    }

    const template = await prisma.quotationTemplate.upsert({
      where: { branch },
      create: { branch, fileName, storedName, uploadedById: session.user.id },
      update: { fileName, storedName, uploadedById: session.user.id },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'quotationTemplate',
        entityId: template.id,
        details: { branch, fileName },
      },
    })

    return NextResponse.json(template)
  } catch (err) {
    console.error('[quotation-templates] save failed:', err)
    return NextResponse.json({ error: 'Could not save the template' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const branch = new URL(req.url).searchParams.get('branch')
  if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

  await prisma.quotationTemplate.deleteMany({ where: { branch } })
  return NextResponse.json({ ok: true })
}
