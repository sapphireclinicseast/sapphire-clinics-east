import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  COLLECTION_BRANCHES, COLLECTION_SETTINGS_READ_ROLES, COLLECTION_SETTINGS_WRITE_ROLES,
  cleanCollectionSettingsInput, mergeBranchSettings,
} from '@/lib/collection-report'

// HMO Collection Report settings, per branch (lib/collection-report). Company
// details live in InvoiceSettings (shared with Invoice Settings); TIN, bank and
// finance officer in CollectionReportSettings. East falls back to the SOA
// settings bank until its own is saved.

async function loadAll() {
  const branches = COLLECTION_BRANCHES.map(b => b.value)
  const [company, collection, soa] = await Promise.all([
    prisma.invoiceSettings.findMany({ where: { branch: { in: branches } } }),
    prisma.collectionReportSettings.findMany({ where: { branch: { in: branches } } }),
    prisma.soaSettings.findUnique({ where: { id: 'singleton' } }),
  ])
  return COLLECTION_BRANCHES.map(b => mergeBranchSettings(
    b.value,
    company.find(c => c.branch === b.value) ?? null,
    collection.find(c => c.branch === b.value) ?? null,
    b.value === 'SANDBOX_EAST' ? soa : null,
  ))
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !COLLECTION_SETTINGS_READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    return NextResponse.json({ branches: await loadAll() })
  } catch (e) {
    console.error('collection-settings GET failed:', e)
    return NextResponse.json({ error: 'Could not load the collection report settings' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !COLLECTION_SETTINGS_WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, company, collection, error } = cleanCollectionSettingsInput(await req.json())
    if (error) return NextResponse.json({ error }, { status: 400 })
    const updatedByName = (session.user.name as string) || null
    await prisma.$transaction([
      prisma.invoiceSettings.upsert({ where: { branch }, create: { branch, ...company }, update: company }),
      prisma.collectionReportSettings.upsert({
        where: { branch },
        create: { branch, ...collection, updatedByName },
        update: { ...collection, updatedByName },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id as string,
          action: 'UPDATE',
          entity: 'collectionReportSettings',
          entityId: branch,
          details: { branch, fields: [...Object.keys(company), ...Object.keys(collection)] },
        },
      }),
    ])
    return NextResponse.json({ branches: await loadAll() })
  } catch (e) {
    console.error('collection-settings PUT failed:', e)
    return NextResponse.json({ error: 'Could not save the collection report settings' }, { status: 500 })
  }
}
